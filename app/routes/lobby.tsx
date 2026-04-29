import { Link, Form, data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { useMemo, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type NextMatch = {
  id: string;
  startTime: Date;
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
  }).format(new Date(value));
}

function getSoonestGame(games: LobbyGame[]) {
  return [...games]
    .filter((game) => game.nextMatch)
    .sort((a, b) => {
      const aTime = new Date(a.nextMatch!.startTime).getTime();
      const bTime = new Date(b.nextMatch!.startTime).getTime();
      return aTime - bTime;
    })[0] ?? null;
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
    const predictedMatchIds = new Set(game.predictions.map((prediction) => prediction.matchId));

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
      favoriteTeamName: game.favoriteTeam?.shortName || game.favoriteTeam?.name || null,
      favoriteTeamLogo: game.favoriteTeam?.logo ?? null,
      membersCount: game._count.members,
      matchesCount: game._count.gameMatches,
      liveMatchesCount,
      finishedMatchesCount,
      pendingPredictionsCount,
      submittedPredictionsCount: game.predictions.length,
      exactHitsCount: game.predictions.filter((prediction) => prediction.wasExact).length,
      nextMatch: nextMatchRaw
        ? {
            id: nextMatchRaw.match.id,
            startTime: nextMatchRaw.match.startTime,
            homeTeam:
              nextMatchRaw.match.homeTeam.shortName || nextMatchRaw.match.homeTeam.name,
            awayTeam:
              nextMatchRaw.match.awayTeam.shortName || nextMatchRaw.match.awayTeam.name,
            status: nextMatchRaw.match.status,
          }
        : null,
    };
  });

  const leagueGames = games.filter((game) => game.mode === "GROUP");
  const careerGames = games.filter((game) => game.mode === "CAREER");

  return data({
    currentUser,
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

export default function LobbyPage() {
  const { currentUser, leagueGames, careerGames, stats } = useLoaderData<typeof loader>();
  const [activeTab, setActiveTab] = useState<LobbyTab>("leagues");

  const soonestLeagueGame = useMemo(() => getSoonestGame(leagueGames), [leagueGames]);
  const soonestCareerGame = useMemo(() => getSoonestGame(careerGames), [careerGames]);

  if (!currentUser) {
    return <GuestLobby />;
  }

  return (
    <main className="theme-page relative overflow-hidden px-3 py-3 sm:px-5 sm:py-5">
      <LobbyBackground />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-4">
        <LobbyHeader currentUser={currentUser} />

        <CompactOverview stats={stats} />

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
            emptyText="Режим у процесі розробки, тут ще поки нічого нема, але лишнім разом не буде нагадати, шо вІНІСІУС ПІДАР"
            createHref="/create/career"
            createLabel="Почати кар’єру"
            soonestGame={soonestCareerGame}
            games={careerGames}
          />
        ) : null}

        {activeTab === "create" ? <CreateTab /> : null}

        {activeTab === "rules" ? <RulesTab /> : null}
      </div>
    </main>
  );
}

function GuestLobby() {
  return (
    <main className="theme-page relative overflow-hidden px-4 py-6">
      <LobbyBackground />

      <div className="relative mx-auto flex min-h-[70vh] max-w-4xl items-center">
        <div className="theme-panel-strong relative w-full overflow-hidden rounded-[2rem] p-6 sm:p-8">
          <PitchSvg className="absolute inset-0 h-full w-full opacity-30" />

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
                className="rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-black text-white transition hover:opacity-90"
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
  currentUser: { displayName?: string | null; name?: string | null; email?: string | null } | null;
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
    <section className="grid grid-cols-5 gap-2">
      <StatPill icon={<IconShield />} label="Ліги" value={stats.leagueGamesCount} />
      <StatPill icon={<IconStar />} label="Соло" value={stats.careerGamesCount} />
      <StatPill icon={<IconLive />} label="Live" value={stats.totalLiveMatches} />
      <StatPill icon={<IconClock />} label="Прогн." value={stats.totalPendingPredictions} />
      <StatPill icon={<IconTrophy />} label="Точні" value={stats.totalExactHits} />
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
    <div className="theme-panel flex min-h-20 flex-col items-center justify-center rounded-[1.25rem] px-2 py-3 text-center">
      <div className="theme-accent mb-1 h-5 w-5">{icon}</div>
      <div className="text-xl font-black leading-none">{value}</div>
      <div className="theme-muted mt-1 text-[10px] font-bold uppercase tracking-[0.12em]">
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
  const tabs: { id: LobbyTab; label: string; icon: React.ReactNode }[] = [
    { id: "leagues", label: "Ліги", icon: <IconShield /> },
    { id: "solo", label: "Соло", icon: <IconStar /> },
    { id: "create", label: "Створити", icon: <IconPlus /> },
    { id: "rules", label: "Правила", icon: <IconBook /> },
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
              "flex items-center justify-center gap-2 rounded-[1.15rem] px-2 py-3 text-xs font-black transition sm:text-sm",
              isActive
                ? "bg-[var(--accent)] text-white shadow-lg shadow-black/20"
                : "theme-muted hover:bg-[var(--panel-strong)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            <span className="h-4 w-4">{tab.icon}</span>
            {tab.label}
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

          <Link to={createHref} className="theme-button rounded-2xl px-3 py-2 text-xs font-black">
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
      <PitchSvg className="absolute inset-0 h-full w-full opacity-20" />

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
                  <span className="font-black">{formatMatchDate(game.nextMatch.startTime)}</span>
                </div>
              </div>
            </div>

            <Link
              to={`/games/${game.id}`}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-black text-white transition hover:opacity-90"
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

function CompactGameRow({ game, type }: { game: LobbyGame; type: "league" | "solo" }) {
  const initials = useMemo(() => {
    return game.name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [game.name]);

  const progress =
    game.matchesCount > 0
      ? Math.round((game.finishedMatchesCount / game.matchesCount) * 100)
      : 0;

  return (
    <Link
      to={`/games/${game.id}`}
      className="group theme-card-highlight grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[1.25rem] p-3 transition hover:bg-[var(--panel-strong)]"
    >
      <div className="theme-accent-bg flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl font-black">
        {type === "solo" && game.favoriteTeamLogo ? (
          <img
            src={game.favoriteTeamLogo}
            alt={game.favoriteTeamName || game.name}
            className="h-8 w-8 object-contain"
          />
        ) : game.avatarUrl ? (
          <img src={game.avatarUrl} alt={game.name} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate font-black">{game.name}</div>

        <div className="theme-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
          <span>{type === "solo" ? game.favoriteTeamName || "Career" : game.linkedTournamentName || "League"}</span>
          <span>{game.membersCount} гравців</span>
          <span>{game.pendingPredictionsCount} без прогнозу</span>
        </div>

        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--panel)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-all"
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
            {formatMatchDate(game.nextMatch.startTime)}
          </span>
        ) : (
          <IconArrow className="theme-muted h-5 w-5 transition group-hover:translate-x-0.5" />
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
      className="theme-panel group relative min-h-48 overflow-hidden rounded-[1.75rem] p-5 transition hover:-translate-y-1"
    >
      <PitchSvg className="absolute inset-0 h-full w-full opacity-10" />

      <div className="relative z-10">
        <div className="theme-accent-bg flex h-14 w-14 items-center justify-center rounded-2xl">
          <span className="h-8 w-8">{icon}</span>
        </div>

        <h3 className="mt-5 text-2xl font-black">{title}</h3>
        <p className="theme-text-soft mt-2 text-sm leading-6">{text}</p>

        <div className="theme-accent mt-5 inline-flex items-center gap-2 text-sm font-black">
          Відкрити
          <IconArrow className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function RulesTab() {
  return (
    <section className="theme-panel rounded-[1.75rem] p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="theme-accent-bg flex h-12 w-12 items-center justify-center rounded-2xl">
          <IconBook className="h-6 w-6" />
        </div>

        <div>
          <h2 className="text-xl font-black">Правила гри</h2>
          <p className="theme-muted text-sm">Коротко, без зайвого тексту.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <RuleCard icon={<IconTrophy />} title="3 бали" text="Точний рахунок." />
        <RuleCard icon={<IconCheck />} title="1 бал" text="Правильний результат." />
        <RuleCard icon={<IconLive />} title="Live" text="Матч закрився — прогноз не змінюємо." />
      </div>
    </section>
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
        className="mt-4 inline-flex rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-black text-white"
      >
        Почати
      </Link>
    </div>
  );
}

function TeamBadge({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="theme-panel flex h-14 w-14 items-center justify-center rounded-2xl text-sm font-black">
        {label.slice(0, 3).toUpperCase()}
      </div>
      <div className="max-w-24 truncate text-sm font-black">{label}</div>
    </div>
  );
}

function LobbyBackground() {
  return (
    <div className="pointer-events-none fixed inset-0">
      <div className="absolute left-[-12%] top-[-12%] h-80 w-80 rounded-full bg-[var(--hero-glow)] blur-3xl" />
      <div className="absolute right-[-10%] top-[18%] h-72 w-72 rounded-full bg-[var(--hero-glow-2)] blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.08))]" />
    </div>
  );
}

function PitchSvg({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 500 280" fill="none" className={className} aria-hidden="true">
      <rect x="28" y="24" width="444" height="232" rx="30" stroke="var(--border)" strokeWidth="3" />
      <path d="M250 24V256" stroke="var(--border)" strokeWidth="3" />
      <circle cx="250" cy="140" r="42" stroke="var(--border)" strokeWidth="3" />
      <circle cx="250" cy="140" r="5" fill="var(--accent)" />
      <path d="M28 88H92C108 88 120 100 120 116V164C120 180 108 192 92 192H28" stroke="var(--border)" strokeWidth="3" />
      <path d="M472 88H408C392 88 380 100 380 116V164C380 180 392 192 408 192H472" stroke="var(--border)" strokeWidth="3" />
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
      <path d="M12 7L16 10L14.5 15H9.5L8 10L12 7Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10L4.5 9M16 10L19.5 9M9.5 15L8 19M14.5 15L16 19" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

function IconShield({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M12 3L19 6V11C19 16 16 20 12 21C8 20 5 16 5 11V6L12 3Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 12L11 14L15.5 9.5" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

function IconStar({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M12 3L14.8 8.7L21 9.6L16.5 14L17.6 20.2L12 17.3L6.4 20.2L7.5 14L3 9.6L9.2 8.7L12 3Z" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

function IconPlus({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconBook({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M5 5.5C5 4.7 5.7 4 6.5 4H20V18H7C5.9 18 5 18.9 5 20V5.5Z" stroke="currentColor" strokeWidth="2" />
      <path d="M5 20C5 18.9 5.9 18 7 18H20" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

function IconLive({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M7 7C4.5 9.5 4.5 14.5 7 17M17 7C19.5 9.5 19.5 14.5 17 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconTrophy({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M8 4H16V9C16 12 14.3 14 12 14C9.7 14 8 12 8 9V4Z" stroke="currentColor" strokeWidth="2" />
      <path d="M8 6H4V8C4 10.2 5.8 12 8 12M16 6H20V8C20 10.2 18.2 12 16 12M12 14V18M9 20H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconUser({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21C5 17 8 15 12 15C16 15 19 17 20 21" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

function IconLogout({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M10 5H5V19H10" stroke="currentColor" strokeWidth="2" />
      <path d="M14 8L18 12L14 16M18 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconArrow({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M5 12H19M13 6L19 12L13 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </SvgIcon>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 3V7M16 3V7M4 10H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconKey({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M12 12H21M17 12V15M20 12V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconWhistle({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M5 10H14L19 6V15C19 17.8 16.8 20 14 20H10C7.2 20 5 17.8 5 15V10Z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="15" r="2" stroke="currentColor" strokeWidth="2" />
      <path d="M5 10L3 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconBoot({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M5 6H11L13 13H19V17H8C6.3 17 5 15.7 5 14V6Z" stroke="currentColor" strokeWidth="2" />
      <path d="M9 17V20M14 17V20M18 17V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconCheck({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path d="M5 12.5L10 17L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </SvgIcon>
  );
}