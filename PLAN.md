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
| Phase 3 | Claude Sonnet 4.6 Integration: Titel-Generierung, Konzept-Extraktion, Tag-Generierung, URL-Extraktion |
| Phase 4 | Konzept-Chips auf NuggetCard, /concepts Übersicht, /concepts/[id] Detailseite |
| Infra | Deployment auf Netcup via GitHub Actions, Node 22, pm2, prisma migrate deploy |
| UX | NuggetCard ausklappbar, BottomNav im Root-Layout, AI-generierte Fallback-Titel |
| Tracking | Token-/Kosten-Anzeige für Owner auf /all |

### Produktion
- URL: nuggets.jomaar.de
- DB: `prisma/prod.db` (SQLite auf Netcup)
- Modell: `claude-sonnet-4-6`
- Alle 5 Migrations angewandt, Domains geseedet

---

## Offene TODOs

| # | Aufgabe | Prio | Notiz |
|---|---------|------|-------|
| 1 | ⚠️ ANTHROPIC_API_KEY rotieren | hoch | War kurz in Chat-Verlauf sichtbar |
| 2 | Konzepte bei PATCH neu extrahieren | mittel | Aktuell nur bei POST (neuer Nugget) |
| 3 | Batch-Re-Extraktion für alte Nuggets | mittel | Bestehende Nuggets haben noch keine Konzepte/Titel |
| 4 | Force-directed Graph-Visualisierung | mittel | d3 oder react-force-graph, /graph Route |
| 5 | Push Notifications (iOS, 3×/day) | mittel | Web Push API |
| 6 | iOS Shortcut → Share Sheet quick-add | niedrig | |
| 7 | icon-192.png / icon-512.png | niedrig | PWA-Icons fehlen noch |

---

## Nächste Schritte (Empfehlung)

**Kurzfristig:**
1. API-Key rotieren (Sicherheit)
2. Konzepte bei PATCH re-extrahieren (Konsistenz beim Bearbeiten)
3. Batch-Endpunkt für alte Nuggets (`POST /api/admin/reextract`)

**Mittelfristig:**
4. Graph-Visualisierung — die Konzept-Daten sind da, fehlt nur der visuelle Layer

---

## Domains

| Slug | Name | Inhalte |
|---|---|---|
| `faith` | Glaube & Bibel | Theologie, NT-Griechisch, Hebräisch AT, Bibel-Exegese |
| `business` | Business & Technik | Automatisierung, Robotik, KI, Supply Chain, Manufacturing |
| `health` | Gesundheit & Fitness | Training, Ernährung, Schlaf, mentale Gesundheit |
| `books` | Bücher & Ideen | Buchnotizen, Zitate, allgemeines Wissen, Philosophie |
