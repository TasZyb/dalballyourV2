-- AlterEnum
ALTER TYPE "CoinReason" ADD VALUE IF NOT EXISTS 'DAILY_QUIZ';
ALTER TYPE "CoinReason" ADD VALUE IF NOT EXISTS 'PREDICTION_BOOST';

-- CreateEnum
CREATE TYPE "MatchFactEventType" AS ENUM ('GOAL', 'ASSIST', 'OWN_GOAL', 'PENALTY_SCORED', 'PENALTY_MISSED', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION', 'HAT_TRICK', 'PLAYER_OF_MATCH');

-- CreateEnum
CREATE TYPE "DailyQuizQuestionType" AS ENUM ('MATCH_RESULT', 'MATCH_SCORE', 'TEAM_OPPONENT', 'TEAM_TOURNAMENT', 'GOAL_SCORER', 'HAT_TRICK_PLAYER');

-- CreateEnum
CREATE TYPE "PredictionBoostStatus" AS ENUM ('AVAILABLE', 'APPLIED', 'EXPIRED');

-- CreateTable
CREATE TABLE "MatchFactEvent" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT,
    "playerId" TEXT,
    "type" "MatchFactEventType" NOT NULL,
    "minute" INTEGER,
    "value" INTEGER,
    "label" TEXT,
    "metadata" JSONB,
    "source" TEXT,
    "sourceEventId" TEXT,
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchFactEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyQuizQuestion" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "quizDate" TIMESTAMP(3) NOT NULL,
    "type" "DailyQuizQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT,
    "sourceMatchId" TEXT,
    "sourceTeamId" TEXT,
    "sourcePlayerId" TEXT,
    "rewardCoins" INTEGER NOT NULL DEFAULT 10,
    "rewardBoostValue" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyQuizAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "quizDate" TIMESTAMP(3) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "totalQuestions" INTEGER NOT NULL DEFAULT 0,
    "coinsAwarded" INTEGER NOT NULL DEFAULT 0,
    "boostAwardedValue" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyQuizAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedAnswer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyQuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionBoost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sourceAttemptId" TEXT,
    "value" INTEGER NOT NULL DEFAULT 2,
    "status" "PredictionBoostStatus" NOT NULL DEFAULT 'AVAILABLE',
    "expiresAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PredictionBoost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MatchFactEvent_matchId_sourceEventId_key" ON "MatchFactEvent"("matchId", "sourceEventId");

-- CreateIndex
CREATE INDEX "MatchFactEvent_matchId_type_idx" ON "MatchFactEvent"("matchId", "type");

-- CreateIndex
CREATE INDEX "MatchFactEvent_teamId_idx" ON "MatchFactEvent"("teamId");

-- CreateIndex
CREATE INDEX "MatchFactEvent_playerId_idx" ON "MatchFactEvent"("playerId");

-- CreateIndex
CREATE INDEX "DailyQuizQuestion_gameId_quizDate_idx" ON "DailyQuizQuestion"("gameId", "quizDate");

-- CreateIndex
CREATE INDEX "DailyQuizQuestion_sourceMatchId_idx" ON "DailyQuizQuestion"("sourceMatchId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuizAttempt_userId_gameId_quizDate_key" ON "DailyQuizAttempt"("userId", "gameId", "quizDate");

-- CreateIndex
CREATE INDEX "DailyQuizAttempt_gameId_quizDate_idx" ON "DailyQuizAttempt"("gameId", "quizDate");

-- CreateIndex
CREATE INDEX "DailyQuizAttempt_userId_idx" ON "DailyQuizAttempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuizAnswer_attemptId_questionId_key" ON "DailyQuizAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "DailyQuizAnswer_questionId_idx" ON "DailyQuizAnswer"("questionId");

-- CreateIndex
CREATE INDEX "PredictionBoost_userId_gameId_status_idx" ON "PredictionBoost"("userId", "gameId", "status");

-- CreateIndex
CREATE INDEX "PredictionBoost_gameId_idx" ON "PredictionBoost"("gameId");

-- CreateIndex
CREATE INDEX "PredictionBoost_sourceAttemptId_idx" ON "PredictionBoost"("sourceAttemptId");

-- AddForeignKey
ALTER TABLE "MatchFactEvent" ADD CONSTRAINT "MatchFactEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFactEvent" ADD CONSTRAINT "MatchFactEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFactEvent" ADD CONSTRAINT "MatchFactEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizQuestion" ADD CONSTRAINT "DailyQuizQuestion_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizQuestion" ADD CONSTRAINT "DailyQuizQuestion_sourceMatchId_fkey" FOREIGN KEY ("sourceMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizQuestion" ADD CONSTRAINT "DailyQuizQuestion_sourceTeamId_fkey" FOREIGN KEY ("sourceTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizQuestion" ADD CONSTRAINT "DailyQuizQuestion_sourcePlayerId_fkey" FOREIGN KEY ("sourcePlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizAttempt" ADD CONSTRAINT "DailyQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizAttempt" ADD CONSTRAINT "DailyQuizAttempt_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizAnswer" ADD CONSTRAINT "DailyQuizAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DailyQuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyQuizAnswer" ADD CONSTRAINT "DailyQuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DailyQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionBoost" ADD CONSTRAINT "PredictionBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionBoost" ADD CONSTRAINT "PredictionBoost_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionBoost" ADD CONSTRAINT "PredictionBoost_sourceAttemptId_fkey" FOREIGN KEY ("sourceAttemptId") REFERENCES "DailyQuizAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
