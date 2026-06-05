-- CreateTable
CREATE TABLE "nuggets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentHtml" TEXT NOT NULL,
    "contentPlain" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceLabel" TEXT,
    "aiChatUrl" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nuggetId" TEXT NOT NULL,
    "nextReview" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "intervalDays" REAL NOT NULL DEFAULT 1,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reviews_nuggetId_fkey" FOREIGN KEY ("nuggetId") REFERENCES "nuggets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
