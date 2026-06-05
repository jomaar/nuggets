# Nuggets

Personal knowledge management PWA with spaced repetition and AI-powered concept extraction.

**Stack:** Next.js 14 App Router · TypeScript · Tailwind · Prisma + SQLite · Claude Sonnet API · SM-2

---

## Core Flow: Creating a Nugget

```
Browser                      Server (Node.js)                  Anthropic API
  │                                │                                 │
  │  POST /api/nuggets             │                                 │
  │  { contentMarkdown, tags, … }  │                                 │
  │ ──────────────────────────────►│                                 │
  │                                │  INSERT nuggets                 │
  │                                │  INSERT reviews (SM-2 start)    │
  │                                │                                 │
  │                                │  SELECT concepts (all existing) │
  │                                │ ───────────────────────────────►│
  │                                │  tool_use: {                    │
  │                                │    title,                       │
  │                                │    existingConcepts + relevance,│
  │                                │    newConcepts + labels         │
  │                                │  }                              │
  │                                │ ◄───────────────────────────── │
  │                                │                                 │
  │                                │  UPDATE nugget (title, tokens)  │
  │                                │  UPSERT nugget_concepts         │
  │                                │  INSERT concepts + labels       │
  │                                │  (only for genuinely new nodes) │
  │                                │                                 │
  │  201 { nugget }                │                                 │
  │ ◄──────────────────────────────│                                 │
```

**Key design decisions:**

- The browser never touches the database — all Prisma/SQLite operations run in Node.js on the server.
- Claude receives the full list of existing concepts so it can match across languages (e.g. `ἀγάπη = Liebe = Love`) before creating new nodes.
- Concept extraction uses forced tool use (`tool_choice: { type: "tool", name: "save_concepts" }`) to guarantee structured JSON output.
- Title generation is a side-effect of extraction — Claude sets the title only if it is still empty (user titles are never overwritten).
- Token usage (`aiInputTokens`, `aiOutputTokens`) is persisted per nugget for cost tracking.

---

## Data Model

```
Nugget ──── NuggetConcept ──── Concept
  │              (relevance)      │
  │                               └── ConceptLabel (de/en/el/he)
  └── Review  (SM-2 state)
  └── Domain  (thematic group)
```

Concepts are **language-neutral nodes** — the same idea can have labels in German, English, Greek, and Hebrew. Edges between concepts are implicit: two concepts are related if they co-occur in the same nuggets.

---

## Spaced Repetition (SM-2)

Each nugget has a `Review` record tracking `nextReview`, `intervalDays`, `easeFactor`, and `repetitions`. The `/` page shows all nuggets due today. After reviewing, the user rates `again / hard / easy` and the SM-2 algorithm schedules the next repetition.

---

## Auth

Single-owner model: one `SESSION_SECRET` cookie, checked server-side in `proxy.ts`. Public visitors can read all nuggets; write operations (POST/PATCH/DELETE) require the owner session.

---

## Development

```bash
npm install
npm run dev
npx prisma migrate dev --name <migration-name>
npx prisma studio
git push origin main   # triggers deploy to Netcup via GitHub Actions
```

**Environment variables required:**

```
DATABASE_URL=file:./dev.db
ADMIN_PASSWORD=…
SESSION_SECRET=…          # 64-char hex
ANTHROPIC_API_KEY=…
```

## GitHub Secrets (Deployment)

| Secret | Inhalt |
|---|---|
| `NETCUP_HOST` | SSH-Hostname |
| `NETCUP_USER` | SSH-Benutzername |
| `NETCUP_PASSWORD` | SSH-Passwort |
