import {
  data,
  useLoaderData,
  useNavigation,
  type LoaderFunctionArgs,
} from "react-router";
import { useMemo, useState } from "react";
import { MatchStatus, MembershipStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";

type LeaderboardView = "overview" | "exact" | "form";

type LastResult = {
  matchId: string;
  points: number;
  wasExact: boolean;
  wasCorrect: boolean;
};

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

  last5Results: LastResult[];

  gapToLeader: number;
};

function getDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatMovement(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function getAvatarLetters(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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

function getResultBoxStyle(result: LastResult) {
  if (result.wasExact) {
    return {
      background: "var(--success-soft)",
      color: "var(--success)",
      border: "1px solid color-mix(in srgb, var(--success) 32%, transparent)",
    };
  }

  if (result.wasCorrect) {
    return {
      background: "var(--accent-soft)",
      color: "var(--accent)",
      border: "1px solid color-mix(in srgb, var(--accent) 32%, transparent)",
    };
  }

  return {
    background: "color-mix(in srgb, #ef4444 12%, transparent)",
    color: "#ef4444",
    border: "1px solid color-mix(in srgb, #ef4444 24%, transparent)",
  };
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

  const leaderboardMatchIds = new Set(game.gameMatches.map((gm) => gm.matchId));

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

    const finishedPredictions = playerPredictions
      .filter((prediction) => prediction.match.status === MatchStatus.FINISHED)
      .sort((a, b) => a.match.startTime.getTime() - b.match.startTime.getTime());

    let rawPoints = 0;
    let weightedPoints = 0;
    let exactHits = 0;
    let correctResults = 0;
    let wrongHits = 0;

    let runningStreak = 0;
    let bestStreak = 0;

    for (const prediction of finishedPredictions) {
      rawPoints += prediction.pointsAwarded;
      weightedPoints += prediction.weightedPointsAwarded;

      if (prediction.wasExact) exactHits += 1;

      if (prediction.wasExact || prediction.wasOutcomeOnly) {
        correctResults += 1;
        runningStreak += 1;
        bestStreak = Math.max(bestStreak, runningStreak);
      } else {
        wrongHits += 1;
        runningStreak = 0;
      }
    }

    let currentStreak = 0;

    for (let i = finishedPredictions.length - 1; i >= 0; i--) {
      const prediction = finishedPredictions[i];

      if (prediction.wasExact || prediction.wasOutcomeOnly) {
        currentStreak += 1;
      } else {
        break;
      }
    }

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

    const last5Results = finishedPredictions.slice(-5).map((prediction) => ({
      matchId: prediction.matchId,
      points: prediction.weightedPointsAwarded,
      wasExact: prediction.wasExact,
      wasCorrect: prediction.wasExact || prediction.wasOutcomeOnly,
    }));

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

      last5Results,

      gapToLeader: 0,
    };
  });

  const overallSorted = [...rowsBase]
    .sort((a, b) => {
      if (b.weightedPoints !== a.weightedPoints) {
        return b.weightedPoints - a.weightedPoints;
      }

      if (b.exactHits !== a.exactHits) {
        return b.exactHits - a.exactHits;
      }

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
        if (b.correctResults !== a.correctResults) {
          return b.correctResults - a.correctResults;
        }

        if (b.exactHits !== a.exactHits) {
          return b.exactHits - a.exactHits;
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

  const mostAccurate =
    [...leaderboard].sort((a, b) => {
      if (b.accuracyRate !== a.accuracyRate) {
        return b.accuracyRate - a.accuracyRate;
      }

      return b.weightedPoints - a.weightedPoints;
    })[0] ?? null;

  const exactKing =
    [...leaderboard].sort((a, b) => {
      if (b.exactHits !== a.exactHits) {
        return b.exactHits - a.exactHits;
      }

      return b.exactRate - a.exactRate;
    })[0] ?? null;

  const bestForm =
    [...leaderboard].sort((a, b) => {
      if (b.currentStreak !== a.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }

      return b.accuracyRate - a.accuracyRate;
    })[0] ?? null;

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
      mostAccurate,
      exactKing,
      bestForm,
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
      className="shrink-0 rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition"
      style={
        active
          ? {
              background: "var(--accent-soft)",
              color: "var(--accent)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
            }
          : {
              background: "transparent",
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

function MedalIcon({ place }: { place: 1 | 2 | 3 }) {
  const styles =
    place === 1
      ? { fill: "#fbbf24", inner: "#fde68a" }
      : place === 2
      ? { fill: "#cbd5e1", inner: "#e2e8f0" }
      : { fill: "#fb923c", inner: "#fdba74" };

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path
        d="M7 2h4l1 4H8L7 2Zm6 0h4l-1 4h-4l1-4Z"
        fill="#64748b"
        opacity="0.8"
      />
      <circle cx="12" cy="14" r="6.5" fill={styles.fill} />
      <circle cx="12" cy="14" r="3.2" fill={styles.inner} />
    </svg>
  );
}

function rankAccentStyle(rank: number) {
  if (rank === 1) {
    return {
      background: "color-mix(in srgb, #fbbf24 10%, transparent)",
      borderTop: "1px solid color-mix(in srgb, #fbbf24 24%, transparent)",
    };
  }

  if (rank === 2) {
    return {
      background: "color-mix(in srgb, #cbd5e1 8%, transparent)",
      borderTop: "1px solid color-mix(in srgb, #cbd5e1 18%, transparent)",
    };
  }

  if (rank === 3) {
    return {
      background: "color-mix(in srgb, #fb923c 8%, transparent)",
      borderTop: "1px solid color-mix(in srgb, #fb923c 18%, transparent)",
    };
  }

  return {
    background: "transparent",
    borderTop: "1px solid var(--border)",
  };
}

function LastFiveBoxes({ results }: { results: LastResult[] }) {
  if (results.length === 0) {
    return <span style={{ color: "var(--muted)" }}>—</span>;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {results.map((result) => (
        <span
          key={result.matchId}
          title={
            result.wasExact
              ? "Точний рахунок"
              : result.wasCorrect
              ? "Вгаданий результат"
              : "Промах"
          }
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-black tabular-nums"
          style={getResultBoxStyle(result)}
        >
          {result.points}
        </span>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div
      className="rounded-2xl px-3 py-3"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="text-[10px] font-black uppercase tracking-[0.16em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-xl font-black tabular-nums"
        style={{ color: "var(--text)" }}
      >
        {value}
      </div>
      <div className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>
        {helper}
      </div>
    </div>
  );
}

function HighlightChip({
  label,
  value,
  accent = "accent",
}: {
  label: string;
  value: string;
  accent?: "accent" | "success" | "warning";
}) {
  const styles =
    accent === "success"
      ? {
          bg: "var(--success-soft)",
          color: "var(--success)",
          border:
            "1px solid color-mix(in srgb, var(--success) 24%, transparent)",
        }
      : accent === "warning"
      ? {
          bg: "color-mix(in srgb, #f59e0b 14%, transparent)",
          color: "#f59e0b",
          border: "1px solid color-mix(in srgb, #f59e0b 24%, transparent)",
        }
      : {
          bg: "var(--accent-soft)",
          color: "var(--accent)",
          border:
            "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
        };

  return (
    <div
      className="rounded-2xl px-3 py-2"
      style={{
        background: styles.bg,
        color: styles.color,
        border: styles.border,
      }}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.14em] opacity-80">
        {label}
      </div>
      <div className="mt-1 text-sm font-black">{value}</div>
    </div>
  );
}

function MobileRow({
  player,
  currentUserId,
}: {
  player: Row;
  currentUserId?: string | null;
}) {
  const isMe = currentUserId === player.id;
  const isTop3 = player.rank <= 3;

  return (
    <div
      className="px-3 py-3"
      style={{
        ...(isTop3
          ? rankAccentStyle(player.rank)
          : { borderTop: "1px solid var(--border)" }),
        background: isMe
          ? "var(--accent-soft)"
          : isTop3
          ? rankAccentStyle(player.rank).background
          : "transparent",
      }}
    >
      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3">
        <div>
          {player.rank <= 3 ? (
            <MedalIcon place={player.rank as 1 | 2 | 3} />
          ) : (
            <div
              className="text-sm font-black tabular-nums"
              style={{ color: "var(--muted)" }}
            >
              #{player.rank}
            </div>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={player.name} image={player.image} size="sm" />
          <div className="min-w-0">
            <div
              className="truncate text-sm font-black"
              style={{ color: "var(--text)" }}
            >
              {player.name}
            </div>
            <div
              className="truncate text-[11px]"
              style={{ color: "var(--text-soft)" }}
            >
              {player.finishedPredictionsCount} матчів •{" "}
              {formatPercent(player.accuracyRate)} форма
            </div>
          </div>
        </div>

        <div className="text-right">
          <div
            className="text-base font-black tabular-nums"
            style={{ color: "var(--text)" }}
          >
            {player.weightedPoints}
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-soft)" }}>
            очок
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px]">
          <span
            className="rounded-full px-2 py-1 font-black"
            style={{
              background: "var(--panel)",
              color: "var(--accent)",
              border: "1px solid var(--border)",
            }}
          >
            {formatPercent(player.accuracyRate)}
          </span>

          <span
            className="rounded-full px-2 py-1 font-black"
            style={{
              background: "var(--panel)",
              color: "var(--success)",
              border: "1px solid var(--border)",
            }}
          >
            exact {player.exactHits}
          </span>

          <span
            className="rounded-full px-2 py-1 font-black"
            style={getMovementTone(player.movement)}
          >
            {formatMovement(player.movement)}
          </span>
        </div>

        <LastFiveBoxes results={player.last5Results} />
      </div>
    </div>
  );
}

export default function LeaderboardPage() {
  const navigation = useNavigation();

  const { currentUser, game, leaderboard, highlights } =
    useLoaderData<typeof loader>();

  const [view, setView] = useState<LeaderboardView>("overview");

  const isRouteLoading = navigation.state === "loading";
  const isSubmitting = navigation.state === "submitting";
  const isBusy = isRouteLoading || isSubmitting;

  const displayedRows = useMemo(() => {
    const rows = [...leaderboard];

    if (view === "overview") {
      return rows.sort((a, b) => {
        if (b.weightedPoints !== a.weightedPoints) {
          return b.weightedPoints - a.weightedPoints;
        }

        if (b.exactHits !== a.exactHits) {
          return b.exactHits - a.exactHits;
        }

        return a.name.localeCompare(b.name, "uk");
      });
    }

    if (view === "exact") {
      return rows.sort((a, b) => {
        if (b.exactHits !== a.exactHits) {
          return b.exactHits - a.exactHits;
        }

        if (b.exactRate !== a.exactRate) {
          return b.exactRate - a.exactRate;
        }

        return b.weightedPoints - a.weightedPoints;
      });
    }

    return rows.sort((a, b) => {
      if (b.accuracyRate !== a.accuracyRate) {
        return b.accuracyRate - a.accuracyRate;
      }

      if (b.currentStreak !== a.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }

      return b.weightedPoints - a.weightedPoints;
    });
  }, [leaderboard, view]);

  const totalPoints = leaderboard.reduce(
    (sum, player) => sum + player.weightedPoints,
    0
  );

  const totalExactHits = leaderboard.reduce(
    (sum, player) => sum + player.exactHits,
    0
  );

  const totalCorrectHits = leaderboard.reduce(
    (sum, player) => sum + player.correctResults,
    0
  );

  const totalFinishedPredictions = leaderboard.reduce(
    (sum, player) => sum + player.finishedPredictionsCount,
    0
  );

  const globalAccuracy =
    totalFinishedPredictions > 0
      ? (totalCorrectHits / totalFinishedPredictions) * 100
      : 0;

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`space-y-4 transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        <section
          className="rounded-[28px] p-3 sm:p-4"
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
                Загальна
              </TabButton>

              <TabButton
                active={view === "exact"}
                onClick={() => setView("exact")}
              >
                В ціль
              </TabButton>

              <TabButton
                active={view === "form"}
                onClick={() => setView("form")}
              >
                Форма
              </TabButton>
            </div>
          </div>

          <div
            className="mt-3 overflow-hidden rounded-[24px]"
            style={{
              background: "var(--panel)",
              border: "1px solid var(--border)",
            }}
          >
            {displayedRows.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: "var(--text-soft)" }}>
                Поки що немає даних.
              </div>
            ) : (
              <>
                <div
                  className="grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] md:hidden"
                  style={{
                    color: "var(--muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div>#</div>
                  <div>Гравець</div>
                  <div>Очки</div>
                </div>

                <div className="md:hidden">
                  {displayedRows.map((player) => (
                    <MobileRow
                      key={player.id}
                      player={player}
                      currentUserId={currentUser?.id}
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
                          <th className="px-4 py-3 text-left font-black">#</th>
                          <th className="px-4 py-3 text-left font-black">
                            Гравець
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Очки
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Матчі
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Форма
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            В ціль
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Останні 5
                          </th>
                          <th className="px-4 py-3 text-right font-black">
                            Move
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {displayedRows.map((player) => {
                          const isMe = player.id === currentUser?.id;
                          const isTop3 = player.rank <= 3;

                          return (
                            <tr
                              key={player.id}
                              style={{
                                ...(isTop3
                                  ? rankAccentStyle(player.rank)
                                  : { borderTop: "1px solid var(--border)" }),
                                background: isMe
                                  ? "var(--accent-soft)"
                                  : isTop3
                                  ? rankAccentStyle(player.rank).background
                                  : "transparent",
                              }}
                            >
                              <td className="px-4 py-3">
                                {player.rank <= 3 ? (
                                  <div className="flex items-center gap-2">
                                    <MedalIcon
                                      place={player.rank as 1 | 2 | 3}
                                    />
                                    <span
                                      className="font-black tabular-nums"
                                      style={{ color: "var(--text)" }}
                                    >
                                      #{player.rank}
                                    </span>
                                  </div>
                                ) : (
                                  <span
                                    className="font-black tabular-nums"
                                    style={{ color: "var(--muted)" }}
                                  >
                                    #{player.rank}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <Avatar
                                    name={player.name}
                                    image={player.image}
                                    size="sm"
                                  />

                                  <div className="min-w-0">
                                    <div
                                      className="truncate font-black"
                                      style={{ color: "var(--text)" }}
                                    >
                                      {player.name}
                                    </div>
                                    <div
                                      className="text-xs"
                                      style={{ color: "var(--text-soft)" }}
                                    >
                                      {player.correctResults} влучань •{" "}
                                      {player.wrongHits} промахів
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td
                                className="px-4 py-3 text-right text-base font-black tabular-nums"
                                style={{ color: "var(--text)" }}
                              >
                                {player.weightedPoints}
                              </td>

                              <td
                                className="px-4 py-3 text-right tabular-nums"
                                style={{ color: "var(--text-soft)" }}
                              >
                                {player.finishedPredictionsCount}
                              </td>

                              <td
                                className="px-4 py-3 text-right font-black tabular-nums"
                                style={{ color: "var(--accent)" }}
                              >
                                {formatPercent(player.accuracyRate)}
                              </td>

                              <td
                                className="px-4 py-3 text-right tabular-nums"
                                style={{ color: "var(--text-soft)" }}
                              >
                                <span
                                  className="font-black"
                                  style={{ color: "var(--success)" }}
                                >
                                  {player.exactHits}
                                </span>{" "}
                                / {formatPercent(player.exactRate)}
                              </td>

                              <td className="px-4 py-3">
                                <LastFiveBoxes results={player.last5Results} />
                              </td>

                              <td className="px-4 py-3 text-right">
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

        <section
          className="rounded-[28px] px-4 py-4 sm:px-5"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--accent) 10%, transparent), var(--panel-strong))",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div
                className="text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                Leaderboard Arena
              </div>

              <h1
                className="mt-1 text-2xl font-black tracking-tight"
                style={{ color: "var(--text)" }}
              >
                Загальна статистика
              </h1>

              <div
                className="mt-1 text-sm"
                style={{ color: "var(--text-soft)" }}
              >
                {game.finishedMatchesCount} зіграних матчів •{" "}
                {game.membersCount} гравців
                {game.linkedTournamentName
                  ? ` • ${game.linkedTournamentName}`
                  : ""}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <HighlightChip
                label="Форма"
                value={highlights.bestForm?.name ?? "—"}
                accent="warning"
              />
              <HighlightChip
                label="Точність"
                value={highlights.mostAccurate?.name ?? "—"}
                accent="success"
              />
              <HighlightChip
                label="В ціль"
                value={highlights.exactKing?.name ?? "—"}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <StatCard
              label="Усього очок"
              value={`${totalPoints}`}
              helper="разом по всіх гравцях"
            />
            <StatCard
              label="Точних рахунків"
              value={`${totalExactHits}`}
              helper="попадання рівно в ціль"
            />
            <StatCard
              label="Форма ліги"
              value={formatPercent(globalAccuracy)}
              helper="вгадані результати"
            />
            <StatCard
              label="Прогнозів"
              value={`${totalFinishedPredictions}`}
              helper="по завершених матчах"
            />
          </div>
        </section>

        {highlights.me ? (
          <section
            className="rounded-[22px] px-4 py-3"
            style={{
              background: "var(--accent-soft)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div
                  className="text-[10px] font-black uppercase tracking-[0.16em]"
                  style={{ color: "var(--accent)" }}
                >
                  Твоя позиція
                </div>
                <div
                  className="mt-1 text-lg font-black"
                  style={{ color: "var(--text)" }}
                >
                  #{highlights.me.rank} • {highlights.me.weightedPoints} очок
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-black"
                  style={getMovementTone(highlights.me.movement)}
                >
                  {formatMovement(highlights.me.movement)} move
                </span>

                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-black"
                  style={{
                    background: "var(--panel)",
                    color: "var(--text-soft)",
                    border: "1px solid var(--border)",
                  }}
                >
                  gap {highlights.me.gapToLeader}
                </span>

                <span
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-black"
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
                  className="inline-flex rounded-full px-3 py-1.5 text-xs font-black"
                  style={{
                    background: "var(--accent-soft)",
                    color: "var(--accent)",
                    border:
                      "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
                  }}
                >
                  {formatPercent(highlights.me.accuracyRate)} форма
                </span>

                <LastFiveBoxes results={highlights.me.last5Results} />
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}