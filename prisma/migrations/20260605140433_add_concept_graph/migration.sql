-- CreateTable
CREATE TABLE "concepts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "concept_labels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conceptId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    CONSTRAINT "concept_labels_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "nugget_concepts" (
    "nuggetId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "relevance" REAL NOT NULL DEFAULT 1.0,

    PRIMARY KEY ("nuggetId", "conceptId"),
    CONSTRAINT "nugget_concepts_nuggetId_fkey" FOREIGN KEY ("nuggetId") REFERENCES "nuggets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "nugget_concepts_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "concepts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "concept_labels_conceptId_language_term_key" ON "concept_labels"("conceptId", "language", "term");
