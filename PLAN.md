# Nuggets PWA — Entwicklungsplan

## Vision

Nuggets ist ein persönlicher Wissens-Graph für alle Lebensbereiche: Glaube & Bibel,
Business & Technik, Gesundheit, allgemeines Wissen. Neue Einträge werden mit KI-Unterstützung
angelegt: Claude extrahiert Konzepte, verknüpft sie sprachübergreifend (Liebe = Love = ἀγάπη)
und domänenübergreifend — ein Konzept wie "Systemdenken" verbindet Business- und Health-Nuggets
automatisch. Abrufbar über Spaced Repetition (SM-2).

---

## Status

### ✅ Abgeschlossen

| Phase | Was |
|---|---|
| Phase 1 | Markdown-Editor, Domains, Edit-Seite, Auth (Session-Cookie), DSGVO (Impressum, Datenschutz, self-hosted Fonts) |
| Phase 2 | Konzept-Graph DB-Schema (Concept, ConceptLabel, NuggetConcept) |
| Phase 3 | Claude Sonnet 4.6 Integration: Titel-Generierung, Konzept-Extraktion, Tag-Generierung, URL-Extraktion aus Text |
| Phase 4 | Konzept-Chips auf NuggetCard, /concepts Übersicht, /concepts/[id] Detailseite |
| Infra | Deployment auf Netcup via GitHub Actions, Node 22, pm2, prisma migrate deploy + seed |
| UX | NuggetCard ausklappbar, BottomNav im Root-Layout, AI-generierte Fallback-Titel |
| Tracking | Token-/Kosten-Anzeige für Owner auf /all |
| Security | SSH-Key Auth auf Netcup, Root-Passwort geändert, Session-Cookie-Auth |
| Import | "↑ Datei laden"-Button in Add + Edit (.md, .txt, .html → Markdown via turndown) |
| Phase 5a | Content-Überarbeitung durch Claude (`revisedContent` im Tool-Schema, Toggle "✨ KI-Überarbeitung" in Add) |
| Phase 5b | Domain-spezifische Prompt-Injections (`domainPrompt`-Feld auf Domain, in System-Prompt eingehängt) |
| Admin | `/admin`-Seite (owner-only): Globaler Prompt-Zusatz + Domain-Prompts live editierbar, persistiert in `AppSettings`/`Domain` |

### Produktion
- URL: nuggets.jomaar.de
- DB: `prisma/prod.db` (SQLite auf Netcup), aktuell Testdaten
- Modell: `claude-sonnet-4-6`, max_tokens: 4096
- Alle Migrations angewandt, Domains geseedet

---

## Offene TODOs

| # | Aufgabe | Prio | Notiz |
|---|---------|------|-------|
| 1 | Produktions-DB neu aufsetzen | hoch | Testdaten löschen, sauber starten (Befehl siehe unten) |
| 2 | Konzepte bei PATCH neu extrahieren | mittel | Aktuell nur bei POST (neuer Nugget) |
| 3 | Batch-Datei-Import | mittel | Mehrere Dateien auswählen → je ein Nugget |
| 4 | Force-directed Graph-Visualisierung | mittel | d3 oder react-force-graph, /graph Route |
| 5 | Push Notifications (iOS, 3×/day) | niedrig | Web Push API |
| 6 | iOS Shortcut → Share Sheet quick-add | niedrig | |
| 7 | icon-192.png / icon-512.png | niedrig | PWA-Icons fehlen noch |

---

## Phase 5 — KI-Kernkomponente verbessern

Dies ist die nächste große Entwicklungsphase. Ziel: aus rohem Input (Text, Datei, URL)
wird ein sauber strukturierter, verlustfrei verdichteter Wissensnugget.

---

### ✅ 5a — Content-Überarbeitung durch Claude (erledigt)

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

---

### ✅ 5b — Domain-spezifische Prompt-Injections (erledigt)

**Umsetzung:** `domainPrompt String?` auf `Domain` (Migration `add_domain_prompt`),
in `prisma/seed.ts` mit den vier Entwürfen befüllt, in `extractAndLinkConcepts`
geladen und an `SYSTEM_PROMPT` angehängt. `/api/domains` liefert `domainPrompt`
bewusst nicht aus (`select` eingeschränkt — kein Client-Bedarf).

**Erweiterung — Admin-UI (`/admin`, owner-only):**
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

---

### 5c — Per-Nugget Prompt-Ergänzung (mittlere Prio)

**Problem:** Manchmal will man Claude für einen bestimmten Nugget auf etwas Besonderes
hinweisen (z.B. "Fokus auf den Unterschied zwischen Paulus und Johannes").

**Lösung:** Optionales Textfeld im Formular "Hinweis an KI" — wird als zusätzlicher
Kontext an Claude übergeben, aber nicht gespeichert.

**Umsetzung:**
- State `aiHint` in `app/add/page.tsx` und `app/edit/[id]/page.tsx`
- Wird im API-Body mitgeschickt: `{ contentMarkdown, aiHint, ... }`
- In `extractAndLinkConcepts`: als zusätzliche User-Message oder System-Prompt-Ergänzung
- Nicht in der DB gespeichert (einmaliger Hinweis)

---

### 5d — URL-Import: Webseite → Nugget (mittlere Prio)

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

---

### 5e — Konzept-Skalierung & Prompt-Effizienz (strategische Frage)

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

---

### 5f — Inline Concept-Links im Text (niedrige Prio, hoher Mehrwert)

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

## Server-Befehle (Referenz)

### DB neu aufsetzen (Testdaten löschen)
```bash
ssh root@37.120.184.77
rm ~/nuggets.jomaar.de/prisma/prod.db
cd ~/nuggets.jomaar.de
export $(grep -v '^#' .env | xargs)
npx prisma migrate deploy
npx prisma db seed
```

### .env geändert (neuer API-Key, neues Secret)
```bash
ssh root@37.120.184.77
cd ~/nuggets.jomaar.de && bash scripts/reload.sh
```

### Logs prüfen
```bash
ssh root@37.120.184.77 "pm2 logs nuggets --lines 30 --nostream"
```

### DB abfragen
```bash
ssh root@37.120.184.77 "sqlite3 ~/nuggets.jomaar.de/prisma/prod.db 'SELECT id, title, tags FROM nuggets ORDER BY createdAt DESC LIMIT 5;'"
```

---

## Domains

| Slug | Name | Inhalte |
|---|---|---|
| `faith` | Glaube & Bibel | Theologie, NT-Griechisch, Hebräisch AT, Bibel-Exegese |
| `business` | Business & Technik | Automatisierung, Robotik, KI, Supply Chain, Manufacturing |
| `health` | Gesundheit & Fitness | Training, Ernährung, Schlaf, mentale Gesundheit |
| `books` | Bücher & Ideen | Buchnotizen, Zitate, allgemeines Wissen, Philosophie |
