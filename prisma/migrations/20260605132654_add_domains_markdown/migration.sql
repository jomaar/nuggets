-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_nuggets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentMarkdown" TEXT NOT NULL DEFAULT '',
    "contentHtml" TEXT NOT NULL,
    "contentPlain" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceLabel" TEXT,
    "aiChatUrl" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "domainId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "nuggets_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_nuggets" ("aiChatUrl", "contentHtml", "contentPlain", "createdAt", "id", "sourceLabel", "sourceUrl", "tags", "updatedAt") SELECT "aiChatUrl", "contentHtml", "contentPlain", "createdAt", "id", "sourceLabel", "sourceUrl", "tags", "updatedAt" FROM "nuggets";
DROP TABLE "nuggets";
ALTER TABLE "new_nuggets" RENAME TO "nuggets";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "domains_name_key" ON "domains"("name");

-- CreateIndex
CREATE UNIQUE INDEX "domains_slug_key" ON "domains"("slug");
