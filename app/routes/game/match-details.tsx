import {
  Form,
  Link,
  redirect,
  useLoaderData,
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

const LIVE_STATUSES = ["LIVE", "IN_PLAY", "PAUSED", "HALFTIME", "BREAK"];
const UPCOMING_STATUSES = ["SCHEDULED", "TIMED"];
const FINISHED_STATUSES = ["FINISHED"];

function isLiveStatus(status: string) {
  return LIVE_STATUSES.includes(status);
}

function isUpcomingStatus(status: string) {
  return UPCOMING_STATUSES.includes(status);
}

function isFinishedStatus(status: string) {
  return FINISHED_STATUSES.includes(status);
}

function getOutcome(home: number, away: number) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

function calculatePredictionPoints(params: {
  predictedHome: number;
  predictedAway: number;
  actualHome: number | null;
  actualAway: number | null;
  exactPoints: number;
  outcomePoints: number;
  wrongPoints: number;
  weight: number;
}) {
  if (params.actualHome === null || params.actualAway === null) {
    return {
      rawPoints: 0,
      weightedPoints: 0,
      wasExact: false,
      wasOutcomeOnly: false,
      wasWrong: false,
    };
  }

  const wasExact =
    params.predictedHome === params.actualHome &&
    params.predictedAway === params.actualAway;

  const wasOutcomeOnly =
    !wasExact &&
    getOutcome(params.predictedHome, params.predictedAway) ===
      getOutcome(params.actualHome, params.actualAway);

  const rawPoints = wasExact
    ? params.exactPoints
    : wasOutcomeOnly
    ? params.outcomePoints
    : params.wrongPoints;

  return {
    rawPoints,
    weightedPoints: rawPoints * params.weight,
    wasExact,
    wasOutcomeOnly,
    wasWrong: !wasExact && !wasOutcomeOnly,
  };
}

function getStatusLabel(status: string) {
  switch (status) {
    case "SCHEDULED":
    case "TIMED":
      return "Скоро";
    case "LIVE":
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
    case "HALFTIME":
    case "BREAK":
      return "Перерва";
    case "FINISHED":
      return "Завершено";
    case "CANCELED":
    case "CANCELLED":
      return "Скасовано";
    case "POSTPONED":
      return "Перенесено";
    default:
      return status;
  }
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
  if (!isUpcomingStatus(params.matchStatus)) return true;

  const deadline =
    params.predictionClosesAt ??
    getPredictionDeadline(params.startTime, params.gameLockMinutesBeforeStart);

  return now >= deadline;
}

function getDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;
  const matchId = params.matchId;

  if (!currentUser) throw redirect("/login");

  if (!gameId || !matchId) {
    throw new Response("Game or match not found", { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: "ACTIVE",
    },
  });

  if (!membership) throw redirect("/");

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      lockMinutesBeforeStart: true,
      allowMemberPredictionsEdit: true,
      timezone: true,
      defaultRoundWeight: true,
      scoringExact: true,
      scoringOutcome: true,
      scoringWrong: true,
    },
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

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
              userId: currentUser.id,
            },
            take: 1,
          },
        },
      },
    },
    orderBy: {
      match: {
        startTime: "asc",
      },
    },
  });

  const compactMatches = gameMatches.map((gameMatch) => {
    const myPrediction = gameMatch.match.predictions[0] ?? null;

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

    return {
      gameMatchId: gameMatch.id,
      isLocked: locked,
      predictionDeadline: deadline,
      customWeight: gameMatch.customWeight,
      match: {
        id: gameMatch.match.id,
        status: gameMatch.match.status,
        startTime: gameMatch.match.startTime,
        stageLabel: gameMatch.match.stageLabel,
        matchdayLabel: gameMatch.match.matchdayLabel,
        tournament: gameMatch.match.tournament,
        round: gameMatch.match.round,
        homeTeam: gameMatch.match.homeTeam,
        awayTeam: gameMatch.match.awayTeam,
        homeScore: gameMatch.match.homeScore,
        awayScore: gameMatch.match.awayScore,
        myPrediction,
      },
    };
  });

  const selectedGameMatch = await prisma.gameMatch.findFirst({
    where: {
      gameId,
      matchId,
    },
    include: {
      match: {
        include: {
          tournament: true,
          round: true,
          homeTeam: true,
          awayTeam: true,
          predictions: {
            where: { gameId },
            include: {
              user: true,
            },
            orderBy: {
              submittedAt: "asc",
            },
          },
        },
      },
    },
  });

  if (!selectedGameMatch) {
    throw new Response("Match not found in this game", { status: 404 });
  }

  const selectedMatch = selectedGameMatch.match;

  const selectedLocked = isPredictionLocked({
    matchStatus: selectedMatch.status,
    startTime: selectedMatch.startTime,
    gameMatchIsLocked: selectedGameMatch.isLocked,
    predictionClosesAt: selectedGameMatch.predictionClosesAt,
    gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
  });

  const selectedDeadline =
    selectedGameMatch.predictionClosesAt ??
    getPredictionDeadline(selectedMatch.startTime, game.lockMinutesBeforeStart);

  const weightUsed =
    selectedGameMatch.customWeight ??
    selectedMatch.round?.defaultWeight ??
    game.defaultRoundWeight ??
    1;

  const mode = isFinishedStatus(selectedMatch.status)
    ? "FINISHED"
    : isLiveStatus(selectedMatch.status)
    ? "LIVE"
    : "UPCOMING";

  const predictionRows = selectedMatch.predictions
    .map((prediction) => {
      const projected = calculatePredictionPoints({
        predictedHome: prediction.predictedHome,
        predictedAway: prediction.predictedAway,
        actualHome: selectedMatch.homeScore,
        actualAway: selectedMatch.awayScore,
        exactPoints: game.scoringExact,
        outcomePoints: game.scoringOutcome,
        wrongPoints: game.scoringWrong,
        weight: weightUsed,
      });

      const rawPoints = isFinishedStatus(selectedMatch.status)
        ? prediction.pointsAwarded
        : isLiveStatus(selectedMatch.status)
        ? projected.rawPoints
        : null;

      const weightedPoints = isFinishedStatus(selectedMatch.status)
        ? prediction.weightedPointsAwarded
        : isLiveStatus(selectedMatch.status)
        ? projected.weightedPoints
        : null;

      return {
        id: prediction.id,
        userId: prediction.userId,
        name: getDisplayName(prediction.user),
        image: prediction.user.image,
        isMe: prediction.userId === currentUser.id,
        predictedHome: prediction.predictedHome,
        predictedAway: prediction.predictedAway,
        submittedAt: prediction.submittedAt,
        rawPoints,
        weightedPoints,
        wasExact: isFinishedStatus(selectedMatch.status)
          ? prediction.wasExact
          : projected.wasExact,
        wasOutcomeOnly: isFinishedStatus(selectedMatch.status)
          ? prediction.wasOutcomeOnly
          : projected.wasOutcomeOnly,
        wasWrong: isFinishedStatus(selectedMatch.status)
          ? prediction.wasWrong
          : projected.wasWrong,
      };
    })
    .sort((a, b) => {
      if (mode === "FINISHED" || mode === "LIVE") {
        const pointsDiff = (b.weightedPoints ?? 0) - (a.weightedPoints ?? 0);
        if (pointsDiff !== 0) return pointsDiff;

        const rawDiff = (b.rawPoints ?? 0) - (a.rawPoints ?? 0);
        if (rawDiff !== 0) return rawDiff;
      }

      if (a.isMe) return -1;
      if (b.isMe) return 1;

      return a.name.localeCompare(b.name, "uk");
    });

  const maxWeightedPoints =
    mode === "FINISHED" || mode === "LIVE"
      ? Math.max(0, ...predictionRows.map((row) => row.weightedPoints ?? 0))
      : 0;

  const selectedMatchBlock = {
    gameMatchId: selectedGameMatch.id,
    isLocked: selectedLocked,
    predictionDeadline: selectedDeadline,
    customWeight: selectedGameMatch.customWeight,
    weightUsed,
    mode,
    match: {
      ...selectedMatch,
      myPrediction:
        selectedMatch.predictions.find((p) => p.userId === currentUser.id) ??
        null,
    },
  };

  return data({
    currentUser,
    game,
    compactMatches,
    selectedMatchBlock,
    predictionRows,
    maxWeightedPoints,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;
  const routeMatchId = params.matchId;

  if (!currentUser) throw redirect("/login");

  if (!gameId || !routeMatchId) {
    throw new Response("Game or match not found", { status: 404 });
  }

  const formData = await request.formData();

  const matchId = String(formData.get("matchId") || routeMatchId);
  const predictedHome = Number(formData.get("predictedHome"));
  const predictedAway = Number(formData.get("predictedAway"));

  if (!matchId) {
    return data({ error: "Матч не знайдено." }, { status: 400 });
  }

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

  const weightUsed =
    gameMatch.customWeight ??
    gameMatch.match.round?.defaultWeight ??
    game.defaultRoundWeight ??
    1;

  await prisma.prediction.upsert({
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
      weightUsed,
      updatedAt: new Date(),
    },
  });

  throw redirect(`/games/${gameId}/matches/${matchId}`);
}

function formatMatchDate(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

function formatMatchTime(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getTeamLogoSrc(team: any) {
  if (team.logo) return team.logo;
  if (team.shortName) return `/teams/${team.shortName}.svg`;
  if (team.code) return `/teams/${team.code}.svg`;
  return null;
}

function getTournamentLogoSrc(tournament?: any) {
  if (!tournament?.logo) return null;
  return tournament.logo.startsWith("/")
    ? tournament.logo
    : `/teams/${tournament.logo}.svg`;
}

function getTournamentSubLabel(match: any) {
  return match.round?.name || match.stageLabel || match.matchdayLabel || null;
}

function CrownIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="absolute -right-2 -top-3 h-7 w-7 drop-shadow-lg"
      aria-hidden="true"
    >
      <path d="M10 48h44l-4 8H14l-4-8Z" fill="currentColor" className="text-amber-300" />
      <path d="M8 22l14 12 10-20 10 20 14-12-5 25H13L8 22Z" fill="currentColor" className="text-yellow-300" />
      <path d="M22 34l10-20 10 20" fill="none" stroke="rgba(0,0,0,.25)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="22" r="4" fill="currentColor" className="text-amber-200" />
      <circle cx="32" cy="14" r="4" fill="currentColor" className="text-amber-200" />
      <circle cx="56" cy="22" r="4" fill="currentColor" className="text-amber-200" />
    </svg>
  );
}

function UserAvatar({
  image,
  name,
  crowned,
}: {
  image?: string | null;
  name: string;
  crowned?: boolean;
}) {
  return (
    <div className="relative shrink-0">
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel)]">
        {image ? (
          <img src={image} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm font-black text-[var(--text-soft)]">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>

      {crowned ? <CrownIcon /> : null}
    </div>
  );
}

function TeamCell({
  team,
  align = "left",
  strong = false,
}: {
  team: any;
  align?: "left" | "right";
  strong?: boolean;
}) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div
      className={[
        "flex min-w-0 items-center gap-2",
        align === "right" ? "justify-end text-right" : "",
      ].join(" ")}
    >
      {align === "right" && (
        <div className="min-w-0">
          <div
            className={
              strong
                ? "truncate text-sm font-black text-[var(--text)] sm:text-base"
                : "truncate text-[13px] font-bold text-[var(--text)] sm:text-sm"
            }
          >
            {team.shortName || team.name}
          </div>
          <div className="hidden truncate text-[10px] text-[var(--muted)] sm:block">
            {team.code || team.name}
          </div>
        </div>
      )}

      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel)]">
        {logoSrc ? (
          <img src={logoSrc} alt={team.name} className="h-5 w-5 object-contain" loading="lazy" />
        ) : (
          <span className="text-[9px] font-black text-[var(--text-soft)]">
            {(team.code || team.shortName || team.name).slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>

      {align === "left" && (
        <div className="min-w-0">
          <div
            className={
              strong
                ? "truncate text-sm font-black text-[var(--text)] sm:text-base"
                : "truncate text-[13px] font-bold text-[var(--text)] sm:text-sm"
            }
          >
            {team.shortName || team.name}
          </div>
          <div className="hidden truncate text-[10px] text-[var(--muted)] sm:block">
            {team.code || team.name}
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentBadge({
  tournament,
  label,
}: {
  tournament?: any;
  label?: string | null;
}) {
  if (!tournament && !label) return null;

  const logoSrc = getTournamentLogoSrc(tournament);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tournament ? (
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90">
            {logoSrc ? (
              <img src={logoSrc} alt={tournament.name} className="h-3 w-3 object-contain" loading="lazy" />
            ) : (
              <span className="text-[8px] font-bold text-black/70">
                {tournament.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <span className="max-w-[140px] truncate text-[11px] text-[var(--text-soft)] sm:max-w-none">
            {tournament.name}
          </span>
        </div>
      ) : null}

      {label ? (
        <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
          {label}
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const className = isLiveStatus(status)
    ? "border-red-400/20 bg-red-500/15 text-red-300"
    : isFinishedStatus(status)
    ? "border-emerald-400/20 bg-emerald-500/15 text-emerald-300"
    : isUpcomingStatus(status)
    ? "border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent)]"
    : "border-[var(--border)] bg-[var(--panel)] text-[var(--text-soft)]";

  return (
    <span
      className={[
        "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
        className,
      ].join(" ")}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function MatchSidebarItem({
  item,
  gameId,
  selectedMatchId,
}: {
  item: any;
  gameId: string;
  selectedMatchId: string;
}) {
  const match = item.match;
  const isActive = selectedMatchId === match.id;
  const tournamentSubLabel = getTournamentSubLabel(match);
  const hasScore = isFinishedStatus(match.status) || isLiveStatus(match.status);

  return (
    <Link
      to={`/games/${gameId}/matches/${match.id}`}
      className={[
        "block rounded-2xl border px-3 py-2.5 transition",
        isActive
          ? "border-[var(--accent)]/30 bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--panel-strong)]",
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TournamentBadge tournament={match.tournament} label={tournamentSubLabel} />

          <div className="flex shrink-0 items-center gap-1.5">
            {match.myPrediction ? (
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-300">
                Є прогноз
              </span>
            ) : null}

            {item.isLocked ? (
              <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                Закрито
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamCell team={match.homeTeam} align="left" />

          <div className="flex min-w-[72px] flex-col items-center justify-center">
            <div className="text-sm font-black tracking-tight text-[var(--text)]">
              {hasScore
                ? `${match.homeScore ?? 0}:${match.awayScore ?? 0}`
                : match.myPrediction
                ? `${match.myPrediction.predictedHome}:${match.myPrediction.predictedAway}`
                : "vs"}
            </div>

            <div className="mt-0.5 text-[10px] text-[var(--muted)]">
              {formatMatchDate(match.startTime)} • {formatMatchTime(match.startTime)}
            </div>
          </div>

          <TeamCell team={match.awayTeam} align="right" />
        </div>
      </div>
    </Link>
  );
}

function PointsResultBadge({ item, mode }: { item: any; mode: string }) {
  if (mode === "UPCOMING") {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm font-black text-[var(--text)]">
        {item.predictedHome}:{item.predictedAway}
      </div>
    );
  }

  const label =
    mode === "LIVE"
      ? "потенційно"
      : item.wasExact
      ? "точний"
      : item.wasOutcomeOnly
      ? "результат"
      : "мимо";

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm font-black text-[var(--text)]">
        {item.predictedHome}:{item.predictedAway}
      </div>

      <div className="text-right text-[11px] font-bold text-[var(--text-soft)]">
        {item.weightedPoints ?? 0} б.{" "}
        <span className="text-[var(--muted)]">
          ({item.rawPoints ?? 0} × вага)
        </span>
      </div>

      <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}

function ParticipantPredictionRow({
  item,
  mode,
  isTop,
}: {
  item: any;
  mode: string;
  isTop: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between gap-3 rounded-2xl border px-3 py-3",
        item.isMe
          ? "border-[var(--accent)]/30 bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--panel)]",
      ].join(" ")}
    >
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar image={item.image} name={item.name} crowned={isTop} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-black text-[var(--text)]">
              {item.name}
            </div>

            {item.isMe ? (
              <span className="rounded-full border border-[var(--accent)]/20 bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--accent)]">
                Це ти
              </span>
            ) : null}

            {isTop && mode !== "UPCOMING" ? (
              <span className="rounded-full border border-yellow-300/20 bg-yellow-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-yellow-300">
                Топ
              </span>
            ) : null}
          </div>

          <div className="mt-1 text-xs text-[var(--muted)]">
            Подано {new Date(item.submittedAt).toLocaleString("uk-UA")}
          </div>
        </div>
      </div>

      <PointsResultBadge item={item} mode={mode} />
    </div>
  );
}

function OtherMatchesBlock({
  compactMatches,
  gameId,
  selectedMatchId,
}: {
  compactMatches: any[];
  gameId: string;
  selectedMatchId: string;
}) {
  const [visible, setVisible] = useState(3);
  const [tab, setTab] = useState<"active" | "finished" | "all">("all");

  const otherMatches = compactMatches
    .filter((item) => item.match.id !== selectedMatchId)
    .sort((a, b) => +new Date(b.match.startTime) - +new Date(a.match.startTime));

  const activeMatches = otherMatches.filter(
    (item) => isLiveStatus(item.match.status) || isUpcomingStatus(item.match.status)
  );

  const finishedMatches = otherMatches.filter((item) =>
    isFinishedStatus(item.match.status)
  );

  const matchesByTab =
    tab === "active"
      ? activeMatches
      : tab === "finished"
      ? finishedMatches
      : otherMatches;

  const visibleMatches = matchesByTab.slice(0, visible);
  const canShowMore = visible < matchesByTab.length;

  function changeTab(nextTab: "active" | "finished" | "all") {
    setTab(nextTab);
    setVisible(3);
  }

  const tabs = [
    {
      key: "active" as const,
      label: "LIVE / Скоро",
      count: activeMatches.length,
    },
    {
      key: "finished" as const,
      label: "Завершені",
      count: finishedMatches.length,
    },
    {
      key: "all" as const,
      label: "Всі",
      count: otherMatches.length,
    },
  ];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[var(--text)] sm:text-xl">
            Інші матчі
          </h2>
          <p className="text-sm text-[var(--text-soft)]">
            Обери інший матч, щоб подивитись прогнози.
          </p>
        </div>

        <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs font-bold text-[var(--muted)]">
          {matchesByTab.length}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {tabs.map((item) => {
          const isActive = tab === item.key;

          return (
            <button
              key={item.key}
              type="button"
              onClick={() => changeTab(item.key)}
              className={[
                "rounded-2xl border px-2 py-2 text-[11px] font-black transition sm:text-xs",
                isActive
                  ? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border)] bg-[var(--panel)] text-[var(--text-soft)] hover:bg-[var(--panel-strong)]",
              ].join(" ")}
            >
              <span className="block truncate">{item.label}</span>
              <span className="mt-0.5 block text-[10px] opacity-70">
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {visibleMatches.length > 0 ? (
        <div className="space-y-2">
          {visibleMatches.map((item) => (
            <MatchSidebarItem
              key={item.gameMatchId}
              item={item}
              gameId={gameId}
              selectedMatchId={selectedMatchId}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-4 py-6 text-sm text-[var(--text-soft)]">
          У цьому розділі поки немає матчів.
        </div>
      )}

      {canShowMore ? (
        <button
          type="button"
          onClick={() => setVisible((prev) => prev + 3)}
          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm font-black text-[var(--text)] transition hover:bg-[var(--panel-strong)]"
        >
          Показати ще 3 матчі
        </button>
      ) : null}
    </section>
  );
}

export default function MatchDetailsPage() {
  const {
    game,
    compactMatches,
    selectedMatchBlock,
    predictionRows,
    maxWeightedPoints,
  } = useLoaderData<typeof loader>();

  const selected = selectedMatchBlock;
  const selectedMatch = selected.match;
  const selectedMatchId = selectedMatch.id;
  const myPrediction = selectedMatch.myPrediction ?? null;
  const tournamentSubLabel = getTournamentSubLabel(selectedMatch);

  const hasScore =
    isFinishedStatus(selectedMatch.status) || isLiveStatus(selectedMatch.status);

  const sectionTitle =
    selected.mode === "FINISHED"
      ? "Хто як поставив і скільки заробив"
      : selected.mode === "LIVE"
      ? "LIVE: потенційні бали прямо зараз"
      : "Прогнози учасників";

  const sectionSubtitle =
    selected.mode === "FINISHED"
      ? "Показані тільки ті учасники, які зробили прогноз на цей матч."
      : selected.mode === "LIVE"
      ? "Бали рахуються тимчасово за поточним рахунком матчу."
      : "Показані прогнози тих, хто вже зробив ставку.";

  return (
    <div className="mx-auto max-w-6xl space-y-5 sm:space-y-8">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="theme-muted text-xs font-black uppercase tracking-[0.24em]">
              Match details
            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
              Деталі матчу
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">
              Матч, прогноз і результати учасників у грі{" "}
              <span className="font-bold text-[var(--text)]">{game.name}</span>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to={`/games/${game.id}/matches`}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-bold text-[var(--text-soft)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--text)]"
            >
              Усі матчі
            </Link>

            <Link
              to={`/games/${game.id}/leaderboard`}
              className="rounded-xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-bold text-[var(--text-soft)] transition hover:bg-[var(--panel-strong)] hover:text-[var(--text)]"
            >
              Таблиця
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="theme-panel rounded-3xl px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <TournamentBadge
                    tournament={selectedMatch.tournament}
                    label={tournamentSubLabel}
                  />

                  <StatusPill status={selectedMatch.status} />
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                  <TeamCell team={selectedMatch.homeTeam} align="left" strong />

                  <div className="flex min-w-[82px] flex-col items-center justify-center sm:min-w-[90px]">
                    <div className="text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
                      {hasScore
                        ? `${selectedMatch.homeScore ?? 0}:${selectedMatch.awayScore ?? 0}`
                        : "vs"}
                    </div>

                    <div className="mt-1 text-center text-[10px] font-bold text-[var(--muted)] sm:text-[11px]">
                      {formatMatchDate(selectedMatch.startTime)} •{" "}
                      {formatMatchTime(selectedMatch.startTime)}
                    </div>
                  </div>

                  <TeamCell team={selectedMatch.awayTeam} align="right" strong />
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-[var(--text-soft)]">
                  <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5">
                    Дедлайн:{" "}
                    {new Date(selected.predictionDeadline).toLocaleString("uk-UA")}
                  </div>

                  <div className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5">
                    Вага: {selected.weightUsed}x
                  </div>
                </div>
              </div>
            </div>

            <div className="theme-panel rounded-3xl px-4 py-4 sm:px-5">
              {selected.isLocked ? (
                <div className="space-y-3">
                  <div className="text-sm font-bold text-[var(--text-soft)]">
                    Прогноз на цей матч уже закритий.
                  </div>

                  {myPrediction ? (
                    <div className="inline-flex rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-black text-emerald-300">
                      Мій прогноз: {myPrediction.predictedHome}:
                      {myPrediction.predictedAway}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-3 text-sm text-[var(--text-soft)]">
                      Ти не встиг подати прогноз.
                    </div>
                  )}
                </div>
              ) : (
                <Form method="post" className="space-y-4">
                  <input type="hidden" name="matchId" value={selectedMatch.id} />

                  <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 sm:gap-4">
                    <div>
                      <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                        {selectedMatch.homeTeam.shortName ||
                          selectedMatch.homeTeam.name}
                      </label>

                      <input
                        type="number"
                        min={0}
                        name="predictedHome"
                        defaultValue={myPrediction?.predictedHome ?? ""}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-center text-xl font-black text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]/40"
                        placeholder="0"
                      />
                    </div>

                    <div className="pb-3 text-lg font-black text-[var(--muted)]">
                      :
                    </div>

                    <div>
                      <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                        {selectedMatch.awayTeam.shortName ||
                          selectedMatch.awayTeam.name}
                      </label>

                      <input
                        type="number"
                        min={0}
                        name="predictedAway"
                        defaultValue={myPrediction?.predictedAway ?? ""}
                        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-center text-xl font-black text-[var(--text)] outline-none transition placeholder:text-[var(--muted)] focus:border-[var(--accent)]/40"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm text-[var(--text-soft)]">
                      {myPrediction
                        ? `Поточний прогноз: ${myPrediction.predictedHome}:${myPrediction.predictedAway}`
                        : "Ти ще не подавав прогноз на цей матч"}
                    </div>

                    <button
                      type="submit"
                      className="inline-flex h-11 items-center justify-center rounded-2xl bg-[var(--accent)] px-5 text-sm font-black text-black transition hover:opacity-90"
                    >
                      {myPrediction ? "Оновити прогноз" : "Зберегти прогноз"}
                    </button>
                  </div>
                </Form>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-black text-[var(--text)] sm:text-xl">
                  {sectionTitle}
                </h3>

                <p className="text-sm text-[var(--text-soft)]">
                  {sectionSubtitle}
                </p>
              </div>

              <span className="w-fit rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs font-bold text-[var(--muted)]">
                {predictionRows.length}
              </span>
            </div>

            {predictionRows.length > 0 ? (
              <div className="space-y-2">
                {predictionRows.map((item: any) => {
                  const isTop =
                    selected.mode !== "UPCOMING" &&
                    maxWeightedPoints > 0 &&
                    (item.weightedPoints ?? 0) === maxWeightedPoints;

                  return (
                    <ParticipantPredictionRow
                      key={item.id}
                      item={item}
                      mode={selected.mode}
                      isTop={isTop}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-4 py-6 text-sm text-[var(--text-soft)]">
                Поки що ніхто не зробив прогноз на цей матч.
              </div>
            )}
          </section>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <OtherMatchesBlock
            compactMatches={compactMatches}
            gameId={game.id}
            selectedMatchId={selectedMatchId}
          />
        </aside>
      </section>
    </div>
  );
}