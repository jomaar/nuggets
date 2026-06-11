-- AlterTable
ALTER TABLE "domains" ADD COLUMN "color" TEXT;

-- Backfill the four seeded domains so the DB is the source of truth for both
-- icon (now a Lucide icon key, replacing the legacy emoji) and the new accent
-- colour. No-ops on environments that don't have these slugs.
UPDATE "domains" SET "icon" = 'Cross',      "color" = '#CA8A04' WHERE "slug" = 'faith';
UPDATE "domains" SET "icon" = 'Briefcase',  "color" = '#2563EB' WHERE "slug" = 'business';
UPDATE "domains" SET "icon" = 'HeartPulse', "color" = '#DC2626' WHERE "slug" = 'health';
UPDATE "domains" SET "icon" = 'BookOpen',   "color" = '#7C3AED' WHERE "slug" = 'books';
