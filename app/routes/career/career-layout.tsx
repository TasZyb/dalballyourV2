import {
  Link,
  Outlet,
  redirect,
  useLoaderData,
  useLocation,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

function formatDateLabel(value: Date | string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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

          // ПІСЛЯ ОНОВЛЕННЯ SCHEMA:
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

          predictions: {
            where: {
              userId: currentUser.id,
            },
            select: {
              id: true,
              wasExact: true,
              wasOutcomeOnly: true,
              pointsAwarded: true,
              weightedPointsAwarded: true,
            },
          },

          gameMatches: {
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
            take: 50,
          },
        },
      },
    },
  });

  if (!membership) {
    throw redirect("/");
  }

  /**
   * Коли додаси mode в Game, тут бажано перевіряти:
   *
   * if (membership.game.mode !== "CAREER") {
   *   throw redirect(`/games/${membership.game.id}`);
   * }
   */

  const game = membership.game;
  const now = new Date();

  const nextGameMatch =
    game.gameMatches.find((item) => {
      const match = item.match;
      return (
        new Date(match.startTime) >= now &&
        match.status !== "FINISHED" &&
        match.status !== "CANCELED" &&
        match.status !== "POSTPONED"
      );
    }) ?? null;

  const liveMatchesCount = game.gameMatches.filter(
    (item) => item.match.status === "LIVE"
  ).length;

  const exactHitsCount = game.predictions.filter((item) => item.wasExact).length;
  const outcomeHitsCount = game.predictions.filter(
    (item) => item.wasExact || item.wasOutcomeOnly
  ).length;

  const totalWeightedPoints = game.predictions.reduce(
    (sum, item) => sum + (item.weightedPointsAwarded ?? 0),
    0
  );

  return data({
    currentUser: {
      id: currentUser.id,
      name: currentUser.name,
      displayName: currentUser.displayName,
      email: currentUser.email,
    },
    career: {
      id: game.id,
      name: game.name,
      slug: game.slug,
      description: game.description,
      status: game.status,
      visibility: game.visibility,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      owner: {
        id: game.owner.id,
        name:
          game.owner.displayName ||
          game.owner.name ||
          game.owner.email ||
          "Гравець",
      },

      // ПІСЛЯ ОНОВЛЕННЯ SCHEMA:
      // favoriteTeam: game.favoriteTeam
      //   ? {
      //       id: game.favoriteTeam.id,
      //       name: game.favoriteTeam.name,
      //       shortName: game.favoriteTeam.shortName,
      //       code: game.favoriteTeam.code,
      //       country: game.favoriteTeam.country,
      //     }
      //   : null,

      favoriteTeam: null,

      linkedTournament: game.linkedTournament
        ? {
            id: game.linkedTournament.id,
            name: game.linkedTournament.name,
          }
        : null,

      stats: {
        matchesCount: game._count.gameMatches,
        predictionsCount: game._count.predictions,
        exactHitsCount,
        outcomeHitsCount,
        liveMatchesCount,
        totalWeightedPoints,
      },

      nextMatch: nextGameMatch
        ? {
            id: nextGameMatch.match.id,
            startTime: nextGameMatch.match.startTime,
            status: nextGameMatch.match.status,
            tournamentName: nextGameMatch.match.tournament?.name ?? null,
            roundName: nextGameMatch.match.round?.name ?? null,
            homeTeam: {
              id: nextGameMatch.match.homeTeam.id,
              name:
                nextGameMatch.match.homeTeam.shortName ||
                nextGameMatch.match.homeTeam.name,
              code: nextGameMatch.match.homeTeam.code,
            },
            awayTeam: {
              id: nextGameMatch.match.awayTeam.id,
              name:
                nextGameMatch.match.awayTeam.shortName ||
                nextGameMatch.match.awayTeam.name,
              code: nextGameMatch.match.awayTeam.code,
            },
          }
        : null,
    },
  });
}

function TeamLogo({
  code,
  name,
  className = "h-12 w-12",
}: {
  code?: string | null;
  name: string;
  className?: string;
}) {
  if (!code) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-xs font-black text-white/70 ${className}`}
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

function LayoutBackground() {
  return (
    <div className="pointer-events-none fixed inset-0">
      <div className="absolute left-[-10%] top-[-12%] h-[28rem] w-[28rem] rounded-full bg-orange-500/10 blur-3xl" />
      <div className="absolute right-[-10%] top-[10%] h-[26rem] w-[26rem] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute bottom-[-10%] left-[18%] h-[24rem] w-[24rem] rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.015),transparent_18%,transparent_82%,rgba(255,255,255,0.015))]" />
    </div>
  );
}

function CareerNavLink({
  to,
  label,
}: {
  to: string;
  label: string;
}) {
  const location = useLocation();
  const active =
    location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <Link
      to={to}
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

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.05] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

export default function CareerLayout() {
  const { career } = useLoaderData<typeof loader>();

  return (
    <main className="min-h-screen overflow-hidden bg-[#060b12] text-white">
      <LayoutBackground />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {career.favoriteTeam ? (
                <TeamLogo
                  code={career.favoriteTeam.code}
                  name={career.favoriteTeam.name}
                  className="h-14 w-14"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-sm font-black text-white/70">
                  FC
                </div>
              )}

              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-200/70">
                  Career mode
                </div>
                <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
                  {career.name}
                </h1>
                <div className="mt-1 text-sm text-white/55">
                  {career.favoriteTeam?.name || "Сольна кар’єра"} · створено{" "}
                  {formatDateLabel(career.createdAt)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] hover:text-white"
              >
                До лобі
              </Link>

              <Link
                to={`/career/${career.id}/settings`}
                className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] hover:text-white"
              >
                Налаштування
              </Link>
            </div>
          </div>

          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1018] p-5 shadow-2xl shadow-black/25 sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.15),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]" />

            <div className="relative z-10 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <div>
                <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-200">
                  Solo hub
                </div>

                <h2 className="mt-4 max-w-3xl text-2xl font-black leading-tight tracking-tight text-white sm:text-4xl">
                  Твоя персональна фанатська кар’єра навколо одного клубу
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base sm:leading-7">
                  Тут живе все, що пов’язано з твоїм клубом: матчі, детальні
                  прогнози, аналіз складу, голеадори, історія та досягнення.
                </p>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniStat label="Матчів" value={career.stats.matchesCount} />
                  <MiniStat label="Прогнозів" value={career.stats.predictionsCount} />
                  <MiniStat label="Точних" value={career.stats.exactHitsCount} />
                  <MiniStat label="LIVE" value={career.stats.liveMatchesCount} />
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
                  Наступна подія
                </div>

                {career.nextMatch ? (
                  <div className="mt-4">
                    <div className="text-lg font-black text-white">
                      {career.nextMatch.homeTeam.name} — {career.nextMatch.awayTeam.name}
                    </div>

                    <div className="mt-2 text-sm text-white/55">
                      {career.nextMatch.tournamentName || "Турнір"}{" "}
                      {career.nextMatch.roundName
                        ? `· ${career.nextMatch.roundName}`
                        : ""}
                    </div>

                    <div className="mt-1 text-sm text-white/55">
                      {formatDateLabel(career.nextMatch.startTime)}
                    </div>

                    <Link
                      to={`/career/${career.id}/matches/${career.nextMatch.id}`}
                      className="mt-4 inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
                    >
                      Відкрити матч
                    </Link>
                  </div>
                ) : (
                  <div className="mt-4 text-sm leading-6 text-white/55">
                    Поки що немає найближчого запланованого матчу.
                  </div>
                )}
              </div>
            </div>
          </section>

          <nav className="flex flex-wrap gap-2">
            <CareerNavLink to={`/career/${career.id}`} label="Home" />
            <CareerNavLink to={`/career/${career.id}/matches`} label="Матчі" />
            <CareerNavLink to={`/career/${career.id}/club`} label="Клуб" />
            <CareerNavLink to={`/career/${career.id}/calendar`} label="Календар" />
            <CareerNavLink to={`/career/${career.id}/history`} label="Історія" />
            <CareerNavLink to={`/career/${career.id}/stats`} label="Статистика" />
            <CareerNavLink
              to={`/career/${career.id}/achievements`}
              label="Досягнення"
            />
            <CareerNavLink to={`/career/${career.id}/settings`} label="Налаштування" />
          </nav>
        </header>

        <section className="rounded-[2rem] border border-white/10 bg-[#0b1018]/90 p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6">
          <Outlet />
        </section>
      </div>
    </main>
  );
}