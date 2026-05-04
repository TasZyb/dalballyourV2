import {
  Link,
  Form,
  data,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useMemo, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type NextMatch = {
  id: string;
  startTime: string;
  formattedStartTime: string;
  homeTeam: string;
  awayTeam: string;
  status: string;
};

type LobbyGame = {
  id: string;
  name: string;
  slug: string | null;
  mode: "GROUP" | "CAREER";
  inviteCode: string;
  status: string;
  bannerUrl: string | null;
  avatarUrl: string | null;
  linkedTournamentName: string | null;
  favoriteTeamName: string | null;
  favoriteTeamLogo: string | null;
  membersCount: number;
  matchesCount: number;
  liveMatchesCount: number;
  finishedMatchesCount: number;
  pendingPredictionsCount: number;
  submittedPredictionsCount: number;
  exactHitsCount: number;
  nextMatch: NextMatch | null;
};

type LobbyStats = {
  leagueGamesCount: number;
  careerGamesCount: number;
  totalLiveMatches: number;
  totalPendingPredictions: number;
  totalExactHits: number;
};

type LobbyTab = "leagues" | "solo" | "create" | "rules";

function isMatchClosed(match: { status: string; startTime: Date | string }) {
  const startTime = new Date(match.startTime);

  return (
    match.status === "FINISHED" ||
    match.status === "CANCELED" ||
    match.status === "POSTPONED" ||
    startTime <= new Date()
  );
}

function formatMatchDate(value: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(value));
}

function getSoonestGame(games: LobbyGame[]) {
  return (
    [...games]
      .filter((game) => game.nextMatch)
      .sort((a, b) => {
        const aTime = new Date(a.nextMatch!.startTime).getTime();
        const bTime = new Date(b.nextMatch!.startTime).getTime();
        return aTime - bTime;
      })[0] ?? null
  );
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return data({
      currentUser: null,
      leagueGames: [] as LobbyGame[],
      careerGames: [] as LobbyGame[],
      stats: {
        leagueGamesCount: 0,
        careerGamesCount: 0,
        totalLiveMatches: 0,
        totalPendingPredictions: 0,
        totalExactHits: 0,
      } satisfies LobbyStats,
    });
  }

  const memberships = await prisma.gameMember.findMany({
    where: {
      userId: currentUser.id,
      status: "ACTIVE",
    },
    include: {
      game: {
        include: {
          owner: true,
          linkedTournament: true,
          favoriteTeam: true,
          _count: {
            select: {
              members: true,
              gameMatches: true,
            },
          },
          gameMatches: {
            include: {
              match: {
                include: {
                  homeTeam: true,
                  awayTeam: true,
                },
              },
            },
            orderBy: {
              match: {
                startTime: "asc",
              },
            },
          },
          predictions: {
            where: {
              userId: currentUser.id,
            },
            select: {
              id: true,
              matchId: true,
              wasExact: true,
            },
          },
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  const games: LobbyGame[] = memberships.map((membership) => {
    const game = membership.game;
    const predictedMatchIds = new Set(
      game.predictions.map((prediction) => prediction.matchId)
    );

    const nextMatchRaw =
      game.gameMatches.find((gm) => {
        const start = new Date(gm.match.startTime);

        return (
          start >= new Date() &&
          gm.match.status !== "FINISHED" &&
          gm.match.status !== "CANCELED" &&
          gm.match.status !== "POSTPONED"
        );
      }) ?? null;

    const liveMatchesCount = game.gameMatches.filter(
      (gm) => gm.match.status === "LIVE"
    ).length;

    const finishedMatchesCount = game.gameMatches.filter(
      (gm) => gm.match.status === "FINISHED"
    ).length;

    const pendingPredictionsCount = game.gameMatches.filter((gm) => {
      if (gm.isLocked) return false;
      if (isMatchClosed(gm.match)) return false;
      return !predictedMatchIds.has(gm.match.id);
    }).length;

    return {
      id: game.id,
      name: game.name,
      slug: game.slug,
      mode: game.mode,
      inviteCode: game.inviteCode,
      status: game.status,
      bannerUrl: game.bannerUrl ?? null,
      avatarUrl: game.avatarUrl ?? null,
      linkedTournamentName: game.linkedTournament?.name ?? null,
      favoriteTeamName:
        game.favoriteTeam?.shortName || game.favoriteTeam?.name || null,
      favoriteTeamLogo: game.favoriteTeam?.logo ?? null,
      membersCount: game._count.members,
      matchesCount: game._count.gameMatches,
      liveMatchesCount,
      finishedMatchesCount,
      pendingPredictionsCount,
      submittedPredictionsCount: game.predictions.length,
      exactHitsCount: game.predictions.filter((prediction) => prediction.wasExact)
        .length,
      nextMatch: nextMatchRaw
        ? {
            id: nextMatchRaw.match.id,
            startTime: nextMatchRaw.match.startTime.toISOString(),
            formattedStartTime: formatMatchDate(nextMatchRaw.match.startTime),
            homeTeam:
              nextMatchRaw.match.homeTeam.shortName ||
              nextMatchRaw.match.homeTeam.name,
            awayTeam:
              nextMatchRaw.match.awayTeam.shortName ||
              nextMatchRaw.match.awayTeam.name,
            status: nextMatchRaw.match.status,
          }
        : null,
    };
  });

  const leagueGames = games.filter((game) => game.mode === "GROUP");
  const careerGames = games.filter((game) => game.mode === "CAREER");

  return data({
    currentUser: {
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      displayName: currentUser.displayName,
    },
    leagueGames,
    careerGames,
    stats: {
      leagueGamesCount: leagueGames.length,
      careerGamesCount: careerGames.length,
      totalLiveMatches: games.reduce((sum, game) => sum + game.liveMatchesCount, 0),
      totalPendingPredictions: games.reduce(
        (sum, game) => sum + game.pendingPredictionsCount,
        0
      ),
      totalExactHits: games.reduce((sum, game) => sum + game.exactHitsCount, 0),
    } satisfies LobbyStats,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const formData = await request.formData();

  const intent = String(formData.get("intent") || "");

  if (intent !== "feedback") {
    return data(
      {
        ok: false,
        message: "Невідома дія форми.",
      },
      { status: 400 }
    );
  }

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const message = String(formData.get("message") || "").trim();

  if (!message) {
    return data(
      {
        ok: false,
        message: "Напиши побажання або ідею.",
      },
      { status: 400 }
    );
  }

  const senderName =
    name || currentUser?.displayName || currentUser?.name || "Не вказано";
  const senderEmail = email || currentUser?.email || "Не вказано";

  if (!process.env.RESEND_API_KEY) {
    console.log("Feedback form message:", {
      senderName,
      senderEmail,
      message,
    });

    return data({
      ok: false,
      message:
        "Форма готова, але треба додати RESEND_API_KEY в .env, щоб лист реально відправлявся.",
    });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from:
        process.env.FEEDBACK_FROM_EMAIL ||
        "Match Predictor <onboarding@resend.dev>",
      to: ["taszyb9@gmail.com"],
      subject: "Побажання до Match Predictor",
      text: `
Нове побажання до гри

Імʼя: ${senderName}
Email: ${senderEmail}

Повідомлення:
${message}
      `.trim(),
    }),
  });

  if (!response.ok) {
    return data(
      {
        ok: false,
        message: "Не вдалося відправити лист. Спробуй ще раз.",
      },
      { status: 500 }
    );
  }

  return data({
    ok: true,
    message: "Дякую! Побажання відправлено.",
  });
}

export default function LobbyPage() {
  const { currentUser, leagueGames, careerGames, stats } =
    useLoaderData<typeof loader>();

  const [activeTab, setActiveTab] = useState<LobbyTab>("leagues");

  const soonestLeagueGame = useMemo(
    () => getSoonestGame(leagueGames),
    [leagueGames]
  );

  const soonestCareerGame = useMemo(
    () => getSoonestGame(careerGames),
    [careerGames]
  );

  if (!currentUser) {
    return <GuestLobby />;
  }

  return (
    <main className="theme-page relative min-h-screen overflow-hidden px-3 py-3 sm:px-5 sm:py-5">
      <LobbyBackground />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-4">
        <LobbyHeader currentUser={currentUser} />

        <LobbyTabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "leagues" ? (
          <GamesTab
            type="league"
            title="Твої ліги"
            emptyTitle="Ще немає дружніх ліг"
            emptyText="Створи лігу або приєднайся по коду."
            createHref="/create/league"
            createLabel="Нова ліга"
            soonestGame={soonestLeagueGame}
            games={leagueGames}
          />
        ) : null}

        {activeTab === "solo" ? (
          <GamesTab
            type="solo"
            title="Соло кар’єра"
            emptyTitle="Ще немає кар’єри"
            emptyText="Режим у процесі розробки. Скоро тут зʼявиться карʼєра за улюблений клуб."
            createHref="/create/career"
            createLabel="Почати кар’єру"
            soonestGame={soonestCareerGame}
            games={careerGames}
          />
        ) : null}

        {activeTab === "create" ? <CreateTab /> : null}

        {activeTab === "rules" ? <RulesTab /> : null}

        <CompactOverview stats={stats} />
      </div>
    </main>
  );
}

function GuestLobby() {
  return (
    <main className="theme-page relative min-h-screen overflow-hidden px-4 py-6">
      <LobbyBackground />

      <div className="relative mx-auto flex min-h-[70vh] max-w-4xl items-center">
        <div className="theme-panel-strong relative w-full overflow-hidden rounded-[2rem] p-6 sm:p-8">
          <PitchSvg className="absolute right-[-160px] top-[-90px] h-64 w-[420px] opacity-10" />

          <div className="relative z-10 max-w-2xl">
            <div className="theme-accent-bg inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em]">
              Match Predictor
            </div>

            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
              Прогнозуй матчі. Обганяй друзів.
            </h1>

            <p className="theme-text-soft mt-4 max-w-xl text-sm leading-6 sm:text-base">
              Дружні ліги, сольна кар’єра, live-матчі, таблиці та точні рахунки.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="theme-primary-button rounded-2xl px-5 py-3 text-sm font-black"
              >
                Увійти
              </Link>

              <Link
                to="/create/league"
                className="theme-button rounded-2xl px-5 py-3 text-sm font-bold"
              >
                Створити лігу
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function LobbyHeader({
  currentUser,
}: {
  currentUser: {
    displayName?: string | null;
    name?: string | null;
    email?: string | null;
  } | null;
}) {
  const displayName =
    currentUser?.displayName || currentUser?.name || currentUser?.email || "Гравець";

  return (
    <header className="theme-panel flex items-center justify-between gap-3 rounded-[1.5rem] px-3 py-3 sm:px-4">
      <Link to="/" className="flex min-w-0 items-center gap-3">
        <div className="theme-accent-bg flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <IconBall className="h-6 w-6" />
        </div>

        <div className="min-w-0">
          <div className="theme-muted text-[10px] font-black uppercase tracking-[0.2em]">
            Lobby
          </div>
          <div className="truncate text-lg font-black">Predict League</div>
        </div>
      </Link>

      <div className="flex items-center gap-2">
        <Link
          to="/me"
          className="theme-button hidden rounded-2xl px-4 py-2 text-sm font-bold sm:inline-flex"
        >
          {displayName}
        </Link>

        <Link
          to="/me"
          className="theme-button inline-flex h-10 w-10 items-center justify-center rounded-2xl sm:hidden"
          aria-label="Профіль"
        >
          <IconUser className="h-5 w-5" />
        </Link>

        <Form method="post" action="/logout">
          <button
            type="submit"
            className="theme-button inline-flex h-10 w-10 items-center justify-center rounded-2xl"
            aria-label="Вийти"
          >
            <IconLogout className="h-5 w-5" />
          </button>
        </Form>
      </div>
    </header>
  );
}

function CompactOverview({ stats }: { stats: LobbyStats }) {
  return (
    <section className="theme-panel rounded-[1.5rem] p-3">
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
            Активність
          </div>
          <h2 className="text-sm font-black sm:text-base">Коротко по твоїй грі</h2>
        </div>

        <IconTrophy className="theme-accent h-6 w-6" />
      </div>

      <div className="grid grid-cols-5 gap-2">
        <StatPill icon={<IconShield />} label="Ліги" value={stats.leagueGamesCount} />
        <StatPill icon={<IconStar />} label="Соло" value={stats.careerGamesCount} />
        <StatPill icon={<IconLive />} label="Live" value={stats.totalLiveMatches} />
        <StatPill
          icon={<IconClock />}
          label="Прогн."
          value={stats.totalPendingPredictions}
        />
        <StatPill icon={<IconTrophy />} label="Точні" value={stats.totalExactHits} />
      </div>
    </section>
  );
}

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="theme-card-highlight flex min-h-16 flex-col items-center justify-center rounded-[1rem] px-1.5 py-2 text-center sm:min-h-20 sm:px-2 sm:py-3">
      <div className="theme-accent mb-1 h-4 w-4 sm:h-5 sm:w-5">{icon}</div>
      <div className="text-base font-black leading-none sm:text-xl">{value}</div>
      <div className="theme-muted mt-1 text-[9px] font-bold uppercase tracking-[0.08em] sm:text-[10px] sm:tracking-[0.12em]">
        {label}
      </div>
    </div>
  );
}

function LobbyTabs({
  activeTab,
  onChange,
}: {
  activeTab: LobbyTab;
  onChange: (tab: LobbyTab) => void;
}) {
  const tabs: {
    id: LobbyTab;
    label: string;
    shortLabel: string;
    icon: React.ReactNode;
  }[] = [
    { id: "leagues", label: "Ліги", shortLabel: "Ліги", icon: <IconShield /> },
    { id: "solo", label: "Соло", shortLabel: "Соло", icon: <IconStar /> },
    { id: "create", label: "Створити", shortLabel: "Ств.", icon: <IconPlus /> },
    { id: "rules", label: "Правила", shortLabel: "Прав.", icon: <IconBook /> },
  ];

  return (
    <nav className="theme-panel grid grid-cols-4 gap-1 rounded-[1.5rem] p-1">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              "flex min-h-14 flex-col items-center justify-center rounded-[1.15rem] px-1.5 py-2 text-[10px] font-black leading-none transition-colors sm:min-h-12 sm:flex-row sm:gap-2 sm:px-3 sm:py-3 sm:text-sm",
              isActive
                ? "bg-[var(--accent)] text-[var(--accent-button-text)]"
                : "theme-muted hover:bg-[var(--panel-strong)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            <span className="mb-1 h-4 w-4 sm:mb-0">{tab.icon}</span>
            <span className="block sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:block">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function GamesTab({
  type,
  title,
  emptyTitle,
  emptyText,
  createHref,
  createLabel,
  soonestGame,
  games,
}: {
  type: "league" | "solo";
  title: string;
  emptyTitle: string;
  emptyText: string;
  createHref: string;
  createLabel: string;
  soonestGame: LobbyGame | null;
  games: LobbyGame[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
      <NextMatchPanel type={type} game={soonestGame} createHref={createHref} />

      <div className="theme-panel rounded-[1.75rem] p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="theme-accent-bg flex h-9 w-9 items-center justify-center rounded-2xl">
              {type === "league" ? <IconShield /> : <IconStar />}
            </div>
            <h2 className="text-lg font-black">{title}</h2>
          </div>

          <Link
            to={createHref}
            className="theme-button rounded-2xl px-3 py-2 text-xs font-black"
          >
            {createLabel}
          </Link>
        </div>

        {games.length ? (
          <div className="grid gap-2">
            {games.map((game) => (
              <CompactGameRow key={game.id} game={game} type={type} />
            ))}
          </div>
        ) : (
          <EmptyTabState title={emptyTitle} text={emptyText} href={createHref} />
        )}
      </div>
    </section>
  );
}

function NextMatchPanel({
  type,
  game,
  createHref,
}: {
  type: "league" | "solo";
  game: LobbyGame | null;
  createHref: string;
}) {
  return (
    <div className="theme-panel-strong relative overflow-hidden rounded-[1.75rem] p-4">
      <PitchSvg className="absolute right-[-140px] top-[-90px] h-64 w-[420px] opacity-10" />

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          <div className="theme-accent-bg inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em]">
            <IconClock className="h-4 w-4" />
            Найближчий матч
          </div>

          {type === "league" ? (
            <IconWhistle className="theme-accent h-9 w-9" />
          ) : (
            <IconBoot className="theme-accent h-9 w-9" />
          )}
        </div>

        {game?.nextMatch ? (
          <>
            <div className="mt-5">
              <div className="theme-muted text-xs font-bold uppercase tracking-[0.14em]">
                {game.name}
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <TeamBadge label={game.nextMatch.homeTeam} />
                <div className="theme-accent text-xl font-black">VS</div>
                <TeamBadge label={game.nextMatch.awayTeam} />
              </div>

              <div className="theme-card-highlight mt-4 rounded-2xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="theme-text-soft text-sm">Старт</span>
                  <span className="font-black">
                    {game.nextMatch.formattedStartTime}
                  </span>
                </div>
              </div>
            </div>

            <Link
              to={`/games/${game.id}`}
              className="theme-primary-button mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black"
            >
              Відкрити гру
              <IconArrow className="h-4 w-4" />
            </Link>
          </>
        ) : (
          <div className="mt-6">
            <IconCalendar className="theme-accent h-16 w-16" />

            <h3 className="mt-4 text-2xl font-black">Матчів поки немає</h3>
            <p className="theme-text-soft mt-2 text-sm leading-6">
              Створи нову гру або додай матчі до існуючої.
            </p>

            <Link
              to={createHref}
              className="theme-button mt-5 inline-flex rounded-2xl px-4 py-3 text-sm font-black"
            >
              Створити
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function CompactGameRow({
  game,
  type,
}: {
  game: LobbyGame;
  type: "league" | "solo";
}) {
  const initials = game.name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const progress =
    game.matchesCount > 0
      ? Math.round((game.finishedMatchesCount / game.matchesCount) * 100)
      : 0;

  return (
    <Link
      to={`/games/${game.id}`}
      className="group theme-card-highlight grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[1.25rem] p-3 transition-colors hover:bg-[var(--panel-strong)]"
    >
      <div className="theme-accent-bg flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl font-black">
        {type === "solo" && game.favoriteTeamLogo ? (
          <img
            src={game.favoriteTeamLogo}
            alt={game.favoriteTeamName || game.name}
            className="h-8 w-8 object-contain"
            loading="lazy"
          />
        ) : game.avatarUrl ? (
          <img
            src={game.avatarUrl}
            alt={game.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          initials
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate font-black">{game.name}</div>

        <div className="theme-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
          <span>
            {type === "solo"
              ? game.favoriteTeamName || "Career"
              : game.linkedTournamentName || "League"}
          </span>
          <span>{game.membersCount} гравців</span>
          <span>{game.pendingPredictionsCount} без прогнозу</span>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel)]">
          <div
            className="h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        {game.liveMatchesCount > 0 ? (
          <span className="theme-success-bg rounded-full px-2 py-1 text-[10px] font-black uppercase">
            Live
          </span>
        ) : null}

        {game.nextMatch ? (
          <span className="theme-muted text-right text-xs">
            {game.nextMatch.formattedStartTime}
          </span>
        ) : (
          <IconArrow className="theme-muted h-5 w-5 transition-transform group-hover:translate-x-0.5" />
        )}
      </div>
    </Link>
  );
}

function CreateTab() {
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <CreateCard
        title="Дружня ліга"
        text="Для друзів, кодів запрошення, таблиці та спільних матчів."
        href="/create/league"
        icon={<IconShield />}
      />

      <CreateCard
        title="Соло кар’єра"
        text="Для улюбленого клубу, особистих прогнозів і власного прогресу."
        href="/create/career"
        icon={<IconStar />}
      />

      <CreateCard
        title="Приєднатись"
        text="Введи код ліги й одразу заходь у гру."
        href="/join"
        icon={<IconKey />}
      />
    </section>
  );
}

function CreateCard({
  title,
  text,
  href,
  icon,
}: {
  title: string;
  text: string;
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={href}
      className="theme-panel group relative min-h-48 overflow-hidden rounded-[1.75rem] p-5 transition-transform hover:-translate-y-1"
    >
      <PitchSvg className="absolute right-[-150px] top-[-90px] h-56 w-[380px] opacity-10" />

      <div className="relative z-10">
        <div className="theme-accent-bg flex h-14 w-14 items-center justify-center rounded-2xl">
          <span className="h-8 w-8">{icon}</span>
        </div>

        <h3 className="mt-5 text-2xl font-black">{title}</h3>
        <p className="theme-text-soft mt-2 text-sm leading-6">{text}</p>

        <div className="theme-accent mt-5 inline-flex items-center gap-2 text-sm font-black">
          Відкрити
          <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function RulesTab() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <section className="grid gap-4">
      <div className="theme-panel rounded-[1.75rem] p-4 sm:p-5">
        <div className="mb-5 flex items-center gap-3">
          <div className="theme-accent-bg flex h-12 w-12 items-center justify-center rounded-2xl">
            <IconBook className="h-6 w-6" />
          </div>

          <div>
            <h2 className="text-xl font-black">Правила гри</h2>
            <p className="theme-muted text-sm">
              Повний гайд по лігах, прогнозах, балах і вкладках.
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <RuleSection
            icon={<IconPlus />}
            title="Як створити гру"
            items={[
              "Перейди у вкладку «Створити».",
              "Обери «Дружня ліга», якщо хочеш грати з друзями.",
              "Після створення гри відкриється окрема сторінка ліги.",
              "У грі можна мати власну назву, учасників, матчі та таблицю.",
              "Інші гравці можуть приєднатися за кодом запрошення.",
            ]}
          />

          <RuleSection
            icon={<IconShield />}
            title="Що дає роль адміна"
            items={[
              "Адмін керує грою та її налаштуваннями.",
              "Може додавати, переглядати й налаштовувати матчі.",
              "Може стежити за прогнозами, результатами та активністю учасників.",
              "Може відкривати адмін-панель конкретної гри.",
              "У майбутньому адмін отримає більше інструментів для керування лігою.",
            ]}
          />

          <RuleSection
            icon={<IconTrophy />}
            title="Нарахування балів"
            items={[
              "Точний рахунок — 3 бали.",
              "Правильний результат без точного рахунку — 1 бал.",
              "Неправильний прогноз — 0 балів.",
              "Якщо для раунду задана вага, бали можуть множитися на вагу раунду.",
              "Основна таблиця лідерів рахується за результатами завершених матчів.",
            ]}
          />

          <RuleSection
            icon={<IconBall />}
            title="Детальний предікт"
            items={[
              "Детальний предікт уже працює візуально.",
              "Там можна прогнозувати схеми, позиції, MVP, авторів голів та інші деталі.",
              "Логіка нарахування балів за детальний предікт ще в процесі розробки.",
              "Поки основні бали нараховуються за звичайний прогноз рахунку.",
            ]}
          />

          <RuleSection
            icon={<IconStar />}
            title="Соло режим"
            items={[
              "Соло режим поки що в розробці.",
              "Ідея режиму — особиста карʼєра за улюблений клуб.",
              "Переживати важливі матчі улюбленрї команди з більшим інтересом.",
              "Зараз основний стабільний режим — дружні ліги.",
            ]}
          />

          <RuleSection
            icon={<IconLive />}
            title="Live і закриття прогнозів"
            items={[
              "До старту матчу можна зробити прогноз.",
              "Після старту матчу прогноз закривається.",
              "Live-матчі показують поточний стан гри.",
              "Після завершення матчу система рахує очки.",
            ]}
          />
        </div>
      </div>

      <div className="theme-panel rounded-[1.75rem] p-4 sm:p-5">
        <div className="mb-4">
          <div className="theme-muted text-[10px] font-black uppercase tracking-[0.18em]">
            Вкладки гри
          </div>
          <h3 className="mt-1 text-xl font-black">Що є всередині гри</h3>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <TabInfoCard
            title="Головна"
            text="Короткий огляд гри, найближчі матчі, швидкі дії та основна активність."
          />
          <TabInfoCard
            title="Матчі"
            text="Список матчів ліги. Тут можна бачити заплановані, live та завершені поєдинки."
          />
          <TabInfoCard
            title="Прогноз"
            text="Основне місце, де гравець ставить рахунок на матч. Саме цей прогноз дає головні бали."
          />
          <TabInfoCard
            title="Детальний предікт"
            text="Розширений прогноз зі схемами, MVP, авторами голів та додатковими деталями. Бали ще допрацьовуються."
          />
          <TabInfoCard
            title="Лідерборд"
            text="Таблиця гравців: очки, форма, точні попадання, останні результати й позиції."
          />
          <TabInfoCard
            title="Учасники"
            text="Список гравців ліги. Тут можна бачити, хто бере участь у грі."
          />
          <TabInfoCard
            title="Налаштування"
            text="Параметри гри, код запрошення, доступи та керування лігою."
          />
          <TabInfoCard
            title="Адмін"
            text="Доступний для адмінів гри. Тут можна керувати матчами, результатами й учасниками."
          />
        </div>
      </div>

      <div className="theme-panel-strong rounded-[1.75rem] p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="theme-accent-bg flex h-12 w-12 items-center justify-center rounded-2xl">
            <IconCheck className="h-6 w-6" />
          </div>

          <div>
            <h3 className="text-xl font-black">Є ідея або побажання?</h3>
            <p className="theme-muted text-sm">
              Напиши, що додати або покращити. Повідомлення прийде на пошту.
            </p>
          </div>
        </div>

        <Form method="post" className="grid gap-3">
          <input type="hidden" name="intent" value="feedback" />

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              placeholder="Твоє імʼя"
              className="theme-card-highlight rounded-2xl px-4 py-3 text-sm outline-none"
            />

            <input
              name="email"
              type="email"
              placeholder="Email для відповіді"
              className="theme-card-highlight rounded-2xl px-4 py-3 text-sm outline-none"
            />
          </div>

          <textarea
            name="message"
            required
            rows={5}
            placeholder="Що хочеш додати, змінити або покращити?"
            className="theme-card-highlight resize-none rounded-2xl px-4 py-3 text-sm outline-none"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="theme-primary-button rounded-2xl px-5 py-3 text-sm font-black disabled:opacity-60"
          >
            {isSubmitting ? "Відправляю..." : "Відправити побажання"}
          </button>

          {actionData?.message ? (
            <div
              className={[
                "rounded-2xl px-4 py-3 text-sm font-bold",
                actionData.ok ? "theme-success-bg" : "theme-card-highlight",
              ].join(" ")}
            >
              {actionData.message}
            </div>
          ) : null}
        </Form>
      </div>
    </section>
  );
}

function RuleSection({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <div className="theme-card-highlight rounded-[1.35rem] p-4">
      <div className="theme-accent mb-4 h-9 w-9">{icon}</div>
      <h3 className="text-lg font-black">{title}</h3>

      <ul className="theme-text-soft mt-3 space-y-2 text-sm leading-6">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="theme-accent mt-1 shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabInfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="theme-card-highlight rounded-[1.25rem] p-4">
      <h4 className="font-black">{title}</h4>
      <p className="theme-text-soft mt-2 text-sm leading-6">{text}</p>
    </div>
  );
}

function RuleCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="theme-card-highlight rounded-[1.35rem] p-4">
      <div className="theme-accent mb-4 h-9 w-9">{icon}</div>
      <div className="text-xl font-black">{title}</div>
      <div className="theme-text-soft mt-1 text-sm">{text}</div>
    </div>
  );
}

function EmptyTabState({
  title,
  text,
  href,
}: {
  title: string;
  text: string;
  href: string;
}) {
  return (
    <div className="theme-card-highlight rounded-[1.35rem] p-5">
      <IconCalendar className="theme-accent h-14 w-14" />
      <h3 className="mt-4 text-xl font-black">{title}</h3>
      <p className="theme-text-soft mt-2 text-sm leading-6">{text}</p>

      <Link
        to={href}
        className="theme-primary-button mt-4 inline-flex rounded-2xl px-4 py-3 text-sm font-black"
      >
        Почати
      </Link>
    </div>
  );
}

function TeamBadge({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="theme-card-highlight flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black">
        {label.slice(0, 3).toUpperCase()}
      </div>
      <div className="max-w-24 truncate text-sm font-black">{label}</div>
    </div>
  );
}

function LobbyBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-[-120px] top-[-120px] h-72 w-72 rounded-full bg-[var(--hero-glow)] opacity-50" />
      <div className="absolute right-[-120px] top-40 h-72 w-72 rounded-full bg-[var(--hero-glow-2)] opacity-50" />
    </div>
  );
}

function PitchSvg({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 500 280" fill="none" className={className} aria-hidden="true">
      <rect
        x="28"
        y="24"
        width="444"
        height="232"
        rx="30"
        stroke="var(--border)"
        strokeWidth="3"
      />
      <path d="M250 24V256" stroke="var(--border)" strokeWidth="3" />
      <circle cx="250" cy="140" r="42" stroke="var(--border)" strokeWidth="3" />
      <circle cx="250" cy="140" r="5" fill="var(--accent)" />
      <path
        d="M28 88H92C108 88 120 100 120 116V164C120 180 108 192 92 192H28"
        stroke="var(--border)"
        strokeWidth="3"
      />
      <path
        d="M472 88H408C392 88 380 100 380 116V164C380 180 392 192 408 192H472"
        stroke="var(--border)"
        strokeWidth="3"
      />
      <path d="M28 116H58V164H28" stroke="var(--border)" strokeWidth="3" />
      <path d="M472 116H442V164H472" stroke="var(--border)" strokeWidth="3" />
    </svg>
  );
}

/* ICONS */

function SvgIcon({
  children,
  className = "h-5 w-5",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function IconBall({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7L16 10L14.5 15H9.5L8 10L12 7Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 10L4.5 9M16 10L19.5 9M9.5 15L8 19M14.5 15L16 19"
        stroke="currentColor"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M12 3L19 6V11C19 16 16 20 12 21C8 20 5 16 5 11V6L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M9 12L11 14L15.5 9.5" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

function IconStar({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M12 3L14.8 8.7L21 9.6L16.5 14L17.6 20.2L12 17.3L6.4 20.2L7.5 14L3 9.6L9.2 8.7L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M12 5V19M5 12H19"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function IconBook({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M5 5.5C5 4.7 5.7 4 6.5 4H20V18H7C5.9 18 5 18.9 5 20V5.5Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M5 20C5 18.9 5.9 18 7 18H20" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

function IconLive({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path
        d="M7 7C4.5 9.5 4.5 14.5 7 17M17 7C19.5 9.5 19.5 14.5 17 17"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7V12L15 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function IconTrophy({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M8 4H16V9C16 12 14.3 14 12 14C9.7 14 8 12 8 9V4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 6H4V8C4 10.2 5.8 12 8 12M16 6H20V8C20 10.2 18.2 12 16 12M12 14V18M9 20H15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 21C5 17 8 15 12 15C16 15 19 17 20 21"
        stroke="currentColor"
        strokeWidth="2"
      />
    </SvgIcon>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M10 5H5V19H10" stroke="currentColor" strokeWidth="2" />
      <path
        d="M14 8L18 12L14 16M18 12H9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M5 12H19M13 6L19 12L13 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect
        x="4"
        y="5"
        width="16"
        height="15"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 3V7M16 3V7M4 10H20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function IconKey({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 12H21M17 12V15M20 12V15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function IconWhistle({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M5 10H14L19 6V15C19 17.8 16.8 20 14 20H10C7.2 20 5 17.8 5 15V10Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="15" r="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 10L3 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconBoot({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M5 6H11L13 13H19V17H8C6.3 17 5 15.7 5 14V6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 17V20M14 17V20M18 17V20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </SvgIcon>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M5 12.5L10 17L19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}