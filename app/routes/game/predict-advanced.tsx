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
import { FootballLoader } from "~/components/FootballLoader";

const FORMATIONS = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-3", "5-3-2"];

type TeamSide = "HOME" | "AWAY";
type LocalLineupRole = "STARTER" | "BENCH" | "ABSENT";
type PitchSlotLine = "GK" | "DEF" | "MID" | "ATT";
type AdvancedTab = "overview" | "lineup" | "events";

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

type ActionData = {
  error?: string;
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

function getPlayerForSlot(
  lineup: LineupStateItem[],
  side: TeamSide,
  slot: PitchSlot
) {
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

function countGoalsForSide(scorers: ScorerStateItem[], side: TeamSide) {
  return scorers
    .filter((item) => item.teamSide === side)
    .reduce((sum, item) => sum + item.goalsCount, 0);
}

function getScorersForSide(scorers: ScorerStateItem[], side: TeamSide) {
  return scorers
    .filter((item) => item.teamSide === side)
    .sort((a, b) => a.order - b.order);
}

function getScorerForPlayer(
  scorers: ScorerStateItem[],
  playerId: string,
  side: TeamSide
) {
  return scorers.find(
    (item) => item.playerId === playerId && item.teamSide === side
  );
}

function getGoalsRemainingForSide(
  scorers: ScorerStateItem[],
  side: TeamSide,
  predictedHome: number,
  predictedAway: number
) {
  const target = side === "HOME" ? predictedHome : predictedAway;
  return Math.max(0, target - countGoalsForSide(scorers, side));
}

function hasFirstGoalScorerForSide(scorers: ScorerStateItem[], side: TeamSide) {
  return scorers.some(
    (item) => item.teamSide === side && item.isFirstGoalScorer
  );
}

function getStarterPlayerIdsForSide(lineup: LineupStateItem[], side: TeamSide) {
  return new Set(
    lineup
      .filter((item) => item.teamSide === side && item.isStarter)
      .map((item) => item.playerId)
  );
}

function getStarterCountForSide(lineup: LineupStateItem[], side: TeamSide) {
  return lineup.filter((item) => item.teamSide === side && item.isStarter).length;
}

function getTeamBySide(match: any, side: TeamSide) {
  return side === "HOME" ? match.homeTeam : match.awayTeam;
}

function getSideLabel(side: TeamSide) {
  return side === "HOME" ? "Господарі" : "Гості";
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;
  const matchId = params.matchId;

  if (!currentUser) {
    throw redirect("/login");
  }

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  if (!matchId) {
    throw redirect(`/games/${gameId}/predict`);
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
    throw new Response("Game not found", { status: 404 });
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
    throw new Response("Match not found in this game", { status: 404 });
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
    throw new Response("Game or match not found", { status: 404 });
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
    return data<ActionData>({ error: "Введи коректний рахунок." }, { status: 400 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: "ACTIVE",
    },
  });

  if (!membership) {
    return data<ActionData>({ error: "Ти не є учасником цієї гри." }, { status: 403 });
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
    return data<ActionData>({ error: "Гру не знайдено." }, { status: 404 });
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
    return data<ActionData>({ error: "Матч не входить у цю гру." }, { status: 404 });
  }

  const locked = isPredictionLocked({
    matchStatus: gameMatch.match.status,
    startTime: gameMatch.match.startTime,
    gameMatchIsLocked: gameMatch.isLocked,
    predictionClosesAt: gameMatch.predictionClosesAt,
    gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
  });

  if (locked) {
    return data<ActionData>(
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
    return data<ActionData>(
      { error: "У цій грі редагування прогнозів вимкнене." },
      { status: 400 }
    );
  }

  let scorersPayload: ScorerStateItem[] = [];
  let lineupPayload: LineupStateItem[] = [];

  try {
    scorersPayload = normalizeScorersPayload(JSON.parse(scorersJson));
    lineupPayload = normalizeLineupPayload(JSON.parse(lineupJson));
  } catch {
    return data<ActionData>(
      { error: "Помилка у форматі детального прогнозу." },
      { status: 400 }
    );
  }

  const homeGoalsPicked = countGoalsForSide(scorersPayload, "HOME");
  const awayGoalsPicked = countGoalsForSide(scorersPayload, "AWAY");

  if (homeGoalsPicked !== predictedHome) {
    return data<ActionData>(
      {
        error: `Для господарів потрібно розподілити рівно ${predictedHome} гол(и).`,
      },
      { status: 400 }
    );
  }

  if (awayGoalsPicked !== predictedAway) {
    return data<ActionData>(
      {
        error: `Для гостей потрібно розподілити рівно ${predictedAway} гол(и).`,
      },
      { status: 400 }
    );
  }

  const allHomePlayerIds = new Set(gameMatch.match.homeTeam.players.map((p) => p.id));
  const allAwayPlayerIds = new Set(gameMatch.match.awayTeam.players.map((p) => p.id));

  for (const scorer of scorersPayload) {
    if (scorer.teamSide === "HOME" && !allHomePlayerIds.has(scorer.playerId)) {
      return data<ActionData>(
        { error: "Один із бомбардирів не належить господарям." },
        { status: 400 }
      );
    }

    if (scorer.teamSide === "AWAY" && !allAwayPlayerIds.has(scorer.playerId)) {
      return data<ActionData>(
        { error: "Один із бомбардирів не належить гостям." },
        { status: 400 }
      );
    }
  }

  for (const item of lineupPayload) {
    if (item.teamSide === "HOME" && !allHomePlayerIds.has(item.playerId)) {
      return data<ActionData>(
        { error: "Один із гравців складу не належить господарям." },
        { status: 400 }
      );
    }

    if (item.teamSide === "AWAY" && !allAwayPlayerIds.has(item.playerId)) {
      return data<ActionData>(
        { error: "Один із гравців складу не належить гостям." },
        { status: 400 }
      );
    }
  }

  if (
    predictedMvpPlayerId &&
    !allHomePlayerIds.has(predictedMvpPlayerId) &&
    !allAwayPlayerIds.has(predictedMvpPlayerId)
  ) {
    return data<ActionData>(
      { error: "MVP-гравець не належить жодній з команд цього матчу." },
      { status: 400 }
    );
  }

  const homeFirstScorers = scorersPayload.filter(
    (item) => item.teamSide === "HOME" && item.isFirstGoalScorer
  );
  const awayFirstScorers = scorersPayload.filter(
    (item) => item.teamSide === "AWAY" && item.isFirstGoalScorer
  );

  if (homeFirstScorers.length > 1 || awayFirstScorers.length > 1) {
    return data<ActionData>(
      { error: "Для кожної команди можна вибрати лише одного автора першого голу." },
      { status: 400 }
    );
  }

  const homeStarters = lineupPayload.filter(
    (item) => item.teamSide === "HOME" && item.isStarter
  );
  const awayStarters = lineupPayload.filter(
    (item) => item.teamSide === "AWAY" && item.isStarter
  );

  if (homeStarters.length > 11 || awayStarters.length > 11) {
    return data<ActionData>(
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

  throw redirect(`/games/${gameId}/predict-advanced/${matchId}`);
}

function IconScore() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
    </svg>
  );
}

function IconFormation() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
      <circle cx="8" cy="8" r="1.3" />
      <circle cx="8" cy="16" r="1.3" />
      <circle cx="16" cy="12" r="1.3" />
    </svg>
  );
}

function IconStarPlayer() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
      <path d="M12 3l2.2 4.8L19 8.5l-3.5 3.4.8 4.8L12 14.9 7.7 16.7l.8-4.8L5 8.5l4.8-.7L12 3z" />
    </svg>
  );
}

function IconBall() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l3-2 3 2v3l-3 2-3-2z" />
    </svg>
  );
}

function TeamLogo({ team }: { team: any }) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border sm:h-12 sm:w-12"
      style={{
        borderColor: "var(--border)",
      }}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={team.name}
          className="h-6 w-6 object-contain sm:h-7 sm:w-7"
          loading="lazy"
          
        />
      ) : (
        <span className="text-[10px] font-bold">
          {(team.shortName || team.name).slice(0, 3)}
        </span>
      )}
    </div>
  );
}

function TeamSwitchCard({
  team,
  side,
  active,
  score,
  onClick,
}: {
  team: any;
  side: TeamSide;
  active: boolean;
  score: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-[28px] border px-4 py-4 text-left transition hover:opacity-95"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "var(--accent-soft)" : "var(--panel-solid)",
        color: "var(--text)",
      }}
    >
      <TeamLogo team={team} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">
          {getSideLabel(side)}
        </div>
        <div className="mt-1 truncate text-lg font-black">{team.name}</div>
      </div>
      <div className="flex h-12 min-w-[52px] items-center justify-center rounded-2xl border border-black/10 bg-black/5 px-3 text-2xl font-black dark:border-white/10 dark:bg-black/10">
        {score}
      </div>
    </button>
  );
}

function EventBadge({
  children,
  title,
  className = "",
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <div
      title={title}
      className={[
        "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full border border-white/10 bg-black/85 px-1.5 text-[9px] font-black text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)]",
        className,
      ].join(" ")}
    >
      {children}
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
      className="
        group relative
        w-[54px] sm:w-[62px] lg:w-[68px]
        rounded-[14px] sm:rounded-[16px]
        border border-white/10
        bg-[#0b1116]/92
        px-1.5 py-1.5 sm:px-2 sm:py-2
        shadow-[0_8px_18px_rgba(0,0,0,0.24)]
        transition hover:border-white/15 hover:bg-[#101820]
      "
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="
          absolute -right-1 -top-1 z-20
          inline-flex h-4 w-4 sm:h-5 sm:w-5
          items-center justify-center
          rounded-full border border-white/10 bg-black/80
          text-[9px] text-white/65
          opacity-0 transition group-hover:opacity-100
        "
      >
        ×
      </span>

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

function HalfPitchSvg({
  side,
  teamName,
  formation,
  players,
  lineup,
  scorerState,
  predictedMvpPlayerId,
  onOpenSlot,
  onRemoveFromSlot,
}: {
  side: TeamSide;
  teamName: string;
  formation: string;
  players: PlayerLite[];
  lineup: LineupStateItem[];
  scorerState: ScorerStateItem[];
  predictedMvpPlayerId?: string | null;
  onOpenSlot: (slot: PitchSlot) => void;
  onRemoveFromSlot: (slot: PitchSlot) => void;
}) {
  const slots = useMemo(() => buildHalfPitchSlots(formation, side), [formation, side]);

  const playerMap = useMemo(() => {
    return new Map(players.map((p) => [p.id, p]));
  }, [players]);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-gradient-mid)] p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--foreground)]">
            {teamName}
          </div>
          <div className="text-[11px] text-[var(--text-muted)]">
            Натисни на позицію, щоб вибрати гравця
          </div>
        </div>

        <div className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-[11px] text-[var(--foreground)] dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
          {formation}
        </div>
      </div>

      <div className="flex justify-center">
        <div
          className="
            relative w-full max-w-[420px]
            overflow-hidden rounded-[22px]
            border border-white/8
            shadow-[0_10px_30px_rgba(0,0,0,0.22)]
          "
          style={{
            aspectRatio: "50 / 70",
            background: "#165b24",
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute bottom-0 top-0"
              style={{
                left: `${(i * 100) / 8}%`,
                width: `${100 / 8}%`,
                backgroundColor: i % 2 === 0 ? "#1b6f28" : "#165b24",
              }}
            />
          ))}

          <div className="absolute inset-0 border border-white/10" />
          <div className="absolute bottom-[6%] left-[8%] right-[8%] top-[6%] rounded-[18px] border border-white/20" />
          <div className="absolute bottom-[6%] left-1/2 top-[6%] w-px -translate-x-1/2 bg-white/20" />
          <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />

          {slots.map((slot) => {
            const pick = getPlayerForSlot(lineup, side, slot);

            if (pick) return null;

            return (
              <button
                key={`empty-${slot.key}`}
                type="button"
                onClick={() => onOpenSlot(slot)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                }}
              >
                <div className="relative h-[34px] w-[34px] sm:h-[38px] sm:w-[38px]">
                  <div className="absolute inset-0 rounded-full border border-white/20 bg-white/[0.05]" />
                  <div className="absolute inset-[7px] rounded-full border border-white/10 bg-white/[0.03]" />
                </div>
              </button>
            );
          })}

          {slots.map((slot) => {
            const pick = getPlayerForSlot(lineup, side, slot);
            if (!pick) return null;

            const player = playerMap.get(pick.playerId);
            if (!player) return null;

            const scorerMeta = getScorerForPlayer(scorerState, player.id, side);
            const isMvp = predictedMvpPlayerId === player.id;

            return (
              <div
                key={`filled-${slot.key}`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                }}
              >
                <div className="relative">
                  <div className="absolute -right-1.5 -top-1.5 z-30 flex flex-col items-end gap-1">
                    {isMvp ? <EventBadge title="MVP">★</EventBadge> : null}
                    {scorerMeta?.isFirstGoalScorer ? (
                      <EventBadge title="Перший гол">1st</EventBadge>
                    ) : null}
                    {scorerMeta ? (
                      <EventBadge title="Голи">⚽{scorerMeta.goalsCount}</EventBadge>
                    ) : null}
                  </div>

                  <LineupCard
                    player={player}
                    slotLabel={slot.label}
                    onClick={() => onOpenSlot(slot)}
                    onRemove={() => onRemoveFromSlot(slot)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlayerPickerModal({
  open,
  title,
  subtitle,
  players,
  selectedIds,
  currentPlayerId,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  players: PlayerLite[];
  selectedIds?: Set<string>;
  currentPlayerId?: string | null;
  onClose: () => void;
  onPick: (playerId: string) => void;
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  if (!open) return null;

  const disabledIds = new Set(selectedIds ?? []);
  if (currentPlayerId) disabledIds.delete(currentPlayerId);

  const filteredPlayers = players.filter((player) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;

    return (
      player.name.toLowerCase().includes(q) ||
      (player.shortName || "").toLowerCase().includes(q) ||
      String(player.shirtNumber || "").includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6">
      <div
        className="flex h-[82vh] min-h-[620px] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border shadow-[0_25px_80px_rgba(0,0,0,0.28)] max-sm:h-[88vh] max-sm:min-h-0"
        style={{
          borderColor: "var(--border)",
          background: "var(--panel-solid)",
          color: "var(--text)",
        }}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-4 sm:px-5"
          style={{
            borderColor: "var(--border)",
          }}
        >
          <div className="min-w-0">
            <div className="truncate text-lg font-black">{title}</div>

            {subtitle ? (
              <div
                className="mt-1 text-sm"
                style={{ color: "var(--text-soft)" }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border transition hover:opacity-90"
            style={{
              borderColor: "var(--border)",
              background: "var(--panel)",
              color: "var(--text)",
            }}
          >
            ×
          </button>
        </div>

        <div
          className="shrink-0 border-b px-4 py-4 sm:px-5"
          style={{
            borderColor: "var(--border)",
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук по імені, short name або номеру"
            className="h-11 w-full rounded-2xl border px-4 text-sm outline-none"
            style={{
              borderColor: "var(--border)",
              background: "var(--panel)",
              color: "var(--text)",
            }}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-2">
            {filteredPlayers.length === 0 ? (
              <div
                className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center text-sm"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--card-highlight)",
                  color: "var(--text-soft)",
                }}
              >
                Нічого не знайдено.
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const disabled = disabledIds.has(player.id);
                const isCurrent = currentPlayerId === player.id;

                return (
                  <button
                    key={player.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(player.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-[22px] border px-4 py-3 text-left transition"
                    style={{
                      borderColor: isCurrent
                        ? "var(--accent)"
                        : "var(--border)",
                      background: isCurrent
                        ? "var(--accent-soft)"
                        : "var(--panel)",
                      color: "var(--text)",
                      opacity: disabled ? 0.4 : 1,
                      cursor: disabled ? "not-allowed" : "pointer",
                    }}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border"
                        style={{
                          borderColor: "var(--border)",
                          background: "var(--card-highlight)",
                        }}
                      >
                        {player.photo ? (
                          <img
                            src={player.photo}
                            alt={player.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span
                            className="text-[10px] font-bold"
                            style={{ color: "var(--text-soft)" }}
                          >
                            {getShortPlayerName(player).slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {player.name}
                        </div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--muted)" }}
                        >
                          {player.shirtNumber ? `#${player.shirtNumber} · ` : ""}
                          {getPositionLabel(player.position)}
                          {player.isInjured ? " · травма" : ""}
                          {player.isSuspended ? " · дискваліфікація" : ""}
                        </div>
                      </div>
                    </div>

                    <div
                      className="shrink-0 text-xs font-semibold"
                      style={{
                        color: isCurrent
                          ? "var(--accent)"
                          : "var(--muted)",
                      }}
                    >
                      {isCurrent ? "Обрано" : disabled ? "Зайнято" : "Вибрати"}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default function PredictAdvancedPage() {
  const { match, prediction, isLocked } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const [activeTab, setActiveTab] = useState<AdvancedTab>("overview");
  const [activeTeamSide, setActiveTeamSide] = useState<TeamSide>("HOME");
  const [predictedHome, setPredictedHome] = useState<number>(
    prediction?.predictedHome ?? 0
  );
  const [predictedAway, setPredictedAway] = useState<number>(
    prediction?.predictedAway ?? 0
  );
  const [predictedHomeFormation, setPredictedHomeFormation] = useState<string>(
    prediction?.predictedHomeFormation || "4-3-3"
  );
  const [predictedAwayFormation, setPredictedAwayFormation] = useState<string>(
    prediction?.predictedAwayFormation || "4-3-3"
  );
  const [predictedMvpPlayerId, setPredictedMvpPlayerId] = useState<string>(
    prediction?.predictedMvpPlayerId || ""
  );
  const [notes, setNotes] = useState<string>(prediction?.notes || "");
  const [lineupState, setLineupState] = useState<LineupStateItem[]>(
    normalizeLineupPayload(prediction?.lineupPicks ?? [])
  );
  const [scorerState, setScorerState] = useState<ScorerStateItem[]>(
    normalizeScorersPayload(prediction?.scorerPicks ?? [])
  );
  const [activeSlot, setActiveSlot] = useState<ActiveSlotState>(null);
  const [formationWarning, setFormationWarning] = useState<{
    side: TeamSide;
    nextFormation: string;
  } | null>(null);
  const [isScorerPickerOpen, setIsScorerPickerOpen] = useState(false);
  const [isMvpPickerOpen, setIsMvpPickerOpen] = useState(false);

  const isRouteLoading = navigation.state === "loading";
  const isSubmitting = navigation.state === "submitting";
  const isBusy = isRouteLoading || isSubmitting;

  const homePlayers = useMemo(
    () => sortPlayersForPicker(match.homeTeam.players || []),
    [match.homeTeam.players]
  );
  const awayPlayers = useMemo(
    () => sortPlayersForPicker(match.awayTeam.players || []),
    [match.awayTeam.players]
  );

  const activeTeam = activeTeamSide === "HOME" ? match.homeTeam : match.awayTeam;
  const activePlayers = activeTeamSide === "HOME" ? homePlayers : awayPlayers;
  const activeFormation =
    activeTeamSide === "HOME" ? predictedHomeFormation : predictedAwayFormation;
  const activeGoalTarget = activeTeamSide === "HOME" ? predictedHome : predictedAway;
  const activeGoalsAssigned = countGoalsForSide(scorerState, activeTeamSide);
  const activeGoalsRemaining = getGoalsRemainingForSide(
    scorerState,
    activeTeamSide,
    predictedHome,
    predictedAway
  );

  const lineupSelectedIds = useMemo(() => {
    const ids = new Set(
      lineupState
        .filter((item) => item.teamSide === activeTeamSide && item.isStarter)
        .map((item) => item.playerId)
    );

    const current = activeSlot
      ? getPlayerForSlot(lineupState, activeSlot.side, activeSlot.slot)?.playerId
      : null;

    if (current) ids.delete(current);

    return ids;
  }, [lineupState, activeSlot, activeTeamSide]);

  const currentLineupPlayers = useMemo(() => {
    if (!activeSlot) return [];
    const teamPlayers = activeSlot.side === "HOME" ? homePlayers : awayPlayers;
    return sortPlayersForPicker(
      filterPlayersForSlot(teamPlayers, activeSlot.slot.line)
    );
  }, [activeSlot, homePlayers, awayPlayers]);

  const currentLineupPlayerId = useMemo(() => {
    if (!activeSlot) return null;
    return (
      getPlayerForSlot(lineupState, activeSlot.side, activeSlot.slot)?.playerId ??
      null
    );
  }, [activeSlot, lineupState]);

  const currentScorerPlayers = useMemo(() => {
    return activePlayers;
  }, [activePlayers]);

  const currentMvpPlayers = useMemo(() => {
    return activePlayers;
  }, [activePlayers]);

  const activeSideScorers = useMemo(
    () => getScorersForSide(scorerState, activeTeamSide),
    [scorerState, activeTeamSide]
  );

  const activeMvpPlayer =
    activePlayers.find((p) => p.id === predictedMvpPlayerId) ?? null;

  function hasLineupForSide(side: TeamSide) {
    return lineupState.some((item) => item.teamSide === side && item.isStarter);
  }

  function requestFormationChange(side: TeamSide, nextFormation: string) {
    const currentFormation =
      side === "HOME" ? predictedHomeFormation : predictedAwayFormation;

    if (currentFormation === nextFormation) return;

    if (hasLineupForSide(side)) {
      setFormationWarning({ side, nextFormation });
      return;
    }

    applyFormationChange(side, nextFormation);
  }

  function applyFormationChange(side: TeamSide, nextFormation: string) {
    if (side === "HOME") {
      setPredictedHomeFormation(nextFormation);
    } else {
      setPredictedAwayFormation(nextFormation);
    }

    setLineupState((prev) => prev.filter((item) => item.teamSide !== side));
    setFormationWarning(null);
  }

  function openSlot(side: TeamSide, slot: PitchSlot) {
    if (isLocked) return;
    if (activeTab !== "lineup") {
      setActiveTab("lineup");
    }
    setActiveTeamSide(side);
    setActiveSlot({ mode: "LINEUP", side, slot });
  }

  function closeSlot() {
    setActiveSlot(null);
  }

  function handlePickPlayerForActiveSlot(playerId: string) {
    if (!activeSlot) return;

    setLineupState((prev) =>
      upsertPlayerIntoSlot({
        lineup: prev,
        side: activeSlot.side,
        slot: activeSlot.slot,
        playerId,
      })
    );

    setActiveSlot(null);
  }

  function handleRemoveFromSlot(side: TeamSide, slot: PitchSlot) {
    setLineupState((prev) =>
      removePlayerFromSlot({
        lineup: prev,
        side,
        slot,
      })
    );
  }

  function openScorerPicker() {
    if (isLocked || activeGoalsRemaining <= 0) return;
    setActiveTab("events");
    setIsScorerPickerOpen(true);
  }

  function closeScorerPicker() {
    setIsScorerPickerOpen(false);
  }

  function handlePickScorer(playerId: string) {
    if (activeGoalsRemaining <= 0) return;

    const existing = getScorerForPlayer(scorerState, playerId, activeTeamSide);

    if (existing) {
      updateScorerGoals(playerId, activeTeamSide, existing.goalsCount + 1);
      setIsScorerPickerOpen(false);
      return;
    }

    setScorerState((prev) => [
      ...prev,
      {
        id: createLocalId(),
        playerId,
        teamSide: activeTeamSide,
        goalsCount: 1,
        isFirstGoalScorer: !hasFirstGoalScorerForSide(prev, activeTeamSide),
        order: prev.length,
      },
    ]);

    setIsScorerPickerOpen(false);
  }

  function updateScorerGoals(playerId: string, side: TeamSide, nextGoals: number) {
    const currentItem = getScorerForPlayer(scorerState, playerId, side);
    const currentGoals = currentItem?.goalsCount ?? 0;
    const target = side === "HOME" ? predictedHome : predictedAway;
    const sideTotal = countGoalsForSide(scorerState, side);
    const nextTotal = sideTotal - currentGoals + Math.max(0, nextGoals);

    if (nextTotal > target) return;

    setScorerState((prev) => {
      if (nextGoals <= 0) {
        const removed = prev.filter(
          (item) => !(item.playerId === playerId && item.teamSide === side)
        );

        const removedWasFirst = prev.find(
          (item) => item.playerId === playerId && item.teamSide === side
        )?.isFirstGoalScorer;

        if (removedWasFirst) {
          const firstRemainingIndex = removed.findIndex((item) => item.teamSide === side);
          if (firstRemainingIndex !== -1) {
            const cloned = [...removed];
            cloned[firstRemainingIndex] = {
              ...cloned[firstRemainingIndex],
              isFirstGoalScorer: true,
            };
            return cloned;
          }
        }

        return removed;
      }

      const exists = prev.some(
        (item) => item.playerId === playerId && item.teamSide === side
      );

      if (exists) {
        return prev.map((item) =>
          item.playerId === playerId && item.teamSide === side
            ? { ...item, goalsCount: nextGoals }
            : item
        );
      }

      return [
        ...prev,
        {
          id: createLocalId(),
          playerId,
          teamSide: side,
          goalsCount: nextGoals,
          isFirstGoalScorer: !hasFirstGoalScorerForSide(prev, side),
          order: prev.length,
        },
      ];
    });
  }

  function setFirstGoalScorer(playerId: string, side: TeamSide) {
    setScorerState((prev) =>
      prev.map((item) =>
        item.teamSide !== side
          ? item
          : {
              ...item,
              isFirstGoalScorer: item.playerId === playerId,
            }
      )
    );
  }

  function toggleMvp(playerId: string) {
    setPredictedMvpPlayerId((prev) => (prev === playerId ? "" : playerId));
    setIsMvpPickerOpen(false);
  }

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`theme-page mx-auto max-w-7xl space-y-4 pb-8 transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
      <Form method="post" className="space-y-4">
        <input type="hidden" name="predictedHome" value={predictedHome} />
        <input type="hidden" name="predictedAway" value={predictedAway} />
        <input
          type="hidden"
          name="predictedHomeFormation"
          value={predictedHomeFormation}
        />
        <input
          type="hidden"
          name="predictedAwayFormation"
          value={predictedAwayFormation}
        />
        <input
          type="hidden"
          name="predictedMvpPlayerId"
          value={predictedMvpPlayerId}
        />
        <input type="hidden" name="notes" value={notes} />
        <input type="hidden" name="lineupJson" value={JSON.stringify(lineupState)} />
        <input type="hidden" name="scorersJson" value={JSON.stringify(scorerState)} />

        <section className="theme-panel rounded-[30px] border px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground)]">
                <IconBall />
                Advanced predict
              </div>

              <h1 className="mt-3 text-2xl font-black">Детальний прогноз</h1>

              <div className="mt-2 text-sm text-[--text-muted]">
                {match.homeTeam.name} — {match.awayTeam.name}
              </div>
              <div className="mt-1 text-sm text-[var(--text-muted)]">
                {formatMatchDateTime(match.startTime)}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                to={`../predict?matchId=${match.id}`}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/75 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                <IconScore />
                Назад
              </Link>

              <button
                type="submit"
                disabled={isLocked || isSubmitting}
                className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-white/90"
              >
                <IconStarPlayer />
                {isSubmitting ? "Зберігаю..." : "Зберегти прогноз"}
              </button>
            </div>
          </div>

          {actionData?.error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
              {actionData.error}
            </div>
          ) : null}

          {isLocked ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-yellow-400/20 dark:bg-yellow-500/10 dark:text-yellow-100">
              Прогноз на цей матч уже закритий. Перегляд доступний, але редагування вимкнено.
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <TeamSwitchCard
            team={match.homeTeam}
            side="HOME"
            active={activeTeamSide === "HOME"}
            score={predictedHome}
            onClick={() => setActiveTeamSide("HOME")}
          />
          <TeamSwitchCard
            team={match.awayTeam}
            side="AWAY"
            active={activeTeamSide === "AWAY"}
            score={predictedAway}
            onClick={() => setActiveTeamSide("AWAY")}
          />
        </section>

        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-[var(--text)] shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em]">
                <IconFormation />
                Схема активної команди
              </div>

              <h2 className="mt-3 text-xl font-black">{activeTeam.name}</h2>

              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Змінюється тільки схема тієї команди, яку ти зараз редагуєш.
              </p>
            </div>

            <select
              value={activeFormation}
              onChange={(e) =>
                requestFormationChange(activeTeamSide, e.target.value)
              }
              disabled={isLocked}
              className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 text-sm font-bold outline-none sm:w-[180px]"
            >
              {FORMATIONS.map((item) => (
                <option key={item} value={item} className="text-black">
                  {item}
                </option>
              ))}
            </select>
          </div>

          {formationWarning ? (
            <div className="mt-4 rounded-2xl border border-amber-300/40 bg-amber-500/10 p-4">
              <div className="text-sm font-black text-amber-700 dark:text-amber-100">
                Зміна схеми очистить склад
              </div>

              <p className="mt-1 text-sm text-amber-700/80 dark:text-amber-100/75">
                Для {getTeamBySide(match, formationWarning.side).name} вже
                складений стартовий склад. Якщо змінити схему, попередній склад
                цієї команди злетить і ти почнеш з нуля.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() =>
                    applyFormationChange(
                      formationWarning.side,
                      formationWarning.nextFormation
                    )
                  }
                  className="rounded-2xl bg-amber-500 px-4 py-3 text-sm font-black text-black transition hover:opacity-90"
                >
                  Так, змінити і очистити
                </button>

                <button
                  type="button"
                  onClick={() => setFormationWarning(null)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-bold transition hover:opacity-90"
                >
                  Скасувати
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_380px]">
          <div className="space-y-4">
            <section className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  { key: "overview", label: "Рахунок", icon: <IconScore /> },
                  { key: "lineup", label: "Склад", icon: <IconFormation /> },
                  { key: "events", label: "MVP + голи", icon: <IconStarPlayer /> },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key as AdvancedTab)}
                    className={[
                      "inline-flex h-11 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition",
                      activeTab === tab.key
                        ? "border-slate-300 bg-slate-900 text-white dark:border-white/20 dark:bg-white dark:text-black"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white",
                    ].join(" ")}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>

              <HalfPitchSvg
                side={activeTeamSide}
                teamName={activeTeam.name}
                formation={activeFormation}
                players={activePlayers}
                lineup={lineupState}
                scorerState={scorerState}
                predictedMvpPlayerId={predictedMvpPlayerId}
                onOpenSlot={(slot) => openSlot(activeTeamSide, slot)}
                onRemoveFromSlot={(slot) =>
                  handleRemoveFromSlot(activeTeamSide, slot)
                }
              />
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-slate-900 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text)]">
                  Активний клуб
                </div>
                <div className="mt-2 truncate text-lg font-black text-[var(--text)]">
                  {activeTeam.name}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-slate-900 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text)]">
                  Формація
                </div>
                <div className="mt-2 text-lg font-black text-[var(--text)]">{activeFormation}</div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 text-slate-900 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text)]">
                  Стартовий склад
                </div>
                <div className="mt-2 text-lg font-black text-[var(--text)]">
                  {getStarterCountForSide(lineupState, activeTeamSide)} / 11
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            {activeTab === "overview" ? (
              <>
                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-slate-900 shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-white sm:p-5">
                  <div className="text-lg font-semibold text-[var(--text)]">Рахунок</div>
                  <div className="mt-1 text-sm text-[var(--text)]">
                    Визначи основний рахунок матчу
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="text-sm font-semibold text-[var(--text)]">{match.homeTeam.name}</div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          disabled={isLocked || predictedHome <= 0}
                          onClick={() => setPredictedHome(Math.max(0, predictedHome - 1))}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-lg text-[var(--text)]"
                        >
                          -
                        </button>
                        <div className="text-3xl font-black text-[var(--text)]">{predictedHome}</div>
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => setPredictedHome(predictedHome + 1)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-lg text-[var(--text)]"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                      <div className="text-sm font-semibold text-[var(--text)]">{match.awayTeam.name}</div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          disabled={isLocked || predictedAway <= 0}
                          onClick={() => setPredictedAway(Math.max(0, predictedAway - 1))}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] text-lg text-[var(--text)] pointer"
                        >
                          -
                        </button>
                        <div className="text-3xl font-black text-[var(--text)]">{predictedAway}</div>
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={() => setPredictedAway(predictedAway + 1)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-lg text-[var(--text)]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--background)] p-4 text-[var(--text)] shadow-sm sm:p-5">
                  <div className="text-lg font-semibold">Нотатки</div>
                  <div className="mt-1 text-sm text-[var(--text)]">
                    Коротко, якщо хочеш
                  </div>

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={5}
                    className="mt-4 w-full rounded-2xl border border-[var(--border)] bg-[var(--background)] text-[var(--text)] px-4 py-3 text-sm outline-none "
                    placeholder="Тут можна залишити свої думки по матчу"
                    disabled={isLocked}
                  />
                </section>
              </>
            ) : null}

            {activeTab === "lineup" ? (
              <section className="rounded-[28px] border border-[var(--border)] bg-[var(--background)] p-4 text-[var(--text)] shadow-sm sm:p-5">
                <div className="text-lg font-semibold">Склад активної команди</div>
                <div className="mt-1 text-sm text-[var(--text)]">
                  Працює саме через твоє поле: натискаєш на позицію на полі — відкривається вибір гравця.
                </div>

                <div className="mt-4 space-y-2">
                  {buildHalfPitchSlots(activeFormation, activeTeamSide).map((slot) => {
                    const row = getPlayerForSlot(lineupState, activeTeamSide, slot);
                    const player = row
                      ? activePlayers.find((item) => item.id === row.playerId)
                      : null;

                    return (
                      <button
                        key={slot.key}
                        type="button"
                        onClick={() => openSlot(activeTeamSide, slot)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-3 py-3 text-left transition hover:bg-[var(--bg-hover)] dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                        disabled={isLocked}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-xs font-black dark:border-white/10 dark:bg-black/20">
                            {slot.label}
                          </div>

                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {player ? player.name : "Порожня позиція"}
                            </div>
                            <div className="text-xs text-[var(--text)]">
                              {player
                                ? `${player.shirtNumber ? `#${player.shirtNumber} · ` : ""}${getPositionLabel(player.position)}`
                                : "Натисни, щоб обрати гравця"}
                            </div>
                          </div>
                        </div>

                        <div className="text-xs font-semibold text-[var(--text)]">
                          {player ? "Змінити" : "Обрати"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {activeTab === "events" ? (
              <>
                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--background)] p-4 text-[var(--text)] shadow-sm dark:border-white/10 dark:bg-white/[0.05] dark:text-white sm:p-5">
                  <div className="text-lg font-semibold">Голи активної команди</div>
                  <div className="mt-1 text-sm text-[var(--text)]">
                    Можна вибрати будь-якого гравця активної команди в межах прогнозованої кількості голів.
                  </div>

                  <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 dark:border-white/10 dark:bg-white/[0.03]">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text)]">
                      Розподіл
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-2xl font-black">
                          {activeGoalsAssigned} / {activeGoalTarget}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-white/45">
                          Ще треба розподілити: {activeGoalsRemaining}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={openScorerPicker}
                        disabled={isLocked || activeGoalsRemaining <= 0}
                        className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--bg-hover)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:bg-white/[0.08]"
                      >
                        Додати автора
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {activeSideScorers.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-sm text-[var(--text)] dark:border-white/10 dark:bg-white/[0.03] dark:text-white/45">
                        Поки немає авторів голів для {activeTeam.name}.
                      </div>
                    ) : (
                      activeSideScorers.map((row) => {
                        const player = activePlayers.find((item) => item.id === row.playerId);
                        if (!player) return null;

                        const sideTotal = countGoalsForSide(scorerState, activeTeamSide);

                        return (
                          <div
                            key={row.id}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">
                                  {player.name}
                                </div>
                                <div className="text-xs text-[var(--text)]">
                                  {player.shirtNumber ? `#${player.shirtNumber} · ` : ""}
                                  {getPositionLabel(player.position)}
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => updateScorerGoals(player.id, activeTeamSide, 0)}
                                disabled={isLocked}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--text)] transition hover:bg-red-50 hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:hover:bg-red-500/20 dark:hover:text-red-200"
                              >
                                ×
                              </button>
                            </div>

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isLocked || row.goalsCount <= 1}
                                  onClick={() =>
                                    updateScorerGoals(
                                      player.id,
                                      activeTeamSide,
                                      row.goalsCount - 1
                                    )
                                  }
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-lg disabled:opacity-40"
                                >
                                  -
                                </button>

                                <div className="inline-flex min-w-[56px] items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-2 text-lg font-black">
                                  {row.goalsCount}
                                </div>

                                <button
                                  type="button"
                                  disabled={
                                    isLocked ||
                                    sideTotal - row.goalsCount + (row.goalsCount + 1) >
                                      activeGoalTarget
                                  }
                                  onClick={() =>
                                    updateScorerGoals(
                                      player.id,
                                      activeTeamSide,
                                      row.goalsCount + 1
                                    )
                                  }
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--background)] text-lg dark:border-white/10 dark:bg-black/20 disabled:opacity-40"
                                >
                                  +
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => setFirstGoalScorer(player.id, activeTeamSide)}
                                disabled={isLocked}
                                className={[
                                  "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                                  row.isFirstGoalScorer
                                    ? "border-[var(--border)] bg-[var(--background)] text-[var(--text)] "
                                    : "border-[var(--border)] bg-[var(--background)] text-[var(--text)] hover:bg-slate-100 dark:border-white/10 dark:bg-black/20 dark:text-white/75 dark:hover:bg-white/[0.08]",
                                ].join(" ")}
                              >
                                Перший гол
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="rounded-[28px] border border-[var(--border)] bg-[var(--background)] p-4 text-[var(--text)] shadow-sm sm:p-5">
                  <div className="text-lg font-semibold">MVP команди</div>
                  <div className="mt-1 text-sm text-[var(--text)]">
                    MVP можна вибрати з будь-якого гравця активної команди.
                  </div>

                  {activeMvpPlayer ? (
                    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                      <div className="text-sm font-semibold">{activeMvpPlayer.name}</div>
                      <div className="mt-1 text-xs text-[var(--text)]">
                        {activeMvpPlayer.shirtNumber
                          ? `#${activeMvpPlayer.shirtNumber} · `
                          : ""}
                        {getPositionLabel(activeMvpPlayer.position)}
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setIsMvpPickerOpen(true)}
                          disabled={isLocked}
                          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-slate-100 dark:border-white/10 dark:bg-black/20 dark:text-white dark:hover:bg-white/[0.08]"
                        >
                          Змінити
                        </button>
                        <button
                          type="button"
                          onClick={() => setPredictedMvpPlayerId("")}
                          disabled={isLocked}
                          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-red-50 hover:text-red-600 dark:border-white/10 dark:bg-black/20 dark:text-white/80 dark:hover:bg-red-500/20 dark:hover:text-red-200"
                        >
                          Прибрати
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsMvpPickerOpen(true)}
                      disabled={isLocked}
                      className="mt-4 w-full rounded-2xl border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-6 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Обрати MVP для {activeTeam.name}
                    </button>
                  )}
                </section>
              </>
            ) : null}
          </div>
        </section>
      </Form>

      <PlayerPickerModal
        open={Boolean(activeSlot)}
        title={
          activeSlot
            ? `${getTeamBySide(match, activeSlot.side).name} · ${activeSlot.slot.label}`
            : ""
        }
        subtitle="Показуються тільки релевантні гравці для цієї позиції"
        players={currentLineupPlayers}
        selectedIds={lineupSelectedIds}
        currentPlayerId={currentLineupPlayerId}
        onClose={closeSlot}
        onPick={handlePickPlayerForActiveSlot}
      />

      <PlayerPickerModal
        open={isScorerPickerOpen}
        title={`${activeTeam.name} · Автор голу`}
        subtitle="Можна вибрати будь-якого гравця активної команди"
        players={currentScorerPlayers}
        onClose={closeScorerPicker}
        onPick={handlePickScorer}
      />

      <PlayerPickerModal
        open={isMvpPickerOpen}
        title={`${activeTeam.name} · MVP`}
        subtitle="Можна вибрати будь-якого гравця активної команди"
        players={currentMvpPlayers}
        currentPlayerId={predictedMvpPlayerId || null}
        onClose={() => setIsMvpPickerOpen(false)}
        onPick={toggleMvp}
      />
    </div>
    </>
  );
}
