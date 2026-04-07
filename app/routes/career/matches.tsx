import {
  Link,
  useLoaderData,
  useSearchParams,
  data,
  redirect,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type MatchFilter = "all" | "upcoming" | "live" | "finished" | "pending";

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusMeta(status: string) {
  switch (status) {
    case "LIVE":
      return {
        label: "LIVE",
        className: "border-red-400/20 bg-red-400/10 text-red-200",
      };
    case "FINISHED":
      return {
        label: "Завершено",
        className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
      };
    case "POSTPONED":
      return {
        label: "Перенесено",
        className: "border-yellow-400/20 bg-yellow-400/10 text-yellow-200",
      };
    case "CANCELED":
      return {
        label: "Скасовано",
        className: "border-white/10 bg-white/[0.05] text-white/65",
      };
    default:
      return {
        label: "Скоро",
        className: "border-blue-400/20 bg-blue-400/10 text-blue-200",
      };
  }
}

function getPredictionMeta(prediction: {
  wasExact: boolean;
  wasOutcomeOnly: boolean;
  wasWrong: boolean;
} | null) {
  if (!prediction) {
    return {
      label: "Без прогнозу",
      className: "border-white/10 bg-white/[0.05] text-white/60",
    };
  }

  if (prediction.wasExact) {
    return {
      label: "Точний",
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    };
  }

  if (prediction.wasOutcomeOnly) {
    return {
      label: "Результат",
      className: "border-blue-400/20 bg-blue-400/10 text-blue-200",
    };
  }

  if (prediction.wasWrong) {
    return {
      label: "Мимо",
      className: "border-red-400/20 bg-red-400/10 text-red-200",
    };
  }

  return {
    label: "Прогноз",
    className: "border-white/10 bg-white/[0.05] text-white/60",
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Career not found", { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: "ACTIVE",
    },
    include: {
      game: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!membership) {
    throw redirect("/");
  }

  const gameMatches = await prisma.gameMatch.findMany({
    where: {
      gameId,
    },
    include: {
      match: {
        include: {
          homeTeam: {
            select: {
              id: true,
              name: true,
              shortName: true,
              code: true,
            },
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
              shortName: true,
              code: true,
            },
          },
          tournament: {
            select: {
              id: true,
              name: true,
            },
          },
          round: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: {
      match: {
        startTime: "asc",
      },
    },
    take: 300,
  });

  const predictions = await prisma.prediction.findMany({
    where: {
      gameId,
      userId: currentUser.id,
    },
    select: {
      id: true,
      matchId: true,
      predictedHome: true,
      predictedAway: true,
      weightedPointsAwarded: true,
      wasExact: true,
      wasOutcomeOnly: true,
      wasWrong: true,
      submittedAt: true,
    },
  });

  const predictionMap = new Map(predictions.map((prediction) => [prediction.matchId, prediction]));
  const now = new Date();

  const matches = gameMatches.map((item) => {
    const prediction = predictionMap.get(item.match.id) ?? null;

    return {
      id: item.match.id,
      gameMatchId: item.id,
      isLocked: item.isLocked,
      includeInLeaderboard: item.includeInLeaderboard,
      startTime: item.match.startTime,
      status: item.match.status,
      tournamentName: item.match.tournament?.name ?? null,
      roundName: item.match.round?.name ?? null,
      venue: item.match.venue ?? null,
      homeScore: item.match.homeScore,
      awayScore: item.match.awayScore,
      homeTeam: {
        id: item.match.homeTeam.id,
        name: item.match.homeTeam.shortName || item.match.homeTeam.name,
        code: item.match.homeTeam.code,
      },
      awayTeam: {
        id: item.match.awayTeam.id,
        name: item.match.awayTeam.shortName || item.match.awayTeam.name,
        code: item.match.awayTeam.code,
      },
      prediction: prediction
        ? {
            id: prediction.id,
            predictedHome: prediction.predictedHome,
            predictedAway: prediction.predictedAway,
            weightedPointsAwarded: prediction.weightedPointsAwarded,
            wasExact: prediction.wasExact,
            wasOutcomeOnly: prediction.wasOutcomeOnly,
            wasWrong: prediction.wasWrong,
            submittedAt: prediction.submittedAt,
          }
        : null,
      isUpcoming:
        new Date(item.match.startTime) > now &&
        item.match.status !== "FINISHED" &&
        item.match.status !== "CANCELED" &&
        item.match.status !== "POSTPONED",
      isFinished: item.match.status === "FINISHED",
      isLive: item.match.status === "LIVE",
      isPending:
        !prediction &&
        !item.isLocked &&
        new Date(item.match.startTime) > now &&
        item.match.status !== "FINISHED" &&
        item.match.status !== "CANCELED" &&
        item.match.status !== "POSTPONED",
    };
  });

  return data({
    career: {
      id: membership.game.id,
      name: membership.game.name,
      slug: membership.game.slug,
    },
    matches,
    stats: {
      total: matches.length,
      upcoming: matches.filter((m) => m.isUpcoming).length,
      live: matches.filter((m) => m.isLive).length,
      finished: matches.filter((m) => m.isFinished).length,
      pending: matches.filter((m) => m.isPending).length,
    },
  });
}

function TeamLogo({
  code,
  name,
  className = "h-10 w-10",
}: {
  code?: string | null;
  name: string;
  className?: string;
}) {
  if (!code) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-[10px] font-black text-white/70 ${className}`}
      >
        {name.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`/teams/${code}.svg`}
      alt={name}
      className={`rounded-2xl border border-white/10 bg-white p-1 object-contain ${className}`}
      onError={(e) => {
        const target = e.currentTarget;
        target.style.display = "none";
      }}
    />
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-[#0b1018] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function FilterLink({
  label,
  value,
  current,
}: {
  label: string;
  value: MatchFilter;
  current: MatchFilter;
}) {
  const active = current === value;

  return (
    <Link
      to={value === "all" ? "." : `?filter=${value}`}
      className={[
        "inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
        active
          ? "border-orange-400/25 bg-orange-400/10 text-orange-100"
          : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function CareerMatchesPage() {
  const { career, matches, stats } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  const filterParam = searchParams.get("filter");
  const currentFilter: MatchFilter =
    filterParam === "upcoming" ||
    filterParam === "live" ||
    filterParam === "finished" ||
    filterParam === "pending"
      ? filterParam
      : "all";

  const filteredMatches = matches.filter((match) => {
    switch (currentFilter) {
      case "upcoming":
        return match.isUpcoming;
      case "live":
        return match.isLive;
      case "finished":
        return match.isFinished;
      case "pending":
        return match.isPending;
      default:
        return true;
    }
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
        <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-200">
          Career matches
        </div>

        <h1 className="mt-4 text-2xl font-black text-white sm:text-3xl">
          Матчі кар’єри
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
          Тут зібрані всі матчі твоєї кар’єри. Можеш швидко відсіяти live,
          upcoming, finished або ті, де ти ще не встиг дати прогноз.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Усього" value={stats.total} />
          <StatCard label="Скоро" value={stats.upcoming} />
          <StatCard label="LIVE" value={stats.live} />
          <StatCard label="Завершено" value={stats.finished} />
          <StatCard label="Без прогнозу" value={stats.pending} />
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <FilterLink label="Усі" value="all" current={currentFilter} />
        <FilterLink label="Скоро" value="upcoming" current={currentFilter} />
        <FilterLink label="LIVE" value="live" current={currentFilter} />
        <FilterLink label="Завершені" value="finished" current={currentFilter} />
        <FilterLink label="Без прогнозу" value="pending" current={currentFilter} />
      </section>

      <section className="space-y-4">
        {filteredMatches.length ? (
          filteredMatches.map((match) => {
            const statusMeta = getStatusMeta(match.status);
            const predictionMeta = getPredictionMeta(match.prediction);

            return (
              <div
                key={match.id}
                className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <div
                        className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </div>

                      <div
                        className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${predictionMeta.className}`}
                      >
                        {predictionMeta.label}
                      </div>
                    </div>

                    <div className="mt-3 text-sm text-white/55">
                      {match.tournamentName || "Турнір"}
                      {match.roundName ? ` · ${match.roundName}` : ""}
                    </div>
                  </div>

                  <div className="text-sm text-white/55">
                    {formatDateTime(match.startTime)}
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                  <div className="flex items-center gap-3">
                    <TeamLogo code={match.homeTeam.code} name={match.homeTeam.name} />
                    <div className="min-w-0">
                      <div className="truncate text-lg font-black text-white">
                        {match.homeTeam.name}
                      </div>
                      <div className="mt-1 text-xs text-white/45">HOME</div>
                    </div>
                  </div>

                  <div className="flex flex-col items-center justify-center gap-2">
                    {match.isFinished &&
                    match.homeScore !== null &&
                    match.awayScore !== null ? (
                      <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-5 py-3 text-xl font-black text-white">
                        {match.homeScore}:{match.awayScore}
                      </div>
                    ) : match.prediction ? (
                      <div className="rounded-2xl border border-orange-400/20 bg-orange-400/10 px-5 py-3 text-lg font-black text-white">
                        {match.prediction.predictedHome}:{match.prediction.predictedAway}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-5 py-3 text-sm font-semibold text-white/55">
                        VS
                      </div>
                    )}

                    {match.prediction ? (
                      <div className="text-xs text-white/50">
                        Балів: {match.prediction.weightedPointsAwarded}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3 lg:justify-end">
                    <div className="min-w-0 text-right">
                      <div className="truncate text-lg font-black text-white">
                        {match.awayTeam.name}
                      </div>
                      <div className="mt-1 text-xs text-white/45">AWAY</div>
                    </div>
                    <TeamLogo code={match.awayTeam.code} name={match.awayTeam.name} />
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Link
                    to={`/career/${career.id}/matches/${match.id}`}
                    className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:opacity-90"
                  >
                    Деталі матчу
                  </Link>

                  {!match.isFinished && match.status !== "CANCELED" && match.status !== "POSTPONED" ? (
                    <Link
                      to={`/career/${career.id}/predict/${match.id}`}
                      className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                    >
                      {match.prediction ? "Оновити прогноз" : "Дати прогноз"}
                    </Link>
                  ) : null}
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5 text-sm leading-6 text-white/55">
            За цим фільтром матчів поки немає.
          </div>
        )}
      </section>
    </div>
  );
}