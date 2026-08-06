-- CreateTable
CREATE TABLE "mark_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "scheme" TEXT NOT NULL,
    "glossary" TEXT NOT NULL DEFAULT '{}',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_nuggets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL DEFAULT '',
    "contentMarkdown" TEXT NOT NULL DEFAULT '',
    "contentHtml" TEXT NOT NULL,
    "contentPlain" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceLabel" TEXT,
    "aiChatUrl" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "markScheme" TEXT NOT NULL DEFAULT '{}',
    "markTemplateId" TEXT,
    "domainId" TEXT,
    "aiInputTokens" INTEGER NOT NULL DEFAULT 0,
    "aiOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "nuggets_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "domains" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "nuggets_markTemplateId_fkey" FOREIGN KEY ("markTemplateId") REFERENCES "mark_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_nuggets" ("aiChatUrl", "aiInputTokens", "aiOutputTokens", "contentHtml", "contentMarkdown", "contentPlain", "createdAt", "domainId", "id", "markScheme", "sourceLabel", "sourceUrl", "tags", "title", "updatedAt") SELECT "aiChatUrl", "aiInputTokens", "aiOutputTokens", "contentHtml", "contentMarkdown", "contentPlain", "createdAt", "domainId", "id", "markScheme", "sourceLabel", "sourceUrl", "tags", "title", "updatedAt" FROM "nuggets";
DROP TABLE "nuggets";
ALTER TABLE "new_nuggets" RENAME TO "nuggets";
CREATE INDEX "nuggets_markTemplateId_idx" ON "nuggets"("markTemplateId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "mark_templates_name_key" ON "mark_templates"("name");
