import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";
import {
  getTeamDisplayName,
  getTeamFlagEmoji,
  getTeamLogoSrc,
  getTournamentLogoSrc,
} from "~/lib/logo-utils";
import {
  guestPreviewUser,
  isGuestPreviewGame,
} from "~/lib/guest-preview.server";

const KNOCKOUT_HINTS = [
  "final",
  "фінал",
  "semi",
  "semifinal",
  "semi-final",
  "1/2",
  "quarter",
  "quarter final",
  "quarter-final",
  "1/4",
  "round of 32",
  "round of 16",
  "1/16",
  "1/8",
  "knockout",
  "playoff",
  "плейоф",
  "плей-оф",
];

const BRACKET_ROUNDS = [
  {
    id: "round32",
    title: "1/16",
    subtitle: "Round of 32",
    expectedMatches: 16,
  },
  {
    id: "round16",
    title: "1/8",
    subtitle: "Round of 16",
    expectedMatches: 8,
  },
  {
    id: "quarter",
    title: "1/4",
    subtitle: "Quarter-finals",
    expectedMatches: 4,
  },
  {
    id: "semi",
    title: "1/2",
    subtitle: "Semi-finals",
    expectedMatches: 2,
  },
  {
    id: "final",
    title: "Фінал",
    subtitle: "Final",
    expectedMatches: 1,
  },
] as const;

const WORLD_CUP_2026_ROUND_32_ORDER = [
  ["GER", "PAR"],
  ["FRA", "SWE"],
  ["RSA", "CAN"],
  ["NED", "MAR"],
  ["POR", "CRO"],
  ["ESP", "AUT"],
  ["USA", "BIH"],
  ["BEL", "SEN"],
  ["BRA", "JPN"],
  ["CIV", "NOR"],
  ["MEX", "ECU"],
  ["ENG", "COD"],
  ["ARG", "CPV"],
  ["AUS", "EGY"],
  ["SUI", "ALG"],
  ["COL", "GHA"],
];

function getPredictionDeadline(startTime: Date, lockMinutesBeforeStart: number) {
  return new Date(startTime.getTime() - lockMinutesBeforeStart * 60 * 1000);
}

function isPredictionLocked(params: {
  matchStatus: string;
  startTime: Date;
  gameMatchIsLocked: boolean;
  predictionClosesAt: Date | null;
  gameLockMinutesBeforeStart: number;
}) {
  const now = new Date();

  if (params.gameMatchIsLocked) return true;
  if (params.matchStatus !== "SCHEDULED") return true;

  const deadline =
    params.predictionClosesAt ??
    getPredictionDeadline(params.startTime, params.gameLockMinutesBeforeStart);

  return now >= deadline;
}

function getRoundLabel(match: {
  round?: { name: string; order: number | null } | null;
  stageLabel?: string | null;
  matchdayLabel?: string | null;
}) {
  return match.round?.name || match.stageLabel || match.matchdayLabel || "Раунд";
}

function isGroupMatch(match: {
  round?: { name: string } | null;
  stageLabel?: string | null;
}) {
  const label = `${match.round?.name ?? ""} ${match.stageLabel ?? ""}`.toLowerCase();
  return label.includes("group") || label.includes("груп");
}

function isKnockoutMatch(match: {
  round?: { name: string } | null;
  stageLabel?: string | null;
  matchdayLabel?: string | null;
}) {
  const label = `${match.round?.name ?? ""} ${match.stageLabel ?? ""} ${
    match.matchdayLabel ?? ""
  }`.toLowerCase();

  return KNOCKOUT_HINTS.some((hint) => label.includes(hint));
}

function getRoundRank(label: string, order: number | null | undefined) {
  if (typeof order === "number") return order;

  const normalized = label.toLowerCase();

  if (normalized.includes("round of 32") || normalized.includes("1/16")) return 10;
  if (normalized.includes("round of 16") || normalized.includes("1/8")) return 20;
  if (normalized.includes("quarter") || normalized.includes("1/4")) return 30;
  if (normalized.includes("semi") || normalized.includes("1/2")) return 40;
  if (normalized.includes("third")) return 50;
  if (normalized.includes("фінал") || normalized.includes("final")) return 60;

  return 25;
}

function getBracketRoundId(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes("round of 32") || normalized.includes("1/16")) {
    return "round32";
  }

  if (normalized.includes("round of 16") || normalized.includes("1/8")) {
    return "round16";
  }

  if (normalized.includes("quarter") || normalized.includes("1/4")) {
    return "quarter";
  }

  if (normalized.includes("semi") || normalized.includes("1/2")) {
    return "semi";
  }

  if (normalized.includes("final") || normalized.includes("фінал")) {
    return "final";
  }

  return "other";
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function clampScore(value: FormDataEntryValue | null) {
  if (value === null || String(value).trim() === "") return null;

  const score = Number(value);

  if (Number.isNaN(score) || score < 0 || score > 20) return null;

  return Math.floor(score);
}

function getOutcome(home: number, away: number) {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

async function requireGameAccess(request: Request, gameId: string) {
  const currentUser = await getCurrentUser(request);

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      slug: true,
      lockMinutesBeforeStart: true,
      allowMemberPredictionsEdit: true,
      defaultRoundWeight: true,
      inviteCode: true,
    },
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

  const isGuestPreview = isGuestPreviewGame(game);
  const activeUser = currentUser ?? guestPreviewUser;

  if (!currentUser && !isGuestPreview) {
    throw redirect("/login");
  }

  if (currentUser && !isGuestPreview) {
    const membership = await prisma.gameMember.findFirst({
      where: {
        gameId,
        userId: currentUser.id,
        status: "ACTIVE",
      },
      select: { id: true },
    });

    if (!membership) {
      throw redirect("/");
    }
  }

  return { currentUser, activeUser, game, isGuestPreview };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const url = new URL(request.url);
  const requestedTournamentId = url.searchParams.get("tournament");
  const requestedView = url.searchParams.get("view");
  const { activeUser, game, isGuestPreview } = await requireGameAccess(
    request,
    gameId
  );

  const gameMatches = await prisma.gameMatch.findMany({
    where: { gameId },
    include: {
      match: {
        include: {
          tournament: true,
          round: true,
          homeTeam: true,
          awayTeam: true,
          predictions: {
            where: {
              gameId,
              userId: activeUser.id,
            },
            take: 1,
          },
        },
      },
    },
    orderBy: [
      { match: { tournament: { name: "asc" } } },
      { match: { round: { order: "asc" } } },
      { match: { startTime: "asc" } },
    ],
  });

  const tournamentIds = [
    ...new Set(gameMatches.map((gameMatch) => gameMatch.match.tournamentId)),
  ];

  const tournamentMatches =
    tournamentIds.length > 0
      ? await prisma.match.findMany({
          where: {
            tournamentId: {
              in: tournamentIds,
            },
          },
          include: {
            tournament: true,
            round: true,
            homeTeam: true,
            awayTeam: true,
            predictions: {
              where: {
                gameId,
                userId: activeUser.id,
              },
              take: 1,
            },
            gameMatches: {
              where: {
                gameId,
              },
              take: 1,
            },
          },
          orderBy: [
            { tournament: { name: "asc" } },
            { round: { order: "asc" } },
            { startTime: "asc" },
          ],
        })
      : [];

  const matches = tournamentMatches.map((match) => {
    const gameMatch = match.gameMatches[0] ?? null;
    const locked = gameMatch
      ? isPredictionLocked({
          matchStatus: match.status,
          startTime: match.startTime,
          gameMatchIsLocked: gameMatch.isLocked,
          predictionClosesAt: gameMatch.predictionClosesAt,
          gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
        })
      : match.status !== "SCHEDULED" || match.startTime <= new Date();

    return {
      gameMatchId: gameMatch?.id ?? `tournament-match-${match.id}`,
      isInGame: Boolean(gameMatch),
      isLocked: locked,
      predictionDeadline:
        gameMatch?.predictionClosesAt ??
        getPredictionDeadline(
          match.startTime,
          game.lockMinutesBeforeStart
        ),
      customWeight: gameMatch?.customWeight ?? null,
      match: {
        id: match.id,
        status: match.status,
        startTime: match.startTime,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        penaltyHome: match.penaltyHome,
        penaltyAway: match.penaltyAway,
        stageLabel: match.stageLabel,
        matchdayLabel: match.matchdayLabel,
        tournament: match.tournament,
        round: match.round,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        myPrediction: match.predictions[0] ?? null,
      },
    };
  });

  const tournamentMap = new Map<string, typeof matches>();

  for (const item of matches) {
    const current = tournamentMap.get(item.match.tournament.id) ?? [];
    current.push(item);
    tournamentMap.set(item.match.tournament.id, current);
  }

  const tournaments = [...tournamentMap.entries()]
    .map(([id, items]) => {
      const first = items[0];
      const groupMatches = items.filter((item) => isGroupMatch(item.match));
      const knockoutMatches = items.filter((item) => isKnockoutMatch(item.match));
      const tableMatches = items.filter(
        (item) => !isGroupMatch(item.match) && !isKnockoutMatch(item.match)
      );
      const type =
        groupMatches.length > 0 && knockoutMatches.length > 0
          ? "GROUP_KNOCKOUT"
          : knockoutMatches.length > 0
          ? "KNOCKOUT"
          : groupMatches.length > 0
          ? "GROUPS"
          : "LEAGUE";

      return {
        id,
        name: first.match.tournament.name,
        logo: first.match.tournament.logo,
        country: first.match.tournament.country,
        type,
        matchesCount: items.length,
        groupMatchesCount: groupMatches.length,
        knockoutMatchesCount: knockoutMatches.length,
        tableMatchesCount: tableMatches.length,
        matches: items,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));

  const selectedTournament =
    tournaments.find((tournament) => tournament.id === requestedTournamentId) ??
    tournaments[0] ??
    null;
  const bracketPredictions =
    selectedTournament && !isGuestPreview
      ? await prisma.bracketPrediction.findMany({
          where: {
            gameId,
            userId: activeUser.id,
            tournamentId: selectedTournament.id,
          },
          orderBy: [{ roundId: "asc" }, { slotIndex: "asc" }],
        })
      : [];
  const selectedMatches = selectedTournament?.matches ?? [];
  const selectedGroupMatches = selectedMatches.filter((item) =>
    isGroupMatch(item.match)
  );
  const selectedKnockoutMatches = selectedMatches.filter((item) =>
    isKnockoutMatch(item.match)
  );
  const selectedTableMatches = selectedMatches.filter(
    (item) => !isGroupMatch(item.match) && !isKnockoutMatch(item.match)
  );
  const defaultView =
    selectedTournament?.type === "GROUP_KNOCKOUT"
      ? "knockout"
      : selectedTournament?.type === "GROUPS"
      ? "groups"
      : selectedTournament?.type === "KNOCKOUT"
      ? "knockout"
      : "table";
  const activeView =
    requestedView === "groups" ||
    requestedView === "knockout" ||
    requestedView === "table"
      ? requestedView
      : defaultView;

  const groupMap = new Map<string, typeof selectedGroupMatches>();

  for (const item of selectedGroupMatches) {
    const label = getRoundLabel(item.match);
    const current = groupMap.get(label) ?? [];
    current.push(item);
    groupMap.set(label, current);
  }

  const groups = [...groupMap.entries()]
    .map(([label, items]) => ({
      label,
      rank: getRoundRank(label, items[0]?.match.round?.order),
      standings: buildStandings(items),
      matches: items.sort(
        (a, b) =>
          new Date(a.match.startTime).getTime() -
          new Date(b.match.startTime).getTime()
      ),
    }))
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, "uk"));

  const roundMap = new Map<string, typeof selectedKnockoutMatches>();

  for (const item of selectedKnockoutMatches) {
    const label = getRoundLabel(item.match);
    const current = roundMap.get(label) ?? [];
    current.push(item);
    roundMap.set(label, current);
  }

  const knockoutRounds = [...roundMap.entries()]
    .map(([label, items]) => ({
      key: `${selectedTournament?.id ?? "tournament"}:${label}`,
      label,
      rank: getRoundRank(label, items[0]?.match.round?.order),
      matches: items.sort(
        (a, b) =>
          new Date(a.match.startTime).getTime() -
          new Date(b.match.startTime).getTime()
      ),
    }))
    .sort((a, b) => a.rank - b.rank);

  return data({
    game,
    tournaments,
    selectedTournament,
    activeView,
    groups,
    knockoutRounds,
    tableMatches: [...selectedTableMatches, ...selectedGroupMatches].sort(
      (a, b) =>
        new Date(a.match.startTime).getTime() -
        new Date(b.match.startTime).getTime()
    ),
    bracketPredictions,
    isGuestPreview,
  });
}

function buildStandings(items: any[]) {
  const table = new Map<
    string,
    {
      team: any;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      points: number;
    }
  >();

  const ensureTeam = (team: any) => {
    const existing = table.get(team.id);

    if (existing) return existing;

    const row = {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    };
    table.set(team.id, row);
    return row;
  };

  for (const item of items) {
    ensureTeam(item.match.homeTeam);
    ensureTeam(item.match.awayTeam);

    if (
      item.match.status !== "FINISHED" ||
      item.match.homeScore === null ||
      item.match.awayScore === null
    ) {
      continue;
    }

    const home = ensureTeam(item.match.homeTeam);
    const away = ensureTeam(item.match.awayTeam);
    const outcome = getOutcome(item.match.homeScore, item.match.awayScore);

    home.played += 1;
    away.played += 1;
    home.goalsFor += item.match.homeScore;
    home.goalsAgainst += item.match.awayScore;
    away.goalsFor += item.match.awayScore;
    away.goalsAgainst += item.match.homeScore;

    if (outcome === "home") {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (outcome === "away") {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...table.values()].sort((a, b) => {
    const goalDiffA = a.goalsFor - a.goalsAgainst;
    const goalDiffB = b.goalsFor - b.goalsAgainst;

    return (
      b.points - a.points ||
      goalDiffB - goalDiffA ||
      b.goalsFor - a.goalsFor ||
      a.team.name.localeCompare(b.team.name, "uk")
    );
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const { currentUser, game, isGuestPreview } = await requireGameAccess(
    request,
    gameId
  );

  const formData = await request.formData();
  const matchIds = formData
    .getAll("matchId")
    .map((value) => String(value))
    .filter(Boolean);
  const bracketSlotKeys = formData
    .getAll("bracketSlotKey")
    .map((value) => String(value))
    .filter(Boolean);

  if (matchIds.length === 0 && bracketSlotKeys.length === 0) {
    return data({ error: "Немає матчів для прогнозу." }, { status: 400 });
  }

  const gameMatches =
    matchIds.length > 0
      ? await prisma.gameMatch.findMany({
          where: {
            gameId,
            matchId: { in: matchIds },
          },
          include: {
            match: {
              include: {
                round: true,
              },
            },
          },
        })
      : [];

  const bracketMatchIds = [
    ...new Set(
      bracketSlotKeys
        .map((slotKey) => String(formData.get(`bracketMatchId_${slotKey}`) || ""))
        .filter(Boolean)
    ),
  ];
  const bracketMatches =
    bracketMatchIds.length > 0
      ? await prisma.match.findMany({
          where: {
            id: {
              in: bracketMatchIds,
            },
          },
          include: {
            round: true,
          },
        })
      : [];
  const bracketMatchById = new Map(
    bracketMatches.map((match) => [match.id, match])
  );

  const bracketPredictionsToSave = [];
  const tournamentId = String(formData.get("tournamentId") || "");

  for (const slotKey of bracketSlotKeys) {
    const predictedHome = clampScore(
      formData.get(`bracketPredictedHome_${slotKey}`)
    );
    const predictedAway = clampScore(
      formData.get(`bracketPredictedAway_${slotKey}`)
    );

    if (predictedHome === null && predictedAway === null) continue;

    if (predictedHome === null || predictedAway === null) {
      return data(
        { error: "Для кожного брекет-прогнозу треба вказати обидва рахунки." },
        { status: 400 }
      );
    }

    if (predictedHome === predictedAway) {
      return data(
        { error: "У брекеті треба вибрати переможця, нічия не може пройти далі." },
        { status: 400 }
      );
    }

    const matchId = String(formData.get(`bracketMatchId_${slotKey}`) || "");
    const match = matchId ? bracketMatchById.get(matchId) : null;
    const homeTeamId = String(formData.get(`bracketHomeTeamId_${slotKey}`) || "");
    const awayTeamId = String(formData.get(`bracketAwayTeamId_${slotKey}`) || "");
    const winnerTeamId = String(
      formData.get(`bracketWinnerTeamId_${slotKey}`) || ""
    );
    const roundId = String(formData.get(`bracketRoundId_${slotKey}`) || "");
    const roundTitle = String(formData.get(`bracketRoundTitle_${slotKey}`) || "");
    const slotIndex = Number(formData.get(`bracketSlotIndex_${slotKey}`) || 0);

    if (!tournamentId || !roundId || !roundTitle || !winnerTeamId) {
      continue;
    }

    if (
      match &&
      isPredictionLocked({
        matchStatus: match.status,
        startTime: match.startTime,
        gameMatchIsLocked: match.status === "FINISHED",
        predictionClosesAt: null,
        gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
      })
    ) {
      continue;
    }

    const weightUsed =
      match?.round?.defaultWeight ?? game.defaultRoundWeight ?? 1;
    const isFinished =
      match?.status === "FINISHED" &&
      match.homeScore !== null &&
      match.awayScore !== null;
    const actualHomeScore =
      isFinished && match?.homeTeamId === homeTeamId
        ? match.homeScore
        : isFinished && match?.awayTeamId === homeTeamId
        ? match.awayScore
        : null;
    const actualAwayScore =
      isFinished && match?.homeTeamId === awayTeamId
        ? match.homeScore
        : isFinished && match?.awayTeamId === awayTeamId
        ? match.awayScore
        : null;
    const wasExact =
      actualHomeScore !== null &&
      actualAwayScore !== null &&
      predictedHome === actualHomeScore &&
      predictedAway === actualAwayScore;
    const wasOutcomeOnly =
      actualHomeScore !== null &&
      actualAwayScore !== null &&
      !wasExact &&
      getOutcome(predictedHome, predictedAway) ===
        getOutcome(actualHomeScore, actualAwayScore);
    const wasWrong = Boolean(isFinished) && !wasExact && !wasOutcomeOnly;
    const pointsAwarded = wasExact ? 3 : wasOutcomeOnly ? 1 : 0;

    bracketPredictionsToSave.push({
      slotKey,
      roundId,
      roundTitle,
      slotIndex: Number.isNaN(slotIndex) ? 0 : slotIndex,
      tournamentId,
      matchId: match?.id ?? null,
      homeTeamId: homeTeamId || null,
      awayTeamId: awayTeamId || null,
      winnerTeamId,
      predictedHomeScore: predictedHome,
      predictedAwayScore: predictedAway,
      weightUsed,
      pointsAwarded,
      weightedPointsAwarded: pointsAwarded * weightUsed,
      wasExact,
      wasOutcomeOnly,
      wasWrong,
      scoreCalculatedAt: isFinished ? new Date() : null,
    });
  }

  if (!currentUser && isGuestPreview) {
    return data({
      ok: true,
      message: "Guest-прогнози прийнято для проби. У базу вони не записуються.",
    });
  }

  if (bracketPredictionsToSave.length > 0) {
    const existingBracketPredictions = await prisma.bracketPrediction.findMany({
      where: {
        userId: currentUser!.id,
        gameId,
        tournamentId,
        slotKey: {
          in: bracketPredictionsToSave.map((prediction) => prediction.slotKey),
        },
      },
      select: { slotKey: true },
    });

    if (
      existingBracketPredictions.length > 0 &&
      !game.allowMemberPredictionsEdit
    ) {
      return data(
        { error: "У цій грі редагування брекет-прогнозів вимкнене." },
        { status: 400 }
      );
    }
  }

  const predictionsToSave = [];

  for (const gameMatch of gameMatches) {
    if (!isKnockoutMatch(gameMatch.match)) continue;

    const predictedHome = clampScore(
      formData.get(`predictedHome_${gameMatch.matchId}`)
    );
    const predictedAway = clampScore(
      formData.get(`predictedAway_${gameMatch.matchId}`)
    );

    if (predictedHome === null && predictedAway === null) continue;

    if (predictedHome === null || predictedAway === null) {
      return data(
        { error: "Для кожного прогнозу треба вказати обидва рахунки." },
        { status: 400 }
      );
    }

    const locked = isPredictionLocked({
      matchStatus: gameMatch.match.status,
      startTime: gameMatch.match.startTime,
      gameMatchIsLocked: gameMatch.isLocked,
      predictionClosesAt: gameMatch.predictionClosesAt,
      gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
    });

    if (locked) continue;

    predictionsToSave.push({
      matchId: gameMatch.matchId,
      predictedHome,
      predictedAway,
      weightUsed:
        gameMatch.customWeight ??
        gameMatch.match.round?.defaultWeight ??
        game.defaultRoundWeight ??
        1,
    });
  }

  if (predictionsToSave.length === 0 && bracketPredictionsToSave.length === 0) {
    return data(
      { error: "Немає відкритих матчів плейофу із заповненим прогнозом." },
      { status: 400 }
    );
  }

  const existingPredictions =
    predictionsToSave.length > 0
      ? await prisma.prediction.findMany({
          where: {
            userId: currentUser!.id,
            gameId,
            matchId: {
              in: predictionsToSave.map((prediction) => prediction.matchId),
            },
          },
          select: { matchId: true },
        })
      : [];

  if (existingPredictions.length > 0 && !game.allowMemberPredictionsEdit) {
    return data(
      { error: "У цій грі редагування прогнозів вимкнене." },
      { status: 400 }
    );
  }

  for (const prediction of predictionsToSave) {
    await prisma.prediction.upsert({
      where: {
        userId_gameId_matchId: {
          userId: currentUser!.id,
          gameId,
          matchId: prediction.matchId,
        },
      },
      create: {
        userId: currentUser!.id,
        gameId,
        matchId: prediction.matchId,
        predictedHome: prediction.predictedHome,
        predictedAway: prediction.predictedAway,
        pointsAwarded: 0,
        weightUsed: prediction.weightUsed,
        weightedPointsAwarded: 0,
        multiplierUsed: 1,
        wasExact: false,
        wasOutcomeOnly: false,
        wasWrong: false,
        submittedAt: new Date(),
      },
      update: {
        predictedHome: prediction.predictedHome,
        predictedAway: prediction.predictedAway,
        weightUsed: prediction.weightUsed,
        updatedAt: new Date(),
      },
    });
  }

  for (const prediction of bracketPredictionsToSave) {
    await prisma.bracketPrediction.upsert({
      where: {
        userId_gameId_tournamentId_slotKey: {
          userId: currentUser!.id,
          gameId,
          tournamentId: prediction.tournamentId,
          slotKey: prediction.slotKey,
        },
      },
      create: {
        userId: currentUser!.id,
        gameId,
        ...prediction,
        submittedAt: new Date(),
      },
      update: {
        ...prediction,
        updatedAt: new Date(),
      },
    });
  }

  return redirect(
    `/games/${gameId}/bracket${
      tournamentId ? `?tournament=${tournamentId}&view=knockout` : ""
    }`
  );
}

function TeamMark({ team, compact = false }: { team: any; compact?: boolean }) {
  if (!team) {
    return (
      <div className={`flex min-w-0 items-center ${compact ? "gap-1.5" : "gap-2"} text-white/35`}>
        <div
          className={`flex shrink-0 items-center justify-center rounded-full border border-dashed border-white/15 bg-white/[0.04] ${
            compact ? "h-5 w-5" : "h-8 w-8"
          }`}
        >
          <span className="text-[10px] font-black">?</span>
        </div>
        <span className={compact ? "truncate text-[10px] font-black" : "truncate text-sm font-black"}>
          Очікується
        </span>
      </div>
    );
  }

  const logo = getTeamLogoSrc(team);
  const flag = getTeamFlagEmoji(team);
  const displayName = getTeamDisplayName(team);

  return (
    <div className={`flex min-w-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}>
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/10 ${
          compact ? "h-5 w-5" : "h-8 w-8"
        }`}
      >
        {logo ? (
          <img
            src={logo}
            alt={displayName}
            className={compact ? "h-3.5 w-3.5 object-contain" : "h-5 w-5 object-contain"}
          />
        ) : flag ? (
          <span className={compact ? "text-xs leading-none" : "text-lg leading-none"}>
            {flag}
          </span>
        ) : (
          <span className="text-[9px] font-black uppercase text-white/65">
            {displayName.slice(0, 3)}
          </span>
        )}
      </div>
      <span className={compact ? "truncate text-[10px] font-black text-white" : "truncate text-sm font-black text-white"}>
        {displayName}
      </span>
    </div>
  );
}

function ScoreInput({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue?: number | null;
  disabled?: boolean;
}) {
  return (
    <input
      name={name}
      type="number"
      min="0"
      max="20"
      defaultValue={defaultValue ?? ""}
      disabled={disabled}
      className="h-10 w-12 rounded-xl border border-white/10 bg-black/25 text-center text-base font-black text-white outline-none focus:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-45"
      inputMode="numeric"
      aria-label={name}
    />
  );
}

function TournamentTabs({
  gameId,
  tournaments,
  selectedTournamentId,
}: {
  gameId: string;
  tournaments: any[];
  selectedTournamentId?: string;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tournaments.map((tournament) => {
        const logo = getTournamentLogoSrc(tournament);
        const active = tournament.id === selectedTournamentId;

        return (
          <Link
            key={tournament.id}
            to={`/games/${gameId}/bracket?tournament=${tournament.id}`}
            className={`flex min-w-[210px] items-center gap-3 rounded-2xl border px-3 py-3 transition ${
              active
                ? "border-emerald-300/30 bg-emerald-500/12 text-emerald-50"
                : "border-white/10 bg-white/[0.045] text-white/70 hover:bg-white/[0.08]"
            }`}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90">
              {logo ? (
                <img
                  src={logo}
                  alt={tournament.name}
                  className="h-7 w-7 object-contain"
                />
              ) : (
                <span className="text-xs font-black text-black">
                  {tournament.name.slice(0, 2)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black">{tournament.name}</div>
              <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] opacity-55">
                {tournament.matchesCount} матчів
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ViewTabs({
  gameId,
  tournament,
  activeView,
}: {
  gameId: string;
  tournament: any;
  activeView: string;
}) {
  const tabs = [];

  if (tournament.groupMatchesCount > 0) {
    tabs.push({ id: "groups", label: "Групи" });
  }

  if (tournament.knockoutMatchesCount > 0) {
    tabs.push({ id: "knockout", label: "Сітка" });
  }

  if (tournament.type === "LEAGUE") {
    tabs.push({ id: "table", label: "Тури" });
  }

  if (tabs.length <= 1) return null;

  return (
    <div className="inline-flex rounded-2xl border border-white/10 bg-black/25 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={`/games/${gameId}/bracket?tournament=${tournament.id}&view=${tab.id}`}
          className={`rounded-xl px-4 py-2 text-sm font-black transition ${
            activeView === tab.id
              ? "bg-white text-black"
              : "text-white/55 hover:bg-white/10 hover:text-white"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function GroupTable({ group }: { group: any }) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.045]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h3 className="text-lg font-black text-white">{group.label}</h3>
        <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/55">
          {group.matches.length} матчів
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-[10px] font-black uppercase tracking-[0.14em] text-white/35">
            <tr>
              <th className="px-4 py-3">Команда</th>
              <th className="px-2 py-3 text-center">І</th>
              <th className="px-2 py-3 text-center">В</th>
              <th className="px-2 py-3 text-center">Н</th>
              <th className="px-2 py-3 text-center">П</th>
              <th className="px-2 py-3 text-center">М</th>
              <th className="px-4 py-3 text-right">О</th>
            </tr>
          </thead>
          <tbody>
            {group.standings.map((row: any, index: number) => (
              <tr key={row.team.id} className="border-t border-white/8">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                        index < 2
                          ? "bg-emerald-400 text-emerald-950"
                          : index === 2
                          ? "bg-amber-300 text-amber-950"
                          : "bg-white/10 text-white/45"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <TeamMark team={row.team} />
                  </div>
                </td>
                <td className="px-2 py-3 text-center text-white/70">{row.played}</td>
                <td className="px-2 py-3 text-center text-white/70">{row.wins}</td>
                <td className="px-2 py-3 text-center text-white/70">{row.draws}</td>
                <td className="px-2 py-3 text-center text-white/70">{row.losses}</td>
                <td className="px-2 py-3 text-center text-white/70">
                  {row.goalsFor}:{row.goalsAgainst}
                </td>
                <td className="px-4 py-3 text-right text-lg font-black text-white">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ResultsTable({ matches }: { matches: any[] }) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.045]">
      <div className="border-b border-white/10 px-4 py-3">
        <h3 className="text-lg font-black text-white">Матчі і результати</h3>
        <p className="mt-1 text-sm text-white/45">
          Тут тільки календар і рахунки. Прогнози у такому форматі вимкнені.
        </p>
      </div>

      <div className="divide-y divide-white/8">
        {matches.map((item) => (
          <div
            key={item.gameMatchId}
            className="grid gap-3 px-4 py-3 sm:grid-cols-[130px_1fr_auto] sm:items-center"
          >
            <div className="text-xs font-bold text-white/45">
              {formatDate(item.match.startTime)}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <TeamMark team={item.match.homeTeam} />
              <div className="rounded-xl bg-black/25 px-3 py-1.5 text-center text-sm font-black text-white">
                {item.match.homeScore ?? "-"}:{item.match.awayScore ?? "-"}
              </div>
              <div className="justify-self-end">
                <TeamMark team={item.match.awayTeam} />
              </div>
            </div>
            <div className="text-right text-xs font-bold uppercase tracking-[0.12em] text-white/35">
              {getRoundLabel(item.match)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function getMatchKey(slot: any) {
  return slot.realItem?.match.id ?? slot.id;
}

function getScoreValue(value: string) {
  if (value.trim() === "") return null;

  const score = Number(value);

  if (Number.isNaN(score) || score < 0) return null;

  return Math.floor(score);
}

function getFinishedTeamScore(match: any, team: any) {
  if (
    !match ||
    match.status !== "FINISHED" ||
    match.homeScore === null ||
    match.awayScore === null ||
    !team
  ) {
    return null;
  }

  if (match.homeTeam?.id === team.id) return match.homeScore;
  if (match.awayTeam?.id === team.id) return match.awayScore;

  return null;
}

function getSlotWinner(slot: any, quickScores: Record<string, { home: string; away: string }>) {
  const match = slot.realItem?.match;

  if (
    match?.status === "FINISHED" &&
    match.homeScore !== null &&
    match.awayScore !== null
  ) {
    if (match.homeScore > match.awayScore) return slot.homeTeam;
    if (match.awayScore > match.homeScore) return slot.awayTeam;

    if (
      match.penaltyHome !== null &&
      match.penaltyAway !== null &&
      match.penaltyHome !== match.penaltyAway
    ) {
      return match.penaltyHome > match.penaltyAway ? slot.homeTeam : slot.awayTeam;
    }
  }

  const key = getMatchKey(slot);
  const quick = quickScores[key];
  const quickHome = getScoreValue(quick?.home ?? "");
  const quickAway = getScoreValue(quick?.away ?? "");

  if (quickHome !== null && quickAway !== null && quickHome !== quickAway) {
    return quickHome > quickAway ? slot.homeTeam : slot.awayTeam;
  }

  const prediction = match?.myPrediction;

  if (
    prediction &&
    prediction.predictedHome !== prediction.predictedAway
  ) {
    return prediction.predictedHome > prediction.predictedAway
      ? slot.homeTeam
      : slot.awayTeam;
  }

  return null;
}

function isSamePair(slot: any, item: any) {
  const slotIds = [slot.homeTeam?.id, slot.awayTeam?.id].filter(Boolean).sort();
  const itemIds = [item.match.homeTeam?.id, item.match.awayTeam?.id]
    .filter(Boolean)
    .sort();

  return slotIds.length === 2 && slotIds.join(":") === itemIds.join(":");
}

function getTeamId(team: any) {
  return team?.id ?? null;
}

function getTeamCodeValue(team: any) {
  return String(team?.code || team?.tla || team?.shortName || "").toUpperCase();
}

function isWorldCup2026Tournament(rounds: any[]) {
  return rounds.some((round) =>
    round.matches.some(
      (item: any) =>
        item.match.tournament?.slug === "fifa-world-cup-2026" ||
        item.match.tournament?.name === "FIFA World Cup 2026"
    )
  );
}

function getPairKey(homeTeam: any, awayTeam: any) {
  return [getTeamCodeValue(homeTeam), getTeamCodeValue(awayTeam)]
    .filter(Boolean)
    .sort()
    .join(":");
}

function orderRound32SlotsForWorldCup2026(slots: any[]) {
  const slotByPair = new Map(
    slots.map((slot) => [getPairKey(slot.homeTeam, slot.awayTeam), slot])
  );
  const orderedSlots = WORLD_CUP_2026_ROUND_32_ORDER.map(([home, away]) =>
    slotByPair.get([home, away].sort().join(":"))
  ).filter(Boolean);
  const orderedIds = new Set(orderedSlots.map((slot) => slot.id));
  const leftovers = slots.filter((slot) => !orderedIds.has(slot.id));

  return [...orderedSlots, ...leftovers];
}

function isSlotWinner(slot: any, team: any, quickScores: Record<string, { home: string; away: string }>) {
  const winner = getSlotWinner(slot, quickScores);

  return Boolean(winner && getTeamId(winner) === getTeamId(team));
}

function orderPreviousSlotsForRealRound(
  previousSlots: any[],
  realItems: any[],
  quickScores: Record<string, { home: string; away: string }>
) {
  if (previousSlots.length === 0 || realItems.length === 0) {
    return previousSlots;
  }

  const usedIndexes = new Set<number>();
  const orderedSlots: any[] = [];

  const findWinnerSlotIndex = (team: any) =>
    previousSlots.findIndex(
      (slot, index) =>
        !usedIndexes.has(index) && isSlotWinner(slot, team, quickScores)
    );

  for (const item of realItems) {
    const homeIndex = findWinnerSlotIndex(item.match.homeTeam);
    const awayIndex = findWinnerSlotIndex(item.match.awayTeam);

    if (homeIndex === -1 || awayIndex === -1 || homeIndex === awayIndex) {
      continue;
    }

    orderedSlots.push(previousSlots[homeIndex], previousSlots[awayIndex]);
    usedIndexes.add(homeIndex);
    usedIndexes.add(awayIndex);
  }

  previousSlots.forEach((slot, index) => {
    if (!usedIndexes.has(index)) {
      orderedSlots.push(slot);
    }
  });

  return orderedSlots;
}

function mergeExpectedWithReal(expectedSlots: any[], realItems: any[]) {
  const usedRealIds = new Set<string>();
  const merged = expectedSlots.map((slot) => {
    const realItem = realItems.find((item) => {
      if (usedRealIds.has(item.gameMatchId)) return false;
      return isSamePair(slot, item);
    });

    if (!realItem) return slot;

    usedRealIds.add(realItem.gameMatchId);

    return {
      ...slot,
      id: realItem.gameMatchId,
      realItem,
      homeTeam: slot.homeTeam ?? realItem.match.homeTeam,
      awayTeam: slot.awayTeam ?? realItem.match.awayTeam,
    };
  });

  const unusedRealItems = realItems.filter(
    (item) => !usedRealIds.has(item.gameMatchId)
  );
  const filled = merged.map((slot) => {
    if (slot.realItem || unusedRealItems.length === 0) {
      return slot;
    }

    const realItem = unusedRealItems.shift();

    if (!realItem) return slot;

    return {
      ...slot,
      id: realItem.gameMatchId,
      realItem,
      homeTeam: realItem.match.homeTeam,
      awayTeam: realItem.match.awayTeam,
    };
  });

  return filled;
}

function buildDynamicBracket(rounds: any[], quickScores: Record<string, { home: string; away: string }>) {
  const realByRoundId = new Map<string, any[]>();
  const isWorldCup2026 = isWorldCup2026Tournament(rounds);

  for (const round of rounds) {
    const roundId = getBracketRoundId(round.label);
    const current = realByRoundId.get(roundId) ?? [];
    current.push(...round.matches);
    realByRoundId.set(roundId, current);
  }

  const columns: any[] = [];
  let previousSlots: any[] = [];

  for (const roundConfig of BRACKET_ROUNDS) {
    const realItems = (realByRoundId.get(roundConfig.id) ?? []).sort(
      (a, b) =>
        new Date(a.match.startTime).getTime() -
        new Date(b.match.startTime).getTime()
    );

    let slots: any[];

    if (roundConfig.id === "round32") {
      slots = realItems.map((item, index) => ({
        id: item.gameMatchId,
        realItem: item,
        homeTeam: item.match.homeTeam,
        awayTeam: item.match.awayTeam,
        source: `real-${index}`,
      }));

      if (isWorldCup2026) {
        slots = orderRound32SlotsForWorldCup2026(slots);
      }
    } else {
      const orderedPreviousSlots =
        isWorldCup2026
          ? previousSlots
          : orderPreviousSlotsForRealRound(previousSlots, realItems, quickScores);
      const previousColumn = columns[columns.length - 1];

      if (previousColumn && columns.length === 1) {
        previousColumn.slots = orderedPreviousSlots;
      }

      const winners = orderedPreviousSlots.map((slot) =>
        getSlotWinner(slot, quickScores)
      );
      const expectedSlots = [];
      const expectedCount = Math.max(
        roundConfig.expectedMatches,
        Math.ceil(winners.length / 2)
      );

      for (let index = 0; index < expectedCount; index++) {
        expectedSlots.push({
          id: `${roundConfig.id}-${index}`,
          realItem: null,
          homeTeam: winners[index * 2] ?? null,
          awayTeam: winners[index * 2 + 1] ?? null,
          source: "virtual",
        });
      }

      slots = mergeExpectedWithReal(expectedSlots, realItems);
    }

    columns.push({
      ...roundConfig,
      slots,
    });
    previousSlots = slots;
  }

  return columns.filter((column) => column.slots.length > 0);
}

function BracketScoreInput({
  value,
  onChange,
  name,
  disabled,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <input
      name={name}
      type="number"
      min="0"
      max="20"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className={[
        compact ? "h-6 w-7 rounded-md text-[10px]" : "h-9 w-11 rounded-xl text-sm",
        "border border-white/10 bg-black/25 text-center font-black text-white outline-none focus:border-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-70",
      ].join(" ")}
      inputMode="numeric"
      aria-label={name}
    />
  );
}

function BracketMatchCard({
  slot,
  quickScore,
  onQuickScoreChange,
  winner,
  compact = false,
}: {
  slot: any;
  quickScore: { home: string; away: string };
  onQuickScoreChange: (score: { home: string; away: string }) => void;
  winner: any;
  compact?: boolean;
}) {
  const realItem = slot.realItem;
  const match = realItem?.match;
  const locked = realItem?.isLocked ?? false;
  const isFinished = match?.status === "FINISHED";
  const result =
    isFinished && match.homeScore !== null && match.awayScore !== null
      ? `${match.homeScore}:${match.awayScore}`
      : null;
  const finishedHomeScore = getFinishedTeamScore(match, slot.homeTeam);
  const finishedAwayScore = getFinishedTeamScore(match, slot.awayTeam);
  const homeScoreValue =
    finishedHomeScore !== null
      ? String(finishedHomeScore)
      : quickScore.home;
  const awayScoreValue =
    finishedAwayScore !== null
      ? String(finishedAwayScore)
      : quickScore.away;
  const penalty =
    isFinished &&
    match.penaltyHome !== null &&
    match.penaltyAway !== null
      ? `пен. ${match.penaltyHome}:${match.penaltyAway}`
      : null;
  const disabled = locked || !slot.homeTeam || !slot.awayTeam;

  return (
    <div
      className={[
        "relative border bg-black/25",
        compact ? "rounded-lg p-1" : "rounded-[1.15rem] p-3",
        winner ? "border-emerald-300/25" : "border-white/10",
      ].join(" ")}
    >
      <div className={compact ? "mb-1 flex items-center justify-between gap-1.5" : "mb-3 flex items-center justify-between gap-3"}>
        <span className={compact ? "truncate text-[9px] font-bold text-white/35" : "truncate text-[11px] font-bold text-white/40"}>
          {match ? formatDate(match.startTime) : "Очікує пару"}
        </span>
        <span
          className={`${compact ? "rounded-md px-1.5 py-0.5 text-[8px]" : "rounded-full px-2 py-1 text-[9px]"} font-black uppercase tracking-[0.12em] ${
            isFinished
              ? "bg-white/10 text-white/45"
              : winner
              ? "bg-emerald-500/10 text-emerald-200"
              : "bg-white/[0.06] text-white/35"
          }`}
        >
          {isFinished ? "FT" : winner ? "Далі" : "Pick"}
        </span>
      </div>

      <div className={compact ? "space-y-0.5" : "space-y-2"}>
        <div
          className={`grid grid-cols-[1fr_auto] items-center gap-1.5 ${
            compact ? "rounded-md px-1 py-0.5" : "rounded-xl px-2 py-1.5"
          } ${
            winner?.id === slot.homeTeam?.id ? "bg-emerald-500/10" : "bg-white/[0.03]"
          }`}
        >
          <TeamMark team={slot.homeTeam} compact={compact} />
          <BracketScoreInput
            value={homeScoreValue}
            disabled={disabled || isFinished}
            compact={compact}
            onChange={(home) => onQuickScoreChange({ ...quickScore, home })}
          />
        </div>

        <div
          className={`grid grid-cols-[1fr_auto] items-center gap-1.5 ${
            compact ? "rounded-md px-1 py-0.5" : "rounded-xl px-2 py-1.5"
          } ${
            winner?.id === slot.awayTeam?.id ? "bg-emerald-500/10" : "bg-white/[0.03]"
          }`}
        >
          <TeamMark team={slot.awayTeam} compact={compact} />
          <BracketScoreInput
            value={awayScoreValue}
            disabled={disabled || isFinished}
            compact={compact}
            onChange={(away) => onQuickScoreChange({ ...quickScore, away })}
          />
        </div>
      </div>

      {result && !compact ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">
          <span>FT {result}</span>
          {penalty ? <span className="text-white/45">{penalty}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function getColumnById(columns: any[], id: string) {
  return columns.find((column) => column.id === id) ?? null;
}

function splitRoundSlots(column: any, side: "left" | "right") {
  const slots = column?.slots ?? [];
  const midpoint = Math.ceil(slots.length / 2);

  return side === "left" ? slots.slice(0, midpoint) : slots.slice(midpoint);
}

function BracketColumnHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2 text-center">
      <div className="text-lg font-black text-cyan-200">{title}</div>
      <div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-white/55">
        {subtitle}
      </div>
    </div>
  );
}

function BracketSideColumn({
  column,
  side,
  quickScores,
  setQuickScores,
  reverse = false,
}: {
  column: any;
  side: "left" | "right";
  quickScores: Record<string, { home: string; away: string }>;
  setQuickScores: Dispatch<
    SetStateAction<Record<string, { home: string; away: string }>>
  >;
  reverse?: boolean;
}) {
  const slots = splitRoundSlots(column, side);

  return (
    <section className="flex min-h-[600px] flex-col">
      <BracketColumnHeader title={column.title} subtitle={column.subtitle} />

      <div
        className={[
          "relative flex flex-1 flex-col justify-around gap-1.5",
          reverse ? "order-last" : "",
        ].join(" ")}
      >
        {slots.map((slot: any) => {
          const key = getMatchKey(slot);
          const quickScore = quickScores[key] ?? { home: "", away: "" };
          const winner = getSlotWinner(slot, quickScores);

          return (
            <div key={slot.id} className="relative">
              <BracketMatchCard
                slot={slot}
                quickScore={quickScore}
                winner={winner}
                compact
                onQuickScoreChange={(score) =>
                  setQuickScores((current) => ({
                    ...current,
                    [key]: score,
                  }))
                }
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalColumn({
  finalColumn,
  quickScores,
  setQuickScores,
}: {
  finalColumn: any;
  quickScores: Record<string, { home: string; away: string }>;
  setQuickScores: Dispatch<
    SetStateAction<Record<string, { home: string; away: string }>>
  >;
}) {
  const finalSlot = finalColumn?.slots?.[0] ?? null;
  const key = finalSlot ? getMatchKey(finalSlot) : "final-empty";
  const quickScore = quickScores[key] ?? { home: "", away: "" };
  const winner = finalSlot ? getSlotWinner(finalSlot, quickScores) : null;

  return (
    <section className="flex min-h-[600px] flex-col items-center justify-center">
      <div className="mb-3 text-center">
        <div className="text-sm font-black uppercase tracking-[0.14em] text-cyan-200">
          Final
        </div>
        <div className="mt-1 text-2xl">🏆</div>
      </div>

      {finalSlot ? (
        <div className="w-full">
          <BracketMatchCard
            slot={finalSlot}
            quickScore={quickScore}
            winner={winner}
            onQuickScoreChange={(score) =>
              setQuickScores((current) => ({
                ...current,
                [key]: score,
              }))
            }
          />
        </div>
      ) : null}

      <div className="mt-3 min-h-[56px] w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-center">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/60">
          Champion
        </div>
        <div className="mt-1 truncate text-sm font-black text-cyan-50">
          {winner ? getTeamDisplayName(winner) : "Очікується"}
        </div>
      </div>
    </section>
  );
}

function MobileTeamFlag({ team, winner }: { team: any; winner: boolean }) {
  const flag = getTeamFlagEmoji(team);
  const label = getTeamDisplayName(team);

  return (
    <div
      className={[
        "flex h-8 w-8 items-center justify-center rounded-full border text-base",
        winner
          ? "border-emerald-300/35 bg-emerald-400/15"
          : "border-white/10 bg-white/[0.06]",
      ].join(" ")}
      aria-label={label}
      title={label}
    >
      {team ? (
        flag ? (
          <span className="leading-none">{flag}</span>
        ) : (
          <span className="text-[8px] font-black uppercase text-white/70">
            {label.slice(0, 3)}
          </span>
        )
      ) : (
        <span className="text-xs font-black text-white/35">?</span>
      )}
    </div>
  );
}

function MobileBracketTile({
  slot,
  winner,
  onOpen,
}: {
  slot: any;
  winner: any;
  onOpen: () => void;
}) {
  const match = slot.realItem?.match;
  const finishedHomeScore = getFinishedTeamScore(match, slot.homeTeam);
  const finishedAwayScore = getFinishedTeamScore(match, slot.awayTeam);
  const hasResult = finishedHomeScore !== null && finishedAwayScore !== null;
  const isFinished = match?.status === "FINISHED";
  const homeWinner = winner?.id === slot.homeTeam?.id;
  const awayWinner = winner?.id === slot.awayTeam?.id;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={[
        "group rounded-xl border bg-black/25 px-1.5 py-1.5 text-left transition active:scale-[0.98]",
        winner ? "border-emerald-300/25" : "border-white/10",
      ].join(" ")}
    >
      <div className="flex items-center justify-center gap-1">
        <MobileTeamFlag team={slot.homeTeam} winner={homeWinner} />

        <div className="w-8 shrink-0 text-center">
          <div className="text-[7px] font-black uppercase tracking-[0.1em] text-white/35">
            {isFinished ? "FT" : winner ? "Далі" : "Pick"}
          </div>
          <div className="mt-0.5 text-[11px] font-black text-white">
            {hasResult ? `${finishedHomeScore}:${finishedAwayScore}` : "vs"}
          </div>
        </div>

        <MobileTeamFlag team={slot.awayTeam} winner={awayWinner} />
      </div>
    </button>
  );
}

function MobileBracketColumn({
  column,
  side,
  quickScores,
  onOpenSlot,
}: {
  column: any;
  side: "left" | "right";
  quickScores: Record<string, { home: string; away: string }>;
  onOpenSlot: (slotId: string) => void;
}) {
  const slots = splitRoundSlots(column, side);

  return (
    <section className="flex min-h-[455px] flex-col">
      <div className="mb-2 text-center">
        <div className="text-xs font-black text-cyan-200">{column.title}</div>
        <div className="mt-0.5 text-[7px] font-black uppercase tracking-[0.1em] text-white/45">
          {column.subtitle}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-around gap-1">
        {slots.map((slot: any) => {
          const winner = getSlotWinner(slot, quickScores);

          return (
            <MobileBracketTile
              key={slot.id}
              slot={slot}
              winner={winner}
              onOpen={() => onOpenSlot(slot.id)}
            />
          );
        })}
      </div>
    </section>
  );
}

function MobileFinalColumn({
  finalColumn,
  quickScores,
  onOpenSlot,
}: {
  finalColumn: any;
  quickScores: Record<string, { home: string; away: string }>;
  onOpenSlot: (slotId: string) => void;
}) {
  const finalSlot = finalColumn?.slots?.[0] ?? null;
  const winner = finalSlot ? getSlotWinner(finalSlot, quickScores) : null;

  return (
    <section className="flex min-h-[455px] flex-col items-center justify-center">
      <div className="mb-2 text-center">
        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-200">
          Final
        </div>
        <div className="mt-1 text-xl">🏆</div>
      </div>

      {finalSlot ? (
        <MobileBracketTile
          slot={finalSlot}
          winner={winner}
          onOpen={() => onOpenSlot(finalSlot.id)}
        />
      ) : null}

      <div className="mt-3 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-2 py-2 text-center">
        <div className="text-[8px] font-black uppercase tracking-[0.12em] text-cyan-100/55">
          Champion
        </div>
        <div className="mt-1 truncate text-[11px] font-black text-cyan-50">
          {winner ? getTeamDisplayName(winner) : "TBD"}
        </div>
      </div>
    </section>
  );
}

function DesktopBracket({
  tournament,
  bracketColumns,
  quickScores,
  setQuickScores,
}: {
  tournament: any;
  bracketColumns: any[];
  quickScores: Record<string, { home: string; away: string }>;
  setQuickScores: Dispatch<
    SetStateAction<Record<string, { home: string; away: string }>>
  >;
}) {
  const round32 = getColumnById(bracketColumns, "round32");
  const round16 = getColumnById(bracketColumns, "round16");
  const quarter = getColumnById(bracketColumns, "quarter");
  const semi = getColumnById(bracketColumns, "semi");
  const finalColumn = getColumnById(bracketColumns, "final");

  return (
    <div className="hidden overflow-x-auto rounded-[1.5rem] border border-cyan-300/15 bg-[#03142a] p-3 shadow-2xl shadow-black/30 xl:block">
      <div className="min-w-[1420px]">
        <div className="mb-3 flex items-center justify-center gap-3 text-center">
          <div className="text-2xl">🏆</div>
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white">
              {tournament.name}
            </h2>
            <div className="mx-auto mt-1.5 h-px w-52 bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
          </div>
        </div>

        <div className="grid grid-cols-[1.08fr_0.95fr_0.82fr_0.62fr_0.78fr_0.62fr_0.82fr_0.95fr_1.08fr] gap-2.5">
          {round32 ? (
            <BracketSideColumn
              column={round32}
              side="left"
              quickScores={quickScores}
              setQuickScores={setQuickScores}
            />
          ) : null}
          {round16 ? (
            <BracketSideColumn
              column={round16}
              side="left"
              quickScores={quickScores}
              setQuickScores={setQuickScores}
            />
          ) : null}
          {quarter ? (
            <BracketSideColumn
              column={quarter}
              side="left"
              quickScores={quickScores}
              setQuickScores={setQuickScores}
            />
          ) : null}
          {semi ? (
            <BracketSideColumn
              column={semi}
              side="left"
              quickScores={quickScores}
              setQuickScores={setQuickScores}
            />
          ) : null}

          <FinalColumn
            finalColumn={finalColumn}
            quickScores={quickScores}
            setQuickScores={setQuickScores}
          />

          {semi ? (
            <BracketSideColumn
              column={semi}
              side="right"
              quickScores={quickScores}
              setQuickScores={setQuickScores}
            />
          ) : null}
          {quarter ? (
            <BracketSideColumn
              column={quarter}
              side="right"
              quickScores={quickScores}
              setQuickScores={setQuickScores}
            />
          ) : null}
          {round16 ? (
            <BracketSideColumn
              column={round16}
              side="right"
              quickScores={quickScores}
              setQuickScores={setQuickScores}
            />
          ) : null}
          {round32 ? (
            <BracketSideColumn
              column={round32}
              side="right"
              quickScores={quickScores}
              setQuickScores={setQuickScores}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MobileBracket({
  bracketColumns,
  quickScores,
  setQuickScores,
}: {
  bracketColumns: any[];
  quickScores: Record<string, { home: string; away: string }>;
  setQuickScores: Dispatch<
    SetStateAction<Record<string, { home: string; away: string }>>
  >;
}) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const selectedSlot =
    bracketColumns
      .flatMap((column) => column.slots)
      .find((slot: any) => slot.id === selectedSlotId) ?? null;
  const round32 = getColumnById(bracketColumns, "round32");
  const round16 = getColumnById(bracketColumns, "round16");
  const quarter = getColumnById(bracketColumns, "quarter");
  const semi = getColumnById(bracketColumns, "semi");
  const finalColumn = getColumnById(bracketColumns, "final");

  useEffect(() => {
    if (
      selectedSlotId &&
      !bracketColumns.some((column) =>
        column.slots.some((slot: any) => slot.id === selectedSlotId)
      )
    ) {
      setSelectedSlotId(null);
    }
  }, [bracketColumns, selectedSlotId]);

  if (bracketColumns.length === 0) return null;

  return (
    <div className="space-y-3 xl:hidden">
      <div className="rounded-[1.5rem] border border-cyan-300/15 bg-[#03142a] p-2 shadow-2xl shadow-black/30">
        <div className="mb-2 flex items-center justify-center gap-2 text-center">
          <div className="text-lg">🏆</div>
          <div className="text-sm font-black text-white">Сітка плейоф</div>
        </div>

        <div className="overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="grid min-w-[860px] grid-cols-[1fr_0.9fr_0.74fr_0.56fr_0.68fr_0.56fr_0.74fr_0.9fr_1fr] gap-1.5">
            {round32 ? (
              <MobileBracketColumn
                column={round32}
                side="left"
                quickScores={quickScores}
                onOpenSlot={setSelectedSlotId}
              />
            ) : null}
            {round16 ? (
              <MobileBracketColumn
                column={round16}
                side="left"
                quickScores={quickScores}
                onOpenSlot={setSelectedSlotId}
              />
            ) : null}
            {quarter ? (
              <MobileBracketColumn
                column={quarter}
                side="left"
                quickScores={quickScores}
                onOpenSlot={setSelectedSlotId}
              />
            ) : null}
            {semi ? (
              <MobileBracketColumn
                column={semi}
                side="left"
                quickScores={quickScores}
                onOpenSlot={setSelectedSlotId}
              />
            ) : null}

            <MobileFinalColumn
              finalColumn={finalColumn}
              quickScores={quickScores}
              onOpenSlot={setSelectedSlotId}
            />

            {semi ? (
              <MobileBracketColumn
                column={semi}
                side="right"
                quickScores={quickScores}
                onOpenSlot={setSelectedSlotId}
              />
            ) : null}
            {quarter ? (
              <MobileBracketColumn
                column={quarter}
                side="right"
                quickScores={quickScores}
                onOpenSlot={setSelectedSlotId}
              />
            ) : null}
            {round16 ? (
              <MobileBracketColumn
                column={round16}
                side="right"
                quickScores={quickScores}
                onOpenSlot={setSelectedSlotId}
              />
            ) : null}
            {round32 ? (
              <MobileBracketColumn
                column={round32}
                side="right"
                quickScores={quickScores}
                onOpenSlot={setSelectedSlotId}
              />
            ) : null}
          </div>
        </div>
      </div>

      {selectedSlot ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <button
            type="button"
            aria-label="Закрити деталі матчу"
            className="absolute inset-0"
            onClick={() => setSelectedSlotId(null)}
          />

          <div className="relative w-full max-w-md rounded-[1.5rem] border border-white/10 bg-[#061426] p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-cyan-200/70">
                  {selectedSlot.realItem?.match
                    ? formatDate(selectedSlot.realItem.match.startTime)
                    : "Очікує пару"}
                </div>
                <h3 className="mt-1 text-lg font-black text-white">
                  Деталі матчу
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSlotId(null)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-xl font-black text-white"
              >
                ×
              </button>
            </div>

            {(() => {
              const key = getMatchKey(selectedSlot);
              const quickScore = quickScores[key] ?? { home: "", away: "" };
              const winner = getSlotWinner(selectedSlot, quickScores);

              return (
                <BracketMatchCard
                  slot={selectedSlot}
                  quickScore={quickScore}
                  winner={winner}
                  onQuickScoreChange={(score) =>
                    setQuickScores((current) => ({
                      ...current,
                      [key]: score,
                    }))
                  }
                />
              );
            })()}

            <p className="mt-3 text-center text-xs text-white/40">
              Збереження прогнозів відбудеться через нижню кнопку сторінки.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KnockoutBracket({
  game,
  tournament,
  rounds,
  bracketPredictions,
  isBusy,
}: {
  game: any;
  tournament: any;
  rounds: any[];
  bracketPredictions: any[];
  isBusy: boolean;
}) {
  const initialQuickScores = useMemo(() => {
    const scores: Record<string, { home: string; away: string }> = {};

    for (const round of rounds) {
      for (const item of round.matches) {
        const prediction = item.match.myPrediction;

        scores[item.match.id] = {
          home:
            prediction?.predictedHome === undefined ||
            prediction?.predictedHome === null
              ? ""
              : String(prediction.predictedHome),
          away:
            prediction?.predictedAway === undefined ||
            prediction?.predictedAway === null
              ? ""
              : String(prediction.predictedAway),
        };
      }
    }

    for (const prediction of bracketPredictions) {
      if (
        prediction.predictedHomeScore === null ||
        prediction.predictedAwayScore === null
      ) {
        continue;
      }

      scores[prediction.slotKey] = {
        home: String(prediction.predictedHomeScore),
        away: String(prediction.predictedAwayScore),
      };
    }

    return scores;
  }, [rounds, bracketPredictions]);
  const [quickScores, setQuickScores] =
    useState<Record<string, { home: string; away: string }>>(initialQuickScores);

  useEffect(() => {
    setQuickScores(initialQuickScores);
  }, [initialQuickScores]);

  const bracketColumns = useMemo(
    () => buildDynamicBracket(rounds, quickScores),
    [rounds, quickScores]
  );
  const persistablePredictions = rounds.flatMap((round) =>
    round.matches
      .filter((item: any) => item.isInGame && !item.isLocked)
      .map((item: any) => {
        const score = quickScores[item.match.id] ?? { home: "", away: "" };
        const home = getScoreValue(score.home);
        const away = getScoreValue(score.away);

        return {
          item,
          home,
          away,
        };
      })
      .filter((entry: any) => entry.home !== null && entry.away !== null)
  );
  const bracketPredictionEntries = bracketColumns.flatMap((column: any) =>
    column.slots
      .map((slot: any, index: number) => {
        const key = getMatchKey(slot);
        const score = quickScores[key] ?? { home: "", away: "" };
        const home = getScoreValue(score.home);
        const away = getScoreValue(score.away);
        const winner = getSlotWinner(slot, quickScores);

        return {
          slot,
          column,
          index,
          key,
          home,
          away,
          winner,
        };
      })
      .filter(
        (entry: any) =>
          entry.home !== null &&
          entry.away !== null &&
          entry.home !== entry.away &&
          entry.winner?.id
      )
  );

  if (rounds.length === 0) {
    return (
      <section className="theme-panel rounded-[2rem] p-8 text-center">
        <h2 className="text-2xl font-black text-[var(--text)]">
          Сітка ще порожня
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-soft)]">
          Коли в турнірі зʼявляться матчі плейофу, тут буде повний шлях до
          фіналу.
        </p>
      </section>
    );
  }

  return (
    <Form method="post" className="space-y-4">
      <input type="hidden" name="tournamentId" value={tournament.id} />
      {persistablePredictions.map((entry: any) => (
        <div key={entry.item.match.id} className="hidden">
          <input type="hidden" name="matchId" value={entry.item.match.id} />
          <input
            type="hidden"
            name={`predictedHome_${entry.item.match.id}`}
            value={entry.home}
          />
          <input
            type="hidden"
            name={`predictedAway_${entry.item.match.id}`}
            value={entry.away}
          />
        </div>
      ))}
      {bracketPredictionEntries.map((entry: any) => (
        <div key={`${entry.column.id}:${entry.key}`} className="hidden">
          <input type="hidden" name="bracketSlotKey" value={entry.key} />
          <input
            type="hidden"
            name={`bracketRoundId_${entry.key}`}
            value={entry.column.id}
          />
          <input
            type="hidden"
            name={`bracketRoundTitle_${entry.key}`}
            value={entry.column.title}
          />
          <input
            type="hidden"
            name={`bracketSlotIndex_${entry.key}`}
            value={entry.index}
          />
          <input
            type="hidden"
            name={`bracketMatchId_${entry.key}`}
            value={entry.slot.realItem?.match.id ?? ""}
          />
          <input
            type="hidden"
            name={`bracketHomeTeamId_${entry.key}`}
            value={entry.slot.homeTeam?.id ?? ""}
          />
          <input
            type="hidden"
            name={`bracketAwayTeamId_${entry.key}`}
            value={entry.slot.awayTeam?.id ?? ""}
          />
          <input
            type="hidden"
            name={`bracketWinnerTeamId_${entry.key}`}
            value={entry.winner.id}
          />
          <input
            type="hidden"
            name={`bracketPredictedHome_${entry.key}`}
            value={entry.home}
          />
          <input
            type="hidden"
            name={`bracketPredictedAway_${entry.key}`}
            value={entry.away}
          />
        </div>
      ))}

      <DesktopBracket
        tournament={tournament}
        bracketColumns={bracketColumns}
        quickScores={quickScores}
        setQuickScores={setQuickScores}
      />

      <MobileBracket
        bracketColumns={bracketColumns}
        quickScores={quickScores}
        setQuickScores={setQuickScores}
      />

      <div className="sticky bottom-24 z-20 flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-[var(--panel-solid)]/95 p-3 shadow-2xl backdrop-blur-xl sm:bottom-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-[var(--text)]">{game.name}</div>
          <div className="text-xs text-[var(--text-soft)]">
            Швидкий прогноз одразу рухає команду далі в сітці. Збереження
            записує реальні матчі і персональний шлях команд у брекеті.
          </div>
        </div>

        <button
          type="submit"
          disabled={
            isBusy ||
            (persistablePredictions.length === 0 &&
              bracketPredictionEntries.length === 0)
          }
          className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isBusy ? "Збереження..." : "Зберегти прогнози сітки"}
        </button>
      </div>
    </Form>
  );
}

export default function GameBracketPage() {
  const {
    game,
    tournaments,
    selectedTournament,
    activeView,
    groups,
    knockoutRounds,
    bracketPredictions,
    tableMatches,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as
    | { error?: string; message?: string; ok?: boolean }
    | undefined;
  const navigation = useNavigation();
  const isBusy = navigation.state !== "idle";

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`space-y-6 transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-2 sm:flex-row sm:items-center sm:justify-between">
          {tournaments.length > 0 ? (
            <TournamentTabs
              gameId={game.id}
              tournaments={tournaments}
              selectedTournamentId={selectedTournament?.id}
            />
          ) : null}

          {selectedTournament ? (
            <ViewTabs
              gameId={game.id}
              tournament={selectedTournament}
              activeView={activeView}
            />
          ) : null}
        </div>

        {actionData?.error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {actionData.error}
          </div>
        ) : null}

        {actionData?.message ? (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {actionData.message}
          </div>
        ) : null}

        {!selectedTournament ? (
          <section className="theme-panel rounded-[2rem] p-8 text-center">
            <h2 className="text-2xl font-black text-[var(--text)]">
              Тут ще немає турнірів
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--text-soft)]">
              Додай матчі з адмінки або створи гру з вибраними лігами.
            </p>
          </section>
        ) : activeView === "groups" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map((group: any) => (
              <GroupTable key={group.label} group={group} />
            ))}
          </div>
        ) : activeView === "knockout" ? (
          <KnockoutBracket
            game={game}
            tournament={selectedTournament}
            rounds={knockoutRounds}
            bracketPredictions={bracketPredictions}
            isBusy={isBusy}
          />
        ) : (
          <ResultsTable matches={tableMatches} />
        )}
      </div>
    </>
  );
}
