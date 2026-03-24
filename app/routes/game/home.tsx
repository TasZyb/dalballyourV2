import {
  Link,
  useLoaderData,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { MatchStatus, MembershipStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

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
    year: "numeric",
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

  if (diff <= 0) return "Уже стартував";

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
      return "Завершено";
    case "CANCELED":
      return "Скасовано";
    case "POSTPONED":
      return "Перенесено";
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
      return "border-white/10 bg-white/8 text-white/70";
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

function TournamentBadge({
  tournament,
  label,
}: {
  tournament?: TournamentLike | null;
  label?: string | null;
}) {
  if (!tournament && !label) return null;

  const logoSrc = getTournamentLogoSrc(tournament);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tournament && (
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={tournament.name}
                className="h-3 w-3 object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-[8px] font-bold text-black/70">
                {tournament.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <span className="max-w-[150px] truncate text-[11px] text-white/75 sm:max-w-none">
            {tournament.name}
          </span>
        </div>
      )}

      {label ? (
        <div className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/55">
          {label}
        </div>
      ) : null}
    </div>
  );
}

function TeamMark({ team }: { team: TeamLike }) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 sm:h-11 sm:w-11">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={team.name}
            className="h-6 w-6 object-contain sm:h-7 sm:w-7"
            loading="lazy"
          />
        ) : (
          <span className="text-[10px] font-bold text-white/55">
            {team.code || team.name.slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white sm:text-base">
          {team.shortName || team.name}
        </div>
        <div className="truncate text-[11px] text-white/45 sm:text-xs">
          {team.country || team.name}
        </div>
      </div>
    </div>
  );
}

function SmallStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black tracking-tight text-white">
        {value}
      </div>
      {hint ? <div className="mt-2 text-xs text-white/45">{hint}</div> : null}
    </div>
  );
}

export default function GameHomePage() {
  const { game, nextMatch, tournamentsOverview, myHighlights, myNextChallenge } =
    useLoaderData<typeof loader>();

  const nextMatchLabel = nextMatch ? getTournamentSubLabel(nextMatch) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {nextMatch && (
        <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
                  Найближча подія
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                  {nextMatch.status === "LIVE"
                    ? "Матч уже в грі"
                    : "Наступний матч, який задає тон"}
                </h2>
              </div>

              <div
                className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getStatusClasses(
                  nextMatch.status
                )}`}
              >
                {getStatusLabel(nextMatch.status)}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TournamentBadge
                tournament={nextMatch.tournament}
                label={nextMatchLabel}
              />

              {nextMatch.gameMeta?.bonusLabel ? (
                <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/65">
                  {nextMatch.gameMeta.bonusLabel}
                </span>
              ) : null}

              {(nextMatch.gameMeta?.customWeight ?? 1) > 1 ? (
                <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                  x{nextMatch.gameMeta?.customWeight}
                </span>
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <TeamMark team={nextMatch.homeTeam} />

              <div className="flex flex-col items-center justify-center">
                <div className="text-2xl font-black tracking-tight text-white sm:text-4xl">
                  {nextMatch.status === "FINISHED" || nextMatch.status === "LIVE"
                    ? `${nextMatch.homeScore ?? 0} : ${nextMatch.awayScore ?? 0}`
                    : "vs"}
                </div>

                <div className="mt-2 text-sm text-white/45">
                  {formatMatchDate(nextMatch.startTime)} •{" "}
                  {formatMatchTime(nextMatch.startTime)}
                </div>

                {nextMatch.status === "SCHEDULED" && (
                  <div className="mt-1 text-sm font-medium text-white/60">
                    Початок через {getTimeUntil(nextMatch.startTime)}
                  </div>
                )}
              </div>

              <div className="lg:justify-self-end">
                <TeamMark team={nextMatch.awayTeam} />
              </div>
            </div>

            <div>
              <Link
                to={`/games/${game.id}/matches/${nextMatch.id}`}
                className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90"
              >
                Відкрити матч
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white sm:text-xl">
            Турніри гри
          </h2>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
            {tournamentsOverview.length}
          </span>
        </div>

        {tournamentsOverview.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tournamentsOverview.map((tournament) => {
              const logoSrc = getTournamentLogoSrc(tournament);

              return (
                <div
                  key={tournament.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/90">
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt={tournament.name}
                          className="h-6 w-6 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-[10px] font-bold text-black/70">
                          {tournament.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-white">
                        {tournament.name}
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {tournament.country || "Міжнародний турнір"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                        Усього
                      </div>
                      <div className="mt-1 text-lg font-black text-white">
                        {tournament.totalMatches}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                        LIVE
                      </div>
                      <div className="mt-1 text-lg font-black text-red-200">
                        {tournament.liveMatches}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">
                        Скоро
                      </div>
                      <div className="mt-1 text-lg font-black text-white">
                        {tournament.upcomingMatches}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-white/45">
            Для цієї гри ще не прив’язані турніри.
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-white sm:text-xl">
            Мій вайб у грі
          </h2>

          {myHighlights ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SmallStatCard
                label="Поточний стрік"
                value={myHighlights.currentGoodStreak}
                hint="Скільки поспіль прогнозів дали правильний результат"
              />
              <SmallStatCard
                label="Точні рахунки"
                value={myHighlights.exactHits}
                hint="Exact hits за весь час у цій грі"
              />
              <SmallStatCard
                label="Влучив у результат"
                value={myHighlights.correctResults}
                hint="Усі прогнози, де результат матчу був вгаданий"
              />
              <SmallStatCard
                label="Без прогнозу"
                value={myHighlights.openMatchesWithoutPrediction}
                hint="Скільки відкритих матчів ще чекають твого прогнозу"
              />
              <div className="sm:col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[11px] uppercase tracking-[0.16em] text-white/40">
                  Найкращий турнір для мене
                </div>
                <div className="mt-2 text-xl font-black tracking-tight text-white">
                  {myHighlights.bestTournamentName ?? "Ще формується"}
                </div>
                <div className="mt-2 text-sm text-white/45">
                  Турнір, у якому ти наразі набрав найбільше вагомих очок.
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-white/45">
              Увійди в гру як учасник, і тут з’являться твої особисті досягнення.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-lg font-bold text-white sm:text-xl">
            Мій наступний виклик
          </h2>

          {myNextChallenge ? (
            <Link
              to={`/games/${game.id}/matches/${myNextChallenge.matchId}`}
              className="block rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 transition hover:border-white/20 hover:bg-white/[0.05]"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TournamentBadge
                    tournament={myNextChallenge.tournament}
                    label={getTournamentSubLabel(myNextChallenge)}
                  />

                  {myNextChallenge.bonusLabel ? (
                    <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/65">
                      {myNextChallenge.bonusLabel}
                    </span>
                  ) : null}

                  {(myNextChallenge.customWeight ?? 1) > 1 ? (
                    <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                      x{myNextChallenge.customWeight}
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="truncate text-sm font-semibold text-white">
                    {myNextChallenge.homeTeam.shortName || myNextChallenge.homeTeam.name}
                  </div>

                  <div className="text-center text-base font-black text-white">
                    vs
                  </div>

                  <div className="truncate text-right text-sm font-semibold text-white">
                    {myNextChallenge.awayTeam.shortName || myNextChallenge.awayTeam.name}
                  </div>
                </div>

                <div className="text-sm text-white/50">
                  {formatMatchDate(myNextChallenge.startTime)} •{" "}
                  {formatMatchTime(myNextChallenge.startTime)} • через{" "}
                  {getTimeUntil(myNextChallenge.startTime)}
                </div>

                <div className="text-sm text-white/65">
                  Це найближчий важливий матч, на який у тебе ще немає прогнозу.
                </div>
              </div>
            </Link>
          ) : (
            <div className="rounded-[1.75rem] border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-white/45">
              Або всі найближчі прогнози вже подані, або новий виклик з’явиться зовсім скоро.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}