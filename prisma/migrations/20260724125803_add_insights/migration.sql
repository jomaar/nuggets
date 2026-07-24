-- CreateTable
CREATE TABLE "insights" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "anchorConceptId" TEXT,
    "refs" TEXT NOT NULL DEFAULT '{}',
    "inputHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "insights_anchorConceptId_fkey" FOREIGN KEY ("anchorConceptId") REFERENCES "concepts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "insights_anchorConceptId_idx" ON "insights"("anchorConceptId");

-- CreateIndex
CREATE INDEX "insights_status_idx" ON "insights"("status");

-- CreateIndex
CREATE UNIQUE INDEX "insights_kind_inputHash_key" ON "insights"("kind", "inputHash");
