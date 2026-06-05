# Nuggets PWA — Entwicklungsplan

## Vision

Nuggets ist ein persönlicher Wissens-Graph für alle Lebensbereiche: Glaube & Bibel,
Business & Technik, Gesundheit, allgemeines Wissen. Neue Einträge werden mit KI-Unterstützung
angelegt: Claude extrahiert Konzepte, verknüpft sie sprachübergreifend (Liebe = Love = ἀγάπη)
und domänenübergreifend — ein Konzept wie "Systemdenken" verbindet Business- und Health-Nuggets
automatisch. Abrufbar über Spaced Repetition (SM-2).

---

## Domains

Domains sind eine leichtgewichtige Browsing-Hilfe — kein starres Taxonomie-System.
**Konzepte haben keine Domain** (sie verbinden alles). Nur Nuggets haben eine primäre Domain.

| Slug | Name | Inhalte |
|---|---|---|
| `faith` | Glaube & Bibel | Theologie, NT-Griechisch, Hebräisch AT, Bibel-Exegese |
| `business` | Business & Technik | Automatisierung, Robotik, KI, Supply Chain, Manufacturing, Beratung |
| `health` | Gesundheit & Fitness | Training, Ernährung, Schlaf, mentale Gesundheit |
| `books` | Bücher & Ideen | Buchnotizen, Zitate, allgemeines Wissen, Philosophie |

**Design-Entscheidungen:**
- Ein Nugget gehört zu genau einer Domain (keine Mehrfachzuordnung)
- Domains sind erweiterbar, aber der Druck bleibt niedrig — `books` fängt alles auf
- Die domänenübergreifende Vernetzung geschieht über Konzepte, nicht über Domains

### DB-Schema

```prisma
model Domain {
  id      String   @id @default(cuid())
  name    String   @unique  // "Glaube & Bibel"
  slug    String   @unique  // "faith"
  icon    String?           // Emoji, z.B. "✝️", "⚙️", "🏃", "📚"

  nuggets Nugget[]

  @@map("domains")
}

model Nugget {
  // neu:
  domainId String?
  domain   Domain? @relation(fields: [domainId], references: [id])
}
```

### Seed-Daten (werden beim ersten Migrate eingefügt)

```typescript
const domains = [
  { slug: 'faith',    name: 'Glaube & Bibel',     icon: '✝️' },
  { slug: 'business', name: 'Business & Technik',  icon: '⚙️' },
  { slug: 'health',   name: 'Gesundheit & Fitness', icon: '🏃' },
  { slug: 'books',    name: 'Bücher & Ideen',       icon: '📚' },
]
```

### UI-Integration
- Domain-Auswahl beim Anlegen eines Nuggets (Pflichtfeld mit Default `books`)
- Filter in `app/all/page.tsx` — Tab-Leiste oder Dropdown über der Suche
- BottomNav bleibt unverändert

---

## Phase 1 — Markdown-Editor

**Ziel:** Nuggets in Markdown schreiben statt in Plain HTML.

### Was sich ändert
- Formular in `app/add/page.tsx`: Textarea → Markdown-Editor
- Speicherung: `contentMarkdown` (Markdown-Quelle) + `contentHtml` (gerendert)
- Anzeige in `NuggetCard.tsx`: bereits HTML → keine Änderung nötig

### DB-Migration
```prisma
model Nugget {
  // neu:
  contentMarkdown String @default("")
  // contentHtml bleibt (wird aus Markdown generiert)
}
```

### Paket
```bash
npm install @uiw/react-md-editor
```

### Konventionen
- Editor nur client-side (`'use client'`)
- Markdown → HTML via `lib/content.ts` (bestehende Sanitisierung bleibt)
- Vorhandene Nuggets ohne Markdown bekommen `contentMarkdown = ""`

---

## Phase 2 — Konzept-Graph (DB-Schema)

**Ziel:** Sprachübergreifende Konzepte im Wissensnetz — "Liebe" und "Love" und "ἀγάπη"
sind ein Konzept, nicht drei.

### Neue Tabellen

```prisma
model Concept {
  id          String          @id @default(cuid())
  description String          // sprachunabhängig, z.B. "Selbstlose, göttliche Liebe"
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  labels      ConceptLabel[]
  nuggets     NuggetConcept[]

  @@map("concepts")
}

model ConceptLabel {
  id        String  @id @default(cuid())
  conceptId String
  language  String  // "de" | "en" | "el" | "he"
  term      String  // "Liebe" | "Love" | "ἀγάπη" | "אהבה"

  concept   Concept @relation(fields: [conceptId], references: [id], onDelete: Cascade)

  @@unique([conceptId, language, term])
  @@map("concept_labels")
}

model NuggetConcept {
  nuggetId  String
  conceptId String
  relevance Float  @default(1.0)  // 0–1, für spätere Gewichtung

  nugget    Nugget  @relation(fields: [nuggetId], references: [id], onDelete: Cascade)
  concept   Concept @relation(fields: [conceptId], references: [id], onDelete: Cascade)

  @@id([nuggetId, conceptId])
  @@map("nugget_concepts")
}
```

### Wichtige Design-Entscheidungen
- **Kein automatisches Matching** per Embedding — Claude übernimmt das Matching
- `ἀγάπη` und `φιλία` sind verschiedene Konzepte (semantisch korrekt für NT-Griechisch)
- `relevance` ermöglicht später: "dieses Nugget behandelt Liebe nur am Rande"

---

## Phase 3 — Claude API Integration

**Ziel:** Beim Anlegen eines Nuggets extrahiert Claude automatisch Konzepte und
verknüpft sie mit bestehenden Einträgen im Graphen.

### Ablauf
1. User speichert Nugget
2. API Route ruft `lib/concepts.ts` auf
3. Claude bekommt:
   - Den neuen Nugget-Text
   - Liste aller bestehenden Konzepte mit ihren Labels (aus DB)
4. Claude gibt zurück (strukturiertes JSON):
   - Welche bestehenden Konzepte zutreffen (mit Relevanz)
   - Welche neuen Konzepte angelegt werden sollen
5. DB wird aktualisiert

### Prompt-Strategie
```
Bestehende Konzepte: [{id, description, labels: [{language, term}]}]

Neuer Nugget: "..."

Aufgabe: Welche Konzepte sind relevant? Gibt es neue?
Wichtig: ἀγάπη ≠ φιλία ≠ ἔρως (verschiedene Konzepte!)
```

### Technisch
- Paket: `@anthropic-ai/sdk`
- Modell: `claude-haiku-4-5` (günstig, schnell, für Extraktion ausreichend)
- Umgebungsvariable: `ANTHROPIC_API_KEY`
- Nur serverseitig (API Route), nie im Browser
- Fehler bei API-Ausfall: Nugget wird trotzdem gespeichert, Konzepte leer

### Neue Dateien
- `lib/anthropic.ts` — Client-Singleton
- `lib/concepts.ts` — Extraktion + DB-Schreiben

---

## Phase 4 — Vernetzte Anzeige

**Ziel:** "Verwandte Nuggets" auf der NuggetCard und einer Konzept-Detailseite.

### NuggetCard-Erweiterung
- Tags-ähnliche Chips für verknüpfte Konzepte
- Klick auf Konzept → Konzept-Seite

### Neue Seite: `app/concepts/[id]/page.tsx`
- Zeigt alle Nuggets zu einem Konzept
- In allen Sprachen (alle Labels sichtbar)

### API-Erweiterungen
- `GET /api/nuggets/[id]` → gibt auch `concepts` zurück
- `GET /api/concepts` → Liste aller Konzepte
- `GET /api/concepts/[id]` → Konzept mit allen Nuggets

---

## Design

Design-Overhaul bewusst auf **nach Phase 4** verschoben — erst wenn alle Screens bekannt sind:
- Startseite (fällige Nuggets)
- Formular (Markdown-Editor + Domain-Auswahl)
- Alle Nuggets (Domain-Filter + Suche)
- Konzept-Detailseite
- NuggetCard mit Konzept-Chips

Dann einmalig als System gestalten: Typografie, Farben, Abstände, Navigation.

Bis dahin: aktuelles Design bleibt. Punktuelle Fixes bei konkreten Störungen okay,
aber kein Design-Projekt vor Abschluss der Funktionalität.

---

## Offene TODOs (aus CLAUDE.md)

| # | Aufgabe | Prio |
|---|---------|------|
| 1 | Push Notifications (iOS, 3×/day) | mittel |
| 2 | iOS Shortcut → Share Sheet quick-add | niedrig |
| 3 | icon-192.png / icon-512.png | niedrig |
| 4 | pm2 auf Netcup dokumentieren | erledigt |

---

## Reihenfolge

```
Phase 1 (Markdown-Editor + Domains)
  → Phase 2 (DB-Schema für Konzepte)
  → Phase 3 (Claude-Integration)
  → Phase 4 (Vernetzte Anzeige)
  → Push Notifications
```

Jede Phase ist unabhängig deploybar. Phase 2 und 3 können parallel entwickelt werden,
sobald Phase 1 abgeschlossen ist.

Domains kommen in Phase 1, weil sie das Formular und die DB-Migration direkt betreffen —
besser jetzt als später nachzurüsten.
