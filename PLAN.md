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
