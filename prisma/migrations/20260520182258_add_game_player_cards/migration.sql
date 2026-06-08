-- CreateTable
CREATE TABLE "GamePlayerCard" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 40,
    "previousRating" INTEGER NOT NULL DEFAULT 40,
    "ratingDelta" INTEGER NOT NULL DEFAULT 0,
    "weightedPoints" INTEGER NOT NULL DEFAULT 0,
    "rawPoints" INTEGER NOT NULL DEFAULT 0,
    "exactHits" INTEGER NOT NULL DEFAULT 0,
    "correctResults" INTEGER NOT NULL DEFAULT 0,
    "wrongHits" INTEGER NOT NULL DEFAULT 0,
    "predictions" INTEGER NOT NULL DEFAULT 0,
    "finishedPicks" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "accuracyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "exactRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "photoUrl" TEXT,
    "clubTeamId" TEXT,
    "statsHash" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamePlayerCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayerCard_gameId_userId_key" ON "GamePlayerCard"("gameId", "userId");

-- CreateIndex
CREATE INDEX "GamePlayerCard_gameId_rating_idx" ON "GamePlayerCard"("gameId", "rating");

-- CreateIndex
CREATE INDEX "GamePlayerCard_userId_idx" ON "GamePlayerCard"("userId");

-- CreateIndex
CREATE INDEX "GamePlayerCard_clubTeamId_idx" ON "GamePlayerCard"("clubTeamId");

-- AddForeignKey
ALTER TABLE "GamePlayerCard" ADD CONSTRAINT "GamePlayerCard_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayerCard" ADD CONSTRAINT "GamePlayerCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePlayerCard" ADD CONSTRAINT "GamePlayerCard_clubTeamId_fkey" FOREIGN KEY ("clubTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
