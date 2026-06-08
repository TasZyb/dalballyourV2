import { MatchStatus, MembershipStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";

type PredictionForRating = {
  id: string;
  pointsAwarded: number;
  weightedPointsAwarded: number;
  wasExact: boolean;
  wasOutcomeOnly: boolean;
  wasWrong: boolean;
  updatedAt: Date;
  scoreCalculatedAt: Date | null;
  match: {
    status: MatchStatus;
    startTime: Date;
  };
};

type RatingStats = {
  rating: number;
  weightedPoints: number;
  rawPoints: number;
  exactHits: number;
  correctResults: number;
  wrongHits: number;
  predictions: number;
  finishedPicks: number;
  currentStreak: number;
  bestStreak: number;
  accuracyRate: number;
  exactRate: number;
  statsHash: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundRate(value: number) {
  return Number(value.toFixed(1));
}

export function calculatePlayerCardRating(
  predictions: PredictionForRating[]
): RatingStats {
  const finishedPredictions = predictions
    .filter((prediction) => prediction.match.status === MatchStatus.FINISHED)
    .sort((a, b) => a.match.startTime.getTime() - b.match.startTime.getTime());

  let weightedPoints = 0;
  let rawPoints = 0;
  let exactHits = 0;
  let correctResults = 0;
  let wrongHits = 0;
  let runningStreak = 0;
  let bestStreak = 0;

  for (const prediction of finishedPredictions) {
    weightedPoints += prediction.weightedPointsAwarded;
    rawPoints += prediction.pointsAwarded;

    if (prediction.wasExact) {
      exactHits += 1;
    }

    if (prediction.wasExact || prediction.wasOutcomeOnly) {
      correctResults += 1;
      runningStreak += 1;
      bestStreak = Math.max(bestStreak, runningStreak);
    } else {
      wrongHits += 1;
      runningStreak = 0;
    }
  }

  let currentStreak = 0;

  for (let i = finishedPredictions.length - 1; i >= 0; i--) {
    const prediction = finishedPredictions[i];

    if (prediction.wasExact || prediction.wasOutcomeOnly) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  const finishedPicks = finishedPredictions.length;
  const accuracyRate =
    finishedPicks > 0 ? (correctResults / finishedPicks) * 100 : 0;
  const exactRate = finishedPicks > 0 ? (exactHits / finishedPicks) * 100 : 0;

  const activityScore = clamp(finishedPicks * 1.5, 0, 12);
  const accuracyScore = accuracyRate * 0.25;
  const exactScore = exactRate * 0.22;
  const pointsScore = clamp(weightedPoints * 0.65, 0, 18);
  const streakScore = clamp(bestStreak * 1.8 + currentStreak * 1.2, 0, 14);
  const penalty = clamp(wrongHits * 0.9, 0, 12);

  const rating = clamp(
    Math.round(
      40 + activityScore + accuracyScore + exactScore + pointsScore + streakScore - penalty
    ),
    40,
    100
  );

  const statsHash = [
    finishedPicks,
    weightedPoints,
    rawPoints,
    exactHits,
    correctResults,
    wrongHits,
    currentStreak,
    bestStreak,
    predictions
      .map((prediction) => {
        const changedAt =
          prediction.scoreCalculatedAt?.toISOString() ??
          prediction.updatedAt.toISOString();

        return `${prediction.id}:${prediction.weightedPointsAwarded}:${changedAt}`;
      })
      .join("|"),
  ].join(":");

  return {
    rating,
    weightedPoints,
    rawPoints,
    exactHits,
    correctResults,
    wrongHits,
    predictions: predictions.length,
    finishedPicks,
    currentStreak,
    bestStreak,
    accuracyRate: roundRate(accuracyRate),
    exactRate: roundRate(exactRate),
    statsHash,
  };
}

export async function syncGamePlayerCards(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      members: {
        where: {
          status: MembershipStatus.ACTIVE,
        },
        include: {
          user: {
            select: {
              id: true,
              image: true,
              favoriteTeamId: true,
            },
          },
        },
      },
      playerCards: {
        select: {
          userId: true,
          rating: true,
          predictions: true,
          statsHash: true,
          computedAt: true,
        },
      },
      gameMatches: {
        where: {
          includeInLeaderboard: true,
        },
        select: {
          matchId: true,
        },
      },
    },
  });

  if (!game) return;

  const leaderboardMatchIds = new Set(
    game.gameMatches.map((gameMatch) => gameMatch.matchId)
  );

  const [predictionCount, latestPredictionUpdate, latestScoreUpdate] =
    await Promise.all([
      prisma.prediction.count({
        where: {
          gameId,
          matchId: {
            in: [...leaderboardMatchIds],
          },
        },
      }),
      prisma.prediction.aggregate({
        where: {
          gameId,
          matchId: {
            in: [...leaderboardMatchIds],
          },
        },
        _max: {
          updatedAt: true,
        },
      }),
      prisma.prediction.aggregate({
        where: {
          gameId,
          matchId: {
            in: [...leaderboardMatchIds],
          },
        },
        _max: {
          scoreCalculatedAt: true,
        },
      }),
    ]);

  const activeMemberIds = new Set(game.members.map((member) => member.userId));
  const activeCards = game.playerCards.filter((card) =>
    activeMemberIds.has(card.userId)
  );
  const cardsPredictionCount = activeCards.reduce(
    (sum, card) => sum + card.predictions,
    0
  );
  const oldestCardComputedAt = activeCards.reduce<Date | null>(
    (oldest, card) =>
      !oldest || card.computedAt < oldest ? card.computedAt : oldest,
    null
  );
  const newestPredictionChange = [
    latestPredictionUpdate._max.updatedAt,
    latestScoreUpdate._max.scoreCalculatedAt,
  ]
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const cacheLooksFresh =
    activeCards.length === game.members.length &&
    cardsPredictionCount === predictionCount &&
    oldestCardComputedAt &&
    (!newestPredictionChange || oldestCardComputedAt >= newestPredictionChange);

  if (cacheLooksFresh) {
    return;
  }

  const predictions = await prisma.prediction.findMany({
    where: {
      gameId,
      matchId: {
        in: [...leaderboardMatchIds],
      },
    },
    include: {
      match: {
        select: {
          status: true,
          startTime: true,
        },
      },
    },
  });

  const predictionsByUserId = new Map<string, PredictionForRating[]>();

  for (const prediction of predictions) {
    const userPredictions = predictionsByUserId.get(prediction.userId) ?? [];
    userPredictions.push(prediction);
    predictionsByUserId.set(prediction.userId, userPredictions);
  }

  const existingCards = new Map(
    game.playerCards.map((card) => [card.userId, card])
  );

  await Promise.all(
    game.members.map(async (member) => {
      const stats = calculatePlayerCardRating(
        predictionsByUserId.get(member.userId) ?? []
      );
      const existingCard = existingCards.get(member.userId);

      if (existingCard?.statsHash === stats.statsHash) {
        return;
      }

      await prisma.gamePlayerCard.upsert({
        where: {
          gameId_userId: {
            gameId,
            userId: member.userId,
          },
        },
        create: {
          gameId,
          userId: member.userId,
          rating: stats.rating,
          previousRating: 40,
          ratingDelta: stats.rating - 40,
          weightedPoints: stats.weightedPoints,
          rawPoints: stats.rawPoints,
          exactHits: stats.exactHits,
          correctResults: stats.correctResults,
          wrongHits: stats.wrongHits,
          predictions: stats.predictions,
          finishedPicks: stats.finishedPicks,
          currentStreak: stats.currentStreak,
          bestStreak: stats.bestStreak,
          accuracyRate: stats.accuracyRate,
          exactRate: stats.exactRate,
          photoUrl: member.user.image,
          clubTeamId: member.user.favoriteTeamId,
          statsHash: stats.statsHash,
          computedAt: new Date(),
        },
        update: {
          previousRating: existingCard?.rating ?? 40,
          rating: stats.rating,
          ratingDelta: stats.rating - (existingCard?.rating ?? 40),
          weightedPoints: stats.weightedPoints,
          rawPoints: stats.rawPoints,
          exactHits: stats.exactHits,
          correctResults: stats.correctResults,
          wrongHits: stats.wrongHits,
          predictions: stats.predictions,
          finishedPicks: stats.finishedPicks,
          currentStreak: stats.currentStreak,
          bestStreak: stats.bestStreak,
          accuracyRate: stats.accuracyRate,
          exactRate: stats.exactRate,
          photoUrl: existingCard ? undefined : member.user.image,
          clubTeamId: existingCard ? undefined : member.user.favoriteTeamId,
          statsHash: stats.statsHash,
          computedAt: new Date(),
        },
      });
    })
  );
}
