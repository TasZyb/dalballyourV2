-- CreateEnum
CREATE TYPE "PredictionTeamSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "CoinTransactionType" AS ENUM ('EARN', 'SPEND', 'ADJUST', 'BONUS', 'PENALTY');

-- CreateEnum
CREATE TYPE "CoinReason" AS ENUM ('PARTICIPATION', 'EXACT_SCORE', 'CORRECT_OUTCOME', 'ROUND_WIN', 'GAME_WIN', 'STREAK_BONUS', 'DAILY_BONUS', 'ADMIN_GRANT', 'ADMIN_REMOVE', 'SHOP_PURCHASE');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'LIVE', 'FINISHED', 'CANCELED', 'POSTPONED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DRAFT');

-- CreateEnum
CREATE TYPE "GameVisibility" AS ENUM ('PRIVATE', 'PUBLIC', 'UNLISTED');

-- CreateEnum
CREATE TYPE "GameMemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'LEFT', 'KICKED', 'BANNED');

-- CreateEnum
CREATE TYPE "PlayerPosition" AS ENUM ('GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LineupRole" AS ENUM ('STARTER', 'BENCH', 'ABSENT');

-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('GROUP', 'CAREER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "bio" TEXT,
    "favoriteTeamId" TEXT,
    "favoriteColor" TEXT,
    "profileBanner" TEXT,
    "displayName" TEXT,
    "isProfilePublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "code" TEXT,
    "logo" TEXT,
    "country" TEXT,
    "externalId" TEXT,
    "foundedYear" INTEGER,
    "city" TEXT,
    "stadium" TEXT,
    "website" TEXT,
    "primaryColor" TEXT,
    "secondaryColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamProfile" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "fullName" TEXT,
    "nickname" TEXT,
    "coach" TEXT,
    "venueName" TEXT,
    "venueCapacity" INTEGER,
    "description" TEXT,
    "bannerImage" TEXT,
    "badgeDark" TEXT,
    "badgeLight" TEXT,
    "foundedYear" INTEGER,
    "city" TEXT,
    "country" TEXT,
    "externalSource" TEXT,
    "externalUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "slug" TEXT,
    "photo" TEXT,
    "position" "PlayerPosition" NOT NULL DEFAULT 'UNKNOWN',
    "shirtNumber" INTEGER,
    "age" INTEGER,
    "dateOfBirth" TIMESTAMP(3),
    "nationality" TEXT,
    "countryOfBirth" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "preferredFoot" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isInjured" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "injuryNote" TEXT,
    "marketValue" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearLabel" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "country" TEXT,
    "logo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "seasonId" TEXT,
    "externalId" TEXT,
    "type" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "order" INTEGER,
    "defaultWeight" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "tournamentId" TEXT NOT NULL,
    "roundId" TEXT,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "venue" TEXT,
    "stageLabel" TEXT,
    "matchdayLabel" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "extraHomeScore" INTEGER,
    "extraAwayScore" INTEGER,
    "penaltyHome" INTEGER,
    "penaltyAway" INTEGER,
    "sourceUpdatedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "referee" TEXT,
    "attendance" INTEGER,
    "homeFormation" TEXT,
    "awayFormation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLineup" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "formation" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "coachName" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchLineup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLineupPlayer" (
    "id" TEXT NOT NULL,
    "lineupId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" "LineupRole" NOT NULL DEFAULT 'STARTER',
    "positionLabel" TEXT,
    "shirtNumber" INTEGER,
    "order" INTEGER,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchLineupPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamFormSnapshot" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "seasonId" TEXT,
    "formWindow" INTEGER NOT NULL DEFAULT 5,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "failedToScore" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "formString" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamFormSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerStatSnapshot" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "seasonId" TEXT,
    "appearances" INTEGER NOT NULL DEFAULT 0,
    "starts" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerStatSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "bannerUrl" TEXT,
    "avatarUrl" TEXT,
    "ownerId" TEXT NOT NULL,
    "mode" "GameMode" NOT NULL DEFAULT 'GROUP',
    "favoriteTeamId" TEXT,
    "linkedTournamentId" TEXT,
    "inviteCode" TEXT NOT NULL,
    "visibility" "GameVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "GameStatus" NOT NULL DEFAULT 'ACTIVE',
    "allowJoinByCode" BOOLEAN NOT NULL DEFAULT true,
    "allowMemberPredictionsEdit" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT,
    "scoringExact" INTEGER NOT NULL DEFAULT 3,
    "scoringOutcome" INTEGER NOT NULL DEFAULT 1,
    "scoringWrong" INTEGER NOT NULL DEFAULT 0,
    "defaultRoundWeight" INTEGER NOT NULL DEFAULT 1,
    "lockMinutesBeforeStart" INTEGER NOT NULL DEFAULT 0,
    "participationRewardCoins" INTEGER NOT NULL DEFAULT 0,
    "exactScoreRewardCoins" INTEGER NOT NULL DEFAULT 0,
    "correctOutcomeRewardCoins" INTEGER NOT NULL DEFAULT 0,
    "roundWinRewardCoins" INTEGER NOT NULL DEFAULT 0,
    "gameWinRewardCoins" INTEGER NOT NULL DEFAULT 0,
    "totalPredictions" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "exactPredictions" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "role" "GameMemberRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "nickname" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "kickedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GameMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameInvite" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdById" TEXT,
    "email" TEXT,
    "roleOnJoin" "GameMemberRole" NOT NULL DEFAULT 'MEMBER',
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMatch" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "customWeight" INTEGER,
    "bonusLabel" TEXT,
    "includeInLeaderboard" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "predictionOpensAt" TIMESTAMP(3),
    "predictionClosesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "predictedHome" INTEGER NOT NULL,
    "predictedAway" INTEGER NOT NULL,
    "predictedHomeFormation" TEXT,
    "predictedAwayFormation" TEXT,
    "notes" TEXT,
    "confidenceLevel" INTEGER,
    "predictedFirstTeamToScore" "PredictionTeamSide",
    "predictedBothTeamsToScore" BOOLEAN,
    "predictedTotalGoals" INTEGER,
    "predictedMvpPlayerId" TEXT,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "weightUsed" INTEGER NOT NULL DEFAULT 1,
    "weightedPointsAwarded" INTEGER NOT NULL DEFAULT 0,
    "multiplierUsed" INTEGER NOT NULL DEFAULT 1,
    "wasExact" BOOLEAN NOT NULL DEFAULT false,
    "wasOutcomeOnly" BOOLEAN NOT NULL DEFAULT false,
    "wasWrong" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "scoreCalculatedAt" TIMESTAMP(3),

    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionLineupPick" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamSide" "PredictionTeamSide" NOT NULL,
    "isStarter" BOOLEAN NOT NULL DEFAULT true,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "predictedRole" "LineupRole",
    "predictedPositionLabel" TEXT,
    "order" INTEGER,

    CONSTRAINT "PredictionLineupPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionScorerPick" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamSide" "PredictionTeamSide" NOT NULL,
    "goalsCount" INTEGER NOT NULL DEFAULT 1,
    "minuteHint" INTEGER,
    "isFirstGoalScorer" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER,

    CONSTRAINT "PredictionScorerPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
    "lifetimeSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT,
    "matchId" TEXT,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER,
    "type" "CoinTransactionType" NOT NULL,
    "reason" "CoinReason" NOT NULL,
    "note" TEXT,
    "grantedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_displayName_idx" ON "User"("displayName");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Team_shortName_idx" ON "Team"("shortName");

-- CreateIndex
CREATE INDEX "Team_code_idx" ON "Team"("code");

-- CreateIndex
CREATE INDEX "Team_externalId_idx" ON "Team"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamProfile_teamId_key" ON "TeamProfile"("teamId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Player_externalId_idx" ON "Player"("externalId");

-- CreateIndex
CREATE INDEX "Player_position_idx" ON "Player"("position");

-- CreateIndex
CREATE INDEX "Player_isActive_idx" ON "Player"("isActive");

-- CreateIndex
CREATE INDEX "Player_shirtNumber_idx" ON "Player"("shirtNumber");

-- CreateIndex
CREATE UNIQUE INDEX "player_teamId_name_key" ON "Player"("teamId", "name");

-- CreateIndex
CREATE INDEX "Season_isCurrent_idx" ON "Season"("isCurrent");

-- CreateIndex
CREATE INDEX "Season_externalId_idx" ON "Season"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Season_name_key" ON "Season"("name");

-- CreateIndex
CREATE INDEX "Tournament_seasonId_idx" ON "Tournament"("seasonId");

-- CreateIndex
CREATE INDEX "Tournament_isActive_idx" ON "Tournament"("isActive");

-- CreateIndex
CREATE INDEX "Tournament_externalId_idx" ON "Tournament"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_name_key" ON "Tournament"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_slug_key" ON "Tournament"("slug");

-- CreateIndex
CREATE INDEX "Round_tournamentId_order_idx" ON "Round"("tournamentId", "order");

-- CreateIndex
CREATE INDEX "Round_slug_idx" ON "Round"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Round_tournamentId_name_key" ON "Round"("tournamentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Match_externalId_key" ON "Match"("externalId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_startTime_idx" ON "Match"("tournamentId", "startTime");

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "Match"("roundId");

-- CreateIndex
CREATE INDEX "Match_status_startTime_idx" ON "Match"("status", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Match_homeTeamId_awayTeamId_startTime_key" ON "Match"("homeTeamId", "awayTeamId", "startTime");

-- CreateIndex
CREATE INDEX "MatchLineup_matchId_idx" ON "MatchLineup"("matchId");

-- CreateIndex
CREATE INDEX "MatchLineup_teamId_idx" ON "MatchLineup"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLineup_matchId_teamId_key" ON "MatchLineup"("matchId", "teamId");

-- CreateIndex
CREATE INDEX "MatchLineupPlayer_playerId_idx" ON "MatchLineupPlayer"("playerId");

-- CreateIndex
CREATE INDEX "MatchLineupPlayer_lineupId_role_order_idx" ON "MatchLineupPlayer"("lineupId", "role", "order");

-- CreateIndex
CREATE UNIQUE INDEX "MatchLineupPlayer_lineupId_playerId_key" ON "MatchLineupPlayer"("lineupId", "playerId");

-- CreateIndex
CREATE INDEX "TeamFormSnapshot_teamId_calculatedAt_idx" ON "TeamFormSnapshot"("teamId", "calculatedAt");

-- CreateIndex
CREATE INDEX "TeamFormSnapshot_tournamentId_idx" ON "TeamFormSnapshot"("tournamentId");

-- CreateIndex
CREATE INDEX "TeamFormSnapshot_seasonId_idx" ON "TeamFormSnapshot"("seasonId");

-- CreateIndex
CREATE INDEX "PlayerStatSnapshot_playerId_idx" ON "PlayerStatSnapshot"("playerId");

-- CreateIndex
CREATE INDEX "PlayerStatSnapshot_tournamentId_idx" ON "PlayerStatSnapshot"("tournamentId");

-- CreateIndex
CREATE INDEX "PlayerStatSnapshot_seasonId_idx" ON "PlayerStatSnapshot"("seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStatSnapshot_playerId_tournamentId_seasonId_calculate_key" ON "PlayerStatSnapshot"("playerId", "tournamentId", "seasonId", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Game_slug_key" ON "Game"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Game_inviteCode_key" ON "Game"("inviteCode");

-- CreateIndex
CREATE INDEX "Game_ownerId_idx" ON "Game"("ownerId");

-- CreateIndex
CREATE INDEX "Game_linkedTournamentId_idx" ON "Game"("linkedTournamentId");

-- CreateIndex
CREATE INDEX "Game_favoriteTeamId_idx" ON "Game"("favoriteTeamId");

-- CreateIndex
CREATE INDEX "Game_visibility_status_idx" ON "Game"("visibility", "status");

-- CreateIndex
CREATE INDEX "Game_mode_idx" ON "Game"("mode");

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
CREATE INDEX "Prediction_gameId_matchId_idx" ON "Prediction"("gameId", "matchId");

-- CreateIndex
CREATE INDEX "Prediction_userId_gameId_idx" ON "Prediction"("userId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Prediction_userId_gameId_matchId_key" ON "Prediction"("userId", "gameId", "matchId");

-- CreateIndex
CREATE INDEX "PredictionLineupPick_predictionId_teamSide_order_idx" ON "PredictionLineupPick"("predictionId", "teamSide", "order");

-- CreateIndex
CREATE INDEX "PredictionLineupPick_playerId_idx" ON "PredictionLineupPick"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionLineupPick_predictionId_playerId_key" ON "PredictionLineupPick"("predictionId", "playerId");

-- CreateIndex
CREATE INDEX "PredictionScorerPick_predictionId_order_idx" ON "PredictionScorerPick"("predictionId", "order");

-- CreateIndex
CREATE INDEX "PredictionScorerPick_playerId_idx" ON "PredictionScorerPick"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserWallet_userId_key" ON "UserWallet"("userId");

-- CreateIndex
CREATE INDEX "CoinTransaction_userId_createdAt_idx" ON "CoinTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CoinTransaction_gameId_idx" ON "CoinTransaction"("gameId");

-- CreateIndex
CREATE INDEX "CoinTransaction_matchId_idx" ON "CoinTransaction"("matchId");

-- CreateIndex
CREATE INDEX "CoinTransaction_reason_idx" ON "CoinTransaction"("reason");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_favoriteTeamId_fkey" FOREIGN KEY ("favoriteTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamProfile" ADD CONSTRAINT "TeamProfile_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLineup" ADD CONSTRAINT "MatchLineup_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLineupPlayer" ADD CONSTRAINT "MatchLineupPlayer_lineupId_fkey" FOREIGN KEY ("lineupId") REFERENCES "MatchLineup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLineupPlayer" ADD CONSTRAINT "MatchLineupPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFormSnapshot" ADD CONSTRAINT "TeamFormSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFormSnapshot" ADD CONSTRAINT "TeamFormSnapshot_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamFormSnapshot" ADD CONSTRAINT "TeamFormSnapshot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatSnapshot" ADD CONSTRAINT "PlayerStatSnapshot_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatSnapshot" ADD CONSTRAINT "PlayerStatSnapshot_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStatSnapshot" ADD CONSTRAINT "PlayerStatSnapshot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_favoriteTeamId_fkey" FOREIGN KEY ("favoriteTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_linkedTournamentId_fkey" FOREIGN KEY ("linkedTournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMember" ADD CONSTRAINT "GameMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMember" ADD CONSTRAINT "GameMember_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInvite" ADD CONSTRAINT "GameInvite_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInvite" ADD CONSTRAINT "GameInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatch" ADD CONSTRAINT "GameMatch_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameMatch" ADD CONSTRAINT "GameMatch_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_predictedMvpPlayerId_fkey" FOREIGN KEY ("predictedMvpPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionLineupPick" ADD CONSTRAINT "PredictionLineupPick_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionLineupPick" ADD CONSTRAINT "PredictionLineupPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionScorerPick" ADD CONSTRAINT "PredictionScorerPick_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionScorerPick" ADD CONSTRAINT "PredictionScorerPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserWallet" ADD CONSTRAINT "UserWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoinTransaction" ADD CONSTRAINT "CoinTransaction_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
