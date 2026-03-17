-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Prediction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "predictedHome" INTEGER NOT NULL,
    "predictedAway" INTEGER NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "weightUsed" INTEGER NOT NULL DEFAULT 1,
    "weightedPointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "multiplierUsed" INTEGER NOT NULL DEFAULT 1,
    "wasExact" BOOLEAN NOT NULL DEFAULT false,
    "wasOutcomeOnly" BOOLEAN NOT NULL DEFAULT false,
    "wasWrong" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lockedAt" DATETIME,
    "scoreCalculatedAt" DATETIME,
    CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prediction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Prediction" ("gameId", "id", "lockedAt", "matchId", "multiplierUsed", "pointsAwarded", "predictedAway", "predictedHome", "scoreCalculatedAt", "submittedAt", "updatedAt", "userId", "wasExact", "wasOutcomeOnly", "wasWrong") SELECT "gameId", "id", "lockedAt", "matchId", "multiplierUsed", "pointsAwarded", "predictedAway", "predictedHome", "scoreCalculatedAt", "submittedAt", "updatedAt", "userId", "wasExact", "wasOutcomeOnly", "wasWrong" FROM "Prediction";
DROP TABLE "Prediction";
ALTER TABLE "new_Prediction" RENAME TO "Prediction";
CREATE INDEX "Prediction_gameId_matchId_idx" ON "Prediction"("gameId", "matchId");
CREATE INDEX "Prediction_userId_gameId_idx" ON "Prediction"("userId", "gameId");
CREATE UNIQUE INDEX "Prediction_userId_gameId_matchId_key" ON "Prediction"("userId", "gameId", "matchId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
