#!/usr/bin/env python3
"""Reports whether the Python toolchain behind app/tools is usable.

Same contract as the other helpers: one JSON object on stdout, exit 0. Used by
GET /api/tools/status so a missing or half-installed venv shows up as a plain
sentence in the UI instead of as a failed conversion later on.
"""

import json
import sys


def main() -> int:
    info = {"ok": True, "python": sys.version.split()[0], "packages": {}, "missing": []}

    for module, label in (("pymupdf", "pymupdf"), ("pymupdf4llm", "pymupdf4llm")):
        try:
            mod = __import__(module)
            info["packages"][label] = getattr(mod, "__version__", "?")
        except Exception as exc:  # noqa: BLE001 — a broken install is as bad as a missing one
            info["ok"] = False
            info["missing"].append(f"{label}: {exc}")

    print(json.dumps(info))
    return 0


if __name__ == "__main__":
    sys.exit(main())
