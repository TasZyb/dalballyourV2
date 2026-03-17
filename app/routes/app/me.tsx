import { Form, Link, data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUser } from "~/lib/auth.server";

function getDisplayName(user: {
  name: string | null;
  email: string | null;
  displayName?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      favoriteTeam: true,
      predictions: {
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
        orderBy: {
          updatedAt: "desc",
        },
      },
    },
  });

  if (!fullUser) {
    throw new Response("User not found", { status: 404 });
  }

  const [upcomingMatches, allUsers] = await Promise.all([
    prisma.match.findMany({
      where: {
        status: "SCHEDULED",
      },
      orderBy: {
        startTime: "asc",
      },
      take: 5,
      include: {
        tournament: true,
        round: true,
        homeTeam: true,
        awayTeam: true,
      },
    }),
    prisma.user.findMany({
      include: {
        predictions: true,
      },
    }),
  ]);

  const leaderboard = allUsers
    .map((player) => {
      const totalPoints = player.predictions.reduce(
        (sum, prediction) => sum + prediction.pointsAwarded,
        0
      );

      return {
        id: player.id,
        name: player.displayName || player.name || player.email || "Гравець",
        totalPoints,
      };
    })
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const place =
    leaderboard.findIndex((player) => player.id === fullUser.id) + 1 || null;

  const totalPoints = fullUser.predictions.reduce(
    (sum, prediction) => sum + prediction.pointsAwarded,
    0
  );

  const exactHits = fullUser.predictions.filter(
    (prediction) => prediction.pointsAwarded === 3
  ).length;

  const correctResults = fullUser.predictions.filter(
    (prediction) => prediction.pointsAwarded >= 1
  ).length;

  const averagePoints =
    fullUser.predictions.length > 0
      ? Number((totalPoints / fullUser.predictions.length).toFixed(2))
      : 0;

  const recentPredictions = fullUser.predictions.slice(0, 5);

  return data({
    user: fullUser,
    place,
    totalPoints,
    exactHits,
    correctResults,
    averagePoints,
    predictionsCount: fullUser.predictions.length,
    recentPredictions,
    upcomingMatches,
    leaderboard: leaderboard.slice(0, 5),
  });
}

export default function MePage() {
  const {
    user,
    place,
    totalPoints,
    exactHits,
    correctResults,
    averagePoints,
    predictionsCount,
    recentPredictions,
    upcomingMatches,
    leaderboard,
  } = useLoaderData<typeof loader>();

  const displayName = getDisplayName(user);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              ← На головну
            </Link>

            <Link
              to="/predict"
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90"
            >
              Зробити прогноз
            </Link>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/me/edit"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Редагувати профіль
            </Link>

            <Form method="post" action="/logout">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/15"
              >
                Вийти
              </button>
            </Form>
          </div>
        </div>

        <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              {user.image ? (
                <img
                  src={user.image}
                  alt={displayName}
                  className="h-20 w-20 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/10 text-2xl font-black">
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}

              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                  Особистий кабінет
                </div>
                <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                  {displayName}
                </h1>
                <p className="mt-2 text-sm text-white/60">{user.email}</p>

                {user.bio && (
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                    {user.bio}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/65">
                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
                    Роль: {user.role}
                  </span>

                  {user.favoriteTeam && (
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
                      Улюблена команда: {user.favoriteTeam.name}
                    </span>
                  )}

                  <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">
                    Профіль: {user.isProfilePublic ? "Публічний" : "Приватний"}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/50">Місце</div>
                <div className="mt-2 text-2xl font-black">
                  {place ? `#${place}` : "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/50">Очки</div>
                <div className="mt-2 text-2xl font-black">{totalPoints}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/50">Прогнози</div>
                <div className="mt-2 text-2xl font-black">{predictionsCount}</div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs text-white/50">Сер. бал</div>
                <div className="mt-2 text-2xl font-black">{averagePoints}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="text-sm text-white/55">Точні рахунки</div>
            <div className="mt-2 text-3xl font-black">{exactHits}</div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="text-sm text-white/55">Вгадані результати</div>
            <div className="mt-2 text-3xl font-black">{correctResults}</div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="text-sm text-white/55">Колір профілю</div>
            <div className="mt-2 text-lg font-bold">
              {user.favoriteColor || "Не вибрано"}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="text-sm text-white/55">З нами з</div>
            <div className="mt-2 text-lg font-bold">
              {new Date(user.createdAt).toLocaleDateString("uk-UA")}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Останні прогнози</h2>
              <Link
                to="/me/history"
                className="text-sm font-semibold text-white/70 hover:text-white"
              >
                Вся історія
              </Link>
            </div>

            <div className="space-y-3">
              {recentPredictions.length > 0 ? (
                recentPredictions.map((prediction) => (
                  <div
                    key={prediction.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                      {prediction.match.tournament.name}
                      {prediction.match.round
                        ? ` · ${prediction.match.round.name}`
                        : ""}
                    </div>

                    <div className="mt-2 text-lg font-black">
                      {prediction.match.homeTeam.name}{" "}
                      <span className="text-white/35">vs</span>{" "}
                      {prediction.match.awayTeam.name}
                    </div>

                    <div className="mt-2 text-sm text-white/65">
                      Твій прогноз: {prediction.predictedHome} :{" "}
                      {prediction.predictedAway}
                    </div>

                    <div className="mt-2 text-sm text-white/50">
                      Очки: {prediction.pointsAwarded}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
                  У тебе ще немає прогнозів.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black">Найближчі матчі</h2>
              <Link
                to="/predict"
                className="text-sm font-semibold text-white/70 hover:text-white"
              >
                До прогнозів
              </Link>
            </div>

            <div className="space-y-3">
              {upcomingMatches.length > 0 ? (
                upcomingMatches.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                      {match.tournament.name}
                      {match.round ? ` · ${match.round.name}` : ""}
                    </div>

                    <div className="mt-2 text-lg font-black">
                      {match.homeTeam.name} <span className="text-white/35">vs</span>{" "}
                      {match.awayTeam.name}
                    </div>

                    <div className="mt-2 text-sm text-white/60">
                      {new Date(match.startTime).toLocaleString("uk-UA")}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
                  Найближчих матчів зараз немає.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black">Міні-рейтинг</h2>
            <Link
              to="/me/stats"
              className="text-sm font-semibold text-white/70 hover:text-white"
            >
              Детальна статистика
            </Link>
          </div>

          <div className="space-y-3">
            {leaderboard.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
              >
                <div className="font-semibold">
                  #{index + 1} · {player.name}
                </div>
                <div className="text-white/70">{player.totalPoints} pts</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}