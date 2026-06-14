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
app/api/nuggets/[id]/related/ → GET related nuggets (KnowledgeGraph proximity)
app/api/concepts/[id]/related/ → GET related concepts (KnowledgeGraph proximity)
app/api/graph/ego/    → GET ego network (?type=concept|nugget&id=…) — raw bipartite edges
app/graph/page.tsx    → ego-network view (nav tab "Netz"; focus in URL, pushState/popstate)
app/api/bookmarks/    → GET list / POST create
app/api/bookmarks/[id]/ → DELETE
app/api/extract/      → POST { url } → { text } (resolve link: YouTube transcript / web article)
app/api/rework/       → POST { text, prompt } → { result } (owner-only; rework a selected passage with AI)
app/edit/[id]/        → edit nugget form
components/NuggetCard.tsx · BottomNav.tsx · DomainChips.tsx · DomainIcon.tsx · TextStatsBar.tsx · EgoGraph.tsx · GraphSheet.tsx · useLongPress.ts · AiReworkPopup.tsx
lib/prisma.ts · sm2.ts · content.ts · youtube.ts · webpage.ts · textStats.ts · graph.ts · ego.ts · recentNuggets.ts · nuggetFontSize.ts
```

## Rules
- No raw SQL — Prisma only
- Colors via CSS vars (globals.css), not Tailwind colors
- Tags: stored as JSON string → always `JSON.parse(n.tags)`
- Content: always sanitized via lib/content.ts. Canonical format = `contentHtml` (Tiptap, may contain highlight `<mark data-color>`). `contentMarkdown` is a DERIVED projection for the AI (via `htmlToMarkdown`, strips `<mark>`); `contentPlain` for search. Editor: `components/NuggetEditor.tsx` (Tiptap). Highlights roadmap: PLAN.md Phase 6.
- Highlight/selection menu (`components/NuggetEditor.tsx` Tiptap BubbleMenu): pinned to a FIXED point just under the sticky top bar via `getReferencedVirtualElement` (zero-size point at `.sticky`'s bottom edge; `placement:'bottom'`, `flip:false`), NOT anchored to the selection. Why: iOS's native text-selection callout (Copy / Look Up …) hugs the selection and can't be read (UIKit overlay, not in the DOM) — a selection-anchored menu collided with it, and a dynamic "opposite side" rule didn't hold on iPad. Size/style live in globals.css (`.highlight-menu` / `.highlight-swatch` / `.highlight-remove` / `.highlight-ai`); the AI-rework button (`.highlight-ai` + Sparkles) only renders with `enableAiRework` (edit view).
- Edit view save / leave / focus (`app/edit/[id]`): **Speichern stays in edit mode** — it PATCHes, resets the dirty baseline, shows a brief „Gespeichert ✓" flash, and does NOT navigate away (it used to `router.push('/all')`). Leave via the nav whenever. Dirty tracking: `baselineRef` snapshots all persisted fields; `dirty` = live fields ≠ baseline. The CONTENT baseline is corrected to Tiptap's normalized HTML via `NuggetEditor`'s `onReady` (it also `setContent`s the normalized form), so mount-time re-serialization isn't mistaken for an edit — keep `onReady` wired or load always reads dirty. **Unsaved-changes guard** (only while `dirty`): the Abbrechen button (labelled „Schließen" when clean) `confirm()`s; a `beforeunload` listener covers reload/tab-close/external nav; a CAPTURE-phase document click listener catches in-app `<Link>` navigation (App Router has no built-in nav guard) and cancels it on decline — it skips anchors inside `.tiptap-editor` (those don't navigate) and non-primary/modified clicks. NOT covered: the browser/gesture Back button (popstate) — SPA back doesn't fire `beforeunload`. **Focus mode**: a `Maximize2`/`Minimize2` toggle (left of Schließen/Speichern, accent when active, state in `focus`) hides title/domain/source/AI-chat/tags + the „Inhalt"-label row; the editor box gets class `edit-focus-box` → `.ProseMirror { min-height: calc(100dvh - 210px) }` (globals.css) so the body text fills nearly the whole viewport below the sticky bar. Length meter + action buttons stay visible.
- HTML file import (`app/add` + `app/edit`): run raw `.html` through `stripImportBallast()` (lib/content.ts) — strips ChatGPT-Exporter chrome (metadata header, "Powered by" footer, Prompt/Response scaffolding); no-op on non-exporter HTML.
- Highlights popup (app/nugget single view, `Highlighter` toolbar button → `marksOpen`): lists every `<mark>` in reading order as a table-of-contents — tap a row to jump (`scrollToMark`), per-row 🔗 copies a deeplink. Sized for overview: `max-w-xl`, `maxHeight 80vh`, and each row is `line-clamp-2 break-words` (NOT `truncate`) so long highlights wrap to two lines before ellipsis. Row container is `items-start` so the 🔗 button stays on the first line.
- Bookmarks (app/nugget single view + app/page list): reading bookmarks store a **text-quote anchor** (W3C Web Annotation style) — `quote` + `prefix`/`suffix` context + `lineText` for display. NOT a scroll offset or doc index: survives reflow/edits and resolves the right spot when the quote repeats. Capture via `caretRangeFromPoint`, jump via `findRanges()` + `scrollRangeIntoView()` (reused from in-nugget search). Anchor handed to the single view through `sessionStorage` (key `nugget-bookmark-jump`). NO content mutation — bookmarks are metadata, never touch `contentHtml`.
- Cross-nugget deeplinks (`lib/bookmarkLink.ts`): copy a link to a reading spot from one nugget and paste it into another's text to branch there. Reuses the bookmark text-quote anchor — the anchor (`quote`+`prefix`+`suffix`) is base64url-encoded into a `?bm=<token>`; the nugget id lives in the path, so `/nugget/<id>?bm=<token>` fully addresses a spot. Copy actions: per-row 🔗 on the `app/page` bookmark list, and per-mark 🔗 in the single-view highlights popup (`anchorForMark` builds the anchor from a `<mark>`; quote = the highlighted text). `copyDeepLink(path, label)` writes BOTH `text/html` (`<a href>` with human-readable label = highlight text / bookmarked line, URL hidden) and a `text/plain` **Markdown link** `[label](absolute-url)` fallback — so pasting into Tiptap yields a labelled link, AND pasting into the Markdown new-nugget form (`app/add` textarea → `marked` preview) or any Markdown-aware app renders the same hidden-URL hyperlink instead of a bare URL. (The plain-text flavor used to be a bare URL, which is why `app/add` showed the raw link while the Tiptap edit view showed a labelled one.) The `text/plain` URL is ABSOLUTE (works outside the app); the HTML `href` stays relative (in-app portability). **href is SITE-RELATIVE on purpose** (portable across domain/server moves; resolved against the live origin). The single view resolves `?bm=` on mount (URL beats the `sessionStorage` jump) and intercepts clicks on same-origin `/nugget/…?bm=…` links in the read content (`handleContentClick` → `jumpToAnchor`; foreign nugget = navigate, same nugget = jump in place). Tiptap link config lives on `StarterKit.configure({ link: … })` — do NOT add a second `@tiptap/extension-link` (duplicate-extension warning). External absolute-URL variant for sharing = TODO 8.
- Concepts (lib/concepts.ts): nodes are ABSTRACT & reusable ("Logos", not "Logos as expression"); the nugget's specific reading lives on the edge in `NuggetConcept.note`. Extractor uses Named-Entity-Linking (prefer matching existing concepts). Concept model = `claude-opus-4-8`. Granularity guards (2026-06-12): per-note budget computed IN CODE (`conceptBudget`: 3–8 total by word count, ≤ half new), injected into the prompt as concrete numbers AND enforced post-response (`enforceConceptBudget`: relevance-sorted, existing concepts win ties); SYSTEM_PROMPT has an anti-pattern block („X als Y" / „X vs. Y" / source-scoped labels → edge note, not node); new concepts must justify `whyNoExistingMatch` (required tool-schema field). Orphan concepts (no edges) are swept after nugget DELETE (`app/api/nuggets/[id]`). Maintenance scripts (run on server, .env sourced, `npx tsx`): `scripts/cleanup-orphan-concepts.ts`, `scripts/reextract-concepts.ts` (wipes edges + re-extracts; content/highlights/bookmarks untouched), `scripts/set-domain-prompt.ts` (show/set `Domain.domainPrompt` until Session-B admin UI).
- Per-note AI hint (`aiHint`, app/add pre-save dialog): appended LAST to the system prompt in `lib/concepts.ts`, framed as HIGHEST PRIORITY — it overrides the revision/domain/global rules on conflict. The one thing it must NOT override is the structural output contract (the `save_concepts` tool + its required fields) — keep that carve-out when editing the prompt, or responses stop parsing.
- "Text aus Link" (app/add): the content field's URL is resolved server-side via `/api/extract` (browser can't fetch cross-origin). `lib/youtube.ts` (transcript) + `lib/webpage.ts` (Readability article text). MUST stay server-side. Length is guarded: 5 MB byte-cap on web downloads, 100k-char hard cap on returned text (`truncated` flag). Web extractor uses `jsdom` + `@mozilla/readability` — heavy dep, swap to `linkedom` later (see TODO 6).
- Length meter: `lib/textStats.ts` (`countPlainText` for Markdown/add, `countHtml` for HTML/read+edit) + `components/TextStatsBar.tsx`, shown above the text in add/edit/read. Soft warn threshold in app/add = `WARN_CHARS` (20k).
- Domains: icon **and** colour are DB-driven (`Domain.icon` = Lucide key e.g. `"Cross"`; `Domain.color` = hex). `components/DomainIcon.tsx` resolves the key via `DOMAIN_ICON_REGISTRY` (the curated icon set — also the source for Session B's admin picker) and renders `color` when `colored`; both fall back to the legacy slug maps / palette (`domainColor()`) when the DB value is null, so un-migrated domains still render. Seed (`prisma/seed.ts`) sets icon/color per domain and self-heals on re-run. Every domain-rendering surface must pass `icon`/`color`, so selects must include both (`domain: true` covers it; an explicit `select` must list them). `components/DomainChips.tsx` is the adaptive selector (icon-only → +short name → +full name by width; `variant="full"` forces names) and is reused by add + edit; the `all` page's filter chips replicate the same adaptive label pattern (they keep their own slug-toggle + "Alle" chip). Short label = `shortName()` (text before " & ", exported from DomainChips).
- Graph navigation (PLAN.md Phase 8): Stufe A (drill-down lists) is live — related blocks on `/concepts/[id]` + `/nugget/[id]`, fed by `GET …/related` routes wrapping `lib/graph.ts` (`KnowledgeGraph`, derived proximity — never store concept↔concept edges). UI principle: always show WHY a link exists (edge `note` / shared concepts), never just that it exists. Stufe B Kern-Slice is live (2026-06-12): `/graph` ego view — ONE node centered, neighbors radial, tap neighbor = hop (glide animation). Data: `GET /api/graph/ego` (raw `NuggetConcept` edges, NOT proximity; types in `lib/ego.ts`). `components/EgoGraph.tsx` renders center+ring as ONE keyed list so surviving nodes glide via CSS transform transition (no d3/physics — deterministic radial layout). Focus lives in the URL via `window.location` + pushState/popstate (NOT `useSearchParams` — Suspense; back-swipe walks the hop trail). Nav: "Netz" tab → `/graph`, "Konzepte" tab → `/concepts`. Stufe B Slice 1 is live (2026-06-12): `components/GraphSheet.tsx` bottom sheet (peek 40 % ↔ expanded 85 %, NO backdrop — graph stays hoppable behind it; covers BottomNav at z-60). Tap center / tap edge / long-press ring node (`components/useLongPress.ts`, 500 ms, click-suppression via non-passive `touchend` preventDefault) all open the sheet; "Öffnen" navigates to the detail page; full interaction matrix is a comment in `app/graph/page.tsx`. Drag rules: blocking scroll must be declarative (`touch-action: none` — React touch listeners are passive); pointer capture must happen on `pointerdown` (mouse has no implicit capture), buttons exempt (capture would swallow their click). Stufe B rest (Slice 2: Breadcrumb, zweiter Ring — approaches sketched in PLAN.md) open — NO force-directed full graph as primary mobile view. ⚠️ `NuggetReader` in the single view must stay `key={nugget.id}`: same-segment navigation (`/nugget/a → /nugget/b`) re-renders without remounting, but `useHighlightSave` seeds its state/baseline only on mount.
- Root overflow (globals.css `html, body`): MUST be `overflow-x: clip`, NOT `hidden`. The zoom-out guard needs to clip horizontal overflow, but on iOS WebKit `overflow-x: hidden` turns the root into a scroll container (`overflow-y` computes to `auto`) — that **breaks `position: sticky`** (the single-view action bar with the bookmark button scrolled away) AND detaches window scrolling so `window.scrollY` reads 0 (the recent-nuggets scroll save/restore stored/restored 0). `clip` clips identically but creates no scroll container. Desktop Chromium is forgiving (sticky also broke there, but window scroll still worked), so verify sticky/scroll behaviour with this in mind.
- Recently-opened nuggets (`lib/recentNuggets.ts`, app/page top): per-device localStorage list (`nugget-recent-opened`, newest first, cap 10, shows 3) recorded on single-view mount. Each entry also stores the reading **scroll position**; tapping a recent entry sets `sessionStorage['nugget-restore-scroll']` and the single view restores `window.scrollY` (a bookmark `?bm=`/jump target takes precedence). **Save scroll on the throttle/trailing-debounce scroll listener, NEVER on effect cleanup** — leaving via an in-app link scrolls to top first, so a cleanup read clobbers the saved value with 0 (only repro'd on soft nav). `recordRecentNugget` preserves `scrollY` across re-opens. Recent push uses `{ scroll: false }`; restore re-applies the target for ~700ms (async Tiptap render + late scroll-to-top). `getRecentScroll`/`updateRecentScroll`.
- AI rework of a selection (edit view only, PLAN.md TODO 7 edit-variant): select text in `app/edit` → "✨ KI" in the Tiptap selection BubbleMenu (`NuggetEditor` prop `enableAiRework`) opens `components/AiReworkPopup.tsx` → free-text instruction + presets → `POST /api/rework` (owner-guarded, `claude-opus-4-8`, returns ONLY the revised passage) → review / re-send / replace. Replace goes through the editor (`insertContentAt` on the captured range, plain text → inline or `<p>` blocks, HTML-escaped) so it is ordinary editing — **highlights/bookmarks survive**, persisted on normal save. Deliberately edit-view only (read-view in-place replace would break the text-quote anchors). Full-rewrite-on-save is still TODO 7.
- Nugget reading font size (`lib/nuggetFontSize.ts`): per-device size (`nugget-font-size`, 13–24px, default 15) as the CSS var `--nugget-font-size` on `<html>`. Defined in ONE place — `.tiptap-editor .ProseMirror { font-size: var(--nugget-font-size, 15px) }` (read + edit text; rest of UI keeps `--text-base`). Control = "Schriftgröße" row in the single-view info panel (A− / px / A+ / Zurücksetzen). Applied flash-free by an inline boot script in `layout.tsx`. Heading scale is em-relative (`h1` 1.3em, `h2` 1.15em, `h3` 1.05em, line-height 1.3) so headings scale with the control; code is `0.88em` (relative). Keep heading sizes em so the control keeps working.
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
7. 💭 **KI-Aktionen beim Edit-Speichern (Teil-Variante gebaut, Rest offen)**: ✅ Die
   **Selektions-Überarbeitung** ist gebaut (s. Regel „AI rework of a selection" — Text markieren
   → KI-Popup → ersetzt nur die Selektion über den Editor, Highlights/Bookmarks bleiben). OFFEN
   bleibt die ursprüngliche Idee unten: KI-Aktionen für den GANZEN Text beim Speichern. Auf `app/edit`
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
8. 💭 **Externer Deeplink auf eine Textstelle (offen, geplant)**: Aus *beliebig markiertem
   Text* in einem Nugget eine **absolute** Deeplink-URL (mit Domain) kopieren, um sie extern
   zu verschicken / in Reminders/Kalender abzulegen — Empfänger springt von außen direkt an
   die Stelle. Die Sprung-Mechanik existiert komplett (`?bm=`-Token + Klick/Mount-Resolve aus
   der Highlight-/Bookmark-Deeplink-Arbeit, `lib/bookmarkLink.ts`). Es fehlt nur die Auslöse-UI:
   Selektion abgreifen → Anker bauen (wie `anchorForMark`, nur aus einer Range statt `<mark>`)
   → `copyDeepLink` mit **absoluter** URL (nicht relativ wie die internen Links — extern muss
   die Domain rein). Abgrenzung zu den internen Cross-Nugget-Links (relativ, portabel): das
   hier ist bewusst origin-gebunden für den Versand nach außen.
