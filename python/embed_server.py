#!/usr/bin/env python3
"""Local embedding daemon behind the Spinnennetz "Naheliegendes" feature.

Unlike the other python/ helpers (pdf_to_markdown.py, health.py), this is NOT
a subprocess-per-call tool — see the "Einbetten" section of the Spinnennetz
Stufe-1 plan for why: it needs to embed on every nugget/mark/comment save,
not on rare owner-triggered calls, and reloading the model's weights (1-3s)
on every single save would not fit. Instead it loads the model ONCE at
startup and stays running, managed by pm2 like the Next process itself (see
.github/workflows/deploy.yml) — one more line in a supervisor this project
already runs, not a new operational paradigm.

Contract: JSON in, JSON out, over plain HTTP on 127.0.0.1 only — never
proxied through nginx, same rule the app itself follows (see CLAUDE.md,
"Beide Server binden an 127.0.0.1"). No third-party web framework (avoids a
second dependency beyond what sentence-transformers/torch already pull in) —
stdlib http.server is enough for this tiny surface.

  POST /embed   { "texts": [...], "mode": "query"|"passage" }  -> { "vectors": [[...], ...] }
  GET  /health  -> { "ok": true, "model": "...", "dim": 384 }

Vectors are L2-normalized at encode time (`normalize_embeddings=True`), so
the Node side can rank by plain dot product instead of full cosine — see
lib/nearbyIndex.ts.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MODEL_NAME = os.environ.get("EMBED_MODEL", "intfloat/multilingual-e5-small")
PORT = int(os.environ.get("EMBED_DAEMON_PORT", "8801"))
HOST = "127.0.0.1"

# e5 models expect an asymmetric-retrieval prefix — "passage: " when
# indexing, "query: " when searching. See the Spinnennetz plan's "Was das
# Modell wirklich tut" note for why this matters and when each mode is used.
PREFIXES = {"query": "query: ", "passage": "passage: "}

# Request-size / batch-size guards, mirroring MAX_STDOUT_BYTES in
# lib/pythonTools.ts — a runaway batch shouldn't be able to hang the daemon
# for other requests, since this process (unlike the subprocess tools) is
# shared across every concurrent caller.
MAX_BODY_BYTES = 8 * 1024 * 1024
MAX_BATCH_SIZE = 256

print(f"[embed_server] loading {MODEL_NAME} …", file=sys.stderr, flush=True)
from sentence_transformers import SentenceTransformer  # noqa: E402 — import after logging the intent, it's the slow part

model = SentenceTransformer(MODEL_NAME, device="cpu")
EMBED_DIM = model.get_sentence_embedding_dimension()
print(f"[embed_server] ready — dim={EMBED_DIM}, listening on {HOST}:{PORT}", file=sys.stderr, flush=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002 — silence per-request access log; /health is polled
        pass

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._send_json(200, {"ok": True, "model": MODEL_NAME, "dim": EMBED_DIM})
            return
        self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path != "/embed":
            self._send_json(404, {"ok": False, "error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > MAX_BODY_BYTES:
            self._send_json(400, {"ok": False, "error": "invalid or oversized body"})
            return

        try:
            payload = json.loads(self.rfile.read(length))
        except Exception:
            self._send_json(400, {"ok": False, "error": "invalid JSON"})
            return

        texts = payload.get("texts")
        mode = payload.get("mode", "passage")
        if not isinstance(texts, list) or not all(isinstance(t, str) for t in texts):
            self._send_json(400, {"ok": False, "error": "texts must be a string array"})
            return
        if mode not in PREFIXES:
            self._send_json(400, {"ok": False, "error": "mode must be 'query' or 'passage'"})
            return
        if len(texts) == 0:
            self._send_json(200, {"vectors": []})
            return
        if len(texts) > MAX_BATCH_SIZE:
            self._send_json(400, {"ok": False, "error": f"batch too large (max {MAX_BATCH_SIZE})"})
            return

        prefixed = [PREFIXES[mode] + t for t in texts]
        try:
            vectors = model.encode(prefixed, normalize_embeddings=True, show_progress_bar=False)
        except Exception as exc:  # noqa: BLE001 — one bad batch must not crash a long-lived daemon
            self._send_json(500, {"ok": False, "error": str(exc)})
            return

        self._send_json(200, {"vectors": [v.tolist() for v in vectors]})


def main() -> int:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
