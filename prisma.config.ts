// Prisma 7 with a prisma.config.ts no longer auto-loads .env — without this the
// CLI silently falls through to the `?? 'file:./dev.db'` default below and
// migrates/seeds an EMPTY scratch DB in the repo root while the app keeps using
// the real one from .env. Loading it here keeps CLI and runtime on one database.
// `dotenv/config` never overwrites variables already set in the environment, so
// the server's own DATABASE_URL still wins.
import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'file:./dev.db',
  },
})
