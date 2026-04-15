import {
  data,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { useMemo, useState } from "react";
import { MatchStatus, MembershipStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type LeaderboardView =
  | "overview"
  | "form"
  | "accuracy"
  | "exact"
  | "risk";

type Row = {
  id: string;
  name: string;
  image?: string | null;

  rank: number;
  movement: number;

  weightedPoints: number;
  rawPoints: number;
  bonusPoints: number;

  exactHits: number;
  correctResults: number;
  wrongHits: number;

  finishedPredictionsCount: number;
  totalPredictionsCount: number;

  accuracyRate: number;
  exactRate: number;
  wrongRate: number;

  currentStreak: number;
  bestStreak: number;

  last5Form: number[];
  last5Average: number;
  last10Average: number;

  weightedMatchesCount: number;
  weightedMatchesPoints: number;
  weightedMatchesAverage: number;

  consistencyScore: number;
  momentumScore: number;

  gapToLeader: number;
};

function getDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
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

function formatMovement(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function getMovementTone(value: number) {
  if (value > 0) {
    return {
      background: "var(--success-soft)",
      color: "var(--success)",
      border: "1px solid color-mix(in srgb, var(--success) 26%, transparent)",
    };
  }

  if (value < 0) {
    return {
      background: "color-mix(in srgb, #ef4444 14%, transparent)",
      color: "#ef4444",
      border: "1px solid color-mix(in srgb, #ef4444 24%, transparent)",
    };
  }

  return {
    background: "var(--panel)",
    color: "var(--text-soft)",
    border: "1px solid var(--border)",
  };
}

function getFormBadgeStyle(value: number) {
  if (value >= 3) {
    return {
      background: "var(--success-soft)",
      color: "var(--success)",
      border: "1px solid color-mix(in srgb, var(--success) 28%, transparent)",
    };
  }

  if (value >= 1) {
    return {
      background: "var(--accent-soft)",
      color: "var(--accent)",
      border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
    };
  }

  return {
    background: "color-mix(in srgb, #ef4444 14%, transparent)",
    color: "#ef4444",
    border: "1px solid color-mix(in srgb, #ef4444 24%, transparent)",
  };
}

function getAvatarLetters(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      linkedTournament: true,
      members: {
        where: {
          status: MembershipStatus.ACTIVE,
        },
        include: {
          user: true,
        },
        orderBy: [{ joinedAt: "asc" }],
      },
      gameMatches: {
        where: {
          includeInLeaderboard: true,
        },
        include: {
          match: {
            include: {
              round: true,
              tournament: true,
            },
          },
        },
      },
      predictions: {
        include: {
          user: true,
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
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

  const leaderboardMatchIds = new Set(
    game.gameMatches.map((gm) => gm.matchId)
  );

  const finishedPredictionsForGame = game.predictions.filter(
    (prediction) =>
      leaderboardMatchIds.has(prediction.matchId) &&
      prediction.match.status === MatchStatus.FINISHED
  );

  const rowsBase: Row[] = game.members.map((member) => {
    const playerPredictions = game.predictions.filter(
      (prediction) =>
        prediction.userId === member.userId &&
        leaderboardMatchIds.has(prediction.matchId)
    );

    const finishedPredictions = playerPredictions.filter(
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

    const pointsSeries = finishedPredictions.map(
      (prediction) => prediction.weightedPointsAwarded
    );

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

    const last5Form = pointsSeries.slice(-5);
    const last10Form = pointsSeries.slice(-10);

    const finishedPredictionsCount = finishedPredictions.length;
    const totalPredictionsCount = playerPredictions.length;

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

    const last5Average = avg(
      last5Form.reduce((sum, item) => sum + item, 0),
      last5Form.length
    );

    const last10Average = avg(
      last10Form.reduce((sum, item) => sum + item, 0),
      last10Form.length
    );

    const weightedMatchesAverage = avg(
      weightedMatchesPoints,
      weightedMatchesCount
    );

    const seasonAverage = avg(weightedPoints, finishedPredictionsCount);
    const volatilityPenalty = Math.abs(last10Average - seasonAverage);
    const consistencyScore =
      seasonAverage * 10 + accuracyRate * 0.35 - volatilityPenalty * 4;

    const momentumScore =
      last5Average * 12 + currentStreak * 4 + exactHits * 0.5;

    return {
      id: member.user.id,
      name: getDisplayName(member.user),
      image: member.user.image ?? null,

      rank: 0,
      movement: 0,

      weightedPoints,
      rawPoints,
      bonusPoints: weightedPoints - rawPoints,

      exactHits,
      correctResults,
      wrongHits,

      finishedPredictionsCount,
      totalPredictionsCount,

      accuracyRate: Number(accuracyRate.toFixed(1)),
      exactRate: Number(exactRate.toFixed(1)),
      wrongRate: Number(wrongRate.toFixed(1)),

      currentStreak,
      bestStreak,

      last5Form,
      last5Average: Number(last5Average.toFixed(2)),
      last10Average: Number(last10Average.toFixed(2)),

      weightedMatchesCount,
      weightedMatchesPoints,
      weightedMatchesAverage: Number(weightedMatchesAverage.toFixed(2)),

      consistencyScore: Number(consistencyScore.toFixed(2)),
      momentumScore: Number(momentumScore.toFixed(2)),

      gapToLeader: 0,
    };
  });

  const overallSorted = [...rowsBase]
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
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }));

  const previousOrderMap = new Map(
    [...rowsBase]
      .sort((a, b) => {
        if (b.last10Average !== a.last10Average) {
          return b.last10Average - a.last10Average;
        }
        if (b.weightedPoints !== a.weightedPoints) {
          return b.weightedPoints - a.weightedPoints;
        }
        return a.name.localeCompare(b.name, "uk");
      })
      .map((row, index) => [row.id, index + 1])
  );

  const leaderPoints = overallSorted[0]?.weightedPoints ?? 0;

  const leaderboard = overallSorted.map((row) => {
    const prevRank = previousOrderMap.get(row.id) ?? row.rank;
    return {
      ...row,
      movement: prevRank - row.rank,
      gapToLeader: Math.max(0, leaderPoints - row.weightedPoints),
    };
  });

  const hottestPlayer =
    [...leaderboard].sort((a, b) => b.momentumScore - a.momentumScore)[0] ??
    null;

  const mostAccurate =
    [...leaderboard].sort((a, b) => b.accuracyRate - a.accuracyRate)[0] ?? null;

  const exactKing =
    [...leaderboard].sort((a, b) => b.exactHits - a.exactHits)[0] ?? null;

  const bestStreakPlayer =
    [...leaderboard].sort((a, b) => b.bestStreak - a.bestStreak)[0] ?? null;

  const me =
    currentUser
      ? leaderboard.find((player) => player.id === currentUser.id) ?? null
      : null;

  return data({
    currentUser,
    game: {
      id: game.id,
      name: game.name,
      linkedTournamentName: game.linkedTournament?.name ?? null,
      membersCount: game.members.length,
      finishedMatchesCount: new Set(
        finishedPredictionsForGame.map((p) => p.matchId)
      ).size,
    },
    leaderboard,
    highlights: {
      hottestPlayer,
      mostAccurate,
      exactKing,
      bestStreakPlayer,
      me,
    },
  });
}

function TabButton({
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
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-2xl px-3 py-2 text-xs font-semibold transition sm:px-4 sm:text-sm"
      style={
        active
          ? {
              background: "var(--accent-soft)",
              color: "var(--accent)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
            }
          : {
              background: "var(--panel)",
              color: "var(--text-soft)",
              border: "1px solid var(--border)",
            }
      }
    >
      {children}
    </button>
  );
}

function Avatar({
  name,
  image,
  size = "md",
}: {
  name: string;
  image?: string | null;
  size?: "sm" | "md";
}) {
  const sizeClass =
    size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";

  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className={`${sizeClass} rounded-full object-cover`}
        style={{ border: "1px solid var(--border)" }}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex items-center justify-center rounded-full font-black`}
      style={{
        background:
          "linear-gradient(135deg, var(--accent-soft), color-mix(in srgb, var(--accent) 18%, transparent))",
        color: "var(--accent)",
        border: "1px solid color-mix(in srgb, var(--accent) 26%, transparent)",
      }}
    >
      {getAvatarLetters(name)}
    </div>
  );
}

function FormMini({ values }: { values: number[] }) {
  if (values.length === 0) {
    return <span style={{ color: "var(--muted)" }}>—</span>;
  }

  return (
    <div className="flex items-center gap-1">
      {values.slice(-5).map((value, index) => (
        <span
          key={`${index}-${value}`}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[10px] font-black"
          style={getFormBadgeStyle(value)}
        >
          {value}
        </span>
      ))}
    </div>
  );
}

function MobileCompactRow({
  player,
  currentUserId,
  view,
}: {
  player: Row;
  currentUserId?: string | null;
  view: LeaderboardView;
}) {
  const isMe = currentUserId === player.id;

  let mainValue = `${player.weightedPoints}`;
  let subLeft = `${player.gapToLeader} behind`;
  let subRight = `${player.finishedPredictionsCount} matches`;

  if (view === "form") {
    mainValue = `${player.last5Average}`;
    subLeft = `Streak ${player.currentStreak}`;
    subRight = `Best ${player.bestStreak}`;
  }

  if (view === "accuracy") {
    mainValue = formatPercent(player.accuracyRate);
    subLeft = `${formatPercent(player.exactRate)} exact`;
    subRight = `${formatPercent(player.wrongRate)} wrong`;
  }

  if (view === "exact") {
    mainValue = `${player.exactHits}`;
    subLeft = `${formatPercent(player.exactRate)} exact`;
    subRight = `${player.correctResults} correct`;
  }

  if (view === "risk") {
    mainValue = `${player.weightedMatchesPoints}`;
    subLeft = `${player.weightedMatchesCount} heavy`;
    subRight = `avg ${player.weightedMatchesAverage}`;
  }

  return (
    <div
      className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3"
      style={{
        background: isMe ? "var(--accent-soft)" : "transparent",
        borderTop: "1px solid var(--border)",
      }}
    >
      <div
        className="text-sm font-black tabular-nums"
        style={{ color: "var(--muted)" }}
      >
        #{player.rank}
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Avatar name={player.name} image={player.image} size="sm" />
          <div className="min-w-0">
            <div
              className="truncate text-sm font-bold"
              style={{ color: "var(--text)" }}
            >
              {player.name}
            </div>
            <div
              className="truncate text-[11px]"
              style={{ color: "var(--text-soft)" }}
            >
              {subLeft} • {subRight}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-right">
        <div
          className="text-base font-black leading-none tabular-nums"
          style={{ color: "var(--text)" }}
        >
          {mainValue}
        </div>

        <span
          className="inline-flex min-w-10 items-center justify-center rounded-full px-2 py-1 text-[10px] font-bold"
          style={getMovementTone(player.movement)}
        >
          {formatMovement(player.movement)}
        </span>
      </div>
    </div>
  );
}

function HighlightCard({
  label,
  title,
  value,
  note,
  accent = "accent",
}: {
  label: string;
  title: string;
  value: string;
  note?: string;
  accent?: "accent" | "success" | "warning";
}) {
  const accentStyles =
    accent === "success"
      ? {
          chipBg: "var(--success-soft)",
          chipColor: "var(--success)",
          chipBorder:
            "1px solid color-mix(in srgb, var(--success) 24%, transparent)",
        }
      : accent === "warning"
      ? {
          chipBg: "color-mix(in srgb, #f59e0b 14%, transparent)",
          chipColor: "#f59e0b",
          chipBorder: "1px solid color-mix(in srgb, #f59e0b 24%, transparent)",
        }
      : {
          chipBg: "var(--accent-soft)",
          chipColor: "var(--accent)",
          chipBorder:
            "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
        };

  return (
    <div
      className="rounded-3xl p-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
        style={{
          background: accentStyles.chipBg,
          color: accentStyles.chipColor,
          border: accentStyles.chipBorder,
        }}
      >
        {label}
      </div>

      <div
        className="mt-3 truncate text-sm font-semibold"
        style={{ color: "var(--text-soft)" }}
      >
        {title}
      </div>

      <div
        className="mt-2 text-2xl font-black tracking-tight tabular-nums"
        style={{ color: "var(--text)" }}
      >
        {value}
      </div>

      {note ? (
        <div className="mt-2 text-xs" style={{ color: "var(--text-soft)" }}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

export default function LeaderboardPage() {
  const { currentUser, game, leaderboard, highlights } =
    useLoaderData<typeof loader>();

  const [view, setView] = useState<LeaderboardView>("overview");

  const displayedRows = useMemo(() => {
    const rows = [...leaderboard];

    if (view === "overview") {
      return rows.sort((a, b) => {
        if (b.weightedPoints !== a.weightedPoints) {
          return b.weightedPoints - a.weightedPoints;
        }
        if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
        return a.name.localeCompare(b.name, "uk");
      });
    }

    if (view === "form") {
      return rows.sort((a, b) => {
        if (b.momentumScore !== a.momentumScore) {
          return b.momentumScore - a.momentumScore;
        }
        if (b.last5Average !== a.last5Average) {
          return b.last5Average - a.last5Average;
        }
        return a.name.localeCompare(b.name, "uk");
      });
    }

    if (view === "accuracy") {
      return rows.sort((a, b) => {
        if (b.accuracyRate !== a.accuracyRate) {
          return b.accuracyRate - a.accuracyRate;
        }
        if (b.consistencyScore !== a.consistencyScore) {
          return b.consistencyScore - a.consistencyScore;
        }
        return a.name.localeCompare(b.name, "uk");
      });
    }

    if (view === "exact") {
      return rows.sort((a, b) => {
        if (b.exactHits !== a.exactHits) return b.exactHits - a.exactHits;
        if (b.exactRate !== a.exactRate) return b.exactRate - a.exactRate;
        return a.name.localeCompare(b.name, "uk");
      });
    }

    return rows.sort((a, b) => {
      if (b.weightedMatchesPoints !== a.weightedMatchesPoints) {
        return b.weightedMatchesPoints - a.weightedMatchesPoints;
      }
      if (b.weightedMatchesAverage !== a.weightedMatchesAverage) {
        return b.weightedMatchesAverage - a.weightedMatchesAverage;
      }
      return a.name.localeCompare(b.name, "uk");
    });
  }, [leaderboard, view]);

  return (
    <>
      <section
        className="rounded-3xl p-3 sm:p-4"
        style={{
          background: "var(--panel-strong)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="-mx-1 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-2 px-1">
            <TabButton
              active={view === "overview"}
              onClick={() => setView("overview")}
            >
              Загальний рейтинг
            </TabButton>
            <TabButton active={view === "form"} onClick={() => setView("form")}>
              Гаряча форма
            </TabButton>
            <TabButton
              active={view === "accuracy"}
              onClick={() => setView("accuracy")}
            >
              Точність
            </TabButton>
            <TabButton active={view === "exact"} onClick={() => setView("exact")}>
              Exact
            </TabButton>
            <TabButton active={view === "risk"} onClick={() => setView("risk")}>
              Важкі матчі
            </TabButton>
          </div>
        </div>

        <div
          className="mt-4 overflow-hidden rounded-3xl"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
          }}
        >
          {displayedRows.length === 0 ? (
            <div
              className="p-4 text-sm"
              style={{ color: "var(--text-soft)" }}
            >
              Поки що немає даних для лідерборду.
            </div>
          ) : (
            <>
              <div
                className="grid grid-cols-[36px_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] md:hidden"
                style={{
                  color: "var(--muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div>#</div>
                <div>Гравець</div>
                <div>Value</div>
              </div>

              <div className="md:hidden">
                {displayedRows.map((player) => (
                  <MobileCompactRow
                    key={player.id}
                    player={player}
                    currentUserId={currentUser?.id}
                    view={view}
                  />
                ))}
              </div>

              <div className="hidden md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr
                        style={{
                          color: "var(--muted)",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <th className="px-4 py-4 text-left font-semibold">#</th>
                        <th className="px-4 py-4 text-left font-semibold">Гравець</th>
                        <th className="px-4 py-4 text-right font-semibold">Очки</th>
                        <th className="px-4 py-4 text-right font-semibold">Gap</th>
                        <th className="px-4 py-4 text-right font-semibold">Acc</th>
                        <th className="px-4 py-4 text-right font-semibold">Exact</th>
                        <th className="px-4 py-4 text-right font-semibold">Стрік</th>
                        <th className="px-4 py-4 text-left font-semibold">Форма</th>
                        <th className="px-4 py-4 text-right font-semibold">Move</th>
                      </tr>
                    </thead>

                    <tbody>
                      {displayedRows.map((player) => {
                        const isMe = player.id === currentUser?.id;

                        return (
                          <tr
                            key={player.id}
                            style={{
                              borderTop: "1px solid var(--border)",
                              background: isMe ? "var(--accent-soft)" : "transparent",
                            }}
                          >
                            <td
                              className="px-4 py-4 font-black tabular-nums"
                              style={{ color: "var(--muted)" }}
                            >
                              #{player.rank}
                            </td>

                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  name={player.name}
                                  image={player.image}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <div
                                    className="truncate font-bold"
                                    style={{ color: "var(--text)" }}
                                  >
                                    {player.name}
                                  </div>
                                  <div
                                    className="text-xs"
                                    style={{ color: "var(--text-soft)" }}
                                  >
                                    {player.finishedPredictionsCount} завершених прогнозів
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td
                              className="px-4 py-4 text-right text-base font-black tabular-nums"
                              style={{ color: "var(--text)" }}
                            >
                              {player.weightedPoints}
                            </td>

                            <td
                              className="px-4 py-4 text-right tabular-nums"
                              style={{ color: "var(--text-soft)" }}
                            >
                              {player.gapToLeader}
                            </td>

                            <td
                              className="px-4 py-4 text-right tabular-nums"
                              style={{ color: "var(--text-soft)" }}
                            >
                              {formatPercent(player.accuracyRate)}
                            </td>

                            <td
                              className="px-4 py-4 text-right tabular-nums"
                              style={{ color: "var(--text-soft)" }}
                            >
                              {player.exactHits}
                            </td>

                            <td
                              className="px-4 py-4 text-right tabular-nums"
                              style={{ color: "var(--text-soft)" }}
                            >
                              {player.currentStreak}
                            </td>

                            <td className="px-4 py-4">
                              <FormMini values={player.last5Form} />
                            </td>

                            <td className="px-4 py-4 text-right">
                              <span
                                className="inline-flex rounded-full px-2.5 py-1 text-xs font-bold"
                                style={getMovementTone(player.movement)}
                              >
                                {formatMovement(player.movement)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-3">
          <div
            className="text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "var(--muted)" }}
          >
            Highlights
          </div>
          <h2
            className="mt-1 text-xl font-black tracking-tight"
            style={{ color: "var(--text)" }}
          >
            Хто зараз найкрутіший
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <HighlightCard
            label="HOT FORM"
            title={highlights.hottestPlayer?.name ?? "—"}
            value={
              highlights.hottestPlayer
                ? `${highlights.hottestPlayer.last5Average}`
                : "—"
            }
            note="Найкраща середня форма за останні 5"
            accent="warning"
          />

          <HighlightCard
            label="ACCURACY"
            title={highlights.mostAccurate?.name ?? "—"}
            value={
              highlights.mostAccurate
                ? formatPercent(highlights.mostAccurate.accuracyRate)
                : "—"
            }
            note="Найвища точність прогнозів"
            accent="success"
          />

          <HighlightCard
            label="EXACT KING"
            title={highlights.exactKing?.name ?? "—"}
            value={String(highlights.exactKing?.exactHits ?? "—")}
            note="Найбільше точних рахунків"
          />

          <HighlightCard
            label="BEST STREAK"
            title={highlights.bestStreakPlayer?.name ?? "—"}
            value={String(highlights.bestStreakPlayer?.bestStreak ?? "—")}
            note="Найдовша безпрограшна серія"
            accent="success"
          />

          <HighlightCard
            label="YOU"
            title={highlights.me?.name ?? "Ти"}
            value={
              highlights.me
                ? `#${highlights.me.rank} • ${highlights.me.weightedPoints}`
                : "—"
            }
            note={
              highlights.me
                ? `${formatPercent(highlights.me.accuracyRate)} accuracy • ${highlights.me.exactHits} exact`
                : "Тебе ще немає в таблиці"
            }
          />
        </div>

        {highlights.me ? (
          <div
            className="mt-3 rounded-3xl p-4"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div
                  className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--muted)" }}
                >
                  Твій зріз
                </div>
                <div
                  className="mt-1 text-lg font-black"
                  style={{ color: "var(--text)" }}
                >
                  #{highlights.me.rank} у таблиці • {highlights.me.weightedPoints} pts
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-bold"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    border:
                      "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
                  }}
                >
                  {formatPercent(highlights.me.accuracyRate)} accuracy
                </span>

                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-bold"
                  style={{
                    background: "var(--success-soft)",
                    color: "var(--success)",
                    border:
                      "1px solid color-mix(in srgb, var(--success) 24%, transparent)",
                  }}
                >
                  {highlights.me.exactHits} exact
                </span>

                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-bold"
                  style={getMovementTone(highlights.me.movement)}
                >
                  {formatMovement(highlights.me.movement)} move
                </span>

                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-bold"
                  style={{
                    background: "var(--panel-strong)",
                    color: "var(--text-soft)",
                    border: "1px solid var(--border)",
                  }}
                >
                  gap {highlights.me.gapToLeader}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}