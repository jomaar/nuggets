-- CreateTable
CREATE TABLE "google_auth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'global',
    "email" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL DEFAULT '',
    "expiresAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scope" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
