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

const FORMATIONS = ["4-3-3", "4-2-3-1", "4-4-2", "3-5-2", "3-4-3", "5-3-2"];

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

function getFormationLines(formation: string) {
  const parts = formation
    .split("-")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);

  return parts.length ? parts : [4, 3, 3];
}

function buildHalfPitchSlots(formation: string, side: TeamSide): PitchSlot[] {
  const lines = getFormationLines(formation);

  const slots: PitchSlot[] = [
    {
      key: `${side}-GK`,
      x: 50,
      y: 86,
      label: "GK",
      line: "GK",
      order: 0,
    },
  ];

  const yMap = [66, 48, 30, 15];
  let order = 1;

  lines.forEach((count, lineIndex) => {
    const y = yMap[lineIndex] ?? 48;

    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 50 : 14 + (72 / (count - 1)) * i;

      let line: PitchSlotLine = "MID";
      if (lineIndex === 0) line = "DEF";
      else if (lineIndex === lines.length - 1) line = "ATT";

      slots.push({
        key: `${side}-${lineIndex}-${i}`,
        x,
        y,
        label: line,
        line,
        order: order++,
      });
    }
  });

  return slots;
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
    return players.filter((p) => p.position !== "GOALKEEPER");
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
                include: {
                  player: true,
                },
                orderBy: [{ order: "asc" }],
              },
              lineupPicks: {
                include: {
                  player: true,
                },
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
    return data({ error: "Ти не є учасником цієї гри." }, { status: 403 });
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
    return data({ error: "Гру не знайдено." }, { status: 404 });
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
    return data({ error: "Матч не входить у цю гру." }, { status: 404 });
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

  throw redirect(`/games/${gameId}/predict-advanced/${matchId}`);
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
      className="group relative w-[74px] rounded-[20px] border border-white/10 bg-[#0a1014]/92 px-2 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.28)] transition hover:border-white/15 hover:bg-[#0d1419]"
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute -right-1.5 -top-1.5 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-black/80 text-[10px] text-white/65 opacity-0 transition group-hover:opacity-100"
      >
        ×
      </span>

      <div className="mb-1 flex items-center justify-between">
        <span className="text-[8px] font-semibold uppercase tracking-[0.16em] text-white/35">
          {slotLabel}
        </span>
        <span className="text-[8px] text-white/30">
          #{player.shirtNumber ?? "--"}
        </span>
      </div>

      <div className="mx-auto flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
        {player.photo ? (
          <img
            src={player.photo}
            alt={player.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-[10px] font-bold text-white/70">
            {getShortPlayerName(player).slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>

      <div className="mt-1.5 truncate text-[10px] font-semibold text-white">
        {getShortPlayerName(player)}
      </div>
      <div className="text-[8px] uppercase tracking-[0.14em] text-white/30">
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

      <div className="relative overflow-hidden rounded-[24px] border border-white/8 bg-[#143a24]">
        <svg viewBox="0 0 100 100" className="block aspect-[0.78/1] w-full">
          <defs>
            <linearGradient id={`pitch-base-${side}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#1b4c2f" />
              <stop offset="100%" stopColor="#123722" />
            </linearGradient>

            <pattern
              id={`grass-lines-${side}`}
              width="100"
              height="12"
              patternUnits="userSpaceOnUse"
            >
              <rect width="100" height="6" fill="rgba(255,255,255,0.018)" />
              <rect y="6" width="100" height="6" fill="rgba(0,0,0,0.018)" />
            </pattern>
          </defs>

          <rect width="100" height="100" fill={`url(#pitch-base-${side})`} />
          <rect width="100" height="100" fill={`url(#grass-lines-${side})`} />

          <rect
            x="5.5"
            y="5.5"
            width="89"
            height="89"
            rx="2"
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.75"
          />

          <line
            x1="5.5"
            x2="94.5"
            y1="94.5"
            y2="94.5"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.75"
          />

          <rect
            x="22"
            y="75.5"
            width="56"
            height="19"
            rx="1.4"
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="0.75"
          />

          <rect
            x="34"
            y="87.5"
            width="32"
            height="7"
            rx="1"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.75"
          />

          <circle cx="50" cy="81.8" r="1" fill="rgba(255,255,255,0.16)" />

          <path
            d="M41.5 94.5 A8.5 8.5 0 0 1 58.5 94.5"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="0.75"
          />

          {slots.map((slot) => {
            const pick = getPlayerForSlot(lineup, side, slot);

            return (
              <g key={slot.key}>
                {!pick ? (
                  <>
                    <circle
                      cx={slot.x}
                      cy={slot.y}
                      r="4.9"
                      fill="rgba(255,255,255,0.03)"
                      stroke="rgba(255,255,255,0.16)"
                      strokeWidth="0.75"
                    />
                    <circle
                      cx={slot.x}
                      cy={slot.y}
                      r="2.7"
                      fill="rgba(255,255,255,0.02)"
                    />
                  </>
                ) : null}
              </g>
            );
          })}
        </svg>

        {slots.map((slot) => {
          const pick = getPlayerForSlot(lineup, side, slot);

          if (!pick) {
            return (
              <button
                key={`slot-${slot.key}`}
                type="button"
                onClick={() => onOpenSlot(slot)}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              >
                <div className="h-[52px] w-[52px]" />
              </button>
            );
          }

          const player = playerMap.get(pick.playerId);
          if (!player) return null;

          return (
            <div
              key={`card-${slot.key}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              <LineupCard
                player={player}
                slotLabel={slot.label}
                onClick={() => onOpenSlot(slot)}
                onRemove={() => onRemoveFromSlot(slot)}
              />
            </div>
          );
        })}
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
    if (!open) setSearch("");
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#0c1116]">
        <div className="border-b border-white/8 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/35">
                Picker
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {title}
              </div>
              {subtitle ? (
                <div className="mt-1 text-sm text-white/45">{subtitle}</div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Закрити
            </button>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук гравця..."
            className="mt-4 h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none placeholder:text-white/25"
          />
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-3 sm:p-4">
          <div className="space-y-2">
            {filteredPlayers.map((player) => {
              const isDisabled = disabledIds.has(player.id);

              return (
                <button
                  key={player.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => onPick(player.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-left transition hover:border-white/15 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                    {player.photo ? (
                      <img
                        src={player.photo}
                        alt={player.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-white/65">
                        {getShortPlayerName(player).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {player.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-white/40">
                      #{player.shirtNumber ?? "--"} · {getPositionLabel(player.position)}
                    </div>
                  </div>
                </button>
              );
            })}

            {filteredPlayers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-white/40">
                Нічого не знайдено
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScorerPickerRow({
  teamName,
  goalsLimit,
  players,
  scorers,
  onAdd,
  onOpen,
  onRemove,
  onGoalsCountChange,
}: {
  teamName: string;
  goalsLimit: number;
  players: PlayerLite[];
  scorers: ScorerStateItem[];
  onAdd: () => void;
  onOpen: (scorerId: string) => void;
  onRemove: (scorerId: string) => void;
  onGoalsCountChange: (scorerId: string, value: number) => void;
}) {
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const total = scorers.reduce((sum, item) => sum + item.goalsCount, 0);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{teamName}</div>
          <div className="mt-0.5 text-[11px] text-white/40">
            Розподілено {total} з {goalsLimit}
          </div>
        </div>

        <button
          type="button"
          onClick={onAdd}
          disabled={total >= goalsLimit || players.length === 0}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          Додати
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {scorers.length > 0 ? (
          scorers.map((scorer) => {
            const player = playerMap.get(scorer.playerId);
            if (!player) return null;

            return (
              <div
                key={scorer.id}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pr-2"
              >
                <button
                  type="button"
                  onClick={() => onOpen(scorer.id)}
                  className="flex items-center gap-2 rounded-full px-2 py-2 transition hover:bg-white/[0.04]"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5">
                    {player.photo ? (
                      <img
                        src={player.photo}
                        alt={player.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-white/65">
                        {getShortPlayerName(player).slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="max-w-[110px] truncate text-[12px] font-semibold text-white">
                    {getShortPlayerName(player)}
                  </div>
                </button>

                <input
                  type="number"
                  min={1}
                  max={goalsLimit || 1}
                  value={scorer.goalsCount}
                  onChange={(e) =>
                    onGoalsCountChange(
                      scorer.id,
                      Math.max(1, Number(e.target.value) || 1)
                    )
                  }
                  className="h-8 w-12 rounded-full border border-white/10 bg-white/[0.04] px-2 text-center text-sm text-white outline-none"
                />

                <button
                  type="button"
                  onClick={() => onRemove(scorer.id)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[11px] text-white/55 transition hover:bg-white/10 hover:text-white"
                >
                  ×
                </button>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-white/40">
            Поки не вибрано авторів голів
          </div>
        )}
      </div>
    </div>
  );
}

export default function PredictAdvancedPage() {
  const { game, match, prediction, isLocked, predictionDeadline } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const [predictedHome, setPredictedHome] = useState(
    prediction?.predictedHome ?? 0
  );
  const [predictedAway, setPredictedAway] = useState(
    prediction?.predictedAway ?? 0
  );
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
  const selectedGoalsLimit =
    selectedTeamSide === "HOME" ? predictedHome : predictedAway;
  const selectedTeamPlayers =
    selectedTeamSide === "HOME" ? match.homeTeam.players : match.awayTeam.players;
  const selectedTeamScorers =
    selectedTeamSide === "HOME" ? homeScorers : awayScorers;

  function openSlot(side: TeamSide, slot: PitchSlot) {
    setActiveSlot({ mode: "LINEUP", side, slot });
  }

  function closeSlot() {
    setActiveSlot(null);
  }

  function handlePickPlayerForActiveSlot(playerId: string) {
    if (!activeSlot) return;

    setLineup((prev) =>
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
    setLineup((prev) =>
      removePlayerFromSlot({
        lineup: prev,
        side,
        slot,
      })
    );
  }

  function addScorer(side: TeamSide) {
    const teamPlayers =
      side === "HOME" ? match.homeTeam.players : match.awayTeam.players;

    const teamScorers = scorers.filter((item) => item.teamSide === side);
    const maxGoals = side === "HOME" ? predictedHome : predictedAway;
    const total = teamScorers.reduce((sum, item) => sum + item.goalsCount, 0);

    if (teamPlayers.length === 0 || total >= maxGoals) return;

    const newScorerId = createLocalId();

    setScorers((prev) => [
      ...prev,
      {
        id: newScorerId,
        playerId: teamPlayers[0].id,
        teamSide: side,
        goalsCount: 1,
        isFirstGoalScorer: false,
        order: prev.length,
      },
    ]);

    setActiveScorer({
      mode: "SCORER",
      scorerId: newScorerId,
      side,
    });
  }

  function openScorerPicker(side: TeamSide, scorerId: string) {
    setActiveScorer({
      mode: "SCORER",
      scorerId,
      side,
    });
  }

  function closeScorerPicker() {
    setActiveScorer(null);
  }

  function handlePickScorer(playerId: string) {
    if (!activeScorer) return;

    setScorers((prev) =>
      prev.map((item) =>
        item.id === activeScorer.scorerId ? { ...item, playerId } : item
      )
    );

    setActiveScorer(null);
  }

  function removeScorer(scorerId: string) {
    setScorers((prev) => prev.filter((item) => item.id !== scorerId));

    setActiveScorer((prev) => {
      if (!prev) return null;
      if (prev.scorerId === scorerId) return null;
      return prev;
    });
  }

  function changeScorerGoals(scorerId: string, value: number) {
    setScorers((prev) =>
      prev.map((item) =>
        item.id === scorerId
          ? { ...item, goalsCount: Math.max(1, value || 1) }
          : item
      )
    );
  }

  const currentLineupPlayers = useMemo(() => {
    if (!activeSlot) return [];

    const teamPlayers =
      activeSlot.side === "HOME" ? match.homeTeam.players : match.awayTeam.players;

    return sortPlayersForPicker(filterPlayersForSlot(teamPlayers, activeSlot.slot.line));
  }, [activeSlot, match.homeTeam.players, match.awayTeam.players]);

  const lineupSelectedIds = useMemo(() => {
    if (!activeSlot) return new Set<string>();

    return new Set(
      lineup
        .filter((item) => item.teamSide === activeSlot.side && item.isStarter)
        .map((item) => item.playerId)
    );
  }, [activeSlot, lineup]);

  const currentLineupPlayerId = useMemo(() => {
    if (!activeSlot) return null;
    return getPlayerForSlot(lineup, activeSlot.side, activeSlot.slot)?.playerId ?? null;
  }, [activeSlot, lineup]);

  const currentScorerPlayers = useMemo(() => {
    if (!activeScorer) return [];

    const teamPlayers =
      activeScorer.side === "HOME" ? match.homeTeam.players : match.awayTeam.players;

    return sortPlayersForPicker(teamPlayers);
  }, [activeScorer, match.homeTeam.players, match.awayTeam.players]);

  const currentScorerPlayerId = useMemo(() => {
    if (!activeScorer) return null;
    return scorers.find((item) => item.id === activeScorer.scorerId)?.playerId ?? null;
  }, [activeScorer, scorers]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
              Advanced Predict
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Детальний прогноз
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Рахунок, автори голів, схема та склади двох команд.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to={`../predict?matchId=${match.id}`}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Назад
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="hidden sm:block">
              <TeamHeaderCompact team={match.homeTeam} sideLabel="Home" />
            </div>

            <div className="flex-1 text-center">
              <div className="text-[11px] uppercase tracking-[0.2em] text-white/35">
                {match.tournament?.name}
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {formatMatchDateTime(match.startTime)}
              </div>
              <div className="mt-1 text-[11px] text-white/40">
                Deadline: {formatMatchDateTime(predictionDeadline)}
              </div>
            </div>

            <div className="hidden sm:block">
              <TeamHeaderCompact team={match.awayTeam} sideLabel="Away" />
            </div>
          </div>
        </div>

        <section className="block xl:hidden">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedTeamSide("HOME")}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                selectedTeamSide === "HOME"
                  ? "border-white/20 bg-white/[0.08]"
                  : "border-white/8 bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-3">
                <TeamLogo team={match.homeTeam} />
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                    Home
                  </div>
                  <div className="truncate text-sm font-semibold text-white">
                    {match.homeTeam.name}
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTeamSide("AWAY")}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                selectedTeamSide === "AWAY"
                  ? "border-white/20 bg-white/[0.08]"
                  : "border-white/8 bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-3">
                <TeamLogo team={match.awayTeam} />
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                    Away
                  </div>
                  <div className="truncate text-sm font-semibold text-white">
                    {match.awayTeam.name}
                  </div>
                </div>
              </div>
            </button>
          </div>
        </section>
      </section>

      {actionData?.error ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm text-red-100">
          {actionData.error}
        </div>
      ) : null}

      {isLocked ? (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
          Прогноз на цей матч уже закритий.
        </div>
      ) : null}

      <Form method="post" className="space-y-6">
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
        <input type="hidden" name="scorersJson" value={JSON.stringify(scorers)} />
        <input type="hidden" name="lineupJson" value={JSON.stringify(lineup)} />

        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
          <div className="mb-4">
            <div className="text-lg font-semibold text-white">Рахунок</div>
            <div className="mt-1 text-sm text-white/45">
              Вкажи свій прогнозований результат матчу
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-2 text-sm font-semibold text-white">
                {match.homeTeam.name}
              </div>
              <input
                type="number"
                min={0}
                value={predictedHome}
                onChange={(e) =>
                  setPredictedHome(Math.max(0, Number(e.target.value) || 0))
                }
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-lg font-semibold text-white outline-none"
                disabled={isLocked}
              />
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-2 text-sm font-semibold text-white">
                {match.awayTeam.name}
              </div>
              <input
                type="number"
                min={0}
                value={predictedAway}
                onChange={(e) =>
                  setPredictedAway(Math.max(0, Number(e.target.value) || 0))
                }
                className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-lg font-semibold text-white outline-none"
                disabled={isLocked}
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
          <div className="mb-4">
            <div className="text-lg font-semibold text-white">Хто заб’є</div>
            <div className="mt-1 text-sm text-white/45">
              Вибери авторів голів і кількість м’ячів
            </div>
          </div>

          <div className="xl:hidden">
            <ScorerPickerRow
              teamName={selectedTeam.name}
              goalsLimit={selectedGoalsLimit}
              players={selectedTeamPlayers}
              scorers={selectedTeamScorers}
              onAdd={() => addScorer(selectedTeamSide)}
              onOpen={(scorerId) => openScorerPicker(selectedTeamSide, scorerId)}
              onRemove={(scorerId) => removeScorer(scorerId)}
              onGoalsCountChange={(scorerId, value) =>
                changeScorerGoals(scorerId, value)
              }
            />
          </div>

          <div className="hidden xl:grid xl:grid-cols-2 xl:gap-4">
            <ScorerPickerRow
              teamName={match.homeTeam.name}
              goalsLimit={predictedHome}
              players={match.homeTeam.players}
              scorers={homeScorers}
              onAdd={() => addScorer("HOME")}
              onOpen={(scorerId) => openScorerPicker("HOME", scorerId)}
              onRemove={(scorerId) => removeScorer(scorerId)}
              onGoalsCountChange={(scorerId, value) =>
                changeScorerGoals(scorerId, value)
              }
            />

            <ScorerPickerRow
              teamName={match.awayTeam.name}
              goalsLimit={predictedAway}
              players={match.awayTeam.players}
              scorers={awayScorers}
              onAdd={() => addScorer("AWAY")}
              onOpen={(scorerId) => openScorerPicker("AWAY", scorerId)}
              onRemove={(scorerId) => removeScorer(scorerId)}
              onGoalsCountChange={(scorerId, value) =>
                changeScorerGoals(scorerId, value)
              }
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
          <div className="mb-4">
            <div className="text-lg font-semibold text-white">Схеми</div>
            <div className="mt-1 text-sm text-white/45">Обери формацію</div>
          </div>

          <div className="xl:hidden">
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-2 text-sm font-semibold text-white">
                {selectedTeam.name}
              </div>

              <select
                value={selectedFormation}
                onChange={(e) => {
                  if (selectedTeamSide === "HOME") {
                    setPredictedHomeFormation(e.target.value);
                  } else {
                    setPredictedAwayFormation(e.target.value);
                  }
                }}
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none"
                disabled={isLocked}
              >
                {FORMATIONS.map((item) => (
                  <option key={item} value={item} className="text-black">
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="hidden xl:grid xl:grid-cols-2 xl:gap-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-2 text-sm font-semibold text-white">
                {match.homeTeam.name}
              </div>
              <select
                value={predictedHomeFormation}
                onChange={(e) => setPredictedHomeFormation(e.target.value)}
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none"
                disabled={isLocked}
              >
                {FORMATIONS.map((item) => (
                  <option key={item} value={item} className="text-black">
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-2 text-sm font-semibold text-white">
                {match.awayTeam.name}
              </div>
              <select
                value={predictedAwayFormation}
                onChange={(e) => setPredictedAwayFormation(e.target.value)}
                className="h-11 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none"
                disabled={isLocked}
              >
                {FORMATIONS.map((item) => (
                  <option key={item} value={item} className="text-black">
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section>
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
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={5}
              className="mt-4 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none"
              placeholder="Тут можна залишити свої думки по матчу"
              disabled={isLocked}
            />
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isLocked || isSubmitting}
            className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? "Зберігаю..." : "Зберегти прогноз"}
          </button>
        </div>
      </Form>

      <PlayerPickerModal
        open={Boolean(activeSlot)}
        title={
          activeSlot
            ? `${
                activeSlot.side === "HOME"
                  ? match.homeTeam.name
                  : match.awayTeam.name
              } · ${activeSlot.slot.label}`
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
        open={Boolean(activeScorer)}
        title={
          activeScorer
            ? `${
                activeScorer.side === "HOME"
                  ? match.homeTeam.name
                  : match.awayTeam.name
              } · Автор голу`
            : ""
        }
        subtitle="Обери гравця цієї команди"
        players={currentScorerPlayers}
        currentPlayerId={currentScorerPlayerId}
        onClose={closeScorerPicker}
        onPick={handlePickScorer}
      />
    </div>
  );
}