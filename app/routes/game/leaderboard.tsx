import { Link, data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type SeasonTableRow = {
  id: string;
  name: string;
  rank: number;
  rawPoints: number;
  weightedPoints: number;
  bonusPoints: number;
  exactHits: number;
  correctResults: number;
  predictionsCount: number;
  averageWeightedPoints: number;
};

function getDisplayName(user: {
  displayName?: string | null;
  name: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
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
            },
          },
        },
      },
    },
    orderBy: [{ displayName: "asc" }, { name: "asc" }, { email: "asc" }],
  });

  const leaderboard: SeasonTableRow[] = users
    .map((user) => {
      let rawPoints = 0;
      let weightedPoints = 0;
      let exactHits = 0;
      let correctResults = 0;

      for (const prediction of user.predictions) {
        const basePoints = prediction.pointsAwarded;
        const roundWeight = prediction.match.round?.weight ?? 1;

        rawPoints += basePoints;
        weightedPoints += basePoints * roundWeight;

        if (basePoints === 3) exactHits++;
        if (basePoints >= 1) correctResults++;
      }

      const predictionsCount = user.predictions.length;
      const averageWeightedPoints =
        predictionsCount > 0 ? weightedPoints / predictionsCount : 0;

      return {
        id: user.id,
        name: getDisplayName(user),
        rank: 0,
        rawPoints,
        weightedPoints,
        bonusPoints: weightedPoints - rawPoints,
        exactHits,
        correctResults,
        predictionsCount,
        averageWeightedPoints: Number(averageWeightedPoints.toFixed(2)),
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

export default function LeaderboardPage() {
  const { currentUser, leaderboard } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />
      <main className="mx-auto max-w-6xl">

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Leaderboard
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Повна таблиця сезону
          </h1>

          <div className="mt-6 space-y-3">
            {leaderboard.length > 0 ? (
              leaderboard.map((player) => (
                <div
                  key={player.id}
                  className={`grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl border px-3 py-3 sm:gap-4 sm:rounded-3xl sm:px-4 sm:py-4 ${
                    currentUser && player.id === currentUser.id
                      ? "border-emerald-400/30 bg-emerald-500/10"
                      : "border-white/10 bg-black/20"
                  }`}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-xs font-black sm:h-11 sm:w-11 sm:text-sm">
                    #{player.rank}
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold sm:text-base md:text-lg">
                      {player.name}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/55 sm:text-sm">
                      <span>Чисті очки: {player.rawPoints}</span>
                      <span>Бонус ваги: +{player.bonusPoints}</span>
                      <span>Точних: {player.exactHits}</span>
                      <span>Результатів: {player.correctResults}</span>
                      <span>Прогнозів: {player.predictionsCount}</span>
                      <span>Сер. бал: {player.averageWeightedPoints}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 sm:text-xs">
                      Очки сезону
                    </div>
                    <div className="mt-1 text-xl font-black sm:text-2xl">
                      {player.weightedPoints}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
                Поки що немає даних для таблиці.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}