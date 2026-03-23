import {
  useLoaderData,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { MatchStatus, MembershipStatus } from "@prisma/client";
import { getCurrentUser } from "~/lib/auth.server";
import Leaderboard from "~/components/Leaderboard";
import UpcomingMatches from "~/components/UpcomingMatches";

type LeaderboardRow = {
  id: string;
  name: string;
  rawPoints: number;
  weightedPoints: number;
  exactHits: number;
  correctResults: number;
  predictionsCount: number;
  rank: number;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const gameId = params.gameId;
  const currentUser = await getCurrentUser(request);

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const leaderboard = await prisma.$queryRaw<LeaderboardRow[]>`
    SELECT
      u.id as id,
      COALESCE(u."displayName", u."name", u."email", 'Гравець') as name,
      COALESCE(SUM(p."pointsAwarded"), 0) as "rawPoints",
      COALESCE(SUM(p."weightedPointsAwarded"), 0) as "weightedPoints",
      COALESCE(SUM(CASE WHEN p."wasExact" = true THEN 1 ELSE 0 END), 0) as "exactHits",
      COALESCE(SUM(CASE WHEN p."wasExact" = true OR p."wasOutcomeOnly" = true THEN 1 ELSE 0 END), 0) as "correctResults",
      COALESCE(COUNT(p.id), 0) as "predictionsCount"
    FROM "GameMember" gm
    JOIN "User" u
      ON u.id = gm."userId"
    LEFT JOIN "Prediction" p
      ON p."userId" = gm."userId"
     AND p."gameId" = gm."gameId"
    WHERE gm."gameId" = ${gameId}
      AND gm."status" = 'ACTIVE'
    GROUP BY u.id, u."displayName", u."name", u."email"
    ORDER BY
      "weightedPoints" DESC,
      "exactHits" DESC,
      "correctResults" DESC,
      name ASC
  `;

  const rankedLeaderboard = leaderboard.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));

  const upcomingMatches = await prisma.match.findMany({
    where: {
      gameMatches: {
        some: {
          gameId,
        },
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
        },
        take: 1,
      },
    },
    orderBy: {
      startTime: "asc",
    },
    take: 6,
  });

  const nextMatch = upcomingMatches[0] ?? null;

  const finishedMatchesCount = await prisma.match.count({
    where: {
      gameMatches: {
        some: {
          gameId,
        },
      },
      status: MatchStatus.FINISHED,
    },
  });

  const totalMatchesCount = await prisma.match.count({
    where: {
      gameMatches: {
        some: {
          gameId,
        },
      },
    },
  });

  const activePlayersCount = await prisma.gameMember.count({
    where: {
      gameId,
      status: MembershipStatus.ACTIVE,
    },
  });

  let currentUserSummary = null;

  if (currentUser) {
    const myRow = rankedLeaderboard.find((player) => player.id === currentUser.id);

    if (myRow) {
      const leader = rankedLeaderboard[0] ?? null;
      const nextPlayer = rankedLeaderboard.find(
        (player) => player.rank === myRow.rank + 1
      );

      const previousPlayer = rankedLeaderboard.find(
        (player) => player.rank === myRow.rank - 1
      );

      const myUpcomingPredictionsCount = await prisma.prediction.count({
        where: {
          userId: currentUser.id,
          gameId,
          match: {
            status: {
              in: [MatchStatus.SCHEDULED, MatchStatus.LIVE],
            },
          },
        },
      });

      currentUserSummary = {
        rank: myRow.rank,
        weightedPoints: myRow.weightedPoints,
        gapToLeader: leader ? leader.weightedPoints - myRow.weightedPoints : 0,
        leadOverNext: nextPlayer
          ? myRow.weightedPoints - nextPlayer.weightedPoints
          : null,
        gapToPrevious: previousPlayer
          ? previousPlayer.weightedPoints - myRow.weightedPoints
          : null,
        upcomingPredictionsCount: myUpcomingPredictionsCount,
      };
    }
  }

  return data({
    leaderboard: rankedLeaderboard,
    upcomingMatches,
    nextMatch,
    currentUserSummary,
    gameStats: {
      activePlayersCount,
      finishedMatchesCount,
      totalMatchesCount,
      remainingMatchesCount: totalMatchesCount - finishedMatchesCount,
    },
  });
}

function StatInline({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl px-3 py-2"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="text-[10px] uppercase tracking-[0.18em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-sm font-semibold"
        style={{ color: "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase tracking-[0.22em]"
      style={{ color: "var(--muted)" }}
    >
      {children}
    </div>
  );
}

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className="theme-panel rounded-3xl p-4">
      {children}
    </section>
  );
}

function Badge({
  children,
  tone = "accent",
}: {
  children: React.ReactNode;
  tone?: "accent" | "warning";
}) {
  const styles =
    tone === "warning"
      ? {
          background: "color-mix(in srgb, var(--warning) 14%, transparent)",
          color: "var(--warning)",
          border: "1px solid color-mix(in srgb, var(--warning) 24%, transparent)",
        }
      : {
          background: "var(--accent-soft)",
          color: "var(--accent)",
          border: "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
        };

  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={styles}
    >
      {children}
    </span>
  );
}

function formatMatchTime(date: string | Date) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getTimeUntil(date: string | Date) {
  const now = new Date().getTime();
  const target = new Date(date).getTime();
  const diff = target - now;

  if (diff <= 0) return "Уже розпочався або скоро старт";

  const totalMinutes = Math.floor(diff / 1000 / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}д ${hours}г`;
  if (hours > 0) return `${hours}г ${minutes}хв`;
  return `${minutes}хв`;
}

export default function GameHomePage() {
  const {
    leaderboard,
    upcomingMatches,
    nextMatch,
    currentUserSummary,
    gameStats,
  } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <SectionLabel>Game overview</SectionLabel>

            <h1
              className="mt-1 text-2xl font-black tracking-tight"
              style={{ color: "var(--text)" }}
            >
              Головна сторінка гри
            </h1>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatInline label="Гравців" value={gameStats.activePlayersCount} />
            <StatInline label="Зіграно" value={gameStats.finishedMatchesCount} />
            <StatInline label="Попереду" value={gameStats.remainingMatchesCount} />
            <StatInline label="Всього матчів" value={gameStats.totalMatchesCount} />
          </div>
        </div>
      </Panel>

      {nextMatch && (
        <Panel>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <SectionLabel>Найближчий матч</SectionLabel>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2
                  className="text-xl font-black sm:text-2xl"
                  style={{ color: "var(--text)" }}
                >
                  {nextMatch.homeTeam.name} — {nextMatch.awayTeam.name}
                </h2>

                {nextMatch.gameMatches[0]?.bonusLabel && (
                  <Badge>{nextMatch.gameMatches[0].bonusLabel}</Badge>
                )}

                {(nextMatch.gameMatches[0]?.customWeight ?? 1) > 1 && (
                  <Badge tone="warning">
                    x{nextMatch.gameMatches[0]?.customWeight ?? 1}
                  </Badge>
                )}
              </div>

              <div
                className="mt-2 text-sm"
                style={{ color: "var(--text-soft)" }}
              >
                {nextMatch.tournament.name}
                {nextMatch.round ? ` • ${nextMatch.round.name}` : ""}
                {" • "}
                {formatMatchTime(nextMatch.startTime)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:min-w-[280px]">
              <StatInline
                label="До старту"
                value={getTimeUntil(nextMatch.startTime)}
              />
              <StatInline
                label="Статус"
                value={nextMatch.status === "LIVE" ? "LIVE" : "Скоро"}
              />
            </div>
          </div>
        </Panel>
      )}

      {currentUserSummary && (
        <Panel>
          <SectionLabel>Моя позиція</SectionLabel>

          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
            <StatInline label="Місце" value={`#${currentUserSummary.rank}`} />
            <StatInline label="Очки" value={currentUserSummary.weightedPoints} />
            <StatInline label="До лідера" value={currentUserSummary.gapToLeader} />
            <StatInline
              label="Відрив вниз"
              value={
                currentUserSummary.leadOverNext === null
                  ? "—"
                  : currentUserSummary.leadOverNext
              }
            />
            <StatInline
              label="Мої прогнози попереду"
              value={currentUserSummary.upcomingPredictionsCount}
            />
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0">
          <Leaderboard players={leaderboard} />
        </div>

        <div className="min-w-0">
          <UpcomingMatches matches={upcomingMatches} />
        </div>
      </div>
    </div>
  );
}