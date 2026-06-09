# Nuggets PWA — Entwicklungsplan

## Vision

Nuggets ist ein persönlicher Wissens-Graph für alle Lebensbereiche: Glaube & Bibel,
Business & Technik, Gesundheit, allgemeines Wissen. Neue Einträge werden mit KI-Unterstützung
angelegt: Claude extrahiert Konzepte, verknüpft sie sprachübergreifend (Liebe = Love = ἀγάπη)
und domänenübergreifend — ein Konzept wie "Systemdenken" verbindet Business- und Health-Nuggets
automatisch. Abrufbar über Spaced Repetition (SM-2).

---

## Lesehilfe — Terminologie

Damit die Gliederung eindeutig bleibt (drei Ebenen, drei Begriffe):

| Begriff | Bedeutung | Beispiel |
|---|---|---|
| **Phase 1…6** | großer Meilenstein, chronologisch | „Phase 6 — Highlights" |
| **Arbeitspaket** (Buchstabe) | abgrenzbares Teilstück *innerhalb* einer Phase | „5g — abstrakte Konzepte" |
| **Stufe A/B/C** | Reihenfolge-Etappen *innerhalb* einer Phase | „Phase 6, Stufe B" |
| **Schritt** (Zahl) | konkrete, abhakbare Einzelaufgabe | „Schritt 7 — BubbleMenu" |

> ⚠️ Früher hieß alles „Phase" — das war mehrdeutig (es gab „Phase 5b" *und* „Phase 6 Phase B").
> Innerhalb von Phasen jetzt nur noch **Arbeitspaket** bzw. **Stufe**.

---

## Status — Abgeschlossen

| Phase / Bereich | Was |
|---|---|
| Phase 1 | Markdown-Editor, Domains, Edit-Seite, Auth (Session-Cookie), DSGVO (Impressum, Datenschutz, self-hosted Fonts) |
| Phase 2 | Konzept-Graph DB-Schema (Concept, ConceptLabel, NuggetConcept) |
| Phase 3 | Claude Integration (inzwischen Opus 4.8): Titel-Generierung, Konzept-Extraktion, Tag-Generierung, URL-Extraktion aus Text |
| Phase 4 | Konzept-Chips auf NuggetCard, /concepts Übersicht, /concepts/[id] Detailseite |
| Phase 5a | Content-Überarbeitung durch Claude (`revisedContent` im Tool-Schema, Toggle "✨ KI-Überarbeitung" in Add) |
| Phase 5b | Domain-spezifische Prompt-Injections (`domainPrompt`-Feld auf Domain) + Admin-UI (`/admin`) |
| Phase 5g | Abstrakte, wiederverwendbare Konzept-Knoten + Named-Entity-Linking; nugget-spezifische Lesart auf der Kante (`NuggetConcept.note`) |
| Phase 6 — Stufe A | Tiptap-Editor ersetzt Textarea in `app/edit`; `contentHtml` kanonisch, `contentMarkdown` als KI-Projektion |
| Phase 6 — Stufe B (teilw.) | Schritt 6 (NuggetCard read-only Tiptap + Highlight-Mark) + Schritt 9 (CSS-Farbpalette) erledigt |
| Infra | Deployment auf Netcup via GitHub Actions, Node 22, pm2, prisma migrate deploy + seed |
| UX | NuggetCard ausklappbar, BottomNav im Root-Layout, AI-generierte Fallback-Titel |
| Tracking | Token-/Kosten-Anzeige für Owner auf /all |
| Security | SSH-Key Auth auf Netcup, Root-Passwort geändert, Session-Cookie-Auth |
| Import | "↑ Datei laden"-Button in Add + Edit (.md, .txt, .html → Markdown via turndown) |

### Produktion
- URL: nuggets.jomaar.de
- DB: `prisma/prod.db` (SQLite auf Netcup), aktuell Testdaten
- Modell: `claude-opus-4-8`, max_tokens: 4096
- Alle Migrations angewandt, Domains geseedet

---

## Offene TODOs

Aufgaben, die **nicht** Teil einer laufenden Phase sind, plus Querverweise auf die, die es sind.

| # | Aufgabe | Prio | Notiz |
|---|---------|------|-------|
| 1 | Phase 5g testen | hoch | Neue Nuggets anlegen, prüfen: Konzepte abstrakt? matcht NEL bestehende? ist `NuggetConcept.note` gefüllt? (`npm run dev` + `npx prisma studio`) |
| 2 | Produktions-DB neu aufsetzen | hoch | Testdaten löschen (Duplikate!), sauber starten (Befehl s. Referenz). Lokale Dev-DB enthält noch alte, zu-spezifische Konzepte aus der Zeit vor 5g |
| 3 | `NuggetConcept.note` im UI anzeigen | mittel | Kanten-Lesart auf /concepts/[id] (pro Nugget) sichtbar machen — Datenfeld da, Frontend nutzt es noch nicht. Nacharbeit zu 5g |
| 4 | Konzepte bei PATCH neu extrahieren | mittel | Aktuell nur bei POST. ⚠️ Achtung Phase 6: kompletter Rewrite würde Highlights zerstören → mit Stufe C absichern |
| 5 | Batch-Datei-Import | mittel | Mehrere Dateien auswählen → je ein Nugget |
| 6 | Force-directed Graph-Visualisierung | mittel | d3 oder react-force-graph, /graph Route |
| 7 | Multi-Color-Highlights fertigstellen | hoch | **→ Phase 6, Stufe B (Schritt 7+8)** — Details in der Phase-6-Sektion |
| 8 | Push Notifications (iOS, 3×/Tag) | niedrig | Web Push API |
| 9 | iOS Shortcut → Share Sheet quick-add | niedrig | |
| 10 | icon-192.png / icon-512.png | niedrig | PWA-Icons fehlen noch |
| ~~11~~ | ~~Save-on-Expand vermeiden~~ | ✅ | **Erledigt 2026-06-08.** `NuggetCard` führt den zuletzt gespeicherten Stand in `lastSavedHtml` mit; die erste `onChange`-Emission (Mount-Re-Normalisierung) setzt nur die Baseline, no-op-PATCHes unterdrückt. `NuggetEditor` liefert `onReady` als Backstop-Baseline (onCreate kann wg. `immediatelyRender:false` *nach* dem ersten onUpdate feuern → reines onReady-Seeding war Race). Browser-verifiziert: Aufklappen → kein PATCH, Highlight → ein PATCH 200 |
| 12 | ChatGPT-Exporter-Ballast bei `.html`-Import | mittel | **Import-Pfad gefixt 2026-06-09** (Commit `33711d7`). **Befund:** Die ursprünglich vermutete JSON-Doppelkodierung existiert in **Prod nicht** (war die inzwischen geleerte Dev-DB). Realer Müll = ChatGPT-Exporter-Chrome in 5 `.html`-importierten Nuggets (Meta-Header `User:/Created:/Link:`, Footer `Powered by ChatGPT Exporter`, `Prompt:/Response:`-Gerüst + Timestamps). Neue `stripImportBallast()` in `lib/content.ts` entfernt das beim Import in `app/add` + `app/edit` (greift nur bei erkanntem Exporter-HTML). **Offen:** Bereinigung der 5 bestehenden Prod-Nuggets — macht der User selbst (Funktion ist wiederverwendbar: `contentHtml` durchschicken, dann `contentMarkdown`/`contentPlain` neu ableiten). |

---

## Phase 5 — KI-Kernkomponente verbessern

Ziel: aus rohem Input (Text, Datei, URL) wird ein sauber strukturierter, verlustfrei
verdichteter Wissensnugget. Arbeitspakete sind mit Buchstaben benannt; Reihenfolge der
Umsetzung war 5a → 5b → 5g (vorgezogen, weil Wurzelproblem), Rest offen.

### Erledigt

#### ✅ 5a — Content-Überarbeitung durch Claude

**Umsetzung:** Kein zweistufiger Aufruf — `save_concepts`-Tool um optionales Feld
`revisedContent` erweitert; System-Prompt bekommt bei aktivem Toggle einen
Revisions-Zusatz (Redundanz raus, Struktur rein, Kürzung ohne Infoverlust).
Ergebnis ersetzt `contentMarkdown`/`contentHtml`/`contentPlain`. Toggle
"✨ KI-Überarbeitung" im Add-Formular, Default: an. Original wird nicht
separat gespeichert (bewusste Entscheidung — Edit-Formular reicht zum Korrigieren).

<details><summary>Ursprünglicher Entwurf</summary>


**Problem:** Rohtexte aus KI-Chats oder Markdown-Exporten sind oft redundant, schlecht
strukturiert, enthalten Nachfragen, Gesprächsartefakte und Wiederholungen.

**Lösung:** Claude überarbeitet den Inhalt aktiv vor dem Speichern:
- Eliminiert Redundanz, ohne Wissen zu verlieren
- Strukturiert neu (Überschriften, Absätze, ggf. Aufzählungen)
- Kürzt ohne Informationsverlust
- Behält Fachbegriffe, Zitate, Quellverweise

**Umsetzung:**
- Zweistufiger API-Aufruf: 1. Inhalt überarbeiten → 2. Konzepte extrahieren (wie heute)
- Oder: erweitertes Tool mit `revisedContent` als zusätzlichem Ausgabefeld
- Überarbeiteter Text wird als `contentMarkdown` gespeichert (Original kann optional erhalten bleiben)
- Toggle im Formular: "KI-Überarbeitung aktivieren" (default: an)

</details>

#### ✅ 5b — Domain-spezifische Prompt-Injections + Admin-UI

**Umsetzung:** `domainPrompt String?` auf `Domain` (Migration `add_domain_prompt`),
in `prisma/seed.ts` mit den vier Entwürfen befüllt, in `extractAndLinkConcepts`
geladen und an `SYSTEM_PROMPT` angehängt. `/api/domains` liefert `domainPrompt`
bewusst nicht aus (`select` eingeschränkt — kein Client-Bedarf).

**Admin-UI (`/admin`, owner-only):**
Domain-Prompts und ein zusätzlicher *globaler Zusatz* (`AppSettings.globalPromptAddition`,
Singleton-Tabelle, Migration `add_app_settings`) sind live editierbar über
`GET/PATCH /api/admin/prompts`. Bewusste Architektur-Entscheidung: Der Code-`SYSTEM_PROMPT`
bleibt unangetastet (strukturkritisch — Tool-Schema-Vertrag), nur **Zusätze** werden
admin-editierbar und in dieser Reihenfolge angehängt:
`SYSTEM_PROMPT + globalPromptAddition + domainPrompt + (REVISION_PROMPT)`.
Geschützt über `proxy.ts` (Seite) und Cookie-Check in der Route (API).

<details><summary>Ursprünglicher Entwurf</summary>


**Problem:** Theologie (NT-Griechisch, Exegese, Konzepte wie ἀγάπη vs. φιλία) braucht
ganz andere Anweisungen als Business/IoT oder Gesundheit.

**Lösung:** Jede Domain hat einen eigenen Zusatz-Prompt, der in den System-Prompt injiziert wird.

**Umsetzung:**
- `domainPrompt`-Feld auf dem `Domain`-Model (Prisma-Migration nötig)
- In `lib/concepts.ts`: `SYSTEM_PROMPT + '\n\n' + domain.domainPrompt`
- Verwaltung über Seed oder Admin-UI (vorerst Seed)

**Entwurf Domain-Prompts:**
```
faith: "This domain covers biblical theology and exegesis. Greek terms (ἀγάπη, φιλία, ἔρως, 
        λόγος etc.) are DISTINCT concepts — never merge them. Hebrew terms should be 
        transliterated. Distinguish NT from OT usage carefully."

business: "This domain covers business, technology, and IoT. Focus on practical frameworks,
           processes, and technical concepts. Distinguish between strategy and implementation."

health: "This domain covers health, fitness, and nutrition. Prefer evidence-based concepts.
         Distinguish between mental and physical health topics."

books: "This domain covers book notes, philosophy, and general knowledge. Capture the 
        author's core argument and key concepts. Note direct quotes explicitly."
```

</details>

#### ✅ 5g — Abstrakte Konzepte + Named-Entity-Linking + Kanten-Lesart

**Problem (das eigentliche Wurzelproblem):** Der Extraktor produzierte *Aussagen* statt
*Konzepte* — z.B. „Logos als Sprach- und Ausdrucksfähigkeit" statt schlicht „Logos".
Solche nuggets-spezifischen Interpretationen können sich per Definition nie mit anderen
Nuggets überschneiden → jedes Konzept hatte genau **1** Nugget, der Graph zerfiel in
Inseln. Ein zwischenzeitlich erwogener **Co-Occurrence-Ansatz** (Kanten zwischen Konzepten,
die im selben Nugget vorkamen) wurde **verworfen**: er erzeugt bei großen Multi-Themen-Nuggets
falsche Verbindungen (verwechselt „stand im selben Text" mit „gehört zusammen") und
„funktionierte" in den Testdaten nur, weil dort Nuggets doppelt lagen.

**Lösung — saubere Trennung Knoten ↔ Kante:**
- **Knoten (`Concept`)** = abstrakt & wiederverwendbar: `Logos`, `Glaube`, `Kreuzestheologie`,
  `Hebräerbrief`. Selbsttest im Prompt: „Könnte ein ganz anderes Nugget denselben Knoten treffen?"
  `Concept.description` disambiguiert Homonyme.
- **Kante (`NuggetConcept.note`)** = was *dieses* Nugget zum Konzept sagt (die spezifische Lesart).
  Neues, nullable Feld (Migration `add_nuggetconcept_note`, ohne Datenverlust auf bestehende DB).
- **Vernetzung** entsteht damit wieder natürlich über **geteilte abstrakte Knoten** — keine
  Co-Occurrence-Tricks nötig. Ein großes Multi-Themen-Nugget hängt an vielen Knoten, jeder
  verbindet robust zu fokussierten kleinen Nuggets.
- **Named-Entity-Linking:** Liste bestehender Konzepte wird wie bisher mitgegeben, aber der
  Prompt zwingt jetzt: „bevorzugt zuordnen, neu anlegen nur wenn wirklich kein Knoten passt;
  im Zweifel matchen".

**Umsetzung (alles in `lib/concepts.ts` + Schema):**
- `SYSTEM_PROMPT` komplett umgeschrieben (Kernprinzip „abstrakte Knoten, keine Aussagen" +
  NEL-Regeln + Erklärung des `note`-Feldes mit Beispiel).
- Tool-Schema `save_concepts`: `note`-Feld bei `existingConcepts` **und** `newConcepts`.
- Persist-Logik schreibt `note` bei Match (upsert) und Neuanlage (create).
- `NuggetConcept.note String?` im Schema; API-Routen liefern es automatisch über bestehende
  `include`-Statements mit (Frontend nutzt es noch nicht — Anzeige offen, s. TODO 3).

### Offen

#### 5c — Per-Nugget Prompt-Ergänzung (mittlere Prio)

**Problem:** Manchmal will man Claude für einen bestimmten Nugget auf etwas Besonderes
hinweisen (z.B. "Fokus auf den Unterschied zwischen Paulus und Johannes").

**Lösung:** Optionales Textfeld im Formular "Hinweis an KI" — wird als zusätzlicher
Kontext an Claude übergeben, aber nicht gespeichert.

**Umsetzung:**
- State `aiHint` in `app/add/page.tsx` und `app/edit/[id]/page.tsx`
- Wird im API-Body mitgeschickt: `{ contentMarkdown, aiHint, ... }`
- In `extractAndLinkConcepts`: als zusätzliche User-Message oder System-Prompt-Ergänzung
- Nicht in der DB gespeichert (einmaliger Hinweis)

#### 5d — URL-Import: Webseite → Nugget (mittlere Prio)

**Problem:** Manchmal reicht ein Link — die Seite soll automatisch geladen und zu einem
Nugget verarbeitet werden.

**Fälle:**
1. Beliebige URL → Seite laden → Text extrahieren → Claude überarbeitet zu Nugget
2. Claude.ai / ChatGPT public link → Konversation extrahieren → zu Nugget verdichten

**Umsetzung:**
- Formular erkennt, wenn der Inhalt nur eine URL ist
- Server-seitiger Fetch (nicht client, wegen CORS): `POST /api/fetch-url { url }`
- HTML → Markdown via `turndown` (serverseitig)
- Dann normaler Überarbeitungs- + Extraktions-Flow
- `sourceUrl` wird automatisch gesetzt

**Einschränkungen:** Viele Seiten blockieren Server-Requests (kein JS-Rendering). Öffentliche
KI-Chat-Links sind oft zugänglich, aber das Format variiert je nach Plattform.

#### 5e — Konzept-Skalierung & Prompt-Effizienz (strategische Frage)

**Problem:** Mit wachsendem Konzeptgraph wird die Liste der bestehenden Konzepte im Prompt
immer länger → höhere Kosten, langsamere Antworten, schlechtere Fokussierung.

**Vergleich mit Karpathy-Ansatz:** Karpathys Wiki ist ein flaches Dokument ohne KI-Matching.
Nuggets geht weiter: strukturierter Graph, sprachübergreifend, mit Relevanzgewichtung.
Der Mehrwert entsteht erst wenn der Graph groß ist — aber dann wird der Prompt groß.

**Mögliche Lösungen:**

1. **Domain-Filterung** (einfach): Nur Konzepte aus der gleichen Domain an Claude schicken.
   Verliert domänen-übergreifende Verbindungen, aber reduziert Prompt-Größe stark.

2. **Frequenz-/Relevanz-Filter** (mittel): Nur Konzepte mit ≥ N Nuggets in den Prompt.
   Seltene Konzepte werden nicht zum Matching angeboten, aber neu angelegt wenn passend.

3. **Lokales Keyword-Matching** (mittel, kein KI-Overhead): Vor dem API-Aufruf per
   Algorithmus prüfen, welche Konzept-Labels im Text vorkommen (Substring-Match, normalisiert).
   Diese vorgematchten Konzepte prominent in den Prompt — Rest weglassen.
   Reduziert KI-Arbeit für offensichtliche Matches, ohne Qualitätsverlust.

4. **Embedding-basiertes Pre-Filtering** (aufwändig): Vektor-Ähnlichkeit um relevante
   Konzepte vorab zu selektieren. Benötigt Embedding-API oder lokales Modell.

**Empfehlung:** Erst 3 (lokales Keyword-Matching) implementieren — kostenlos, schnell,
kombinierbar mit allen anderen Ansätzen. Dann beobachten ab welcher Graph-Größe es
relevant wird.

#### 5f — Inline Concept-Links im Text (niedrige Prio, hoher Mehrwert)

**Idee:** Konzeptbegriffe werden direkt im Nugget-Text verlinkt (wie Wikipedia), nicht
nur als Chips am Ende.

**Beispiel:**
```
"Paulus verwendet [ἀγάπη](/concepts/abc123) in einem anderen Sinn als [φιλία](/concepts/def456)..."
```

**Umsetzung:**
- Nach der Konzept-Extraktion: Text-Postprocessing
- Für jeden verknüpften Begriff: ersten Treffer im Text durch Markdown-Link ersetzen
- Nur erste Erwähnung verlinken (wie Wikipedia)
- Nur wenn der Begriff exakt im Text vorkommt (kein Fuzzy-Match)

---

## Phase 6 — Tiptap-Editor + Multi-Color-Highlights (Kindle-Stil)

**Ziel:** Beim *Lesen* eines Nuggets Text mit mehreren Farben markieren (wie Kindle),
über das normale Markdown hinaus. Highlights überleben das Editieren.

### Entscheidungen (warum so)

- **Tiptap statt Plain-Textarea.** Tiptap war bereits Dependency, wurde aber nirgends benutzt
  (kein `useEditor`). Der entscheidende Grund: Lesen und Bearbeiten leben dann im **selben
  Dokumentmodell** — der Versatz zwischen Markdown-Quelltext (Edit) und gerendertem HTML
  (Lesen) verschwindet. Highlights werden native Tiptap-**Marks**, und Tiptaps eingebautes
  **Position-Mapping** führt sie bei jedem Edit automatisch korrekt nach (einfügen/löschen/
  mittendrin ändern).
- **Highlights als Marks IM Dokument.** Da Markdown keine 5 Farben kodieren kann, wird die
  **kanonische Quelle = `contentHtml`** (kann `<mark data-color="…">`). `contentMarkdown` wird
  zur **Projektion für die KI**, `contentPlain` bleibt für Suche.
  → **Keine Schema-Migration nötig** — Highlights leben im bestehenden `contentHtml`, und der
  Sanitizer in `lib/content.ts` lässt `<mark>` durch (entfernt nur script/iframe/object/on*).
- **KI-Vertrag bleibt unverändert: Markdown rein, Markdown raus.** `extractAndLinkConcepts`
  sendet `contentMarkdown`/`contentPlain` (Markdown) und bekommt `revisedContent` als Markdown
  zurück. Tiptap-Format geht **nie** an die API — vor dem Call Tiptap→Markdown (via `turndown`,
  **Highlight-Marks vorher entfernt** — die KI soll Markierungen nicht sehen), zurück via
  `marked` (MD→HTML).
- **Wann läuft KI-Revision?** **Nur bei POST** (Anlegen, `reviseContent !== false`). **PATCH
  revidiert NICHT** — normales Editieren löst keinen KI-Rewrite aus, Highlights sind sicher.
  ⚠️ **Restrisiko:** ein künftiger „Nugget neu revidieren"-Button (vgl. TODO 4) wäre ein
  kompletter Rewrite von außen → würde Highlights zerstören (kein inkrementelles Edit, Mapping
  kann das nicht retten). Absicherung in Stufe C.

### Stufen & Schritte

#### ✅ Stufe A — Editor-Fundament (Tiptap ersetzt Textarea)

| Schritt | Status | Inhalt |
|---|---|---|
| 1 | ✅ | `@tiptap/extension-highlight` vorhanden (BubbleMenu kommt aus `@tiptap/react`) |
| 2 | ✅ | Gemeinsame Komponente `components/NuggetEditor.tsx` (StarterKit + Link + Placeholder), CSS-Vars passend zu `.nugget-content` |
| 3 | ✅ | `app/edit/[id]/page.tsx`: Textarea + Preview-Toggle → `NuggetEditor`; lädt/speichert `contentHtml` |
| 4 | ✅ | POST + PATCH (`app/api/nuggets/`): `contentHtml` kanonisch; daraus `contentMarkdown` (turndown, Marks entfernt) + `contentPlain` |
| 5 | ✅ | KI-Round-Trip verifiziert (Markdown rein → `revisedContent` Markdown raus → HTML) |

#### ✅ Stufe B — Highlights (das eigentliche Feature, fertig)

| Schritt | Status | Inhalt |
|---|---|---|
| 6 | ✅ | `NuggetCard.tsx`-Leseansicht: `dangerouslySetInnerHTML` → `NuggetEditor` mit `editable={false}` + Highlight-Extension (`multicolor: true`). Lesen & Edit teilen jetzt dasselbe Dokumentmodell |
| 9 | ✅ | CSS-Farbpalette für `<mark data-color>` über CSS-Vars (`--hl-yellow/blue/green/pink/orange` in `globals.css`; Default = gelb) |
| 7 | ✅ | Selektions-BubbleMenu (`@tiptap/react/menus`) mit 5 Farbswatches + „Entfernen". Custom `components/CssVarHighlight.ts` rendert nur `data-color` (kein inline-Style) → CSS-Vars maßgeblich, ⚠️-Problem gelöst |
| 8 | ✅ | Highlight-Änderung → debounced PATCH von `contentHtml`. Leseansicht (`NuggetCard`, `editable={false}`) highlightet jetzt: programmatische Mark-Kommandos laufen auch read-only, `onUpdate` → `onChange` → debounced (800ms) `PATCH {contentHtml}`. `NuggetCard` hält `html` als State (verhindert Revert durch Sync-Effekt), flusht offene Saves beim Unmount. Eigene `shouldShow` überschreibt das Plugin-Default (das sonst bei `!isEditable` blockt). **Browser-Test bestanden** (2026-06-08): Playwright/Chromium Maus-Drag → BubbleMenu erscheint, Mark gesetzt, PATCH 200, Reload-persistent; **Safari/iOS** manuell bestätigt — keine Überlagerung durch natives Selektionsmenü. ⚠️ Nebenbefund s. TODO 11 (Save-on-Expand) |

**Offene Punkte aus Stufe B (→ Stufe C / TODOs):**
- ✅ **Save-on-Expand (gelöst 2026-06-08, TODO 11):** Aufklappen feuerte beim Mount einen no-op-`PATCH`.
  Gelöst über `lastSavedHtml`-Baseline in `NuggetCard` (erste `onChange`-Emission = Baseline, keine
  weiteren no-op-Writes) + `NuggetEditor.onReady`-Backstop. Browser-verifiziert.
- **Mark-Fragmentierung (Verify 2026-06-08):** Selektion über Inline-Grenzen (`<strong>`, `<br>`)
  erzeugt mehrere `<mark>`-Runs statt einem. Optisch korrekt, nur HTML-Bloat. Niedrige Prio.
- **Performance:** Jede *expandierte* `NuggetCard` mountet einen ProseMirror-Editor; bei langen Listen
  im Auge behalten (ggf. read-only auf statisches HTML zurückfallen, solange ein Nugget keine Highlights hat).
- **Nebenbefund (out of scope):** Dev-Log warnt „Duplicate extension names found: ['link']" — Tiptap v3
  `StarterKit` enthält `Link` bereits, das separate `Link.configure(...)` in `NuggetEditor` dupliziert.
  Harmlos, aber bei Gelegenheit aufräumen (Stufe C).

#### Stufe C — Politur & Sicherheit (später)

| Schritt | Status | Inhalt |
|---|---|---|
| 10 | offen | `quote`-Sicherheitsnetz + Warnung bei künftiger Re-Revision eines markierten Nuggets (vgl. TODO 4) |
| 11 | offen | Optional: Highlight-Übersicht pro Nugget (Kindle-Notizübersicht) |

**Kompatibilitätshinweis:** Add-Seite (`app/add`) nutzt noch die alte Markdown-Eingabe — POST
akzeptiert beides (HTML bevorzugt, sonst Markdown), daher kompatibel; Migration der Add-Seite
auf `NuggetEditor` optional.

---

## Referenz — Server-Befehle

> `$SERVER_IP` ist ein Platzhalter (Repo ist public). Die echte IP steht lokal in
> `DEV_TIPS.md` (gitignored). Entweder `export SERVER_IP=…` setzen oder inline ersetzen.

### DB neu aufsetzen (Testdaten löschen)
```bash
ssh root@$SERVER_IP
rm ~/nuggets.jomaar.de/prisma/prod.db
cd ~/nuggets.jomaar.de
export $(grep -v '^#' .env | xargs)
npx prisma migrate deploy
npx prisma db seed
```

### .env geändert (neuer API-Key, neues Secret)
```bash
ssh root@$SERVER_IP
cd ~/nuggets.jomaar.de && bash scripts/reload.sh
```

### Logs prüfen
```bash
ssh root@$SERVER_IP "pm2 logs nuggets --lines 30 --nostream"
```

### DB abfragen
```bash
ssh root@$SERVER_IP "sqlite3 ~/nuggets.jomaar.de/prisma/prod.db 'SELECT id, title, tags FROM nuggets ORDER BY createdAt DESC LIMIT 5;'"
```

---

## Referenz — Domains

| Slug | Name | Inhalte |
|---|---|---|
| `faith` | Glaube & Bibel | Theologie, NT-Griechisch, Hebräisch AT, Bibel-Exegese |
| `business` | Business & Technik | Automatisierung, Robotik, KI, Supply Chain, Manufacturing |
| `health` | Gesundheit & Fitness | Training, Ernährung, Schlaf, mentale Gesundheit |
| `books` | Bücher & Ideen | Buchnotizen, Zitate, allgemeines Wissen, Philosophie |
