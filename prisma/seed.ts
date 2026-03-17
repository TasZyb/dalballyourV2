import {
  PrismaClient,
  GameMemberRole,
  GameStatus,
  GameVisibility,
  MatchStatus,
  MembershipStatus,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

function getBasePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number
) {
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 3;
  }

  const predictedDiff = predictedHome - predictedAway;
  const actualDiff = actualHome - actualAway;

  const predictedOutcome =
    predictedDiff > 0 ? "HOME" : predictedDiff < 0 ? "AWAY" : "DRAW";

  const actualOutcome =
    actualDiff > 0 ? "HOME" : actualDiff < 0 ? "AWAY" : "DRAW";

  if (predictedOutcome === actualOutcome) {
    return 1;
  }

  return 0;
}

async function main() {
  console.log("🌱 Seeding database...");

  /*
   * OPTIONAL HARD CLEANUP
   * Якщо використовуєш prisma db seed без reset — це чистить таблиці вручну.
   * Якщо будеш робити prisma migrate reset, це не обов'язково, але не завадить.
   */
  await prisma.prediction.deleteMany();
  await prisma.gameMatch.deleteMany();
  await prisma.gameInvite.deleteMany();
  await prisma.gameMember.deleteMany();
  await prisma.game.deleteMany();
  await prisma.match.deleteMany();
  await prisma.round.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.season.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  /*
   * SEASON
   */
  const season = await prisma.season.create({
    data: {
      name: "UEFA Season 2025/26",
      yearLabel: "2025/26",
      isCurrent: true,
      startsAt: new Date("2025-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-06-30T23:59:59.000Z"),
    },
  });

  /*
   * TOURNAMENT
   */
  const tournament = await prisma.tournament.create({
    data: {
      name: "Champions League",
      slug: "champions-league",
      country: "Europe",
      isActive: true,
      seasonId: season.id,
    },
  });

  /*
   * ROUNDS
   */
  const round1 = await prisma.round.create({
    data: {
      tournamentId: tournament.id,
      name: "Matchday 1",
      slug: "matchday-1",
      order: 1,
      defaultWeight: 1,
      startsAt: new Date("2025-09-15T00:00:00.000Z"),
      endsAt: new Date("2025-09-18T23:59:59.000Z"),
    },
  });

  const round2 = await prisma.round.create({
    data: {
      tournamentId: tournament.id,
      name: "Matchday 2",
      slug: "matchday-2",
      order: 2,
      defaultWeight: 2,
      startsAt: new Date("2025-09-22T00:00:00.000Z"),
      endsAt: new Date("2025-09-25T23:59:59.000Z"),
    },
  });

  /*
   * TEAMS
   */
  const teams = await Promise.all([
    prisma.team.create({
      data: {
        name: "Arsenal",
        shortName: "ARS",
        code: "ARS",
        country: "England",
      },
    }),
    prisma.team.create({
      data: {
        name: "Barcelona",
        shortName: "BAR",
        code: "BAR",
        country: "Spain",
      },
    }),
    prisma.team.create({
      data: {
        name: "Real Madrid",
        shortName: "RMA",
        code: "RMA",
        country: "Spain",
      },
    }),
    prisma.team.create({
      data: {
        name: "Bayern Munich",
        shortName: "BAY",
        code: "BAY",
        country: "Germany",
      },
    }),
    prisma.team.create({
      data: {
        name: "Manchester City",
        shortName: "MCI",
        code: "MCI",
        country: "England",
      },
    }),
    prisma.team.create({
      data: {
        name: "PSG",
        shortName: "PSG",
        code: "PSG",
        country: "France",
      },
    }),
    prisma.team.create({
      data: {
        name: "Inter",
        shortName: "INT",
        code: "INT",
        country: "Italy",
      },
    }),
    prisma.team.create({
      data: {
        name: "Liverpool",
        shortName: "LIV",
        code: "LIV",
        country: "England",
      },
    }),
  ]);

  /*
   * USERS
   */
  const users = await Promise.all([
    prisma.user.create({
      data: {
        name: "Taras Zubyk",
        email: "taras@test.com",
        displayName: "Taras",
        role: UserRole.ADMIN,
        favoriteColor: "#22c55e",
      },
    }),
    prisma.user.create({
      data: {
        name: "Andrii",
        email: "andrii@test.com",
        displayName: "Andrii",
        role: UserRole.USER,
        favoriteColor: "#3b82f6",
      },
    }),
    prisma.user.create({
      data: {
        name: "Roman",
        email: "roman@test.com",
        displayName: "Roman",
        role: UserRole.USER,
        favoriteColor: "#f59e0b",
      },
    }),
    prisma.user.create({
      data: {
        name: "Ihor",
        email: "ihor@test.com",
        displayName: "Ihor",
        role: UserRole.USER,
        favoriteColor: "#ef4444",
      },
    }),
  ]);

  /*
   * GAME
   */
  const game = await prisma.game.create({
    data: {
      name: "Friends League",
      slug: "friends-league",
      description: "Тестова дружня ліга прогнозів на матчі ЛЧ",
      ownerId: users[0].id,
      linkedTournamentId: tournament.id,
      inviteCode: "JOIN123",
      visibility: GameVisibility.PRIVATE,
      status: GameStatus.ACTIVE,
      allowJoinByCode: true,
      allowMemberPredictionsEdit: true,
      timezone: "Europe/Uzhgorod",
      scoringExact: 3,
      scoringOutcome: 1,
      scoringWrong: 0,
      defaultRoundWeight: 1,
      lockMinutesBeforeStart: 15,
      startsAt: new Date("2025-09-01T00:00:00.000Z"),
    },
  });

  /*
   * GAME INVITE
   */
  await prisma.gameInvite.create({
    data: {
      gameId: game.id,
      code: "FRIENDS-INVITE-001",
      createdById: users[0].id,
      roleOnJoin: GameMemberRole.MEMBER,
      maxUses: 20,
      usedCount: 0,
      expiresAt: new Date("2026-12-31T23:59:59.000Z"),
    },
  });

  /*
   * MEMBERS
   */
  await Promise.all([
    prisma.gameMember.create({
      data: {
        gameId: game.id,
        userId: users[0].id,
        role: GameMemberRole.OWNER,
        status: MembershipStatus.ACTIVE,
        nickname: "Boss",
      },
    }),
    prisma.gameMember.create({
      data: {
        gameId: game.id,
        userId: users[1].id,
        role: GameMemberRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      },
    }),
    prisma.gameMember.create({
      data: {
        gameId: game.id,
        userId: users[2].id,
        role: GameMemberRole.MEMBER,
        status: MembershipStatus.ACTIVE,
      },
    }),
    prisma.gameMember.create({
      data: {
        gameId: game.id,
        userId: users[3].id,
        role: GameMemberRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    }),
  ]);

  /*
   * MATCHES
   * Частина завершені, частина заплановані
   */
  const matches = await Promise.all([
    prisma.match.create({
      data: {
        externalId: "ucl-md1-1",
        tournamentId: tournament.id,
        roundId: round1.id,
        homeTeamId: teams[0].id, // Arsenal
        awayTeamId: teams[1].id, // Barcelona
        venue: "London",
        stageLabel: "League Phase",
        matchdayLabel: "MD1",
        startTime: new Date("2025-09-16T19:00:00.000Z"),
        status: MatchStatus.FINISHED,
        homeScore: 2,
        awayScore: 1,
        sourceUpdatedAt: new Date("2025-09-16T21:00:00.000Z"),
        lockedAt: new Date("2025-09-16T18:45:00.000Z"),
      },
    }),
    prisma.match.create({
      data: {
        externalId: "ucl-md1-2",
        tournamentId: tournament.id,
        roundId: round1.id,
        homeTeamId: teams[2].id, // Real Madrid
        awayTeamId: teams[3].id, // Bayern
        venue: "Madrid",
        stageLabel: "League Phase",
        matchdayLabel: "MD1",
        startTime: new Date("2025-09-16T19:00:00.000Z"),
        status: MatchStatus.FINISHED,
        homeScore: 1,
        awayScore: 1,
        sourceUpdatedAt: new Date("2025-09-16T21:00:00.000Z"),
        lockedAt: new Date("2025-09-16T18:45:00.000Z"),
      },
    }),
    prisma.match.create({
      data: {
        externalId: "ucl-md1-3",
        tournamentId: tournament.id,
        roundId: round1.id,
        homeTeamId: teams[4].id, // Man City
        awayTeamId: teams[5].id, // PSG
        venue: "Manchester",
        stageLabel: "League Phase",
        matchdayLabel: "MD1",
        startTime: new Date("2025-09-17T19:00:00.000Z"),
        status: MatchStatus.FINISHED,
        homeScore: 3,
        awayScore: 0,
        sourceUpdatedAt: new Date("2025-09-17T21:00:00.000Z"),
        lockedAt: new Date("2025-09-17T18:45:00.000Z"),
      },
    }),
    prisma.match.create({
      data: {
        externalId: "ucl-md1-4",
        tournamentId: tournament.id,
        roundId: round1.id,
        homeTeamId: teams[6].id, // Inter
        awayTeamId: teams[7].id, // Liverpool
        venue: "Milan",
        stageLabel: "League Phase",
        matchdayLabel: "MD1",
        startTime: new Date("2025-09-17T19:00:00.000Z"),
        status: MatchStatus.FINISHED,
        homeScore: 0,
        awayScore: 2,
        sourceUpdatedAt: new Date("2025-09-17T21:00:00.000Z"),
        lockedAt: new Date("2025-09-17T18:45:00.000Z"),
      },
    }),
    prisma.match.create({
      data: {
        externalId: "ucl-md2-1",
        tournamentId: tournament.id,
        roundId: round2.id,
        homeTeamId: teams[1].id, // Barcelona
        awayTeamId: teams[2].id, // Real Madrid
        venue: "Barcelona",
        stageLabel: "League Phase",
        matchdayLabel: "MD2",
        startTime: new Date("2025-09-23T19:00:00.000Z"),
        status: MatchStatus.SCHEDULED,
      },
    }),
    prisma.match.create({
      data: {
        externalId: "ucl-md2-2",
        tournamentId: tournament.id,
        roundId: round2.id,
        homeTeamId: teams[3].id, // Bayern
        awayTeamId: teams[4].id, // Man City
        venue: "Munich",
        stageLabel: "League Phase",
        matchdayLabel: "MD2",
        startTime: new Date("2025-09-23T19:00:00.000Z"),
        status: MatchStatus.SCHEDULED,
      },
    }),
    prisma.match.create({
      data: {
        externalId: "ucl-md2-3",
        tournamentId: tournament.id,
        roundId: round2.id,
        homeTeamId: teams[5].id, // PSG
        awayTeamId: teams[6].id, // Inter
        venue: "Paris",
        stageLabel: "League Phase",
        matchdayLabel: "MD2",
        startTime: new Date("2025-09-24T19:00:00.000Z"),
        status: MatchStatus.SCHEDULED,
      },
    }),
    prisma.match.create({
      data: {
        externalId: "ucl-md2-4",
        tournamentId: tournament.id,
        roundId: round2.id,
        homeTeamId: teams[7].id, // Liverpool
        awayTeamId: teams[0].id, // Arsenal
        venue: "Liverpool",
        stageLabel: "League Phase",
        matchdayLabel: "MD2",
        startTime: new Date("2025-09-24T19:00:00.000Z"),
        status: MatchStatus.SCHEDULED,
      },
    }),
  ]);

  /*
   * GAME MATCHES
   * Для round2 дамо customWeight = 2, щоб було видно різницю
   */
  const gameMatches = await Promise.all(
    matches.map((match) =>
      prisma.gameMatch.create({
        data: {
          gameId: game.id,
          matchId: match.id,
          customWeight: match.roundId === round2.id ? 2 : 1,
          includeInLeaderboard: true,
          isLocked: match.status === MatchStatus.FINISHED,
          predictionOpensAt: new Date(
            new Date(match.startTime).getTime() - 1000 * 60 * 60 * 24
          ),
          predictionClosesAt: new Date(
            new Date(match.startTime).getTime() - 1000 * 60 * 15
          ),
        },
      })
    )
  );

  /*
   * PREDEFINED PREDICTIONS
   * Для finished матчів одразу рахуємо pointsAwarded / weightedPointsAwarded
   * Для scheduled — просто прогнози з нульовими поінтами
   */
  const predictionMatrix: Record<
    string,
    { predictedHome: number; predictedAway: number }[]
  > = {
    [users[0].id]: [
      { predictedHome: 2, predictedAway: 1 },
      { predictedHome: 1, predictedAway: 1 },
      { predictedHome: 2, predictedAway: 0 },
      { predictedHome: 0, predictedAway: 2 },
      { predictedHome: 2, predictedAway: 2 },
      { predictedHome: 1, predictedAway: 1 },
      { predictedHome: 2, predictedAway: 1 },
      { predictedHome: 1, predictedAway: 2 },
    ],
    [users[1].id]: [
      { predictedHome: 1, predictedAway: 0 },
      { predictedHome: 2, predictedAway: 1 },
      { predictedHome: 3, predictedAway: 0 },
      { predictedHome: 1, predictedAway: 2 },
      { predictedHome: 1, predictedAway: 1 },
      { predictedHome: 2, predictedAway: 2 },
      { predictedHome: 0, predictedAway: 1 },
      { predictedHome: 2, predictedAway: 2 },
    ],
    [users[2].id]: [
      { predictedHome: 2, predictedAway: 2 },
      { predictedHome: 1, predictedAway: 1 },
      { predictedHome: 2, predictedAway: 1 },
      { predictedHome: 0, predictedAway: 1 },
      { predictedHome: 3, predictedAway: 2 },
      { predictedHome: 1, predictedAway: 0 },
      { predictedHome: 1, predictedAway: 1 },
      { predictedHome: 0, predictedAway: 2 },
    ],
    [users[3].id]: [
      { predictedHome: 3, predictedAway: 1 },
      { predictedHome: 0, predictedAway: 0 },
      { predictedHome: 1, predictedAway: 0 },
      { predictedHome: 0, predictedAway: 3 },
      { predictedHome: 2, predictedAway: 3 },
      { predictedHome: 2, predictedAway: 1 },
      { predictedHome: 2, predictedAway: 0 },
      { predictedHome: 1, predictedAway: 1 },
    ],
  };

  for (const user of users) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const gameMatch = gameMatches.find((gm) => gm.matchId === match.id);

      if (!gameMatch) continue;

      const predictionInput = predictionMatrix[user.id][i];
      const predictedHome = predictionInput.predictedHome;
      const predictedAway = predictionInput.predictedAway;

      let pointsAwarded = 0;
      let wasExact = false;
      let wasOutcomeOnly = false;
      let wasWrong = false;
      let weightUsed = gameMatch.customWeight ?? 1;
      let weightedPointsAwarded = 0;
      let scoreCalculatedAt: Date | null = null;
      let lockedAt: Date | null = null;

      if (
        match.status === MatchStatus.FINISHED &&
        match.homeScore !== null &&
        match.awayScore !== null
      ) {
        pointsAwarded = getBasePoints(
          predictedHome,
          predictedAway,
          match.homeScore,
          match.awayScore
        );

        wasExact = pointsAwarded === 3;
        wasOutcomeOnly = pointsAwarded === 1;
        wasWrong = pointsAwarded === 0;
        weightedPointsAwarded = pointsAwarded * weightUsed;
        scoreCalculatedAt = new Date();
        lockedAt =
          match.lockedAt ??
          new Date(new Date(match.startTime).getTime() - 1000 * 60 * 15);
      }

      await prisma.prediction.create({
        data: {
          userId: user.id,
          gameId: game.id,
          matchId: match.id,
          predictedHome,
          predictedAway,
          pointsAwarded,
          weightUsed,
          weightedPointsAwarded,
          multiplierUsed: 1,
          wasExact,
          wasOutcomeOnly,
          wasWrong,
          submittedAt: new Date(
            new Date(match.startTime).getTime() - 1000 * 60 * 60
          ),
          lockedAt,
          scoreCalculatedAt,
        },
      });
    }
  }

  console.log("✅ Seed finished successfully");
  console.log(`Season: ${season.name}`);
  console.log(`Tournament: ${tournament.name}`);
  console.log(`Game: ${game.name}`);
  console.log(`Invite code: ${game.inviteCode}`);
}

main()
  .catch((error) => {
    console.error("❌ Seed failed");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });