# Nuggets PWA — nuggets.jomaar.de

## Stack
Next.js 14 App Router · TypeScript · Tailwind · Prisma + SQLite · SM-2

## Structure
```
app/page.tsx          → bookmarks list (home tab)
app/today/page.tsx    → due nuggets (parked, off-nav; was the old home tab)
app/add/page.tsx      → new nugget form
app/all/page.tsx      → all + search
app/nugget/[id]/      → single read view (search, highlights, bookmarks)
app/api/due/          → GET due nuggets
app/api/nuggets/      → GET list / POST create
app/api/nuggets/[id]/ → GET PATCH DELETE
app/api/nuggets/[id]/review/ → POST SM-2 rating
app/api/bookmarks/    → GET list / POST create
app/api/bookmarks/[id]/ → DELETE
components/NuggetCard.tsx · BottomNav.tsx
lib/prisma.ts · sm2.ts · content.ts
```

## Rules
- No raw SQL — Prisma only
- Colors via CSS vars (globals.css), not Tailwind colors
- Tags: stored as JSON string → always `JSON.parse(n.tags)`
- Content: always sanitized via lib/content.ts. Canonical format = `contentHtml` (Tiptap, may contain highlight `<mark data-color>`). `contentMarkdown` is a DERIVED projection for the AI (via `htmlToMarkdown`, strips `<mark>`); `contentPlain` for search. Editor: `components/NuggetEditor.tsx` (Tiptap). Highlights roadmap: PLAN.md Phase 6.
- HTML file import (`app/add` + `app/edit`): run raw `.html` through `stripImportBallast()` (lib/content.ts) — strips ChatGPT-Exporter chrome (metadata header, "Powered by" footer, Prompt/Response scaffolding); no-op on non-exporter HTML.
- Bookmarks (app/nugget single view + app/page list): reading bookmarks store a **text-quote anchor** (W3C Web Annotation style) — `quote` + `prefix`/`suffix` context + `lineText` for display. NOT a scroll offset or doc index: survives reflow/edits and resolves the right spot when the quote repeats. Capture via `caretRangeFromPoint`, jump via `findRanges()` + `scrollRangeIntoView()` (reused from in-nugget search). Anchor handed to the single view through `sessionStorage` (key `nugget-bookmark-jump`). NO content mutation — bookmarks are metadata, never touch `contentHtml`.
- Concepts (lib/concepts.ts): nodes are ABSTRACT & reusable ("Logos", not "Logos as expression"); the nugget's specific reading lives on the edge in `NuggetConcept.note`. Extractor uses Named-Entity-Linking (prefer matching existing concepts). Concept model = `claude-opus-4-8`.
- Code + comments in English

## Commands
```bash
npm run dev
npx prisma migrate dev --name <name>
npx prisma studio
git push origin main   # triggers deploy
```

## Development Plan
See `PLAN.md` for the full roadmap (Markdown editor, Concept Graph, Claude API, related nuggets).
`DEV_TIPS.md` (local-only, gitignored) holds dev cheatsheet + real server IP. Server commands in PLAN.md use a `$SERVER_IP` placeholder (public repo).

## Open TODOs
1. Push Notifications (iOS, 3×/day)
2. iOS Shortcut → Share Sheet quick-add
3. icon-192.png / icon-512.png
4. pm2 setup on Netcup
