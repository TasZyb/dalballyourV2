import {
  Link,
  useLoaderData,
  data,
  redirect,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getPredictionState(prediction: {
  wasExact: boolean;
  wasOutcomeOnly: boolean;
  wasWrong: boolean;
}) {
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
    label: "Очікується",
    className: "border-white/10 bg-white/[0.05] text-white/65",
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
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              displayName: true,
              email: true,
            },
          },

          // Коли додаси favoriteTeam relation у Game:
          // favoriteTeam: {
          //   select: {
          //     id: true,
          //     name: true,
          //     shortName: true,
          //     code: true,
          //     country: true,
          //   },
          // },

          linkedTournament: {
            select: {
              id: true,
              name: true,
            },
          },

          _count: {
            select: {
              predictions: true,
              gameMatches: true,
            },
          },
        },
      },
    },
  });

  if (!membership) {
    throw redirect("/");
  }

  const [gameMatches, predictions] = await Promise.all([
    prisma.gameMatch.findMany({
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
      take: 100,
    }),

    prisma.prediction.findMany({
      where: {
        gameId,
        userId: currentUser.id,
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
        submittedAt: "desc",
      },
      take: 6,
    }),
  ]);

  const now = new Date();

  const upcomingMatches = gameMatches.filter((item) => {
    const start = new Date(item.match.startTime);

    return (
      start >= now &&
      item.match.status !== "FINISHED" &&
      item.match.status !== "CANCELED" &&
      item.match.status !== "POSTPONED"
    );
  });

  const nextMatch = upcomingMatches[0] ?? null;
  const secondNextMatch = upcomingMatches[1] ?? null;

  const predictedMatchIds = new Set(predictions.map((prediction) => prediction.matchId));

  const pendingMatches = gameMatches.filter((item) => {
    const match = item.match;

    if (item.isLocked) return false;

    if (
      match.status === "FINISHED" ||
      match.status === "CANCELED" ||
      match.status === "POSTPONED"
    ) {
      return false;
    }

    if (new Date(match.startTime) <= now) return false;

    return !predictedMatchIds.has(match.id);
  });

  const exactHits = predictions.filter((item) => item.wasExact).length;
  const outcomeHits = predictions.filter(
    (item) => item.wasExact || item.wasOutcomeOnly
  ).length;

  const averagePoints =
    predictions.length > 0
      ? (
          predictions.reduce(
            (sum, item) => sum + (item.weightedPointsAwarded ?? 0),
            0
          ) / predictions.length
        ).toFixed(1)
      : "0.0";

  const totalWeightedPoints = predictions.reduce(
    (sum, item) => sum + (item.weightedPointsAwarded ?? 0),
    0
  );

  const career = {
    id: membership.game.id,
    name: membership.game.name,
    slug: membership.game.slug,
    description: membership.game.description,
    status: membership.game.status,
    visibility: membership.game.visibility,
    createdAt: membership.game.createdAt,
    updatedAt: membership.game.updatedAt,
    owner: {
      id: membership.game.owner.id,
      name:
        membership.game.owner.displayName ||
        membership.game.owner.name ||
        membership.game.owner.email ||
        "Гравець",
    },

    // Коли favoriteTeam буде в Game:
    // favoriteTeam: membership.game.favoriteTeam
    //   ? {
    //       id: membership.game.favoriteTeam.id,
    //       name: membership.game.favoriteTeam.name,
    //       shortName: membership.game.favoriteTeam.shortName,
    //       code: membership.game.favoriteTeam.code,
    //       country: membership.game.favoriteTeam.country,
    //     }
    //   : null,

    favoriteTeam: null as
      | {
          id: string;
          name: string;
          shortName: string | null;
          code: string | null;
          country: string | null;
        }
      | null,

    linkedTournament: membership.game.linkedTournament
      ? {
          id: membership.game.linkedTournament.id,
          name: membership.game.linkedTournament.name,
        }
      : null,

    stats: {
      matchesCount: membership.game._count.gameMatches,
      predictionsCount: membership.game._count.predictions,
      exactHitsCount: exactHits,
      outcomeHitsCount: outcomeHits,
      liveMatchesCount: gameMatches.filter((item) => item.match.status === "LIVE").length,
      totalWeightedPoints,
    },
  };

  return data({
    career,

    overview: {
      nextMatch: nextMatch
        ? {
            id: nextMatch.match.id,
            startTime: nextMatch.match.startTime,
            status: nextMatch.match.status,
            tournamentName: nextMatch.match.tournament?.name ?? null,
            roundName: nextMatch.match.round?.name ?? null,
            homeTeam: {
              id: nextMatch.match.homeTeam.id,
              name: nextMatch.match.homeTeam.shortName || nextMatch.match.homeTeam.name,
              code: nextMatch.match.homeTeam.code,
            },
            awayTeam: {
              id: nextMatch.match.awayTeam.id,
              name: nextMatch.match.awayTeam.shortName || nextMatch.match.awayTeam.name,
              code: nextMatch.match.awayTeam.code,
            },
          }
        : null,

      secondNextMatch: secondNextMatch
        ? {
            id: secondNextMatch.match.id,
            startTime: secondNextMatch.match.startTime,
            status: secondNextMatch.match.status,
            tournamentName: secondNextMatch.match.tournament?.name ?? null,
            roundName: secondNextMatch.match.round?.name ?? null,
            homeTeam: {
              id: secondNextMatch.match.homeTeam.id,
              name:
                secondNextMatch.match.homeTeam.shortName ||
                secondNextMatch.match.homeTeam.name,
              code: secondNextMatch.match.homeTeam.code,
            },
            awayTeam: {
              id: secondNextMatch.match.awayTeam.id,
              name:
                secondNextMatch.match.awayTeam.shortName ||
                secondNextMatch.match.awayTeam.name,
              code: secondNextMatch.match.awayTeam.code,
            },
          }
        : null,

      pendingCount: pendingMatches.length,
      exactHits,
      outcomeHits,
      averagePoints,
    },

    recentPredictions: predictions.map((prediction) => ({
      id: prediction.id,
      matchId: prediction.match.id,
      predictedHome: prediction.predictedHome,
      predictedAway: prediction.predictedAway,
      weightedPointsAwarded: prediction.weightedPointsAwarded,
      wasExact: prediction.wasExact,
      wasOutcomeOnly: prediction.wasOutcomeOnly,
      wasWrong: prediction.wasWrong,
      submittedAt: prediction.submittedAt,
      match: {
        id: prediction.match.id,
        startTime: prediction.match.startTime,
        status: prediction.match.status,
        tournamentName: prediction.match.tournament?.name ?? null,
        roundName: prediction.match.round?.name ?? null,
        homeTeam: {
          id: prediction.match.homeTeam.id,
          name:
            prediction.match.homeTeam.shortName || prediction.match.homeTeam.name,
          code: prediction.match.homeTeam.code,
        },
        awayTeam: {
          id: prediction.match.awayTeam.id,
          name:
            prediction.match.awayTeam.shortName || prediction.match.awayTeam.name,
          code: prediction.match.awayTeam.code,
        },
      },
    })),
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

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-black text-white sm:text-xl">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm leading-6 text-white/55">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TinyStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
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

function QuickLinkCard({
  title,
  description,
  to,
}: {
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4 transition hover:border-white/20 hover:bg-white/[0.04]"
    >
      <div className="text-base font-black text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-white/55">{description}</div>
      <div className="mt-4 text-sm font-semibold text-white/80 transition group-hover:text-white">
        Відкрити →
      </div>
    </Link>
  );
}

export default function CareerHomePage() {
  const { career, overview, recentPredictions } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
          <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-200">
            Career overview
          </div>

          <h2 className="mt-4 text-2xl font-black leading-tight text-white sm:text-3xl">
            {career.favoriteTeam
              ? `У фокусі — ${career.favoriteTeam.name}`
              : "У фокусі — твоя кар’єра"}
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base sm:leading-7">
            Тут головне завдання — тримати темп: не пропускати матчі, вчасно
            давати прогнози і накопичувати свій персональний прогрес по клубу.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <TinyStat label="Без прогнозу" value={overview.pendingCount} />
            <TinyStat label="Точних" value={overview.exactHits} />
            <TinyStat label="Хітів" value={overview.outcomeHits} />
            <TinyStat label="Середнє" value={overview.averagePoints} />
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-[#0b1018] p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
            Наступний матч
          </div>

          {overview.nextMatch ? (
            <>
              <div className="mt-4 flex items-center gap-3">
                <TeamLogo
                  code={overview.nextMatch.homeTeam.code}
                  name={overview.nextMatch.homeTeam.name}
                />
                <div className="text-lg font-black text-white">
                  {overview.nextMatch.homeTeam.name}
                </div>
              </div>

              <div className="my-3 text-sm font-semibold uppercase tracking-[0.2em] text-white/35">
                vs
              </div>

              <div className="flex items-center gap-3">
                <TeamLogo
                  code={overview.nextMatch.awayTeam.code}
                  name={overview.nextMatch.awayTeam.name}
                />
                <div className="text-lg font-black text-white">
                  {overview.nextMatch.awayTeam.name}
                </div>
              </div>

              <div className="mt-4 text-sm text-white/55">
                {overview.nextMatch.tournamentName || "Турнір"}
                {overview.nextMatch.roundName
                  ? ` · ${overview.nextMatch.roundName}`
                  : ""}
              </div>

              <div className="mt-1 text-sm text-white/55">
                {formatDateTime(overview.nextMatch.startTime)}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={`/career/${career.id}/matches/${overview.nextMatch.id}`}
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
                >
                  Відкрити матч
                </Link>

                <Link
                  to={`/career/${career.id}/predict/${overview.nextMatch.id}`}
                  className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                >
                  Дати прогноз
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-4 text-sm leading-6 text-white/55">
              Найближчий матч поки не знайдено.
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <QuickLinkCard
          title="Матчі"
          description="Подивись весь список матчів цієї кар’єри і швидко переходь до прогнозу."
          to={`/career/${career.id}/matches`}
        />
        <QuickLinkCard
          title="Клуб"
          description="Відкрий сторінку клубу, склад і деталі гравців."
          to={`/career/${career.id}/club`}
        />
        <QuickLinkCard
          title="Досягнення"
          description="Перевір свій прогрес, streak і найкращі влучання."
          to={`/career/${career.id}/achievements`}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Останні прогнози"
          subtitle="Твої останні рішення по матчах цієї кар’єри."
        >
          {recentPredictions.length ? (
            <div className="space-y-3">
              {recentPredictions.map((prediction) => {
                const state = getPredictionState(prediction);

                return (
                  <Link
                    key={prediction.id}
                    to={`/career/${career.id}/matches/${prediction.matchId}`}
                    className="block rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4 transition hover:border-white/20 hover:bg-white/[0.03]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-black text-white">
                          {prediction.match.homeTeam.name} — {prediction.match.awayTeam.name}
                        </div>
                        <div className="mt-1 text-sm text-white/55">
                          {prediction.match.tournamentName || "Турнір"}
                          {prediction.match.roundName
                            ? ` · ${prediction.match.roundName}`
                            : ""}
                        </div>
                      </div>

                      <div
                        className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${state.className}`}
                      >
                        {state.label}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold text-white">
                        Прогноз: {prediction.predictedHome}:{prediction.predictedAway}
                      </div>

                      <div className="text-sm text-white/55">
                        Балів: {prediction.weightedPointsAwarded}
                      </div>

                      <div className="text-sm text-white/55">
                        {formatDateTime(prediction.submittedAt)}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4 text-sm leading-6 text-white/55">
              У цій кар’єрі ще немає жодного прогнозу.
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Що далі"
          subtitle="Найкращий наступний крок для твоєї кар’єри."
        >
          <div className="space-y-3">
            {overview.nextMatch ? (
              <div className="rounded-[1.25rem] border border-orange-400/20 bg-orange-400/10 p-4">
                <div className="text-sm font-black text-white">
                  Підготуй прогноз на найближчий матч
                </div>
                <div className="mt-2 text-sm leading-6 text-white/70">
                  Найкраще зараз — зайти в матч, дати базовий прогноз, а потім
                  перейти до складу й голеадорів.
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/career/${career.id}/predict/${overview.nextMatch.id}`}
                    className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:opacity-90"
                  >
                    Прогноз на матч
                  </Link>
                  <Link
                    to={`/career/${career.id}/matches/${overview.nextMatch.id}`}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
                  >
                    Деталі матчу
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4">
              <div className="text-sm font-black text-white">Переглянь статистику</div>
              <div className="mt-2 text-sm leading-6 text-white/55">
                Подивись, скільки очок уже набрано, скільки точних влучань і як
                виглядає твоя форма в кар’єрі.
              </div>
              <Link
                to={`/career/${career.id}/stats`}
                className="mt-4 inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
              >
                Відкрити статистику
              </Link>
            </div>

            <div className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4">
              <div className="text-sm font-black text-white">Прокачай кар’єру далі</div>
              <div className="mt-2 text-sm leading-6 text-white/55">
                Далі можна працювати над сторінками клубу, календаря, історії
                прогнозів і персональних досягнень.
              </div>
            </div>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}