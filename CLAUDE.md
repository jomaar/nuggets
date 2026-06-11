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
- Domains: icon **and** colour are DB-driven (`Domain.icon` = Lucide key e.g. `"Cross"`; `Domain.color` = hex). `components/DomainIcon.tsx` resolves the key via `DOMAIN_ICON_REGISTRY` (the curated icon set — also the source for Session B's admin picker) and renders `color` when `colored`; both fall back to the legacy slug maps / palette (`domainColor()`) when the DB value is null, so un-migrated domains still render. Seed (`prisma/seed.ts`) sets icon/color per domain and self-heals on re-run. Every domain-rendering surface must pass `icon`/`color`, so selects must include both (`domain: true` covers it; an explicit `select` must list them). `components/DomainChips.tsx` is the adaptive selector (icon-only → +short name → +full name by width; `variant="full"` forces names) and is reused by add + edit; the `all` page's filter chips replicate the same adaptive label pattern (they keep their own slug-toggle + "Alle" chip). Short label = `shortName()` (text before " & ", exported from DomainChips).
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
2. ✅ iOS Shortcut → Share Sheet quick-add — **done 2026-06-11**. `app/add` pre-fills
   from query params: `?q=…` (smart single param — http(s) value → treated as link/source,
   anything else → text; this keeps the Shortcut branch-free), plus explicit `?url=` / `?text=`
   for back-compat. Read via `window.location` (NOT `useSearchParams`, avoids the App-Router
   Suspense requirement). The deliberate domain + AI-hint pre-save dialog stays intact.
   NOTE: iOS does NOT let a home-screen PWA register as a Share-Sheet target (no Web Share
   Target API in Safari) — the Shortcut is the bridge; it opens the URL in **Safari**, not the
   standalone PWA. Shortcut build (4 actions): Empfange Eingabe (Share Sheet, accept URLs+Text)
   → **URL codieren** (input = nur `Kurzbefehl-Eingabe`, NICHT die Basis-URL) → **Text**
   = `https://nuggets.jomaar.de/add?q=` + `[Codierte URL]` (the literal `?q=` is typed here, must
   stay un-encoded) → **URLs öffnen** ← `[Text]`. Separate Text action is needed because «URLs
   öffnen» on some iOS versions takes only a variable, no mixed text. Pitfall: encoding the whole
   URL turns `?`/`=` into `%3F`/`%3D` → server sees no query param.
3. ✅ Favicon + PWA/iOS home-screen icon — **done 2026-06-10**. `scripts/generate-icons.mjs`
   rasterizes `assets/nuggets-logo.svg` via `sharp` → `public/icon-192.png` + `public/icon-512.png`
   (opaque white bg, iOS-safe) + `app/favicon.ico` (16/32/48 px, PNG-embedded). Logo is
   trimmed of its baked-in whitespace + centred (`LOGO_SCALE` 0.82). Re-run with
   `node scripts/generate-icons.mjs`. Wiring in `app/layout.tsx` + `public/manifest.json`.
4. pm2 setup on Netcup
7. 💭 **KI-Aktionen beim Edit-Speichern (offen, geplant — nicht gebaut)**: Auf `app/edit`
   beim Speichern optional den (handeditierten) Text nochmal durchs LLM schicken — NICHT um
   den Inhalt zu ändern, sondern Formatierung/Qualität: Doppeltes entfernen, umsortieren
   (Argumentationskette glätten), neu formatieren, auf X % kürzen + zusammenfassen. UI-Idee:
   kleines Pop-up mit auswählbaren Aktionen (mappen je auf einen Prompt-Baustein) + Freitext-
   Feld (vgl. `aiHint` + `reviseContent` aus `app/add`, Revision-Prompt in `lib/concepts.ts`).
   ⚠️ **Kernproblem:** Ein Rewrite zerstört Highlights + Bookmarks (Text-Zitat-Anker am Wortlaut
   von `contentHtml`). **User-Ansatz:** statt in-place umschreiben → das überarbeitete Ergebnis
   als NEUES Nugget anlegen (ohne Bookmarks), das Original unverändert lassen. Vor dem Bauen
   Design klären (eigene Session). Verwandt mit der offenen „Konzepte bei PATCH re-extrahieren"-
   Baustelle (Phase 6 Stufe C).
5. 💭 **Bilder-Idee (offen, erst diskutieren ob sinnvoll)**: Nuggets evtl. mit Bildern
   unterstützen. Idee: Nugget-Inhalt bleibt bewusst bildfrei (Text-Fokus), aber separates
   Bild-Verzeichnis in der Persistenz; Nugget verlinkt nur darauf. Offene Frage: verwässert
   das die Kern-Idee (kurze, fokussierte Text-Nuggets)? Vor Implementierung Pro/Contra klären.
6. ⚙️ **jsdom → linkedom evtl. umstellen**: Die Webseiten-Extraktion (`lib/webpage.ts`,
   Feature „Text aus Link") nutzt `jsdom` + `@mozilla/readability`. `jsdom` ist eine
   schwergewichtige Dependency (Größe + Parse-Zeit auf großen Seiten). Bei Bedarf später auf
   `linkedom` (leichter/schneller, ebenfalls Readability-kompatibel via `parseHTML`)
   umstellen — vorher gegen echte Seiten gegentesten, da linkedom gelegentlich DOM-Eigenheiten hat.
