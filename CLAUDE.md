# Nuggets PWA — nuggets.jomaar.de

## Stack
Next.js 14 App Router · TypeScript · Tailwind · Prisma + SQLite · SM-2

## Structure
```
app/page.tsx          → due nuggets today
app/add/page.tsx      → new nugget form
app/all/page.tsx      → all + search
app/api/due/          → GET due nuggets
app/api/nuggets/      → GET list / POST create
app/api/nuggets/[id]/ → GET PATCH DELETE
app/api/nuggets/[id]/review/ → POST SM-2 rating
components/NuggetCard.tsx · BottomNav.tsx
lib/prisma.ts · sm2.ts · content.ts
```

## Rules
- No raw SQL — Prisma only
- Colors via CSS vars (globals.css), not Tailwind colors
- Tags: stored as JSON string → always `JSON.parse(n.tags)`
- Content: always sanitized via lib/content.ts
- Code + comments in English

## Commands
```bash
npm run dev
npx prisma migrate dev --name <name>
npx prisma studio
git push origin main   # triggers deploy
```

## Open TODOs
1. Push Notifications (iOS, 3×/day)
2. iOS Shortcut → Share Sheet quick-add
3. icon-192.png / icon-512.png
4. pm2 setup on Netcup
