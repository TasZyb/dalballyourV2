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
  });
}

export default function MePage() {
  const { theme, user, stats } = useLoaderData<typeof loader>();
  const displayName = getDisplayName(user);

  return (
    <div className="theme-page min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            <ActionLink to="/">← На головну</ActionLink>
            <ActionLink to="/predict" primary>
              Зробити прогноз
            </ActionLink>
            <ActionLink to="/me/history">Історія матчів</ActionLink>
          </div>

          <ThemePicker currentTheme={theme} />

          <div className="flex flex-wrap gap-2">
            <ActionLink to="/me/edit">Редагувати</ActionLink>

            <Form method="post" action="/logout">
              <DangerButton>Вийти</DangerButton>
            </Form>
          </div>
        </header>

        <section className="theme-panel overflow-hidden rounded-[2rem]">
          <div
            className="h-28 border-b border-[var(--border)] bg-[var(--panel-strong)] sm:h-36"
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

          <div className="p-5 sm:p-7">
            <div className="-mt-14 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-end gap-4">
                <Avatar user={user} displayName={displayName} />

                <div className="min-w-0 pb-1">
                  <div className="theme-muted text-xs font-semibold uppercase tracking-[0.25em]">
                    Профіль гравця
                  </div>

                  <h1 className="mt-2 truncate text-3xl font-black tracking-tight text-[var(--text)] sm:text-4xl">
                    {displayName}
                  </h1>

                  <p className="theme-text-soft mt-1 truncate text-sm">
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

        <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Panel title="Статистика прогнозів">
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

          <Panel title="Профіль">
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

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <Panel title="Гаманець">
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
              Тут можна показувати монети, бонуси за точні рахунки, нагороди за
              раунди або майбутній внутрішній магазин.
            </p>
          </Panel>

          <Panel title="Швидкі дії">
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
    if (!fetcher.data?.ok || !fetcher.data.theme) return;

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
    <div className="theme-panel flex flex-wrap items-center gap-1 rounded-2xl p-1">
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
                "rounded-xl px-3 py-2 text-xs font-black transition",
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
        className="h-24 w-24 shrink-0 rounded-[2rem] border-4 border-[var(--bg)] bg-[var(--panel)] object-cover shadow-xl"
      />
    );
  }

  return (
    <div className="theme-card-highlight flex h-24 w-24 shrink-0 items-center justify-center rounded-[2rem] border-4 border-[var(--bg)] text-3xl font-black shadow-xl">
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

function ActionLink({
  to,
  children,
  primary = false,
}: {
  to: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      prefetch="intent"
      className={[
        "inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition",
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
      className="theme-danger-bg inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition hover:opacity-90"
    >
      {children}
    </button>
  );
}

function InfoPill({ children }: { children: ReactNode }) {
  return (
    <span className="theme-card-highlight rounded-full px-3 py-1 text-[var(--text-soft)]">
      {children}
    </span>
  );
}

function BigStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="theme-card-highlight rounded-3xl p-4">
      <div className="theme-muted text-xs">{label}</div>
      <div className="mt-2 text-3xl font-black text-[var(--text)]">{value}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="theme-card-highlight rounded-2xl p-4">
      <div className="theme-text-soft text-sm">{label}</div>
      <div className="mt-2 text-2xl font-black text-[var(--text)]">{value}</div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="theme-panel rounded-[2rem] p-5 sm:p-6">
      <h2 className="mb-4 text-xl font-black text-[var(--text)]">{title}</h2>
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
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-3 last:border-b-0">
      <div className="theme-text-soft text-sm">{label}</div>
      <div className="text-right text-sm font-bold text-[var(--text)]">
        {value}
      </div>
    </div>
  );
}