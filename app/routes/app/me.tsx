import { Form, Link, data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUser } from "~/lib/auth.server";
import ThemeSwitcher from "~/components/ThemeSwitcher";

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

function ActionLink({
  to,
  children,
  primary = false,
}: {
  to: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition"
      style={
        primary
          ? {
              background: "var(--accent)",
              color: "#fff",
              border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
            }
          : {
              background: "var(--panel)",
              color: "var(--text)",
              border: "1px solid var(--border)",
            }
      }
      onMouseEnter={(e) => {
        if (primary) {
          e.currentTarget.style.filter = "brightness(1.05)";
        } else {
          e.currentTarget.style.background = "var(--panel-strong)";
          e.currentTarget.style.borderColor = "var(--border-strong)";
        }
      }}
      onMouseLeave={(e) => {
        if (primary) {
          e.currentTarget.style.filter = "none";
        } else {
          e.currentTarget.style.background = "var(--panel)";
          e.currentTarget.style.borderColor = "var(--border)";
        }
      }}
    >
      {children}
    </Link>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--card-highlight)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div
        className="mt-2 text-2xl font-black"
        style={{ color: "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}

function InfoPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-3 py-1"
      style={{
        background: "var(--card-highlight)",
        border: "1px solid var(--border)",
        color: "var(--text-soft)",
      }}
    >
      {children}
    </span>
  );
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
    <div className="theme-page min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-3">
            <ActionLink to="/">← На головну</ActionLink>
            <ActionLink to="/predict" primary>
              Зробити прогноз
            </ActionLink>
          </div>

          <ThemeSwitcher />

          <div className="flex flex-wrap gap-3">
            <ActionLink to="/me/edit">Редагувати профіль</ActionLink>

            <Form method="post" action="/logout">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition"
                style={{
                  background: "color-mix(in srgb, #ef4444 12%, transparent)",
                  color: "#ef4444",
                  border: "1px solid color-mix(in srgb, #ef4444 24%, transparent)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background =
                    "color-mix(in srgb, #ef4444 16%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background =
                    "color-mix(in srgb, #ef4444 12%, transparent)";
                }}
              >
                Вийти
              </button>
            </Form>
          </div>
        </div>

        <section className="theme-panel rounded-[2rem] p-5 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              {user.image ? (
                <img
                  src={user.image}
                  alt={displayName}
                  className="h-20 w-20 rounded-full object-cover"
                  style={{ border: "1px solid var(--border)" }}
                />
              ) : (
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-black"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--card-highlight)",
                    color: "var(--text)",
                  }}
                >
                  {displayName.slice(0, 1).toUpperCase()}
                </div>
              )}

              <div>
                <div
                  className="text-xs font-semibold uppercase tracking-[0.3em]"
                  style={{ color: "var(--muted)" }}
                >
                  Особистий кабінет
                </div>

                <h1
                  className="mt-2 text-3xl font-black tracking-tight sm:text-4xl"
                  style={{ color: "var(--text)" }}
                >
                  {displayName}
                </h1>

                <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
                  {user.email}
                </p>

                {user.bio && (
                  <p
                    className="mt-3 max-w-2xl text-sm leading-6"
                    style={{ color: "var(--text-soft)" }}
                  >
                    {user.bio}
                  </p>
                )}

                <div
                  className="mt-3 flex flex-wrap gap-2 text-xs"
                  style={{ color: "var(--text-soft)" }}
                >
                  <InfoPill>Роль: {user.role}</InfoPill>

                  {user.favoriteTeam && (
                    <InfoPill>Улюблена команда: {user.favoriteTeam.name}</InfoPill>
                  )}

                  <InfoPill>
                    Профіль: {user.isProfilePublic ? "Публічний" : "Приватний"}
                  </InfoPill>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Місце" value={place ? `#${place}` : "—"} />
              <StatCard label="Очки" value={totalPoints} />
              <StatCard label="Прогнози" value={predictionsCount} />
              <StatCard label="Сер. бал" value={averagePoints} />
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="theme-panel rounded-[1.5rem] p-5">
            <div className="text-sm" style={{ color: "var(--text-soft)" }}>
              Точні рахунки
            </div>
            <div
              className="mt-2 text-3xl font-black"
              style={{ color: "var(--text)" }}
            >
              {exactHits}
            </div>
          </div>

          <div className="theme-panel rounded-[1.5rem] p-5">
            <div className="text-sm" style={{ color: "var(--text-soft)" }}>
              Вгадані результати
            </div>
            <div
              className="mt-2 text-3xl font-black"
              style={{ color: "var(--text)" }}
            >
              {correctResults}
            </div>
          </div>

          <div className="theme-panel rounded-[1.5rem] p-5">
            <div className="text-sm" style={{ color: "var(--text-soft)" }}>
              Колір профілю
            </div>
            <div
              className="mt-2 text-lg font-bold"
              style={{ color: "var(--text)" }}
            >
              {user.favoriteColor || "Не вибрано"}
            </div>
          </div>

          <div className="theme-panel rounded-[1.5rem] p-5">
            <div className="text-sm" style={{ color: "var(--text-soft)" }}>
              З нами з
            </div>
            <div
              className="mt-2 text-lg font-bold"
              style={{ color: "var(--text)" }}
            >
              {new Date(user.createdAt).toLocaleDateString("uk-UA")}
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="theme-panel rounded-[2rem] p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black" style={{ color: "var(--text)" }}>
                Останні прогнози
              </h2>
              <Link
                to="/me/history"
                className="text-sm font-semibold transition"
                style={{ color: "var(--text-soft)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-soft)";
                }}
              >
                Вся історія
              </Link>
            </div>

            <div className="space-y-3">
              {recentPredictions.length > 0 ? (
                recentPredictions.map((prediction) => (
                  <div
                    key={prediction.id}
                    className="rounded-2xl p-4"
                    style={{
                      background: "var(--card-highlight)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      className="text-xs uppercase tracking-[0.2em]"
                      style={{ color: "var(--muted)" }}
                    >
                      {prediction.match.tournament.name}
                      {prediction.match.round
                        ? ` · ${prediction.match.round.name}`
                        : ""}
                    </div>

                    <div
                      className="mt-2 text-lg font-black"
                      style={{ color: "var(--text)" }}
                    >
                      {prediction.match.homeTeam.name}{" "}
                      <span style={{ color: "var(--muted)" }}>vs</span>{" "}
                      {prediction.match.awayTeam.name}
                    </div>

                    <div
                      className="mt-2 text-sm"
                      style={{ color: "var(--text-soft)" }}
                    >
                      Твій прогноз: {prediction.predictedHome} :{" "}
                      {prediction.predictedAway}
                    </div>

                    <div
                      className="mt-2 text-sm"
                      style={{ color: "var(--muted)" }}
                    >
                      Очки: {prediction.pointsAwarded}
                    </div>
                  </div>
                ))
              ) : (
                <div
                  className="rounded-2xl border border-dashed p-4 text-sm"
                  style={{
                    background: "var(--card-highlight)",
                    borderColor: "var(--border)",
                    color: "var(--text-soft)",
                  }}
                >
                  У тебе ще немає прогнозів.
                </div>
              )}
            </div>
          </div>

          <div className="theme-panel rounded-[2rem] p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-black" style={{ color: "var(--text)" }}>
                Найближчі матчі
              </h2>
              <Link
                to="/predict"
                className="text-sm font-semibold transition"
                style={{ color: "var(--text-soft)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-soft)";
                }}
              >
                До прогнозів
              </Link>
            </div>

            <div className="space-y-3">
              {upcomingMatches.length > 0 ? (
                upcomingMatches.map((match) => (
                  <div
                    key={match.id}
                    className="rounded-2xl p-4"
                    style={{
                      background: "var(--card-highlight)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      className="text-xs uppercase tracking-[0.2em]"
                      style={{ color: "var(--muted)" }}
                    >
                      {match.tournament.name}
                      {match.round ? ` · ${match.round.name}` : ""}
                    </div>

                    <div
                      className="mt-2 text-lg font-black"
                      style={{ color: "var(--text)" }}
                    >
                      {match.homeTeam.name}{" "}
                      <span style={{ color: "var(--muted)" }}>vs</span>{" "}
                      {match.awayTeam.name}
                    </div>

                    <div
                      className="mt-2 text-sm"
                      style={{ color: "var(--text-soft)" }}
                    >
                      {new Date(match.startTime).toLocaleString("uk-UA")}
                    </div>
                  </div>
                ))
              ) : (
                <div
                  className="rounded-2xl border border-dashed p-4 text-sm"
                  style={{
                    background: "var(--card-highlight)",
                    borderColor: "var(--border)",
                    color: "var(--text-soft)",
                  }}
                >
                  Найближчих матчів зараз немає.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="theme-panel mt-6 rounded-[2rem] p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-xl font-black" style={{ color: "var(--text)" }}>
              Міні-рейтинг
            </h2>
            <Link
              to="/me/stats"
              className="text-sm font-semibold transition"
              style={{ color: "var(--text-soft)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-soft)";
              }}
            >
              Детальна статистика
            </Link>
          </div>

          <div className="space-y-3">
            {leaderboard.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-2xl px-4 py-3"
                style={{
                  background: "var(--card-highlight)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="font-semibold" style={{ color: "var(--text)" }}>
                  #{index + 1} · {player.name}
                </div>
                <div style={{ color: "var(--text-soft)" }}>
                  {player.totalPoints} pts
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}