/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Prediction` table. All the data in the column will be lost.
  - You are about to drop the column `weight` on the `Round` table. All the data in the column will be lost.
  - You are about to drop the column `season` on the `Tournament` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[externalId]` on the table `Match` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `gameId` to the `Prediction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Match" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Match" ADD COLUMN "extraAwayScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "extraHomeScore" INTEGER;
ALTER TABLE "Match" ADD COLUMN "lockedAt" DATETIME;
ALTER TABLE "Match" ADD COLUMN "matchdayLabel" TEXT;
ALTER TABLE "Match" ADD COLUMN "penaltyAway" INTEGER;
ALTER TABLE "Match" ADD COLUMN "penaltyHome" INTEGER;
ALTER TABLE "Match" ADD COLUMN "sourceUpdatedAt" DATETIME;
ALTER TABLE "Match" ADD COLUMN "stageLabel" TEXT;
ALTER TABLE "Match" ADD COLUMN "venue" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN "code" TEXT;
ALTER TABLE "Team" ADD COLUMN "country" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastSeenAt" DATETIME;

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "yearLabel" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "bannerUrl" TEXT,
    "avatarUrl" TEXT,
    "ownerId" TEXT NOT NULL,
    "linkedTournamentId" TEXT,
    "inviteCode" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "allowJoinByCode" BOOLEAN NOT NULL DEFAULT true,
    "allowMemberPredictionsEdit" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "scoringExact" INTEGER NOT NULL DEFAULT 3,
    "scoringOutcome" INTEGER NOT NULL DEFAULT 1,
    "scoringWrong" INTEGER NOT NULL DEFAULT 0,
    "defaultRoundWeight" INTEGER NOT NULL DEFAULT 1,
    "lockMinutesBeforeStart" INTEGER NOT NULL DEFAULT 0,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Game_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Game_linkedTournamentId_fkey" FOREIGN KEY ("linkedTournamentId") REFERENCES "Tournament" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nickname" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" DATETIME,
    "kickedAt" DATETIME,
    "lastSeenAt" DATETIME,
    CONSTRAINT "GameMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameMember_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameInvite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdById" TEXT,
    "email" TEXT,
    "roleOnJoin" TEXT NOT NULL DEFAULT 'MEMBER',
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameInvite_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "customWeight" INTEGER,
    "bonusLabel" TEXT,
    "includeInLeaderboard" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "predictionOpensAt" DATETIME,
    "predictionClosesAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameMatch_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameMatch_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
INSERT INTO "new_Prediction" ("id", "matchId", "pointsAwarded", "predictedAway", "predictedHome", "updatedAt", "userId") SELECT "id", "matchId", "pointsAwarded", "predictedAway", "predictedHome", "updatedAt", "userId" FROM "Prediction";
DROP TABLE "Prediction";
ALTER TABLE "new_Prediction" RENAME TO "Prediction";
CREATE INDEX "Prediction_gameId_matchId_idx" ON "Prediction"("gameId", "matchId");
CREATE INDEX "Prediction_userId_gameId_idx" ON "Prediction"("userId", "gameId");
CREATE UNIQUE INDEX "Prediction_userId_gameId_matchId_key" ON "Prediction"("userId", "gameId", "matchId");
CREATE TABLE "new_Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "order" INTEGER,
    "defaultWeight" INTEGER NOT NULL DEFAULT 1,
    "startsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Round_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Round" ("createdAt", "id", "name", "order", "tournamentId", "updatedAt") SELECT "createdAt", "id", "name", "order", "tournamentId", "updatedAt" FROM "Round";
DROP TABLE "Round";
ALTER TABLE "new_Round" RENAME TO "Round";
CREATE INDEX "Round_tournamentId_order_idx" ON "Round"("tournamentId", "order");
CREATE INDEX "Round_slug_idx" ON "Round"("slug");
CREATE UNIQUE INDEX "Round_tournamentId_name_key" ON "Round"("tournamentId", "name");
CREATE TABLE "new_Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "country" TEXT,
    "logo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seasonId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tournament_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Tournament" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "Tournament";
DROP TABLE "Tournament";
ALTER TABLE "new_Tournament" RENAME TO "Tournament";
CREATE INDEX "Tournament_seasonId_idx" ON "Tournament"("seasonId");
CREATE INDEX "Tournament_isActive_idx" ON "Tournament"("isActive");
CREATE UNIQUE INDEX "Tournament_name_key" ON "Tournament"("name");
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Season_isCurrent_idx" ON "Season"("isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Game_inviteCode_key" ON "Game"("inviteCode");

-- CreateIndex
CREATE INDEX "Game_ownerId_idx" ON "Game"("ownerId");

-- CreateIndex
CREATE INDEX "Game_linkedTournamentId_idx" ON "Game"("linkedTournamentId");

-- CreateIndex
CREATE INDEX "Game_visibility_status_idx" ON "Game"("visibility", "status");

-- CreateIndex
CREATE INDEX "GameMember_gameId_role_idx" ON "GameMember"("gameId", "role");

-- CreateIndex
CREATE INDEX "GameMember_userId_idx" ON "GameMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameMember_userId_gameId_key" ON "GameMember"("userId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameInvite_code_key" ON "GameInvite"("code");

-- CreateIndex
CREATE INDEX "GameInvite_gameId_idx" ON "GameInvite"("gameId");

-- CreateIndex
CREATE INDEX "GameInvite_expiresAt_idx" ON "GameInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "GameMatch_gameId_idx" ON "GameMatch"("gameId");

-- CreateIndex
CREATE INDEX "GameMatch_matchId_idx" ON "GameMatch"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "GameMatch_gameId_matchId_key" ON "GameMatch"("gameId", "matchId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_startTime_idx" ON "Match"("tournamentId", "startTime");

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "Match"("roundId");

-- CreateIndex
CREATE INDEX "Match_status_startTime_idx" ON "Match"("status", "startTime");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Team_shortName_idx" ON "Team"("shortName");

-- CreateIndex
CREATE INDEX "Team_code_idx" ON "Team"("code");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_displayName_idx" ON "User"("displayName");
