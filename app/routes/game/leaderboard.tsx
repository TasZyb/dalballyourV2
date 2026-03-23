import {
  data,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { useMemo, useState } from "react";
import { MatchStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type LeaderboardMode = "main" | "accuracy" | "form" | "weighted";

type SeasonTableRow = {
  id: string;
  name: string;
  rank: number;

  rawPoints: number;
  weightedPoints: number;
  bonusPoints: number;

  exactHits: number;
  correctResults: number;
  wrongHits: number;

  predictionsCount: number;
  finishedPredictionsCount: number;

  accuracyRate: number;
  exactRate: number;
  wrongRate: number;

  averageWeightedPoints: number;

  currentStreak: number;
  bestStreak: number;
  last5Form: number[];
  last5Average: number;

  weightedMatchesCount: number;
  weightedMatchesPoints: number;
  weightedMatchesAverage: number;
};

function getDisplayName(user: {
  displayName?: string | null;
  name: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
}

function avg(sum: number, count: number) {
  return count > 0 ? sum / count : 0;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  const users = await prisma.user.findMany({
    include: {
      predictions: {
        include: {
          match: {
            include: {
              round: true,
              tournament: true,
            },
          },
        },
        orderBy: {
          match: {
            startTime: "asc",
          },
        },
      },
    },
    orderBy: [{ displayName: "asc" }, { name: "asc" }, { email: "asc" }],
  });

  const leaderboard: SeasonTableRow[] = users
    .map((user) => {
      const finishedPredictions = user.predictions.filter(
        (prediction) => prediction.match.status === MatchStatus.FINISHED
      );

      let rawPoints = 0;
      let weightedPoints = 0;
      let exactHits = 0;
      let correctResults = 0;
      let wrongHits = 0;

      let weightedMatchesCount = 0;
      let weightedMatchesPoints = 0;

      let runningStreak = 0;
      let bestStreak = 0;

      for (const prediction of finishedPredictions) {
        rawPoints += prediction.pointsAwarded;
        weightedPoints += prediction.weightedPointsAwarded;

        if (prediction.wasExact) exactHits += 1;
        if (prediction.wasExact || prediction.wasOutcomeOnly) {
          correctResults += 1;
        }
        if (prediction.wasWrong) wrongHits += 1;

        if (prediction.weightUsed > 1) {
          weightedMatchesCount += 1;
          weightedMatchesPoints += prediction.weightedPointsAwarded;
        }

        if (prediction.pointsAwarded > 0) {
          runningStreak += 1;
          bestStreak = Math.max(bestStreak, runningStreak);
        } else {
          runningStreak = 0;
        }
      }

      let currentStreak = 0;
      for (let i = finishedPredictions.length - 1; i >= 0; i--) {
        if (finishedPredictions[i].pointsAwarded > 0) currentStreak += 1;
        else break;
      }

      const last5Form = finishedPredictions
        .slice(-5)
        .map((prediction) => prediction.weightedPointsAwarded);

      const finishedPredictionsCount = finishedPredictions.length;
      const predictionsCount = user.predictions.length;

      const accuracyRate =
        finishedPredictionsCount > 0
          ? (correctResults / finishedPredictionsCount) * 100
          : 0;

      const exactRate =
        finishedPredictionsCount > 0
          ? (exactHits / finishedPredictionsCount) * 100
          : 0;

      const wrongRate =
        finishedPredictionsCount > 0
          ? (wrongHits / finishedPredictionsCount) * 100
          : 0;

      const averageWeightedPoints = avg(
        weightedPoints,
        finishedPredictionsCount
      );

      const weightedMatchesAverage = avg(
        weightedMatchesPoints,
        weightedMatchesCount
      );

      return {
        id: user.id,
        name: getDisplayName(user),
        rank: 0,

        rawPoints,
        weightedPoints,
        bonusPoints: weightedPoints - rawPoints,

        exactHits,
        correctResults,
        wrongHits,

        predictionsCount,
        finishedPredictionsCount,

        accuracyRate: Number(accuracyRate.toFixed(1)),
        exactRate: Number(exactRate.toFixed(1)),
        wrongRate: Number(wrongRate.toFixed(1)),

        averageWeightedPoints: Number(averageWeightedPoints.toFixed(2)),

        currentStreak,
        bestStreak,
        last5Form,
        last5Average: Number(
          avg(
            last5Form.reduce((sum, item) => sum + item, 0),
            last5Form.length
          ).toFixed(2)
        ),

        weightedMatchesCount,
        weightedMatchesPoints,
        weightedMatchesAverage: Number(weightedMatchesAverage.toFixed(2)),
      };
    })
    .sort((a, b) => {
      if (b.weightedPoints !== a.weightedPoints) {
        return b.weightedPoints - a.weightedPoints;
      }
      if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
      if (b.correctResults !== a.correctResults) {
        return b.correctResults - a.correctResults;
      }
      return a.name.localeCompare(b.name, "uk");
    })
    .map((player, index) => ({
      ...player,
      rank: index + 1,
    }));

  return data({ currentUser, leaderboard });
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm"
      style={
        active
          ? {
              background: "var(--accent-soft)",
              color: "var(--accent)",
              border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
            }
          : {
              background: "var(--panel)",
              color: "var(--text-soft)",
              border: "1px solid var(--border)",
            }
      }
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--panel-strong)";
          e.currentTarget.style.color = "var(--text)";
          e.currentTarget.style.borderColor = "var(--border-strong)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--panel)";
          e.currentTarget.style.color = "var(--text-soft)";
          e.currentTarget.style.borderColor = "var(--border)";
        }
      }}
    >
      {children}
    </button>
  );
}

function FormMini({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <span style={{ color: "var(--muted)" }}>—</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {values.map((value, index) => {
        const style =
          value >= 3
            ? {
                background: "var(--success-soft)",
                color: "var(--success)",
                border: "1px solid color-mix(in srgb, var(--success) 28%, transparent)",
              }
            : value >= 1
            ? {
                background: "var(--accent-soft)",
                color: "var(--accent)",
                border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
              }
            : {
                background: "color-mix(in srgb, #ef4444 14%, transparent)",
                color: "#ef4444",
                border: "1px solid color-mix(in srgb, #ef4444 24%, transparent)",
              };

        return (
          <span
            key={`${index}-${value}`}
            className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[10px] font-bold"
            style={style}
          >
            {value}
          </span>
        );
      })}
    </div>
  );
}

function MobileRow({
  player,
  currentUserId,
  mode,
}: {
  player: SeasonTableRow;
  currentUserId?: string | null;
  mode: LeaderboardMode;
}) {
  const isMe = currentUserId === player.id;

  return (
    <div
      className="rounded-2xl px-3 py-3"
      style={{
        background: isMe ? "var(--accent-soft)" : "var(--panel)",
        border: isMe
          ? "1px solid color-mix(in srgb, var(--accent) 28%, transparent)"
          : "1px solid var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-black"
              style={{ color: "var(--muted)" }}
            >
              #{player.rank}
            </span>
            <span
              className="truncate text-sm font-semibold"
              style={{ color: "var(--text)" }}
            >
              {player.name}
            </span>
          </div>

          {mode === "main" && (
            <div className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>
              Exact {player.exactHits} • Correct {player.correctResults} • Avg{" "}
              {player.averageWeightedPoints}
            </div>
          )}

          {mode === "accuracy" && (
            <div className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>
              Exact {formatPercent(player.exactRate)} • Wrong{" "}
              {formatPercent(player.wrongRate)} • Pred{" "}
              {player.finishedPredictionsCount}
            </div>
          )}

          {mode === "form" && (
            <div className="mt-2">
              <FormMini values={player.last5Form} />
            </div>
          )}

          {mode === "weighted" && (
            <div className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>
              Matches {player.weightedMatchesCount} • Bonus +{player.bonusPoints} • Avg{" "}
              {player.weightedMatchesAverage}
            </div>
          )}
        </div>

        <div className="shrink-0 text-right">
          {mode === "main" && (
            <>
              <div
                className="text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--muted)" }}
              >
                Pts
              </div>
              <div
                className="text-lg font-black"
                style={{ color: "var(--text)" }}
              >
                {player.weightedPoints}
              </div>
            </>
          )}

          {mode === "accuracy" && (
            <>
              <div
                className="text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--muted)" }}
              >
                Acc
              </div>
              <div
                className="text-lg font-black"
                style={{ color: "var(--text)" }}
              >
                {formatPercent(player.accuracyRate)}
              </div>
            </>
          )}

          {mode === "form" && (
            <>
              <div
                className="text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--muted)" }}
              >
                L5
              </div>
              <div
                className="text-lg font-black"
                style={{ color: "var(--text)" }}
              >
                {player.last5Average}
              </div>
            </>
          )}

          {mode === "weighted" && (
            <>
              <div
                className="text-[10px] uppercase tracking-[0.16em]"
                style={{ color: "var(--muted)" }}
              >
                W Pts
              </div>
              <div
                className="text-lg font-black"
                style={{ color: "var(--text)" }}
              >
                {player.weightedMatchesPoints}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const { currentUser, leaderboard } = useLoaderData<typeof loader>();
  const [mode, setMode] = useState<LeaderboardMode>("main");

  const desktopRows = useMemo(() => leaderboard, [leaderboard]);

  return (
    <div className="theme-page">
      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-6">
        <section className="theme-panel rounded-3xl p-3 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.25em]"
                style={{ color: "var(--muted)" }}
              >
                Leaderboard
              </div>
              <h1
                className="mt-1 text-2xl font-black tracking-tight sm:text-3xl"
                style={{ color: "var(--text)" }}
              >
                Таблиця сезону
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <ModeButton active={mode === "main"} onClick={() => setMode("main")}>
                Основне
              </ModeButton>
              <ModeButton
                active={mode === "accuracy"}
                onClick={() => setMode("accuracy")}
              >
                Точність
              </ModeButton>
              <ModeButton active={mode === "form"} onClick={() => setMode("form")}>
                Форма
              </ModeButton>
              <ModeButton
                active={mode === "weighted"}
                onClick={() => setMode("weighted")}
              >
                Важкі матчі
              </ModeButton>
            </div>
          </div>

          {leaderboard.length === 0 ? (
            <div
              className="mt-4 rounded-2xl border border-dashed p-4 text-sm"
              style={{
                background: "var(--panel)",
                borderColor: "var(--border)",
                color: "var(--text-soft)",
              }}
            >
              Поки що немає даних для таблиці.
            </div>
          ) : (
            <>
              <div className="mt-4 space-y-2 md:hidden">
                {leaderboard.map((player) => (
                  <MobileRow
                    key={player.id}
                    player={player}
                    currentUserId={currentUser?.id}
                    mode={mode}
                  />
                ))}
              </div>

              <div className="mt-4 hidden md:block">
                <div className="theme-table rounded-2xl">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-sm">
                      <thead style={{ color: "var(--muted)" }}>
                        {mode === "main" && (
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">#</th>
                            <th className="px-4 py-3 text-left font-semibold">Гравець</th>
                            <th className="px-4 py-3 text-right font-semibold">Очки</th>
                            <th className="px-4 py-3 text-right font-semibold">Чисті</th>
                            <th className="px-4 py-3 text-right font-semibold">Бонус</th>
                            <th className="px-4 py-3 text-right font-semibold">Exact</th>
                            <th className="px-4 py-3 text-right font-semibold">Correct</th>
                            <th className="px-4 py-3 text-right font-semibold">Avg</th>
                          </tr>
                        )}

                        {mode === "accuracy" && (
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">#</th>
                            <th className="px-4 py-3 text-left font-semibold">Гравець</th>
                            <th className="px-4 py-3 text-right font-semibold">Acc</th>
                            <th className="px-4 py-3 text-right font-semibold">Exact %</th>
                            <th className="px-4 py-3 text-right font-semibold">Wrong %</th>
                            <th className="px-4 py-3 text-right font-semibold">Finished</th>
                            <th className="px-4 py-3 text-right font-semibold">Exact</th>
                            <th className="px-4 py-3 text-right font-semibold">Correct</th>
                          </tr>
                        )}

                        {mode === "form" && (
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">#</th>
                            <th className="px-4 py-3 text-left font-semibold">Гравець</th>
                            <th className="px-4 py-3 text-right font-semibold">Current</th>
                            <th className="px-4 py-3 text-right font-semibold">Best</th>
                            <th className="px-4 py-3 text-left font-semibold">Last 5</th>
                            <th className="px-4 py-3 text-right font-semibold">L5 Avg</th>
                            <th className="px-4 py-3 text-right font-semibold">Очки</th>
                          </tr>
                        )}

                        {mode === "weighted" && (
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">#</th>
                            <th className="px-4 py-3 text-left font-semibold">Гравець</th>
                            <th className="px-4 py-3 text-right font-semibold">W Matches</th>
                            <th className="px-4 py-3 text-right font-semibold">W Pts</th>
                            <th className="px-4 py-3 text-right font-semibold">W Avg</th>
                            <th className="px-4 py-3 text-right font-semibold">Bonus</th>
                            <th className="px-4 py-3 text-right font-semibold">Season Pts</th>
                          </tr>
                        )}
                      </thead>

                      <tbody>
                        {desktopRows.map((player) => {
                          const isMe = currentUser?.id === player.id;

                          return (
                            <tr
                              key={player.id}
                              style={{
                                borderTop: "1px solid var(--border)",
                                background: isMe ? "var(--accent-soft)" : "transparent",
                                color: "var(--text)",
                              }}
                            >
                              {mode === "main" && (
                                <>
                                  <td className="px-4 py-3 font-bold" style={{ color: "var(--muted)" }}>
                                    #{player.rank}
                                  </td>
                                  <td className="px-4 py-3 font-semibold">{player.name}</td>
                                  <td className="px-4 py-3 text-right font-black">
                                    {player.weightedPoints}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.rawPoints}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    +{player.bonusPoints}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.exactHits}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.correctResults}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.averageWeightedPoints}
                                  </td>
                                </>
                              )}

                              {mode === "accuracy" && (
                                <>
                                  <td className="px-4 py-3 font-bold" style={{ color: "var(--muted)" }}>
                                    #{player.rank}
                                  </td>
                                  <td className="px-4 py-3 font-semibold">{player.name}</td>
                                  <td className="px-4 py-3 text-right font-black">
                                    {formatPercent(player.accuracyRate)}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {formatPercent(player.exactRate)}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {formatPercent(player.wrongRate)}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.finishedPredictionsCount}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.exactHits}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.correctResults}
                                  </td>
                                </>
                              )}

                              {mode === "form" && (
                                <>
                                  <td className="px-4 py-3 font-bold" style={{ color: "var(--muted)" }}>
                                    #{player.rank}
                                  </td>
                                  <td className="px-4 py-3 font-semibold">{player.name}</td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.currentStreak}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.bestStreak}
                                  </td>
                                  <td className="px-4 py-3">
                                    <FormMini values={player.last5Form} />
                                  </td>
                                  <td className="px-4 py-3 text-right font-black">
                                    {player.last5Average}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.weightedPoints}
                                  </td>
                                </>
                              )}

                              {mode === "weighted" && (
                                <>
                                  <td className="px-4 py-3 font-bold" style={{ color: "var(--muted)" }}>
                                    #{player.rank}
                                  </td>
                                  <td className="px-4 py-3 font-semibold">{player.name}</td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.weightedMatchesCount}
                                  </td>
                                  <td className="px-4 py-3 text-right font-black">
                                    {player.weightedMatchesPoints}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.weightedMatchesAverage}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    +{player.bonusPoints}
                                  </td>
                                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-soft)" }}>
                                    {player.weightedPoints}
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}