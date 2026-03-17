import {
  Link,
  useLoaderData,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

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

function getResultLabel(home: number | null, away: number | null) {
  if (home === null || away === null) return "Очікується";
  if (home > away) return "Перемога господарів";
  if (home < away) return "Перемога гостей";
  return "Нічия";
}

function getPredictionResultLabel(predictedHome: number, predictedAway: number) {
  if (predictedHome > predictedAway) return "П1";
  if (predictedHome < predictedAway) return "П2";
  return "Х";
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

  if (!gameId || !matchId) {
    throw new Response("Game or match not found", { status: 404 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      slug: true,
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
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
  });

  if (!gameMatch) {
    throw new Response("Match not found in this game", { status: 404 });
  }

  const members = await prisma.gameMember.findMany({
    where: {
      gameId,
      status: "ACTIVE",
    },
    include: {
      user: {
        include: {
          predictions: {
            where: {
              gameId,
              matchId,
            },
          },
        },
      },
    },
    orderBy: [
      {
        role: "asc",
      },
      {
        joinedAt: "asc",
      },
    ],
  });

  const predictions = members
    .map((member) => {
      const prediction = member.user.predictions[0] ?? null;

      return {
        membershipId: member.id,
        userId: member.user.id,
        userName: getDisplayName(member.user),
        role: member.role,
        prediction: prediction
          ? {
              id: prediction.id,
              predictedHome: prediction.predictedHome,
              predictedAway: prediction.predictedAway,
              pointsAwarded: prediction.pointsAwarded,
              weightedPointsAwarded: prediction.weightedPointsAwarded,
              wasExact: prediction.wasExact,
              wasOutcomeOnly: prediction.wasOutcomeOnly,
              wasWrong: prediction.wasWrong,
              submittedAt: prediction.submittedAt,
            }
          : null,
      };
    })
    .sort((a, b) => {
      const aHasPrediction = a.prediction ? 1 : 0;
      const bHasPrediction = b.prediction ? 1 : 0;

      if (bHasPrediction !== aHasPrediction) {
        return bHasPrediction - aHasPrediction;
      }

      return a.userName.localeCompare(b.userName, "uk");
    });

  return data({
    currentUser,
    game,
    gameMatch,
    predictions,
  });
}

export default function MatchDetailsPage() {
  const { currentUser, game, gameMatch, predictions } =
    useLoaderData<typeof loader>();

  const match = gameMatch.match;
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const isScheduled = match.status === "SCHEDULED";

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              <span>{game.name}</span>
              <span className="text-white/20">•</span>
              <span>{match.tournament.name}</span>
              {match.round ? (
                <>
                  <span className="text-white/20">•</span>
                  <span>{match.round.name}</span>
                </>
              ) : null}
            </div>

            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl">
              {match.homeTeam.name}{" "}
              <span className="text-white/30">vs</span> {match.awayTeam.name}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/65">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                {new Date(match.startTime).toLocaleString("uk-UA")}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                {getStatusLabel(match.status)}
              </div>

              {match.venue ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  {match.venue}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="../"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              ← Назад до матчів
            </Link>

            {isScheduled &&
              (currentUser ? (
                <Link
                  to={`/games/${game.id}/predict`}
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90"
                >
                  Зробити прогноз
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90"
                >
                  Увійти
                </Link>
              ))}
          </div>
        </div>

        <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:p-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
            <div className="min-w-0 text-right">
              <div className="truncate text-lg font-black sm:text-2xl">
                {match.homeTeam.shortName || match.homeTeam.name}
              </div>
              <div className="truncate text-xs text-white/45 sm:text-sm">
                {match.homeTeam.name}
              </div>
            </div>

            <div className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3 text-center sm:px-6 sm:py-4">
              {isFinished ? (
                <>
                  <div className="text-2xl font-black sm:text-4xl">
                    {match.homeScore}:{match.awayScore}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-emerald-200/80 sm:text-xs">
                    {getResultLabel(match.homeScore, match.awayScore)}
                  </div>
                </>
              ) : isLive ? (
                <>
                  <div className="text-xl font-black text-red-200 sm:text-3xl">
                    LIVE
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/50 sm:text-xs">
                    Матч триває
                  </div>
                </>
              ) : (
                <>
                  <div className="text-xl font-black text-white/70 sm:text-3xl">
                    VS
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-white/50 sm:text-xs">
                    Очікування
                  </div>
                </>
              )}
            </div>

            <div className="min-w-0 text-left">
              <div className="truncate text-lg font-black sm:text-2xl">
                {match.awayTeam.shortName || match.awayTeam.name}
              </div>
              <div className="truncate text-xs text-white/45 sm:text-sm">
                {match.awayTeam.name}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45 sm:text-sm sm:tracking-[0.2em]">
              Прогнози учасників
            </div>
            <h2 className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">
              Хто що поставив на цей матч
            </h2>
          </div>

          <div className="text-sm text-white/55">
            Усього учасників: {predictions.length}
          </div>
        </div>

        <div className="space-y-3">
          {predictions.length > 0 ? (
            predictions.map((item) => {
              const isMe = currentUser && item.userId === currentUser.id;
              const prediction = item.prediction;

              return (
                <div
                  key={item.membershipId}
                  className={`rounded-[1.5rem] border p-4 sm:p-5 ${
                    isMe
                      ? "border-emerald-400/30 bg-emerald-500/10"
                      : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-bold sm:text-lg">
                          {item.userName}
                        </div>

                        {isMe ? (
                          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                            Це ти
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-1 text-sm text-white/45">
                        Роль: {item.role.toLowerCase()}
                      </div>
                    </div>

                    {prediction ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-center">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                            Прогноз
                          </div>
                          <div className="mt-1 text-xl font-black">
                            {prediction.predictedHome}:{prediction.predictedAway}
                          </div>
                          <div className="mt-1 text-xs text-white/45">
                            {getPredictionResultLabel(
                              prediction.predictedHome,
                              prediction.predictedAway
                            )}
                          </div>
                        </div>

                        {isFinished ? (
                          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-center">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                              Бали
                            </div>
                            <div className="mt-1 text-xl font-black">
                              {prediction.weightedPointsAwarded}
                            </div>
                            <div className="mt-1 text-xs text-white/45">
                              сирі: {prediction.pointsAwarded}
                            </div>
                          </div>
                        ) : null}

                        {isFinished ? (
                          <div className="text-sm text-white/60">
                            {prediction.wasExact
                              ? "Точний рахунок"
                              : prediction.wasOutcomeOnly
                              ? "Вгаданий результат"
                              : "Мимо"}
                          </div>
                        ) : (
                          <div className="text-sm text-white/60">
                            Подано:{" "}
                            {new Date(prediction.submittedAt).toLocaleString(
                              "uk-UA"
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-3 text-sm text-white/45">
                        Прогноз ще не подано
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60 sm:rounded-3xl sm:p-6 sm:text-base">
              Для цього матчу ще немає жодного прогнозу.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}