-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "globalPromptAddition" TEXT,
    "updatedAt" DATETIME NOT NULL
);
