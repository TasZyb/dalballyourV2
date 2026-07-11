import {
  Form,
  Link,
  data,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useEffect, useState, type ReactNode } from "react";
import { prisma } from "~/lib/db.server";
import { requireUser } from "~/lib/auth.server";
import {
  getThemeFromRequest,
  isAppTheme,
  themeCookie,
  type AppTheme,
} from "~/lib/theme.server";

const THEMES: { value: AppTheme; label: string; short: string }[] = [
  { value: "ucl", label: "Champions League", short: "UCL" },
  { value: "uel", label: "Europa League", short: "UEL" },
  { value: "uecl", label: "Conference League", short: "UECL" },
  { value: "dark", label: "Dark", short: "Dark" },
  { value: "light", label: "Light", short: "Light" },
];

function getDisplayName(user: {
  name: string | null;
  email: string | null;
  displayName?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
}

function formatDate(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: Date | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUser(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "change-theme") {
    return data({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const theme = formData.get("theme");

  if (!isAppTheme(theme)) {
    return data({ ok: false, error: "Invalid theme" }, { status: 400 });
  }

  return data(
    { ok: true, theme },
    {
      headers: {
        "Set-Cookie": await themeCookie.serialize(theme),
      },
    }
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const authUser = await requireUser(request);
  const theme = await getThemeFromRequest(request);

  const [
    user,
    predictionAgg,
    predictionsCount,
    exactHits,
    correctResults,
    wrongPredictions,
    activeGamesCount,
    activeGames,
    recentPredictions,
  ] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        bio: true,
        displayName: true,
        favoriteColor: true,
        profileBanner: true,
        isProfilePublic: true,
        createdAt: true,
        lastSeenAt: true,

        favoriteTeam: {
          select: {
            id: true,
            name: true,
            shortName: true,
            code: true,
            logo: true,
            country: true,
          },
        },

        wallet: {
          select: {
            balance: true,
            lifetimeEarned: true,
            lifetimeSpent: true,
          },
        },
      },
    }),

    prisma.prediction.aggregate({
      where: { userId: authUser.id },
      _sum: {
        pointsAwarded: true,
        weightedPointsAwarded: true,
        coinsAwarded: true,
      },
      _avg: {
        pointsAwarded: true,
        weightedPointsAwarded: true,
      },
      _max: {
        submittedAt: true,
      },
    }),

    prisma.prediction.count({
      where: { userId: authUser.id },
    }),

    prisma.prediction.count({
      where: {
        userId: authUser.id,
        wasExact: true,
      },
    }),

    prisma.prediction.count({
      where: {
        userId: authUser.id,
        wasOutcomeOnly: true,
      },
    }),

    prisma.prediction.count({
      where: {
        userId: authUser.id,
        wasWrong: true,
      },
    }),

    prisma.gameMember.count({
      where: {
        userId: authUser.id,
        status: "ACTIVE",
      },
    }),

    prisma.gameMember.findMany({
      where: {
        userId: authUser.id,
        status: "ACTIVE",
      },
      orderBy: {
        joinedAt: "desc",
      },
      take: 4,
      select: {
        role: true,
        joinedAt: true,
        coinsEarned: true,
        game: {
          select: {
            id: true,
            name: true,
            mode: true,
            status: true,
            linkedTournament: {
              select: {
                name: true,
              },
            },
            favoriteTeam: {
              select: {
                name: true,
                shortName: true,
                logo: true,
              },
            },
          },
        },
      },
    }),

    prisma.prediction.findMany({
      where: { userId: authUser.id },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        predictedHome: true,
        predictedAway: true,
        pointsAwarded: true,
        weightedPointsAwarded: true,
        wasExact: true,
        wasOutcomeOnly: true,
        updatedAt: true,
        game: {
          select: {
            id: true,
            name: true,
          },
        },
        match: {
          select: {
            startTime: true,
            status: true,
            homeScore: true,
            awayScore: true,
            tournament: {
              select: {
                name: true,
              },
            },
            homeTeam: {
              select: {
                name: true,
                shortName: true,
              },
            },
            awayTeam: {
              select: {
                name: true,
                shortName: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  const rawPoints = predictionAgg._sum.pointsAwarded ?? 0;
  const weightedPoints =
    predictionAgg._sum.weightedPointsAwarded ?? rawPoints;

  const bonusPoints = Math.max(0, weightedPoints - rawPoints);

  const accuracy =
    predictionsCount > 0
      ? Math.round(((exactHits + correctResults) / predictionsCount) * 100)
      : 0;

  return data({
    theme,
    user: {
      ...user,
      createdAtLabel: formatDate(user.createdAt),
      lastSeenAtLabel: formatDate(user.lastSeenAt),
    },
    stats: {
      predictionsCount,
      rawPoints,
      weightedPoints,
      bonusPoints,
      exactHits,
      correctResults,
      wrongPredictions,
      accuracy,
      averageRaw: Number((predictionAgg._avg.pointsAwarded ?? 0).toFixed(2)),
      averageWeighted: Number(
        (predictionAgg._avg.weightedPointsAwarded ?? 0).toFixed(2)
      ),
      coinsAwarded: predictionAgg._sum.coinsAwarded ?? 0,
      lastPredictionAtLabel: formatDate(predictionAgg._max.submittedAt),
      activeGamesCount,
    },
    activeGames: activeGames.map((membership) => ({
      ...membership,
      joinedAtLabel: formatDate(membership.joinedAt),
    })),
    recentPredictions: recentPredictions.map((prediction) => ({
      ...prediction,
      updatedAtLabel: formatDateTime(prediction.updatedAt),
      matchStartLabel: formatDateTime(prediction.match.startTime),
    })),
  });
}

export default function MePage() {
  const { theme, user, stats, activeGames, recentPredictions } =
    useLoaderData<typeof loader>();
  const displayName = getDisplayName(user);

  return (
    <div className="theme-page min-h-screen overflow-x-hidden">
      <main className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-8">
        <header className="mb-4 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-center lg:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <ActionLink to="/">← На головну</ActionLink>
            <ActionLink to="/predict" primary>
              Зробити прогноз
            </ActionLink>
            <ActionLink to="/me/stats">Статистика</ActionLink>
            <ActionLink to="/me/history">Історія матчів</ActionLink>
          </div>

          <ThemePicker currentTheme={theme} />

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:justify-end">
            <ActionLink to="/me/edit">Редагувати</ActionLink>

            <Form method="post" action="/logout" className="min-w-0">
              <DangerButton>Вийти</DangerButton>
            </Form>
          </div>
        </header>

        <section className="theme-panel overflow-hidden rounded-[1.5rem] sm:rounded-[2rem]">
          <div
            className="h-24 border-b border-[var(--border)] bg-[var(--panel-strong)] sm:h-36"
            style={
              user.profileBanner
                ? {
                    backgroundImage: `linear-gradient(to right, rgba(0,0,0,.58), rgba(0,0,0,.1)), url(${user.profileBanner})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : undefined
            }
          />

          <div className="p-4 sm:p-7">
            <div className="-mt-12 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-end gap-3 sm:gap-4">
                <Avatar user={user} displayName={displayName} />

                <div className="min-w-0 pb-1">
                  <div className="theme-muted text-[0.65rem] font-semibold uppercase tracking-[0.18em] sm:text-xs sm:tracking-[0.25em]">
                    Профіль гравця
                  </div>

                  <h1 className="mt-1 line-clamp-2 break-words text-2xl font-black tracking-tight text-[var(--text)] sm:mt-2 sm:truncate sm:text-4xl">
                    {displayName}
                  </h1>

                  <p className="theme-text-soft mt-1 break-all text-xs sm:truncate sm:text-sm">
                    {user.email}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <InfoPill>Роль: {user.role}</InfoPill>
                <InfoPill>
                  Профіль: {user.isProfilePublic ? "Публічний" : "Приватний"}
                </InfoPill>
                <InfoPill>З нами з: {user.createdAtLabel}</InfoPill>
              </div>
            </div>

            {user.bio && (
              <p className="theme-text-soft mt-5 max-w-3xl text-sm leading-6">
                {user.bio}
              </p>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <BigStat label="Прогнозів" value={stats.predictionsCount} />
              <BigStat label="Очки" value={stats.weightedPoints} />
              <BigStat label="Точні рахунки" value={stats.exactHits} />
              <BigStat label="Точність" value={`${stats.accuracy}%`} />
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Panel
            title="Форма прогнозиста"
            eyebrow="Поточний профіль"
            action={
              <ActionLink to="/me/stats" compact>
                Детально
              </ActionLink>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SmallStat label="Базові очки" value={stats.rawPoints} />
              <SmallStat
                label="Бонус за вагу раунду"
                value={`+${stats.bonusPoints}`}
              />
              <SmallStat label="Середній бал" value={stats.averageRaw} />
              <SmallStat
                label="Середній з вагою"
                value={stats.averageWeighted}
              />
              <SmallStat
                label="Вгадані результати"
                value={stats.correctResults}
              />
              <SmallStat
                label="Невдалі прогнози"
                value={stats.wrongPredictions}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionLink to="/me/history" primary>
                Відкрити історію матчів
              </ActionLink>

              <ActionLink to="/me/stats">Детальна статистика</ActionLink>
            </div>
          </Panel>

          <Panel title="Дані профілю" eyebrow="Акаунт">
            <div className="space-y-3">
              <ProfileRow
                label="Улюблена команда"
                value={user.favoriteTeam?.name || "Не вибрано"}
              />
              <ProfileRow
                label="Колір профілю"
                value={user.favoriteColor || "Не вибрано"}
              />
              <ProfileRow label="Активних ігор" value={stats.activeGamesCount} />
              <ProfileRow
                label="Останній прогноз"
                value={stats.lastPredictionAtLabel}
              />
              <ProfileRow
                label="Остання активність"
                value={user.lastSeenAtLabel}
              />
            </div>
          </Panel>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Гаманець" eyebrow="Монети">
            <div className="grid gap-3 sm:grid-cols-3">
              <SmallStat label="Баланс" value={user.wallet?.balance ?? 0} />
              <SmallStat
                label="Зароблено"
                value={user.wallet?.lifetimeEarned ?? 0}
              />
              <SmallStat
                label="Витрачено"
                value={user.wallet?.lifetimeSpent ?? 0}
              />
            </div>

            <p className="theme-text-soft mt-4 text-sm leading-6">
              Монети вже привʼязані до прогнозів і нагород у грі. Баланс
              оновлюється після підрахунку результатів.
            </p>
          </Panel>

          <Panel title="Активні ігри" eyebrow="Ліги">
            <div className="space-y-3">
              {activeGames.length > 0 ? (
                activeGames.map((membership) => (
                  <GameRow key={membership.game.id} membership={membership} />
                ))
              ) : (
                <EmptyState
                  title="Ти ще не в активній грі"
                  text="Створи лігу або приєднайся за кодом, щоб прогнози почали збиратися в таблиці."
                />
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <ActionLink to="/create" primary>
                Створити гру
              </ActionLink>
              <ActionLink to="/join">Приєднатись</ActionLink>
            </div>
          </Panel>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <Panel
            title="Останні прогнози"
            eyebrow="Матчі"
            action={
              <ActionLink to="/me/history" compact>
                Уся історія
              </ActionLink>
            }
          >
            <div className="space-y-3">
              {recentPredictions.length > 0 ? (
                recentPredictions.map((prediction) => (
                  <PredictionRow
                    key={prediction.id}
                    prediction={prediction}
                  />
                ))
              ) : (
                <EmptyState
                  title="Ще немає прогнозів"
                  text="Обери матч у своїй грі й залиш перший рахунок."
                />
              )}
            </div>
          </Panel>

          <Panel title="Швидкі дії" eyebrow="Навігація">
            <div className="grid gap-3 sm:grid-cols-2">
              <ActionLink to="/predict" primary>
                Зробити прогноз
              </ActionLink>
              <ActionLink to="/me/history">Історія матчів</ActionLink>
              <ActionLink to="/me/stats">Статистика</ActionLink>
              <ActionLink to="/me/edit">Редагувати</ActionLink>
            </div>
          </Panel>
        </section>
      </main>
    </div>
  );
}

function ThemePicker({ currentTheme }: { currentTheme: AppTheme }) {
  const fetcher = useFetcher<typeof action>();
  const [optimisticTheme, setOptimisticTheme] =
    useState<AppTheme>(currentTheme);

  useEffect(() => {
    if (!fetcher.data || !fetcher.data.ok || !("theme" in fetcher.data)) {
      return;
    }

    const nextTheme = fetcher.data.theme;
    setOptimisticTheme(nextTheme);

    document.documentElement.dataset.theme = nextTheme;

    document.documentElement.classList.remove(
      "theme-ucl",
      "theme-uel",
      "theme-uecl",
      "theme-dark",
      "theme-light"
    );

    document.documentElement.classList.add(`theme-${nextTheme}`);
  }, [fetcher.data]);

  return (
    <div className="theme-panel grid w-full grid-cols-5 gap-1 rounded-2xl p-1 sm:flex sm:w-auto sm:flex-wrap">
      {THEMES.map((theme) => {
        const active = optimisticTheme === theme.value;

        return (
          <fetcher.Form
            key={theme.value}
            method="post"
            onSubmit={() => setOptimisticTheme(theme.value)}
          >
            <input type="hidden" name="intent" value="change-theme" />
            <input type="hidden" name="theme" value={theme.value} />

            <button
              type="submit"
              title={theme.label}
              className={[
                "w-full rounded-xl px-2 py-2 text-xs font-black transition sm:px-3",
                active
                  ? "theme-primary-button"
                  : "text-[var(--text-soft)] hover:bg-[var(--panel-strong)] hover:text-[var(--text)]",
              ].join(" ")}
            >
              {theme.short}
            </button>
          </fetcher.Form>
        );
      })}
    </div>
  );
}

function Avatar({
  user,
  displayName,
}: {
  user: { image: string | null };
  displayName: string;
}) {
  if (user.image) {
    return (
      <img
        src={user.image}
        alt={displayName}
        loading="lazy"
        decoding="async"
        className="h-20 w-20 shrink-0 rounded-[1.5rem] border-4 border-[var(--bg)] bg-[var(--panel)] object-cover shadow-xl sm:h-24 sm:w-24 sm:rounded-[2rem]"
      />
    );
  }

  return (
    <div className="theme-card-highlight flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.5rem] border-4 border-[var(--bg)] text-2xl font-black shadow-xl sm:h-24 sm:w-24 sm:rounded-[2rem] sm:text-3xl">
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function ActionLink({
  to,
  children,
  primary = false,
  compact = false,
}: {
  to: string;
  children: ReactNode;
  primary?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      to={to}
      prefetch="intent"
      className={[
        "min-w-0 items-center justify-center rounded-2xl text-center text-sm font-semibold leading-tight transition",
        compact ? "inline-flex" : "flex",
        compact ? "px-3 py-2" : "px-4 py-3",
        "w-full sm:w-auto",
        primary ? "theme-primary-button" : "theme-button",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function DangerButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="submit"
      className="theme-danger-bg flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition hover:opacity-90 sm:w-auto"
    >
      {children}
    </button>
  );
}

function InfoPill({ children }: { children: ReactNode }) {
  return (
    <span className="theme-card-highlight max-w-full break-words rounded-full px-3 py-1 text-[var(--text-soft)]">
      {children}
    </span>
  );
}

function BigStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="theme-card-highlight rounded-[1.25rem] p-3 sm:rounded-3xl sm:p-4">
      <div className="theme-muted text-xs">{label}</div>
      <div className="mt-1 text-2xl font-black text-[var(--text)] sm:mt-2 sm:text-3xl">
        {value}
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="theme-card-highlight rounded-[1.25rem] p-3 sm:rounded-2xl sm:p-4">
      <div className="theme-text-soft text-sm">{label}</div>
      <div className="mt-1 text-2xl font-black text-[var(--text)] sm:mt-2">
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="theme-panel min-w-0 rounded-[1.5rem] p-4 sm:rounded-[2rem] sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <div className="theme-muted text-xs font-semibold uppercase tracking-[0.18em] sm:tracking-[0.22em]">
              {eyebrow}
            </div>
          )}
          <h2 className="mt-1 break-words text-lg font-black text-[var(--text)] sm:text-xl">
            {title}
          </h2>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function ProfileRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--border)] py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="theme-text-soft text-sm">{label}</div>
      <div className="break-words text-sm font-bold text-[var(--text)] sm:text-right">
        {value}
      </div>
    </div>
  );
}

function TeamMark({
  team,
}: {
  team: { name: string; shortName: string | null; logo: string | null } | null;
}) {
  if (!team) return null;

  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt={team.name}
        loading="lazy"
        decoding="async"
        className="h-8 w-8 rounded-xl bg-[var(--panel-strong)] object-contain p-1"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--panel-strong)] text-xs font-black text-[var(--text)]">
      {(team.shortName || team.name).slice(0, 2).toUpperCase()}
    </div>
  );
}

function GameRow({
  membership,
}: {
  membership: {
    role: string;
    coinsEarned: number;
    joinedAtLabel: string;
    game: {
      id: string;
      name: string;
      mode: string;
      status: string;
      linkedTournament: { name: string } | null;
      favoriteTeam: {
        name: string;
        shortName: string | null;
        logo: string | null;
      } | null;
    };
  };
}) {
  return (
    <Link
      to={`/games/${membership.game.id}`}
      prefetch="intent"
      className="theme-card-highlight flex min-w-0 flex-col gap-3 rounded-[1.25rem] p-3 transition hover:border-[var(--border-strong)] sm:flex-row sm:items-center sm:justify-between sm:rounded-2xl"
    >
      <div className="flex min-w-0 items-center gap-3">
        <TeamMark team={membership.game.favoriteTeam} />
        <div className="min-w-0">
          <div className="line-clamp-2 break-words text-sm font-black text-[var(--text)] sm:truncate">
            {membership.game.name}
          </div>
          <div className="theme-text-soft mt-1 line-clamp-2 break-words text-xs sm:truncate">
            {membership.game.linkedTournament?.name || membership.game.mode} ·{" "}
            з {membership.joinedAtLabel}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 text-left sm:block sm:text-right">
        <div className="text-xs font-black text-[var(--accent-text)]">
          {membership.role}
        </div>
        <div className="theme-muted mt-1 text-xs">
          {membership.coinsEarned} монет
        </div>
      </div>
    </Link>
  );
}

function getPredictionTone(prediction: {
  wasExact: boolean;
  wasOutcomeOnly: boolean;
}) {
  if (prediction.wasExact) return "Точний";
  if (prediction.wasOutcomeOnly) return "Результат";
  return "Очікує";
}

function PredictionRow({
  prediction,
}: {
  prediction: {
    predictedHome: number;
    predictedAway: number;
    pointsAwarded: number;
    weightedPointsAwarded: number;
    wasExact: boolean;
    wasOutcomeOnly: boolean;
    updatedAtLabel: string;
    matchStartLabel: string;
    game: { id: string; name: string };
    match: {
      status: string;
      homeScore: number | null;
      awayScore: number | null;
      tournament: { name: string };
      homeTeam: { name: string; shortName: string | null };
      awayTeam: { name: string; shortName: string | null };
    };
  };
}) {
  const homeName =
    prediction.match.homeTeam.shortName || prediction.match.homeTeam.name;
  const awayName =
    prediction.match.awayTeam.shortName || prediction.match.awayTeam.name;

  return (
    <Link
      to={`/games/${prediction.game.id}`}
      prefetch="intent"
      className="theme-card-highlight block min-w-0 rounded-[1.25rem] p-3 transition hover:border-[var(--border-strong)] sm:rounded-2xl sm:p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="theme-muted line-clamp-2 break-words text-xs font-semibold uppercase tracking-[0.14em] sm:truncate sm:tracking-[0.18em]">
            {prediction.match.tournament.name}
          </div>
          <div className="mt-2 line-clamp-2 break-words text-base font-black text-[var(--text)] sm:truncate">
            {homeName} <span className="theme-muted">vs</span> {awayName}
          </div>
          <div className="theme-text-soft mt-1 break-words text-xs">
            {prediction.game.name} · {prediction.matchStartLabel}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <ScoreBadge>
            {prediction.predictedHome}:{prediction.predictedAway}
          </ScoreBadge>
          <ScoreBadge muted>{getPredictionTone(prediction)}</ScoreBadge>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <InfoPill>
          Очки: {prediction.weightedPointsAwarded || prediction.pointsAwarded}
        </InfoPill>
        {prediction.match.homeScore !== null &&
          prediction.match.awayScore !== null && (
            <InfoPill>
              Фінал: {prediction.match.homeScore}:{prediction.match.awayScore}
            </InfoPill>
          )}
        <InfoPill>Оновлено: {prediction.updatedAtLabel}</InfoPill>
      </div>
    </Link>
  );
}

function ScoreBadge({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={[
        "whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-black",
        muted
          ? "bg-[var(--panel-strong)] text-[var(--text-soft)]"
          : "bg-[var(--accent-soft)] text-[var(--accent-text)]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card-highlight)] p-4">
      <div className="text-sm font-black text-[var(--text)]">{title}</div>
      <div className="theme-text-soft mt-1 text-sm leading-6">{text}</div>
    </div>
  );
}
