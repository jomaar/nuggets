-- CreateTable
CREATE TABLE "short_links" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "nuggetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "short_links_nuggetId_fkey" FOREIGN KEY ("nuggetId") REFERENCES "nuggets" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "short_links_code_key" ON "short_links"("code");

-- CreateIndex
CREATE UNIQUE INDEX "short_links_path_key" ON "short_links"("path");

-- CreateIndex
CREATE INDEX "short_links_nuggetId_idx" ON "short_links"("nuggetId");
