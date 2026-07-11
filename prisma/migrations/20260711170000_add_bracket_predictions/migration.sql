CREATE TABLE "BracketPrediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "matchId" TEXT,
    "slotKey" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "roundTitle" TEXT NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "winnerTeamId" TEXT,
    "predictedHomeScore" INTEGER,
    "predictedAwayScore" INTEGER,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "weightUsed" INTEGER NOT NULL DEFAULT 1,
    "weightedPointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "wasExact" BOOLEAN NOT NULL DEFAULT false,
    "wasOutcomeOnly" BOOLEAN NOT NULL DEFAULT false,
    "wasWrong" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "scoreCalculatedAt" TIMESTAMP(3),

    CONSTRAINT "BracketPrediction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BracketPrediction_userId_gameId_tournamentId_slotKey_key" ON "BracketPrediction"("userId", "gameId", "tournamentId", "slotKey");
CREATE INDEX "BracketPrediction_gameId_tournamentId_idx" ON "BracketPrediction"("gameId", "tournamentId");
CREATE INDEX "BracketPrediction_userId_gameId_idx" ON "BracketPrediction"("userId", "gameId");
CREATE INDEX "BracketPrediction_matchId_idx" ON "BracketPrediction"("matchId");
CREATE INDEX "BracketPrediction_winnerTeamId_idx" ON "BracketPrediction"("winnerTeamId");

ALTER TABLE "BracketPrediction" ADD CONSTRAINT "BracketPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BracketPrediction" ADD CONSTRAINT "BracketPrediction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BracketPrediction" ADD CONSTRAINT "BracketPrediction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BracketPrediction" ADD CONSTRAINT "BracketPrediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BracketPrediction" ADD CONSTRAINT "BracketPrediction_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BracketPrediction" ADD CONSTRAINT "BracketPrediction_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BracketPrediction" ADD CONSTRAINT "BracketPrediction_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
