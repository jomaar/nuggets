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
app/api/extract/      → POST { url } → { text } (resolve link: YouTube transcript / web article)
app/edit/[id]/        → edit nugget form
components/NuggetCard.tsx · BottomNav.tsx · DomainChips.tsx · DomainIcon.tsx · TextStatsBar.tsx
lib/prisma.ts · sm2.ts · content.ts · youtube.ts · webpage.ts · textStats.ts
```

## Rules
- No raw SQL — Prisma only
- Colors via CSS vars (globals.css), not Tailwind colors
- Tags: stored as JSON string → always `JSON.parse(n.tags)`
- Content: always sanitized via lib/content.ts. Canonical format = `contentHtml` (Tiptap, may contain highlight `<mark data-color>`). `contentMarkdown` is a DERIVED projection for the AI (via `htmlToMarkdown`, strips `<mark>`); `contentPlain` for search. Editor: `components/NuggetEditor.tsx` (Tiptap). Highlights roadmap: PLAN.md Phase 6.
- HTML file import (`app/add` + `app/edit`): run raw `.html` through `stripImportBallast()` (lib/content.ts) — strips ChatGPT-Exporter chrome (metadata header, "Powered by" footer, Prompt/Response scaffolding); no-op on non-exporter HTML.
- Bookmarks (app/nugget single view + app/page list): reading bookmarks store a **text-quote anchor** (W3C Web Annotation style) — `quote` + `prefix`/`suffix` context + `lineText` for display. NOT a scroll offset or doc index: survives reflow/edits and resolves the right spot when the quote repeats. Capture via `caretRangeFromPoint`, jump via `findRanges()` + `scrollRangeIntoView()` (reused from in-nugget search). Anchor handed to the single view through `sessionStorage` (key `nugget-bookmark-jump`). NO content mutation — bookmarks are metadata, never touch `contentHtml`.
- Concepts (lib/concepts.ts): nodes are ABSTRACT & reusable ("Logos", not "Logos as expression"); the nugget's specific reading lives on the edge in `NuggetConcept.note`. Extractor uses Named-Entity-Linking (prefer matching existing concepts). Concept model = `claude-opus-4-8`.
- Per-note AI hint (`aiHint`, app/add pre-save dialog): appended LAST to the system prompt in `lib/concepts.ts`, framed as HIGHEST PRIORITY — it overrides the revision/domain/global rules on conflict. The one thing it must NOT override is the structural output contract (the `save_concepts` tool + its required fields) — keep that carve-out when editing the prompt, or responses stop parsing.
- "Text aus Link" (app/add): the content field's URL is resolved server-side via `/api/extract` (browser can't fetch cross-origin). `lib/youtube.ts` (transcript) + `lib/webpage.ts` (Readability article text). MUST stay server-side. Length is guarded: 5 MB byte-cap on web downloads, 100k-char hard cap on returned text (`truncated` flag). Web extractor uses `jsdom` + `@mozilla/readability` — heavy dep, swap to `linkedom` later (see TODO 6).
- Length meter: `lib/textStats.ts` (`countPlainText` for Markdown/add, `countHtml` for HTML/read+edit) + `components/TextStatsBar.tsx`, shown above the text in add/edit/read. Soft warn threshold in app/add = `WARN_CHARS` (20k).
- Domains: `components/DomainChips.tsx` renders an adaptive selector (icon-only → +short name → +full name by width; `variant="full"` forces names). Each domain has its own colour via `domainColor()` in `components/DomainIcon.tsx` (hand-picked per slug + deterministic palette fallback for new slugs). Domain display names live in the DB (`Domain.name`); short label = text before " & ".
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
3. ✅ Favicon + PWA/iOS home-screen icon — **done 2026-06-10**. `scripts/generate-icons.mjs`
   rasterizes `assets/nuggets-logo.svg` via `sharp` → `public/icon-192.png` + `public/icon-512.png`
   (opaque white bg, iOS-safe) + `app/favicon.ico` (16/32/48 px, PNG-embedded). Logo is
   trimmed of its baked-in whitespace + centred (`LOGO_SCALE` 0.82). Re-run with
   `node scripts/generate-icons.mjs`. Wiring in `app/layout.tsx` + `public/manifest.json`.
4. pm2 setup on Netcup
5. 💭 **Bilder-Idee (offen, erst diskutieren ob sinnvoll)**: Nuggets evtl. mit Bildern
   unterstützen. Idee: Nugget-Inhalt bleibt bewusst bildfrei (Text-Fokus), aber separates
   Bild-Verzeichnis in der Persistenz; Nugget verlinkt nur darauf. Offene Frage: verwässert
   das die Kern-Idee (kurze, fokussierte Text-Nuggets)? Vor Implementierung Pro/Contra klären.
6. ⚙️ **jsdom → linkedom evtl. umstellen**: Die Webseiten-Extraktion (`lib/webpage.ts`,
   Feature „Text aus Link") nutzt `jsdom` + `@mozilla/readability`. `jsdom` ist eine
   schwergewichtige Dependency (Größe + Parse-Zeit auf großen Seiten). Bei Bedarf später auf
   `linkedom` (leichter/schneller, ebenfalls Readability-kompatibel via `parseHTML`)
   umstellen — vorher gegen echte Seiten gegentesten, da linkedom gelegentlich DOM-Eigenheiten hat.
