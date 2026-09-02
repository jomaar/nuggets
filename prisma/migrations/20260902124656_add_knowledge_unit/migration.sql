-- CreateTable
CREATE TABLE "knowledge_units" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nuggetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceId" TEXT,
    "color" TEXT,
    "text" TEXT NOT NULL,
    "gloss" TEXT,
    "quote" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "embedding" BLOB NOT NULL,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL DEFAULT 384,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "knowledge_units_nuggetId_fkey" FOREIGN KEY ("nuggetId") REFERENCES "nuggets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "knowledge_units_nuggetId_idx" ON "knowledge_units"("nuggetId");

-- CreateIndex
CREATE INDEX "knowledge_units_kind_idx" ON "knowledge_units"("kind");

-- CreateIndex
CREATE INDEX "knowledge_units_model_idx" ON "knowledge_units"("model");
