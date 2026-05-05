import {
  Link,
  useLoaderData,
  useNavigation,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { MatchStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";

type TeamLike = {
  id: string;
  name: string;
  shortName?: string | null;
  code?: string | null;
  logo?: string | null;
  country?: string | null;
};

type TournamentLike = {
  id: string;
  name: string;
  slug?: string | null;
  country?: string | null;
  logo?: string | null;
};

type HeroMatch = {
  id: string;
  status: string;
  startTime: Date | string;
  stageLabel?: string | null;
  matchdayLabel?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: TeamLike;
  awayTeam: TeamLike;
  tournament: TournamentLike | null;
  round?: {
    id: string;
    name: string;
  } | null;
  gameMeta?: {
    customWeight?: number | null;
    bonusLabel?: string | null;
  } | null;
};

type TournamentOverview = {
  id: string;
  name: string;
  slug?: string | null;
  country?: string | null;
  logo?: string | null;
  totalMatches: number;
  liveMatches: number;
  upcomingMatches: number;
  finishedMatches: number;
};

type MyHighlights = {
  currentGoodStreak: number;
  exactHits: number;
  correctResults: number;
  openMatchesWithoutPrediction: number;
  bestTournamentName: string | null;
};

type NextChallenge = {
  matchId: string;
  startTime: Date | string;
  homeTeam: TeamLike;
  awayTeam: TeamLike;
  tournament: TournamentLike | null;
  round?: {
    id: string;
    name: string;
  } | null;
  bonusLabel?: string | null;
  customWeight?: number | null;
};

function formatMatchDate(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(date));
}

function formatMatchTime(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getTimeUntil(date: Date | string) {
  const now = new Date().getTime();
  const target = new Date(date).getTime();
  const diff = target - now;

  if (diff <= 0) return "Уже йде";

  const totalMinutes = Math.floor(diff / 1000 / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}д ${hours}г`;
  if (hours > 0) return `${hours}г ${minutes}хв`;
  return `${minutes}хв`;
}

function getStatusLabel(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "Скоро";
    case "LIVE":
      return "LIVE";
    case "FINISHED":
      return "Готово";
    case "CANCELED":
      return "Стоп";
    case "POSTPONED":
      return "Пауза";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "LIVE":
      return "border-red-500/20 bg-red-500/15 text-red-300";
    case "FINISHED":
      return "border-emerald-500/20 bg-emerald-500/15 text-emerald-300";
    case "POSTPONED":
      return "border-amber-500/20 bg-amber-500/15 text-amber-300";
    case "CANCELED":
      return "border-zinc-500/20 bg-zinc-500/15 text-zinc-300";
    default:
      return "border-[var(--border)] bg-[var(--panel)] text-[var(--text-soft)]";
  }
}

function getTeamLogoSrc(team: TeamLike) {
  if (team.logo) return team.logo;
  if (team.shortName) return `/teams/${team.shortName}.svg`;
  return null;
}

function getTournamentLogoSrc(tournament?: TournamentLike | null) {
  if (!tournament) return null;
  if (tournament.logo) return `/teams/${tournament.logo}.svg`;
  return null;
}

function getTournamentSubLabel(match: {
  round?: { name: string } | null;
  stageLabel?: string | null;
  matchdayLabel?: string | null;
}) {
  return match.round?.name || match.stageLabel || match.matchdayLabel || null;
}

function getPredictionDeadline(startTime: Date, lockMinutesBeforeStart: number) {
  return new Date(startTime.getTime() - lockMinutesBeforeStart * 60 * 1000);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const gameId = params.gameId;
  const currentUser = await getCurrentUser(request);

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      lockMinutesBeforeStart: true,
    },
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

  const upcomingAndLiveMatches = await prisma.match.findMany({
    where: {
      gameMatches: {
        some: { gameId },
      },
      status: {
        in: [MatchStatus.SCHEDULED, MatchStatus.LIVE],
      },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      tournament: true,
      round: true,
      gameMatches: {
        where: { gameId },
        select: {
          customWeight: true,
          bonusLabel: true,
          predictionClosesAt: true,
          isLocked: true,
        },
        take: 1,
      },
    },
    orderBy: {
      startTime: "asc",
    },
  });

  const nextMatchRaw = upcomingAndLiveMatches[0] ?? null;

  const nextMatch: HeroMatch | null = nextMatchRaw
    ? {
        id: nextMatchRaw.id,
        status: nextMatchRaw.status,
        startTime: nextMatchRaw.startTime,
        stageLabel: nextMatchRaw.stageLabel,
        matchdayLabel: nextMatchRaw.matchdayLabel,
        homeScore: nextMatchRaw.homeScore,
        awayScore: nextMatchRaw.awayScore,
        homeTeam: nextMatchRaw.homeTeam,
        awayTeam: nextMatchRaw.awayTeam,
        tournament: nextMatchRaw.tournament,
        round: nextMatchRaw.round,
        gameMeta: nextMatchRaw.gameMatches[0] ?? null,
      }
    : null;

  const allGameMatches = await prisma.match.findMany({
    where: {
      gameMatches: {
        some: { gameId },
      },
    },
    include: {
      tournament: true,
    },
  });

  const tournamentsMap = new Map<string, TournamentOverview>();

  for (const match of allGameMatches) {
    if (!match.tournament) continue;

    const current = tournamentsMap.get(match.tournament.id) ?? {
      id: match.tournament.id,
      name: match.tournament.name,
      slug: match.tournament.slug,
      country: match.tournament.country,
      logo: match.tournament.logo,
      totalMatches: 0,
      liveMatches: 0,
      upcomingMatches: 0,
      finishedMatches: 0,
    };

    current.totalMatches += 1;

    if (match.status === "LIVE") current.liveMatches += 1;
    if (match.status === "SCHEDULED") current.upcomingMatches += 1;
    if (match.status === "FINISHED") current.finishedMatches += 1;

    tournamentsMap.set(match.tournament.id, current);
  }

  const tournamentsOverview = Array.from(tournamentsMap.values()).sort((a, b) => {
    if (b.liveMatches !== a.liveMatches) return b.liveMatches - a.liveMatches;

    if (b.upcomingMatches !== a.upcomingMatches) {
      return b.upcomingMatches - a.upcomingMatches;
    }

    return b.totalMatches - a.totalMatches;
  });

  let myHighlights: MyHighlights | null = null;
  let myNextChallenge: NextChallenge | null = null;

  if (currentUser) {
    const myPredictions = await prisma.prediction.findMany({
      where: {
        gameId,
        userId: currentUser.id,
      },
      include: {
        match: {
          include: {
            tournament: true,
          },
        },
      },
      orderBy: {
        match: {
          startTime: "desc",
        },
      },
    });

    let currentGoodStreak = 0;

    for (const prediction of myPredictions) {
      if (prediction.wasExact || prediction.wasOutcomeOnly) {
        currentGoodStreak += 1;
      } else {
        break;
      }
    }

    const exactHits = myPredictions.filter((p) => p.wasExact).length;

    const correctResults = myPredictions.filter(
      (p) => p.wasExact || p.wasOutcomeOnly
    ).length;

    const tournamentPoints = new Map<string, { name: string; points: number }>();

    for (const prediction of myPredictions) {
      const tournament = prediction.match.tournament;
      if (!tournament) continue;

      const current = tournamentPoints.get(tournament.id) ?? {
        name: tournament.name,
        points: 0,
      };

      current.points += prediction.weightedPointsAwarded ?? 0;
      tournamentPoints.set(tournament.id, current);
    }

    const bestTournament = Array.from(tournamentPoints.values()).sort(
      (a, b) => b.points - a.points
    )[0];

    const openGameMatches = await prisma.gameMatch.findMany({
      where: {
        gameId,
        match: {
          status: MatchStatus.SCHEDULED,
        },
      },
      include: {
        match: true,
      },
    });

    const myOpenPredictionIds = new Set(
      (
        await prisma.prediction.findMany({
          where: {
            gameId,
            userId: currentUser.id,
            match: {
              status: MatchStatus.SCHEDULED,
            },
          },
          select: {
            matchId: true,
          },
        })
      ).map((p) => p.matchId)
    );

    const openMatchesWithoutPrediction = openGameMatches.filter((gm) => {
      if (gm.isLocked) return false;

      const deadline =
        gm.predictionClosesAt ??
        getPredictionDeadline(gm.match.startTime, game.lockMinutesBeforeStart);

      if (new Date() >= deadline) return false;

      return !myOpenPredictionIds.has(gm.matchId);
    }).length;

    myHighlights = {
      currentGoodStreak,
      exactHits,
      correctResults,
      openMatchesWithoutPrediction,
      bestTournamentName: bestTournament?.name ?? null,
    };

    const nextChallengeRaw = await prisma.gameMatch.findFirst({
      where: {
        gameId,
        match: {
          status: MatchStatus.SCHEDULED,
        },
      },
      include: {
        match: {
          include: {
            tournament: true,
            round: true,
            homeTeam: true,
            awayTeam: true,
          },
        },
      },
      orderBy: [
        { customWeight: "desc" },
        { predictionClosesAt: "asc" },
        { match: { startTime: "asc" } },
      ],
    });

    if (nextChallengeRaw) {
      const existingPrediction = await prisma.prediction.findUnique({
        where: {
          userId_gameId_matchId: {
            userId: currentUser.id,
            gameId,
            matchId: nextChallengeRaw.matchId,
          },
        },
      });

      if (!existingPrediction) {
        myNextChallenge = {
          matchId: nextChallengeRaw.match.id,
          startTime: nextChallengeRaw.match.startTime,
          homeTeam: nextChallengeRaw.match.homeTeam,
          awayTeam: nextChallengeRaw.match.awayTeam,
          tournament: nextChallengeRaw.match.tournament,
          round: nextChallengeRaw.match.round,
          bonusLabel: nextChallengeRaw.bonusLabel,
          customWeight: nextChallengeRaw.customWeight,
        };
      }
    }
  }

  return data({
    game,
    nextMatch,
    tournamentsOverview,
    myHighlights,
    myNextChallenge,
  });
}

function TeamChip({ team }: { team: TeamLike }) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel-strong)]">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={team.name}
            className="h-4.5 w-4.5 object-contain"
            loading="lazy"
          />
        ) : (
          <span className="text-[9px] font-black text-[var(--text-soft)]">
            {team.code || team.name.slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-[var(--text)]">
          {team.shortName || team.name}
        </div>
      </div>
    </div>
  );
}

function MiniTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "success" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[var(--accent-soft)]"
      : tone === "success"
      ? "border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[var(--success-soft)]"
      : tone === "warning"
      ? "border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[var(--warning-soft)]"
      : "border-[var(--border)] bg-[var(--panel)]";

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-black text-[var(--text)]">{value}</div>
    </div>
  );
}

function TournamentPill({
  tournament,
  label,
}: {
  tournament?: TournamentLike | null;
  label?: string | null;
}) {
  if (!tournament && !label) return null;

  const logoSrc = getTournamentLogoSrc(tournament);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tournament ? (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)]">
          <div className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-white/90">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={tournament.name}
                className="h-3 w-3 object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-[8px] font-black text-black/70">
                {tournament.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <span className="max-w-[110px] truncate">{tournament.name}</span>
        </div>
      ) : null}

      {label ? (
        <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card-highlight)] px-2 py-1 text-[10px] text-[var(--muted)]">
          {label}
        </div>
      ) : null}
    </div>
  );
}

export default function GameHomePage() {
  const navigation = useNavigation();

  const { game, nextMatch, tournamentsOverview, myHighlights, myNextChallenge } =
    useLoaderData<typeof loader>();

  const isRouteLoading = navigation.state === "loading";
  const isSubmitting = navigation.state === "submitting";
  const isBusy = isRouteLoading || isSubmitting;

  const nextMatchLabel = nextMatch ? getTournamentSubLabel(nextMatch) : null;

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`mx-auto max-w-5xl space-y-3 transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        <section className="theme-panel-strong rounded-[26px] p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                Режим гри
              </div>
              <h1 className="truncate text-lg font-black text-[var(--text)] sm:text-xl">
                {game.name}
              </h1>
            </div>

            <Link
              to={`/games/${game.id}/predict`}
              className="inline-flex shrink-0 items-center rounded-2xl border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-black text-[var(--accent)]"
            >
              {isBusy ? "Завантаження..." : "Прогноз"}
            </Link>
          </div>
        </section>

        {nextMatch ? (
          <section className="theme-panel-strong relative overflow-hidden rounded-[30px] p-3 sm:p-4">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(circle_at_top,var(--hero-glow),transparent_70%)]" />

            <div className="relative space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                    Головна гра
                  </div>
                  <div className="mt-0.5 text-xl font-black text-[var(--text)] sm:text-2xl">
                    {nextMatch.status === "LIVE"
                      ? "Матч у розпалі"
                      : "Час готувати прогноз"}
                  </div>
                </div>

                <div
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${getStatusClasses(
                    nextMatch.status
                  )}`}
                >
                  {getStatusLabel(nextMatch.status)}
                </div>
              </div>

              <TournamentPill
                tournament={nextMatch.tournament}
                label={nextMatchLabel}
              />

              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-[24px] border border-[var(--border)] bg-[var(--card-highlight)] p-2.5 sm:p-3">
                <TeamChip team={nextMatch.homeTeam} />

                <div className="px-1 text-center">
                  <div className="text-2xl font-black tracking-tight text-[var(--text)] sm:text-3xl">
                    {nextMatch.status === "LIVE" ||
                    nextMatch.status === "FINISHED"
                      ? `${nextMatch.homeScore ?? 0}:${
                          nextMatch.awayScore ?? 0
                        }`
                      : "VS"}
                  </div>

                  <div className="mt-1 text-[10px] text-[var(--muted)]">
                    {formatMatchDate(nextMatch.startTime)} •{" "}
                    {formatMatchTime(nextMatch.startTime)}
                  </div>

                  {nextMatch.status === "SCHEDULED" ? (
                    <div className="mt-1 text-[11px] font-bold text-[var(--accent)]">
                      через {getTimeUntil(nextMatch.startTime)}
                    </div>
                  ) : null}
                </div>

                <TeamChip team={nextMatch.awayTeam} />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniTile
                  label="Статус"
                  value={getStatusLabel(nextMatch.status)}
                  tone={nextMatch.status === "LIVE" ? "warning" : "default"}
                />

                <MiniTile
                  label="Дата"
                  value={formatMatchDate(nextMatch.startTime)}
                />

                <MiniTile
                  label="Час"
                  value={formatMatchTime(nextMatch.startTime)}
                />

                <MiniTile
                  label="Бонус"
                  value={
                    (nextMatch.gameMeta?.customWeight ?? 1) > 1
                      ? `x${nextMatch.gameMeta?.customWeight}`
                      : nextMatch.gameMeta?.bonusLabel || "Нема"
                  }
                  tone={
                    (nextMatch.gameMeta?.customWeight ?? 1) > 1
                      ? "accent"
                      : "default"
                  }
                />
              </div>

              <div className="flex gap-2">
                <Link
                  to={`/games/${game.id}/matches/${nextMatch.id}`}
                  className="inline-flex items-center justify-center rounded-2xl bg-[var(--text)] px-4 py-2.5 text-sm font-black text-[var(--bg)]"
                >
                  В матч
                </Link>

                <Link
                  to={`/games/${game.id}/predict`}
                  className="inline-flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-sm font-black text-[var(--text)]"
                >
                  Мої прогнози
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 xl:grid-cols-[1fr_0.92fr]">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--text-soft)]">
                Моя зона
              </h2>
            </div>

            {myHighlights ? (
              <div className="grid grid-cols-2 gap-2">
                <MiniTile
                  label="Стрік"
                  value={myHighlights.currentGoodStreak}
                  tone="accent"
                />

                <MiniTile
                  label="Точні"
                  value={myHighlights.exactHits}
                  tone="success"
                />

                <MiniTile
                  label="Вгадав"
                  value={myHighlights.correctResults}
                />

                <MiniTile
                  label="Ще треба"
                  value={myHighlights.openMatchesWithoutPrediction}
                  tone={
                    myHighlights.openMatchesWithoutPrediction > 0
                      ? "warning"
                      : "success"
                  }
                />

                <div className="col-span-2 theme-panel rounded-2xl px-3 py-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
                    Мій найкращий турнір
                  </div>
                  <div className="mt-1 truncate text-base font-black text-[var(--text)]">
                    {myHighlights.bestTournamentName ?? "Ще формується"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="theme-panel rounded-2xl px-3 py-3 text-sm text-[var(--text-soft)]">
                Коли увійдеш у гру, тут будуть твої цифри.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--text-soft)]">
              Наступна місія
            </h2>

            {myNextChallenge ? (
              <Link
                to={`/games/${game.id}/matches/${myNextChallenge.matchId}`}
                className="theme-panel-strong block rounded-[26px] p-3 transition hover:translate-y-[-1px]"
              >
                <div className="space-y-2">
                  <TournamentPill
                    tournament={myNextChallenge.tournament}
                    label={getTournamentSubLabel(myNextChallenge)}
                  />

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card-highlight)] px-2.5 py-2">
                    <div className="truncate text-sm font-black text-[var(--text)]">
                      {myNextChallenge.homeTeam.shortName ||
                        myNextChallenge.homeTeam.name}
                    </div>

                    <div className="text-xs font-black text-[var(--accent)]">
                      VS
                    </div>

                    <div className="truncate text-right text-sm font-black text-[var(--text)]">
                      {myNextChallenge.awayTeam.shortName ||
                        myNextChallenge.awayTeam.name}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-soft)]">
                    <span>{formatMatchDate(myNextChallenge.startTime)}</span>
                    <span>•</span>
                    <span>{formatMatchTime(myNextChallenge.startTime)}</span>
                    <span>•</span>
                    <span>через {getTimeUntil(myNextChallenge.startTime)}</span>
                  </div>

                  <div className="text-sm font-bold text-[var(--text)]">
                    Тут ще нема твого прогнозу.
                  </div>
                </div>
              </Link>
            ) : (
              <div className="theme-panel rounded-2xl px-3 py-3 text-sm text-[var(--text-soft)]">
                Усе ок. Новий виклик скоро з’явиться.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--text-soft)]">
              Турніри
            </h2>

            <Link
              to={`/games/${game.id}/matches`}
              className="text-xs font-black text-[var(--accent)]"
            >
              Усі матчі
            </Link>
          </div>

          {tournamentsOverview.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {tournamentsOverview.map((tournament) => {
                const logoSrc = getTournamentLogoSrc(tournament);

                return (
                  <div
                    key={tournament.id}
                    className="theme-panel rounded-2xl p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel-strong)]">
                        {logoSrc ? (
                          <img
                            src={logoSrc}
                            alt={tournament.name}
                            className="h-4.5 w-4.5 object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="text-[8px] font-black text-[var(--text-soft)]">
                            {tournament.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-[var(--text)]">
                          {tournament.name}
                        </div>
                        <div className="text-[10px] text-[var(--muted)]">
                          {tournament.country || "Турнір"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <MiniTile label="Усі" value={tournament.totalMatches} />

                      <MiniTile
                        label="LIVE"
                        value={tournament.liveMatches}
                        tone="warning"
                      />

                      <MiniTile
                        label="Скоро"
                        value={tournament.upcomingMatches}
                        tone="accent"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="theme-panel rounded-2xl px-3 py-3 text-sm text-[var(--text-soft)]">
              Тут поки пусто.
            </div>
          )}
        </section>
      </div>
    </>
  );
}