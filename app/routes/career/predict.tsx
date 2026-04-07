import { useEffect, useMemo, useState } from "react";
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
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

const FORMATIONS = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-3", "5-3-2"] as const;

type TeamSide = "HOME" | "AWAY";
type LocalLineupRole = "STARTER" | "BENCH" | "ABSENT";
type PitchSlotLine = "GK" | "DEF" | "MID" | "ATT";

type PitchSlot = {
  key: string;
  x: number;
  y: number;
  label: string;
  line: PitchSlotLine;
  order: number;
};

type FormationTemplateSlot = {
  label: string;
  line: PitchSlotLine;
  x: number;
  y: number;
};

type FormationTemplate = {
  name: string;
  slots: FormationTemplateSlot[];
};

type ActiveSlotState = {
  mode: "LINEUP";
  side: TeamSide;
  slot: PitchSlot;
} | null;

type ActiveScorerState = {
  mode: "SCORER";
  scorerId: string;
  side: TeamSide;
} | null;

type ScorerStateItem = {
  id: string;
  playerId: string;
  teamSide: TeamSide;
  goalsCount: number;
  isFirstGoalScorer: boolean;
  order: number;
};

type LineupStateItem = {
  playerId: string;
  teamSide: TeamSide;
  isStarter: boolean;
  isCaptain: boolean;
  predictedRole: LocalLineupRole;
  predictedPositionLabel: string | null;
  order: number;
};

type PlayerLite = {
  id: string;
  name: string;
  shortName?: string | null;
  photo?: string | null;
  shirtNumber?: number | null;
  position?: string | null;
  isInjured?: boolean;
  isSuspended?: boolean;
};

const FORMATION_TEMPLATES: FormationTemplate[] = [
  {
    name: "4-3-3",
    slots: [
      { label: "GK", line: "GK", x: 50, y: 88 },
      { label: "LB", line: "DEF", x: 15, y: 70 },
      { label: "LCB", line: "DEF", x: 38, y: 70 },
      { label: "RCB", line: "DEF", x: 62, y: 70 },
      { label: "RB", line: "DEF", x: 85, y: 70 },
      { label: "LCM", line: "MID", x: 25, y: 52 },
      { label: "CM", line: "MID", x: 50, y: 46 },
      { label: "RCM", line: "MID", x: 75, y: 52 },
      { label: "LW", line: "ATT", x: 20, y: 24 },
      { label: "ST", line: "ATT", x: 50, y: 18 },
      { label: "RW", line: "ATT", x: 80, y: 24 },
    ],
  },
  {
    name: "4-2-3-1",
    slots: [
      { label: "GK", line: "GK", x: 50, y: 88 },
      { label: "LB", line: "DEF", x: 15, y: 70 },
      { label: "LCB", line: "DEF", x: 38, y: 70 },
      { label: "RCB", line: "DEF", x: 62, y: 70 },
      { label: "RB", line: "DEF", x: 85, y: 70 },
      { label: "LCDM", line: "MID", x: 40, y: 56 },
      { label: "RCDM", line: "MID", x: 60, y: 56 },
      { label: "LAM", line: "MID", x: 25, y: 39 },
      { label: "CAM", line: "MID", x: 50, y: 34 },
      { label: "RAM", line: "MID", x: 75, y: 39 },
      { label: "ST", line: "ATT", x: 50, y: 18 },
    ],
  },
  {
    name: "4-4-2",
    slots: [
      { label: "GK", line: "GK", x: 50, y: 88 },
      { label: "LB", line: "DEF", x: 15, y: 70 },
      { label: "LCB", line: "DEF", x: 38, y: 70 },
      { label: "RCB", line: "DEF", x: 62, y: 70 },
      { label: "RB", line: "DEF", x: 85, y: 70 },
      { label: "LM", line: "MID", x: 20, y: 50 },
      { label: "LCM", line: "MID", x: 40, y: 45 },
      { label: "RCM", line: "MID", x: 60, y: 45 },
      { label: "RM", line: "MID", x: 80, y: 50 },
      { label: "LST", line: "ATT", x: 38, y: 20 },
      { label: "RST", line: "ATT", x: 62, y: 20 },
    ],
  },
  {
    name: "3-5-2",
    slots: [
      { label: "GK", line: "GK", x: 50, y: 88 },
      { label: "LCB", line: "DEF", x: 30, y: 70 },
      { label: "CB", line: "DEF", x: 50, y: 68 },
      { label: "RCB", line: "DEF", x: 70, y: 70 },
      { label: "LM", line: "MID", x: 14, y: 50 },
      { label: "LCM", line: "MID", x: 34, y: 45 },
      { label: "CM", line: "MID", x: 50, y: 40 },
      { label: "RCM", line: "MID", x: 66, y: 45 },
      { label: "RM", line: "MID", x: 86, y: 50 },
      { label: "LST", line: "ATT", x: 40, y: 20 },
      { label: "RST", line: "ATT", x: 60, y: 20 },
    ],
  },
  {
    name: "3-4-3",
    slots: [
      { label: "GK", line: "GK", x: 50, y: 88 },
      { label: "LCB", line: "DEF", x: 30, y: 70 },
      { label: "CB", line: "DEF", x: 50, y: 68 },
      { label: "RCB", line: "DEF", x: 70, y: 70 },
      { label: "LM", line: "MID", x: 20, y: 50 },
      { label: "LCM", line: "MID", x: 40, y: 45 },
      { label: "RCM", line: "MID", x: 60, y: 45 },
      { label: "RM", line: "MID", x: 80, y: 50 },
      { label: "LW", line: "ATT", x: 24, y: 24 },
      { label: "ST", line: "ATT", x: 50, y: 18 },
      { label: "RW", line: "ATT", x: 76, y: 24 },
    ],
  },
  {
    name: "5-3-2",
    slots: [
      { label: "GK", line: "GK", x: 50, y: 88 },
      { label: "LWB", line: "DEF", x: 10, y: 70 },
      { label: "LCB", line: "DEF", x: 30, y: 70 },
      { label: "CB", line: "DEF", x: 50, y: 72 },
      { label: "RCB", line: "DEF", x: 70, y: 70 },
      { label: "RWB", line: "DEF", x: 90, y: 70 },
      { label: "LCM", line: "MID", x: 30, y: 50 },
      { label: "CM", line: "MID", x: 50, y: 44 },
      { label: "RCM", line: "MID", x: 70, y: 50 },
      { label: "LST", line: "ATT", x: 40, y: 20 },
      { label: "RST", line: "ATT", x: 60, y: 20 },
    ],
  },
];

function createLocalId() {
  return Math.random().toString(36).slice(2, 11);
}

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

function formatMatchDateTime(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getTeamLogoSrc(team: any) {
  if (team.logo) return team.logo;
  if (team.code) return `/teams/${team.code}.svg`;
  if (team.shortName) return `/teams/${team.shortName}.svg`;
  return null;
}

function buildHalfPitchSlots(formation: string, side: TeamSide): PitchSlot[] {
  const template =
    FORMATION_TEMPLATES.find((item) => item.name === formation) ??
    FORMATION_TEMPLATES.find((item) => item.name === "4-3-3")!;

  return template.slots.map((slot, index) => ({
    key: `${side}-${formation}-${index}-${slot.label}`,
    x: slot.x,
    y: slot.y,
    label: slot.label,
    line: slot.line,
    order: index,
  }));
}

function normalizeLineupPayload(raw: unknown): LineupStateItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item: any) => item && item.playerId && item.teamSide)
    .map((item: any, index: number) => ({
      playerId: String(item.playerId),
      teamSide: item.teamSide === "AWAY" ? "AWAY" : "HOME",
      predictedRole:
        item.predictedRole === "BENCH"
          ? "BENCH"
          : item.predictedRole === "ABSENT"
          ? "ABSENT"
          : "STARTER",
      predictedPositionLabel: item.predictedPositionLabel
        ? String(item.predictedPositionLabel)
        : null,
      isStarter: item.isStarter !== false,
      isCaptain: false,
      order: Number.isFinite(item.order) ? Number(item.order) : index,
    }));
}

function normalizeScorersPayload(raw: unknown): ScorerStateItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item: any) => item && item.playerId && item.teamSide)
    .map((item: any, index: number) => ({
      id: item.id ? String(item.id) : createLocalId(),
      playerId: String(item.playerId),
      teamSide: item.teamSide === "AWAY" ? "AWAY" : "HOME",
      goalsCount:
        Number.isFinite(Number(item.goalsCount)) && Number(item.goalsCount) > 0
          ? Number(item.goalsCount)
          : 1,
      isFirstGoalScorer: Boolean(item.isFirstGoalScorer),
      order: Number.isFinite(item.order) ? Number(item.order) : index,
    }));
}

function getShortPlayerName(player: PlayerLite) {
  if (player.shortName?.trim()) return player.shortName;
  const parts = player.name.trim().split(" ");
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

function getPositionLabel(position?: string | null) {
  switch (position) {
    case "GOALKEEPER":
      return "GK";
    case "DEFENDER":
      return "DEF";
    case "MIDFIELDER":
      return "MID";
    case "FORWARD":
      return "ATT";
    default:
      return "PLAYER";
  }
}

function getPlayerForSlot(lineup: LineupStateItem[], side: TeamSide, slot: PitchSlot) {
  return lineup.find(
    (item) =>
      item.teamSide === side &&
      item.isStarter &&
      item.order === slot.order &&
      item.predictedPositionLabel === slot.label
  );
}

function upsertPlayerIntoSlot(params: {
  lineup: LineupStateItem[];
  side: TeamSide;
  slot: PitchSlot;
  playerId: string;
}) {
  const { lineup, side, slot, playerId } = params;

  const withoutSamePlayer = lineup.filter(
    (item) => !(item.teamSide === side && item.playerId === playerId)
  );

  const withoutThisSlot = withoutSamePlayer.filter(
    (item) =>
      !(
        item.teamSide === side &&
        item.isStarter &&
        item.order === slot.order &&
        item.predictedPositionLabel === slot.label
      )
  );

  return [
    ...withoutThisSlot,
    {
      playerId,
      teamSide: side,
      isStarter: true,
      isCaptain: false,
      predictedRole: "STARTER" as const,
      predictedPositionLabel: slot.label,
      order: slot.order,
    },
  ];
}

function removePlayerFromSlot(params: {
  lineup: LineupStateItem[];
  side: TeamSide;
  slot: PitchSlot;
}) {
  const { lineup, side, slot } = params;

  return lineup.filter(
    (item) =>
      !(
        item.teamSide === side &&
        item.isStarter &&
        item.order === slot.order &&
        item.predictedPositionLabel === slot.label
      )
  );
}

function sortPlayersForPicker(players: PlayerLite[]) {
  const priority: Record<string, number> = {
    GOALKEEPER: 0,
    DEFENDER: 1,
    MIDFIELDER: 2,
    FORWARD: 3,
    UNKNOWN: 4,
  };

  return [...players].sort((a, b) => {
    const pa = priority[a.position || "UNKNOWN"] ?? 9;
    const pb = priority[b.position || "UNKNOWN"] ?? 9;
    if (pa !== pb) return pa - pb;

    const na = a.shirtNumber ?? 999;
    const nb = b.shirtNumber ?? 999;
    if (na !== nb) return na - nb;

    return a.name.localeCompare(b.name);
  });
}

function filterPlayersForSlot(players: PlayerLite[], slotLine: PitchSlotLine) {
  if (slotLine === "GK") {
    return players.filter((p) => p.position === "GOALKEEPER");
  }

  if (slotLine === "DEF") {
    return players.filter(
      (p) => p.position === "DEFENDER" || p.position === "MIDFIELDER"
    );
  }

  if (slotLine === "MID") {
    return players.filter(
      (p) =>
        p.position === "MIDFIELDER" ||
        p.position === "DEFENDER" ||
        p.position === "FORWARD"
    );
  }

  return players.filter(
    (p) => p.position === "FORWARD" || p.position === "MIDFIELDER"
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;
  const matchId = params.matchId;

  if (!currentUser) {
    throw redirect("/login");
  }

  if (!gameId) {
    throw new Response("Career not found", { status: 404 });
  }

  if (!matchId) {
    throw redirect(`/career/${gameId}/matches`);
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: "ACTIVE",
    },
  });

  if (!membership) {
    throw redirect("/");
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      lockMinutesBeforeStart: true,
      allowMemberPredictionsEdit: true,
      timezone: true,
      defaultRoundWeight: true,
    },
  });

  if (!game) {
    throw new Response("Career not found", { status: 404 });
  }

  const gameMatch = await prisma.gameMatch.findFirst({
    where: {
      gameId,
      matchId,
    },
    include: {
      match: {
        include: {
          tournament: true,
          round: true,
          homeTeam: {
            include: {
              players: {
                where: { isActive: true },
                orderBy: [
                  { position: "asc" },
                  { shirtNumber: "asc" },
                  { name: "asc" },
                ],
              },
            },
          },
          awayTeam: {
            include: {
              players: {
                where: { isActive: true },
                orderBy: [
                  { position: "asc" },
                  { shirtNumber: "asc" },
                  { name: "asc" },
                ],
              },
            },
          },
          predictions: {
            where: {
              gameId,
              userId: currentUser.id,
            },
            include: {
              scorerPicks: {
                include: { player: true },
                orderBy: [{ order: "asc" }],
              },
              lineupPicks: {
                include: { player: true },
                orderBy: [{ order: "asc" }],
              },
              predictedMvpPlayer: true,
            },
            take: 1,
          },
        },
      },
    },
  });

  if (!gameMatch) {
    throw new Response("Match not found in this career", { status: 404 });
  }

  const locked = isPredictionLocked({
    matchStatus: gameMatch.match.status,
    startTime: gameMatch.match.startTime,
    gameMatchIsLocked: gameMatch.isLocked,
    predictionClosesAt: gameMatch.predictionClosesAt,
    gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
  });

  const deadline =
    gameMatch.predictionClosesAt ??
    getPredictionDeadline(
      gameMatch.match.startTime,
      game.lockMinutesBeforeStart
    );

  const prediction = gameMatch.match.predictions[0] ?? null;

  return data({
    currentUser,
    game,
    gameMatchId: gameMatch.id,
    isLocked: locked,
    predictionDeadline: deadline,
    match: {
      id: gameMatch.match.id,
      status: gameMatch.match.status,
      startTime: gameMatch.match.startTime,
      tournament: gameMatch.match.tournament,
      round: gameMatch.match.round,
      homeTeam: gameMatch.match.homeTeam,
      awayTeam: gameMatch.match.awayTeam,
    },
    prediction,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;
  const matchIdFromParams = params.matchId;

  if (!currentUser) {
    throw redirect("/login");
  }

  if (!gameId || !matchIdFromParams) {
    throw new Response("Career or match not found", { status: 404 });
  }

  const formData = await request.formData();

  const matchId = matchIdFromParams;
  const predictedHome = Number(formData.get("predictedHome"));
  const predictedAway = Number(formData.get("predictedAway"));
  const predictedHomeFormation = String(
    formData.get("predictedHomeFormation") || "4-3-3"
  );
  const predictedAwayFormation = String(
    formData.get("predictedAwayFormation") || "4-3-3"
  );
  const predictedMvpPlayerId =
    String(formData.get("predictedMvpPlayerId") || "") || null;
  const notes = String(formData.get("notes") || "") || null;
  const scorersJson = String(formData.get("scorersJson") || "[]");
  const lineupJson = String(formData.get("lineupJson") || "[]");

  if (
    Number.isNaN(predictedHome) ||
    Number.isNaN(predictedAway) ||
    predictedHome < 0 ||
    predictedAway < 0
  ) {
    return data({ error: "Введи коректний рахунок." }, { status: 400 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: "ACTIVE",
    },
  });

  if (!membership) {
    return data({ error: "Ти не маєш доступу до цієї кар’єри." }, { status: 403 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      lockMinutesBeforeStart: true,
      allowMemberPredictionsEdit: true,
      defaultRoundWeight: true,
    },
  });

  if (!game) {
    return data({ error: "Кар’єру не знайдено." }, { status: 404 });
  }

  const gameMatch = await prisma.gameMatch.findFirst({
    where: {
      gameId,
      matchId,
    },
    include: {
      match: {
        include: {
          round: true,
          homeTeam: { include: { players: true } },
          awayTeam: { include: { players: true } },
        },
      },
    },
  });

  if (!gameMatch) {
    return data({ error: "Матч не входить у цю кар’єру." }, { status: 404 });
  }

  const locked = isPredictionLocked({
    matchStatus: gameMatch.match.status,
    startTime: gameMatch.match.startTime,
    gameMatchIsLocked: gameMatch.isLocked,
    predictionClosesAt: gameMatch.predictionClosesAt,
    gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
  });

  if (locked) {
    return data(
      { error: "Прогноз на цей матч уже закритий." },
      { status: 400 }
    );
  }

  const existingPrediction = await prisma.prediction.findUnique({
    where: {
      userId_gameId_matchId: {
        userId: currentUser.id,
        gameId,
        matchId,
      },
    },
  });

  if (existingPrediction && !game.allowMemberPredictionsEdit) {
    return data(
      { error: "Редагування прогнозів вимкнене." },
      { status: 400 }
    );
  }

  let scorersPayload: ScorerStateItem[] = [];
  let lineupPayload: LineupStateItem[] = [];

  try {
    scorersPayload = normalizeScorersPayload(JSON.parse(scorersJson));
    lineupPayload = normalizeLineupPayload(JSON.parse(lineupJson));
  } catch {
    return data(
      { error: "Помилка у форматі детального прогнозу." },
      { status: 400 }
    );
  }

  const homeGoalsPicked = scorersPayload
    .filter((item) => item.teamSide === "HOME")
    .reduce((sum, item) => sum + item.goalsCount, 0);

  const awayGoalsPicked = scorersPayload
    .filter((item) => item.teamSide === "AWAY")
    .reduce((sum, item) => sum + item.goalsCount, 0);

  if (homeGoalsPicked !== predictedHome) {
    return data(
      {
        error: `Для господарів потрібно розподілити рівно ${predictedHome} гол(и).`,
      },
      { status: 400 }
    );
  }

  if (awayGoalsPicked !== predictedAway) {
    return data(
      {
        error: `Для гостей потрібно розподілити рівно ${predictedAway} гол(и).`,
      },
      { status: 400 }
    );
  }

  const allHomePlayerIds = new Set(
    gameMatch.match.homeTeam.players.map((p) => p.id)
  );
  const allAwayPlayerIds = new Set(
    gameMatch.match.awayTeam.players.map((p) => p.id)
  );

  for (const scorer of scorersPayload) {
    if (scorer.teamSide === "HOME" && !allHomePlayerIds.has(scorer.playerId)) {
      return data(
        { error: "Один із бомбардирів не належить господарям." },
        { status: 400 }
      );
    }

    if (scorer.teamSide === "AWAY" && !allAwayPlayerIds.has(scorer.playerId)) {
      return data(
        { error: "Один із бомбардирів не належить гостям." },
        { status: 400 }
      );
    }
  }

  for (const item of lineupPayload) {
    if (item.teamSide === "HOME" && !allHomePlayerIds.has(item.playerId)) {
      return data(
        { error: "Один із гравців складу не належить господарям." },
        { status: 400 }
      );
    }

    if (item.teamSide === "AWAY" && !allAwayPlayerIds.has(item.playerId)) {
      return data(
        { error: "Один із гравців складу не належить гостям." },
        { status: 400 }
      );
    }
  }

  const homeStarters = lineupPayload.filter(
    (item) => item.teamSide === "HOME" && item.isStarter
  );
  const awayStarters = lineupPayload.filter(
    (item) => item.teamSide === "AWAY" && item.isStarter
  );

  if (homeStarters.length > 11 || awayStarters.length > 11) {
    return data(
      { error: "У стартовому складі не може бути більше 11 гравців." },
      { status: 400 }
    );
  }

  const weightUsed =
    gameMatch.customWeight ??
    gameMatch.match.round?.defaultWeight ??
    game.defaultRoundWeight ??
    1;

  await prisma.$transaction(async (tx) => {
    const prediction = await tx.prediction.upsert({
      where: {
        userId_gameId_matchId: {
          userId: currentUser.id,
          gameId,
          matchId,
        },
      },
      create: {
        userId: currentUser.id,
        gameId,
        matchId,
        predictedHome,
        predictedAway,
        predictedHomeFormation,
        predictedAwayFormation,
        predictedMvpPlayerId,
        notes,
        pointsAwarded: 0,
        weightUsed,
        weightedPointsAwarded: 0,
        multiplierUsed: 1,
        wasExact: false,
        wasOutcomeOnly: false,
        wasWrong: false,
        submittedAt: new Date(),
      },
      update: {
        predictedHome,
        predictedAway,
        predictedHomeFormation,
        predictedAwayFormation,
        predictedMvpPlayerId,
        notes,
        weightUsed,
        updatedAt: new Date(),
      },
    });

    await tx.predictionScorerPick.deleteMany({
      where: { predictionId: prediction.id },
    });

    await tx.predictionLineupPick.deleteMany({
      where: { predictionId: prediction.id },
    });

    if (scorersPayload.length > 0) {
      await tx.predictionScorerPick.createMany({
        data: scorersPayload.map((item, index) => ({
          predictionId: prediction.id,
          playerId: item.playerId,
          teamSide: item.teamSide,
          goalsCount: item.goalsCount,
          minuteHint: null,
          isFirstGoalScorer: item.isFirstGoalScorer,
          order: item.order ?? index,
        })),
      });
    }

    if (lineupPayload.length > 0) {
      await tx.predictionLineupPick.createMany({
        data: lineupPayload.map((item, index) => ({
          predictionId: prediction.id,
          playerId: item.playerId,
          teamSide: item.teamSide,
          isStarter: item.isStarter,
          isCaptain: false,
          predictedRole: item.predictedRole,
          predictedPositionLabel: item.predictedPositionLabel,
          order: item.order ?? index,
        })),
      });
    }
  });

  throw redirect(`/career/${gameId}/predict/${matchId}`);
}

function TeamLogo({ team }: { team: any }) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 sm:h-12 sm:w-12">
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={team.name}
          className="h-6 w-6 object-contain sm:h-7 sm:w-7"
          loading="lazy"
        />
      ) : (
        <span className="text-[10px] font-bold text-white/55">
          {(team.shortName || team.name).slice(0, 3)}
        </span>
      )}
    </div>
  );
}

function TeamHeaderCompact({
  team,
  sideLabel,
}: {
  team: any;
  sideLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <TeamLogo team={team} />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">
          {sideLabel}
        </div>
        <div className="truncate text-[15px] font-semibold text-white sm:text-base">
          {team.name}
        </div>
      </div>
    </div>
  );
}

function LineupCard({
  player,
  slotLabel,
  onClick,
  onRemove,
}: {
  player: PlayerLite;
  slotLabel: string;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-[54px] sm:w-[62px] lg:w-[68px] rounded-[14px] sm:rounded-[16px] border border-white/10 bg-[#0b1116]/92 px-1.5 py-1.5 sm:px-2 sm:py-2 shadow-[0_8px_18px_rgba(0,0,0,0.24)] transition hover:border-white/15 hover:bg-[#101820]"
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -right-1 -top-1 z-30 inline-flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full border border-white/10 bg-black/90 text-[9px] text-white/75 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/80 hover:text-white"
      >
        ×
      </button>

      <div className="mb-1 flex items-center justify-between">
        <span className="text-[7px] sm:text-[8px] font-semibold uppercase tracking-[0.14em] text-white/35">
          {slotLabel}
        </span>
        <span className="text-[7px] sm:text-[8px] text-white/30">
          {player.shirtNumber ?? "--"}
        </span>
      </div>

      <div className="mx-auto flex h-7 w-7 sm:h-8 sm:w-8 lg:h-9 lg:w-9 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
        {player.photo ? (
          <img
            src={player.photo}
            alt={player.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[8px] sm:text-[9px] font-bold text-white/70">
            {getShortPlayerName(player).slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <div className="mt-1 truncate text-[8px] sm:text-[9px] font-semibold text-white">
        {getShortPlayerName(player)}
      </div>
      <div className="text-[7px] sm:text-[8px] uppercase tracking-[0.12em] text-white/28">
        {getPositionLabel(player.position)}
      </div>
    </button>
  );
}

function SlotButton({
  slot,
  player,
  onClick,
  onRemove,
}: {
  slot: PitchSlot;
  player: PlayerLite | undefined;
  onClick: () => void;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
    >
      {player ? (
        <LineupCard
          player={player}
          slotLabel={slot.label}
          onClick={onClick}
          onRemove={onRemove}
        />
      ) : (
        <div className="flex h-[54px] w-[54px] sm:h-[62px] sm:w-[62px] lg:h-[68px] lg:w-[68px] flex-col items-center justify-center rounded-[14px] sm:rounded-[16px] border border-dashed border-white/20 bg-[#0b1116]/70 text-white/45 transition hover:border-white/30 hover:text-white/70">
          <span className="text-[8px] sm:text-[9px] font-semibold uppercase tracking-[0.12em]">
            {slot.label}
          </span>
          <span className="mt-1 text-[14px]">+</span>
        </div>
      )}
    </button>
  );
}

function HalfPitchSvg({
  side,
  teamName,
  formation,
  players,
  lineup,
  onOpenSlot,
  onRemoveFromSlot,
}: {
  side: TeamSide;
  teamName: string;
  formation: string;
  players: PlayerLite[];
  lineup: LineupStateItem[];
  onOpenSlot: (slot: PitchSlot) => void;
  onRemoveFromSlot: (slot: PitchSlot) => void;
}) {
  const slots = useMemo(() => buildHalfPitchSlots(formation, side), [formation, side]);

  const playerMap = useMemo(() => {
    return new Map(players.map((p) => [p.id, p]));
  }, [players]);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            {teamName}
          </div>
          <div className="text-[11px] text-white/40">
            Натисни на позицію, щоб вибрати гравця
          </div>
        </div>

        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/60">
          {formation}
        </div>
      </div>

      <div className="flex justify-center">
        <div
          className="relative w-full max-w-[420px] overflow-hidden rounded-[22px] border border-white/8 shadow-[0_10px_30px_rgba(0,0,0,0.22)]"
          style={{ aspectRatio: "50 / 70", background: "#165b24" }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0"
              style={{
                left: `${(i * 100) / 8}%`,
                width: `${100 / 8}%`,
                backgroundColor: i % 2 === 0 ? "#1b6f28" : "#165b24",
              }}
            />
          ))}

          <div className="absolute inset-0 rounded-[22px] border border-white/15" />
          <div className="absolute left-[10%] right-[10%] bottom-[6%] top-[6%] rounded-[18px] border border-white/12" />
          <div className="absolute left-1/2 top-[6%] bottom-[6%] w-px -translate-x-1/2 bg-white/12" />
          <div className="absolute left-1/2 top-1/2 h-[18%] w-[18%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/12" />
          <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />

          {slots.map((slot) => {
            const picked = getPlayerForSlot(lineup, side, slot);
            const player = picked ? playerMap.get(picked.playerId) : undefined;

            return (
              <SlotButton
                key={slot.key}
                slot={slot}
                player={player}
                onClick={() => onOpenSlot(slot)}
                onRemove={() => onRemoveFromSlot(slot)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScorerChip({
  scorer,
  player,
  onClick,
}: {
  scorer: ScorerStateItem;
  player?: PlayerLite;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-white/10 bg-[#0b1018] px-3 py-2 text-left transition hover:border-white/20 hover:bg-white/[0.03]"
    >
      <div className="text-sm font-semibold text-white">
        {player ? getShortPlayerName(player) : "Гравець"}
      </div>
      <div className="mt-1 text-xs text-white/50">
        Голів: {scorer.goalsCount}
        {scorer.isFirstGoalScorer ? " · first" : ""}
      </div>
    </button>
  );
}

function PickerModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex min-h-screen items-center justify-center p-3 sm:p-4">
        <div
          className="w-full max-w-2xl max-h-[calc(100vh-24px)] overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1018] shadow-2xl shadow-black/50"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4 sm:px-5">
            <div className="text-lg font-black text-white">{title}</div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="max-h-[calc(100vh-120px)] overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CareerPredictPage() {
  const { game, match, prediction, isLocked, predictionDeadline } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const navigation = useNavigation();

  const [predictedHome, setPredictedHome] = useState(prediction?.predictedHome ?? 0);
  const [predictedAway, setPredictedAway] = useState(prediction?.predictedAway ?? 0);
  const [predictedHomeFormation, setPredictedHomeFormation] = useState(
    prediction?.predictedHomeFormation ?? "4-3-3"
  );
  const [predictedAwayFormation, setPredictedAwayFormation] = useState(
    prediction?.predictedAwayFormation ?? "4-3-3"
  );
  const [predictedMvpPlayerId, setPredictedMvpPlayerId] = useState(
    prediction?.predictedMvpPlayerId ?? ""
  );
  const [notes, setNotes] = useState(prediction?.notes ?? "");
  const [activeSlot, setActiveSlot] = useState<ActiveSlotState>(null);
  const [activeScorer, setActiveScorer] = useState<ActiveScorerState>(null);
  const [selectedTeamSide, setSelectedTeamSide] = useState<TeamSide>("HOME");

  const [scorers, setScorers] = useState<ScorerStateItem[]>(
    (prediction?.scorerPicks ?? []).map((item: any, index: number) => ({
      id: item.id ? String(item.id) : createLocalId(),
      playerId: item.playerId,
      teamSide: item.teamSide,
      goalsCount: item.goalsCount ?? 1,
      isFirstGoalScorer: item.isFirstGoalScorer ?? false,
      order: item.order ?? index,
    }))
  );

  const [lineup, setLineup] = useState<LineupStateItem[]>(
    (prediction?.lineupPicks ?? []).map((item: any, index: number) => ({
      playerId: item.playerId,
      teamSide: item.teamSide,
      isStarter: item.isStarter ?? true,
      isCaptain: false,
      predictedRole: item.predictedRole ?? "STARTER",
      predictedPositionLabel: item.predictedPositionLabel ?? null,
      order: item.order ?? index,
    }))
  );

  const isSubmitting = navigation.state === "submitting";

  const mvpOptions = useMemo(
    () => [...match.homeTeam.players, ...match.awayTeam.players],
    [match.homeTeam.players, match.awayTeam.players]
  );

  const homeScorers = scorers.filter((item) => item.teamSide === "HOME");
  const awayScorers = scorers.filter((item) => item.teamSide === "AWAY");

  const selectedTeam = selectedTeamSide === "HOME" ? match.homeTeam : match.awayTeam;
  const selectedFormation =
    selectedTeamSide === "HOME" ? predictedHomeFormation : predictedAwayFormation;
  const selectedGoalsLimit = selectedTeamSide === "HOME" ? predictedHome : predictedAway;
  const selectedTeamPlayers =
    selectedTeamSide === "HOME" ? match.homeTeam.players : match.awayTeam.players;
  const selectedTeamScorers = selectedTeamSide === "HOME" ? homeScorers : awayScorers;

  function openSlot(side: TeamSide, slot: PitchSlot) {
    if (isLocked) return;
    setActiveSlot({ mode: "LINEUP", side, slot });
  }

  function closeSlot() {
    setActiveSlot(null);
  }

  function handlePickPlayerForActiveSlot(playerId: string) {
    if (!activeSlot) return;

    setLineup((current) =>
      upsertPlayerIntoSlot({
        lineup: current,
        side: activeSlot.side,
        slot: activeSlot.slot,
        playerId,
      })
    );

    closeSlot();
  }

  function handleRemoveFromSlot(side: TeamSide, slot: PitchSlot) {
    setLineup((current) =>
      removePlayerFromSlot({
        lineup: current,
        side,
        slot,
      })
    );
  }

  function addScorer(playerId: string, side: TeamSide) {
    setScorers((current) => [
      ...current,
      {
        id: createLocalId(),
        playerId,
        teamSide: side,
        goalsCount: 1,
        isFirstGoalScorer: current.length === 0,
        order: current.length,
      },
    ]);
  }

  function removeScorer(id: string) {
    setScorers((current) =>
      current
        .filter((item) => item.id !== id)
        .map((item, index) => ({ ...item, order: index }))
    );
    setActiveScorer(null);
  }

  function updateScorer(id: string, patch: Partial<ScorerStateItem>) {
    setScorers((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  const availablePlayersForSlot = useMemo(() => {
    if (!activeSlot) return [];

    return sortPlayersForPicker(
      filterPlayersForSlot(
        activeSlot.side === "HOME" ? match.homeTeam.players : match.awayTeam.players,
        activeSlot.slot.line
      )
    );
  }, [activeSlot, match.homeTeam.players, match.awayTeam.players]);

  const scorerPlayers = useMemo(
    () => sortPlayersForPicker(selectedTeamPlayers),
    [selectedTeamPlayers]
  );

  const homeGoalsAssigned = homeScorers.reduce((sum, item) => sum + item.goalsCount, 0);
  const awayGoalsAssigned = awayScorers.reduce((sum, item) => sum + item.goalsCount, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">
              Career predict
            </div>
            <h1 className="mt-4 text-2xl font-black text-white sm:text-3xl">
              {match.homeTeam.name} — {match.awayTeam.name}
            </h1>
            <div className="mt-2 text-sm text-white/55">
              {match.tournament?.name || "Турнір"}
              {match.round?.name ? ` · ${match.round.name}` : ""}
              {" · "}
              {formatMatchDateTime(match.startTime)}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to={`/career/${game.id}/matches/${match.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              До матчу
            </Link>
            <Link
              to={`/career/${game.id}/predict/${match.id}/lineup`}
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Lineup page
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white/70">
            Статус: <span className="font-semibold text-white">{match.status}</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white/70">
            Дедлайн:{" "}
            <span className="font-semibold text-white">
              {formatMatchDateTime(predictionDeadline)}
            </span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white/70">
            Стан:{" "}
            <span className={`font-semibold ${isLocked ? "text-red-300" : "text-emerald-300"}`}>
              {isLocked ? "Закрито" : "Відкрито"}
            </span>
          </div>
        </div>
      </section>

      <Form method="post" className="space-y-6">
        <input type="hidden" name="scorersJson" value={JSON.stringify(scorers)} />
        <input type="hidden" name="lineupJson" value={JSON.stringify(lineup)} />

        <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="mb-4">
              <h2 className="text-lg font-black text-white sm:text-xl">Базовий прогноз</h2>
              <p className="mt-1 text-sm leading-6 text-white/55">
                Рахунок, схеми, MVP та нотатки.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-sm font-semibold text-white/80">Господарі</div>
                <input
                  type="number"
                  min={0}
                  name="predictedHome"
                  value={predictedHome}
                  onChange={(e) => setPredictedHome(Number(e.target.value || 0))}
                  disabled={isLocked}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white outline-none transition focus:border-white/20 disabled:opacity-60"
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-semibold text-white/80">Гості</div>
                <input
                  type="number"
                  min={0}
                  name="predictedAway"
                  value={predictedAway}
                  onChange={(e) => setPredictedAway(Number(e.target.value || 0))}
                  disabled={isLocked}
                  className="w-full rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white outline-none transition focus:border-white/20 disabled:opacity-60"
                />
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-semibold text-white/80">Формація HOME</div>
                <select
                  name="predictedHomeFormation"
                  value={predictedHomeFormation}
                  onChange={(e) => setPredictedHomeFormation(e.target.value)}
                  disabled={isLocked}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none disabled:opacity-60"
                >
                  {FORMATIONS.map((item) => (
                    <option key={item} value={item} className="text-black">
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <div className="mb-2 text-sm font-semibold text-white/80">Формація AWAY</div>
                <select
                  name="predictedAwayFormation"
                  value={predictedAwayFormation}
                  onChange={(e) => setPredictedAwayFormation(e.target.value)}
                  disabled={isLocked}
                  className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none disabled:opacity-60"
                >
                  {FORMATIONS.map((item) => (
                    <option key={item} value={item} className="text-black">
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="mb-4">
              <h2 className="text-lg font-black text-white sm:text-xl">Голи і бомбардири</h2>
              <p className="mt-1 text-sm leading-6 text-white/55">
                Розподіли голи по гравцях для кожної команди.
              </p>
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="flex items-center justify-between gap-3">
                  <TeamHeaderCompact team={match.homeTeam} sideLabel="HOME" />
                  <div className="text-sm text-white/55">
                    {homeGoalsAssigned}/{predictedHome}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {homeScorers.map((scorer) => {
                    const player = match.homeTeam.players.find((p) => p.id === scorer.playerId);
                    return (
                      <ScorerChip
                        key={scorer.id}
                        scorer={scorer}
                        player={player}
                        onClick={() =>
                          !isLocked &&
                          setActiveScorer({ mode: "SCORER", scorerId: scorer.id, side: "HOME" })
                        }
                      />
                    );
                  })}

                  {!isLocked ? (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveScorer({ mode: "SCORER", scorerId: "", side: "HOME" })
                      }
                      className="rounded-2xl border border-dashed border-white/20 px-3 py-2 text-sm text-white/50 transition hover:border-white/30 hover:text-white/75"
                    >
                      + Додати бомбардира
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="flex items-center justify-between gap-3">
                  <TeamHeaderCompact team={match.awayTeam} sideLabel="AWAY" />
                  <div className="text-sm text-white/55">
                    {awayGoalsAssigned}/{predictedAway}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {awayScorers.map((scorer) => {
                    const player = match.awayTeam.players.find((p) => p.id === scorer.playerId);
                    return (
                      <ScorerChip
                        key={scorer.id}
                        scorer={scorer}
                        player={player}
                        onClick={() =>
                          !isLocked &&
                          setActiveScorer({ mode: "SCORER", scorerId: scorer.id, side: "AWAY" })
                        }
                      />
                    );
                  })}

                  {!isLocked ? (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveScorer({ mode: "SCORER", scorerId: "", side: "AWAY" })
                      }
                      className="rounded-2xl border border-dashed border-white/20 px-3 py-2 text-sm text-white/50 transition hover:border-white/30 hover:text-white/75"
                    >
                      + Додати бомбардира
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4 text-sm text-white/60">
                Для активної сторони <span className="font-semibold text-white">{selectedTeam.name}</span> маєш розподілити рівно{" "}
                <span className="font-semibold text-white">{selectedGoalsLimit}</span> гол(и).
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-black text-white">Побудова складу</div>
              <div className="mt-1 text-sm text-white/45">
                На мобілці перемикай команду, на desktop бачиш обидві одразу.
              </div>
            </div>

            <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setSelectedTeamSide("HOME")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  selectedTeamSide === "HOME"
                    ? "bg-white text-black"
                    : "text-white/65"
                }`}
              >
                HOME
              </button>
              <button
                type="button"
                onClick={() => setSelectedTeamSide("AWAY")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  selectedTeamSide === "AWAY"
                    ? "bg-white text-black"
                    : "text-white/65"
                }`}
              >
                AWAY
              </button>
            </div>
          </div>

          <div className="xl:hidden">
            <HalfPitchSvg
              side={selectedTeamSide}
              teamName={selectedTeam.name}
              formation={selectedFormation}
              players={selectedTeamPlayers}
              lineup={lineup}
              onOpenSlot={(slot) => openSlot(selectedTeamSide, slot)}
              onRemoveFromSlot={(slot) =>
                handleRemoveFromSlot(selectedTeamSide, slot)
              }
            />
          </div>

          <div className="hidden xl:grid xl:grid-cols-2 xl:gap-4">
            <HalfPitchSvg
              side="HOME"
              teamName={match.homeTeam.name}
              formation={predictedHomeFormation}
              players={match.homeTeam.players}
              lineup={lineup}
              onOpenSlot={(slot) => openSlot("HOME", slot)}
              onRemoveFromSlot={(slot) => handleRemoveFromSlot("HOME", slot)}
            />

            <HalfPitchSvg
              side="AWAY"
              teamName={match.awayTeam.name}
              formation={predictedAwayFormation}
              players={match.awayTeam.players}
              lineup={lineup}
              onOpenSlot={(slot) => openSlot("AWAY", slot)}
              onRemoveFromSlot={(slot) => handleRemoveFromSlot("AWAY", slot)}
            />
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
            <div className="text-lg font-semibold text-white">MVP матчу</div>
            <div className="mt-1 text-sm text-white/45">Необов’язково</div>

            <select
              name="predictedMvpPlayerId"
              value={predictedMvpPlayerId}
              onChange={(e) => setPredictedMvpPlayerId(e.target.value)}
              className="mt-4 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none"
              disabled={isLocked}
            >
              <option value="" className="text-black">
                Не обрано
              </option>
              {mvpOptions.map((player: any) => (
                <option key={player.id} value={player.id} className="text-black">
                  {player.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
            <div className="text-lg font-semibold text-white">Нотатки</div>
            <div className="mt-1 text-sm text-white/45">Коротко, якщо хочеш</div>

            <textarea
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              disabled={isLocked}
              className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
              placeholder="Твій розбір матчу..."
            />
          </div>
        </section>

        {actionData?.error ? (
          <div className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
            {actionData.error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isLocked || isSubmitting}
            className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Зберігаємо..." : prediction ? "Оновити прогноз" : "Зберегти прогноз"}
          </button>

          <Link
            to={`/career/${game.id}/matches/${match.id}`}
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Скасувати
          </Link>
        </div>
      </Form>

      <PickerModal
        open={Boolean(activeSlot)}
        title={
          activeSlot
            ? `${activeSlot.side === "HOME" ? match.homeTeam.name : match.awayTeam.name} · ${activeSlot.slot.label}`
            : "Вибір гравця"
        }
        onClose={closeSlot}
      >
        {activeSlot ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                handleRemoveFromSlot(activeSlot.side, activeSlot.slot);
                closeSlot();
              }}
              className="w-full rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-400/15"
            >
              Очистити слот
            </button>

            {availablePlayersForSlot.map((player) => (
              <button
                key={player.id}
                type="button"
                onClick={() => handlePickPlayerForActiveSlot(player.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#0f1720] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.03]"
              >
                <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                  {player.photo ? (
                    <img
                      src={player.photo}
                      alt={player.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[10px] font-bold text-white/60">
                      {getShortPlayerName(player).slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">
                    {getShortPlayerName(player)}
                  </div>
                  <div className="mt-1 text-xs text-white/45">
                    {getPositionLabel(player.position)} · #{player.shirtNumber ?? "--"}
                    {player.isInjured ? " · injured" : ""}
                    {player.isSuspended ? " · suspended" : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </PickerModal>

      <PickerModal
        open={Boolean(activeScorer)}
        title={activeScorer ? `Бомбардири · ${activeScorer.side}` : "Бомбардири"}
        onClose={() => setActiveScorer(null)}
      >
        {activeScorer ? (
          <div className="space-y-4">
            {activeScorer.scorerId ? (
              (() => {
                const current = scorers.find((s) => s.id === activeScorer.scorerId);
                if (!current) return null;

                return (
                  <div className="rounded-2xl border border-white/10 bg-[#0f1720] p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="block">
                        <div className="mb-2 text-sm font-semibold text-white/80">Голів</div>
                        <input
                          type="number"
                          min={1}
                          value={current.goalsCount}
                          onChange={(e) =>
                            updateScorer(current.id, {
                              goalsCount: Math.max(1, Number(e.target.value || 1)),
                            })
                          }
                          className="w-full rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white outline-none transition focus:border-white/20"
                        />
                      </label>

                      <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3">
                        <input
                          type="checkbox"
                          checked={current.isFirstGoalScorer}
                          onChange={(e) =>
                            setScorers((prev) =>
                              prev.map((item) => ({
                                ...item,
                                isFirstGoalScorer:
                                  item.id === current.id ? e.target.checked : false,
                              }))
                            )
                          }
                        />
                        <span className="text-sm font-semibold text-white">Перший голеадор</span>
                      </label>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeScorer(current.id)}
                      className="mt-4 w-full rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-400/15"
                    >
                      Видалити бомбардира
                    </button>
                  </div>
                );
              })()
            ) : null}

            <div className="space-y-3">
              {scorerPlayers.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => {
                    if (activeScorer.scorerId) {
                      updateScorer(activeScorer.scorerId, { playerId: player.id });
                    } else {
                      addScorer(player.id, activeScorer.side);
                    }
                    setActiveScorer(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[#0f1720] px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.03]"
                >
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                    {player.photo ? (
                      <img
                        src={player.photo}
                        alt={player.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-white/60">
                        {getShortPlayerName(player).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {getShortPlayerName(player)}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {getPositionLabel(player.position)} · #{player.shirtNumber ?? "--"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </PickerModal>
    </div>
  );
}