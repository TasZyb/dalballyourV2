import { Link, data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUser } from "~/lib/auth.server";
import { Form } from "react-router";
function getOutcome(home: number, away: number) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: user.id,
    },
    include: {
      match: {
        include: {
          tournament: true,
          round: true,
        },
      },
    },
  });

  const totalPredictions = predictions.length;
  const totalPoints = predictions.reduce(
    (sum, prediction) => sum + prediction.pointsAwarded,
    0
  );
  const exactHits = predictions.filter(
    (prediction) => prediction.pointsAwarded === 3
  ).length;
  const correctResults = predictions.filter(
    (prediction) => prediction.pointsAwarded >= 1
  ).length;

  const averagePoints =
    totalPredictions > 0
      ? Number((totalPoints / totalPredictions).toFixed(2))
      : 0;

  let homeWinsPredicted = 0;
  let awayWinsPredicted = 0;
  let drawsPredicted = 0;

  for (const prediction of predictions) {
    const outcome = getOutcome(
      prediction.predictedHome,
      prediction.predictedAway
    );

    if (outcome === "HOME") homeWinsPredicted++;
    if (outcome === "AWAY") awayWinsPredicted++;
    if (outcome === "DRAW") drawsPredicted++;
  }

  const byTournamentMap = new Map<string, { name: string; points: number; count: number }>();

  for (const prediction of predictions) {
    const tournamentId = prediction.match.tournament.id;
    const current = byTournamentMap.get(tournamentId);

    if (current) {
      current.points += prediction.pointsAwarded;
      current.count += 1;
    } else {
      byTournamentMap.set(tournamentId, {
        name: prediction.match.tournament.name,
        points: prediction.pointsAwarded,
        count: 1,
      });
    }
  }

  const tournamentStats = Array.from(byTournamentMap.values())
    .map((item) => ({
      ...item,
      average: Number((item.points / item.count).toFixed(2)),
    }))
    .sort((a, b) => b.points - a.points);

  return data({
    totalPredictions,
    totalPoints,
    exactHits,
    correctResults,
    averagePoints,
    homeWinsPredicted,
    awayWinsPredicted,
    drawsPredicted,
    tournamentStats,
  });
}

export default function MeStatsPage() {
  const {
    totalPredictions,
    totalPoints,
    exactHits,
    correctResults,
    averagePoints,
    homeWinsPredicted,
    awayWinsPredicted,
    drawsPredicted,
    tournamentStats,
  } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen theme-page">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            to="/me"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            ← Назад у кабінет
          </Link>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Аналітика
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Моя статистика
          </h1>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/50">Усього прогнозів</div>
              <div className="mt-2 text-3xl font-black">{totalPredictions}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/50">Усього очок</div>
              <div className="mt-2 text-3xl font-black">{totalPoints}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/50">Середній бал</div>
              <div className="mt-2 text-3xl font-black">{averagePoints}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/50">Точні рахунки</div>
              <div className="mt-2 text-3xl font-black">{exactHits}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/50">Вгадані результати</div>
              <div className="mt-2 text-3xl font-black">{correctResults}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-xs text-white/50">Нічиї в прогнозах</div>
              <div className="mt-2 text-3xl font-black">{drawsPredicted}</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/55">Ставив на домашніх</div>
              <div className="mt-2 text-2xl font-black">{homeWinsPredicted}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/55">Ставив на гостей</div>
              <div className="mt-2 text-2xl font-black">{awayWinsPredicted}</div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm text-white/55">Ставив на нічию</div>
              <div className="mt-2 text-2xl font-black">{drawsPredicted}</div>
            </div>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
            <h2 className="text-xl font-black">По турнірах</h2>

            <div className="mt-4 space-y-3">
              {tournamentStats.length > 0 ? (
                tournamentStats.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-sm text-white/55">
                        Прогнозів: {item.count} · Сер. бал: {item.average}
                      </div>
                    </div>

                    <div className="text-right text-lg font-black">
                      {item.points}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-white/60">
                  Поки що немає даних по турнірах.
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}