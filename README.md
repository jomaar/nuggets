# Nuggets – nuggets.jomaar.de

Spaced Repetition für persönliche Wissens-Nuggets.

## Stack
- Next.js 14 (App Router)
- Prisma + SQLite
- Tailwind CSS
- SM-2 Algorithmus

## Setup lokal

```bash
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run dev
```

## GitHub Secrets für Deployment

| Secret | Inhalt |
|---|---|
| `NETCUP_HOST` | SSH-Hostname von Netcup |
| `NETCUP_USER` | SSH-Benutzername |
| `NETCUP_PASSWORD` | SSH-Passwort |
| `DATABASE_URL` | `file:./prod.db` |

## Deployment
`git push origin main` → GitHub Action baut und deployt automatisch.
