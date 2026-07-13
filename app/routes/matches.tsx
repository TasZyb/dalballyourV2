import {
  Form,
  Link,
  data,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import { useMemo, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import {
  getTeamDisplayName,
  getTeamFlagEmoji,
  getTeamLogoSrc,
  getTournamentLogoSrc,
} from "~/lib/logo-utils";

type TeamLike = {
  id: string;
  name: string;
  shortName?: string | null;
  code?: string | null;
  tla?: string | null;
  logo?: string | null;
  country?: string | null;
};

type TournamentLike = {
  id: string;
  name: string;
  logo?: string | null;
  country?: string | null;
};

type MatchItem = {
  id: string;
  status: string;
  startTime: string;
  homeScore: number | null;
  awayScore: number | null;
  stageLabel: string | null;
  matchdayLabel: string | null;
  homeTeam: TeamLike;
  awayTeam: TeamLike;
  tournament: TournamentLike | null;
  round: { id: string; name: string } | null;
  userGameId: string | null;
};

type TournamentFilter = {
  id: string;
  name: string;
  logo?: string | null;
  count: number;
};

type DateTab = {
  key: string;
  day: string;
  label: string;
  isToday: boolean;
};

const LIVE_STATUSES = ["LIVE", "IN_PLAY", "PAUSED", "HALFTIME", "BREAK"];
const UPCOMING_STATUSES = ["SCHEDULED", "TIMED"];
const FINISHED_STATUSES = ["FINISHED"];

function isLiveStatus(status: string) {
  return LIVE_STATUSES.includes(status);
}

function isUpcomingStatus(status: string) {
  return UPCOMING_STATUSES.includes(status);
}

function isFinishedStatus(status: string) {
  return FINISHED_STATUSES.includes(status);
}

function toDateInputValue(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(date);
}

function formatDateLabel(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(date));
}

function formatWeekdayLabel(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    weekday: "short",
    timeZone: "Europe/Kyiv",
  })
    .format(new Date(date))
    .replace(".", "");
}

function formatTimeLabel(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(date));
}

function getMatchDateKey(date: Date | string) {
  return toDateInputValue(new Date(date));
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateInputValue(date);
}

function buildDateTabs(todayKey: string): DateTab[] {
  return Array.from({ length: 10 }, (_, index) => {
    const offset = index - 3;
    const key = addDays(todayKey, offset);
    const date = `${key}T12:00:00.000Z`;

    return {
      key,
      day: formatDateLabel(date),
      label: offset === 0 ? "Сьогодні" : formatWeekdayLabel(date),
      isToday: offset === 0,
    };
  });
}

function getStatusLabel(status: string) {
  if (isLiveStatus(status)) return "Live";
  if (isUpcomingStatus(status)) return "Майбутній";
  if (isFinishedStatus(status)) return "FT";
  if (status === "POSTPONED") return "Перенесено";
  if (status === "CANCELED" || status === "CANCELLED") return "Скасовано";
  return status;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  const to = new Date(now);
  to.setDate(to.getDate() + 45);

  const userGameIds = currentUser
    ? (
        await prisma.gameMember.findMany({
          where: {
            userId: currentUser.id,
            status: "ACTIVE",
          },
          select: {
            gameId: true,
          },
        })
      ).map((membership) => membership.gameId)
    : [];

  const matchesRaw = await prisma.match.findMany({
    where: {
      startTime: {
        gte: from,
        lte: to,
      },
      status: {
        notIn: ["CANCELED", "POSTPONED"],
      },
    },
    include: {
      tournament: {
        select: {
          id: true,
          name: true,
          logo: true,
          country: true,
        },
      },
      round: {
        select: {
          id: true,
          name: true,
        },
      },
      homeTeam: {
        select: {
          id: true,
          name: true,
          shortName: true,
          code: true,
          logo: true,
          country: true,
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          shortName: true,
          code: true,
          logo: true,
          country: true,
        },
      },
      gameMatches: {
        where: {
          gameId: {
            in: userGameIds,
          },
        },
        select: {
          gameId: true,
        },
        take: 1,
      },
    },
    orderBy: {
      startTime: "asc",
    },
    take: 180,
  });

  const matches: MatchItem[] = matchesRaw.map((match) => ({
    id: match.id,
    status: match.status,
    startTime: match.startTime.toISOString(),
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    stageLabel: match.stageLabel,
    matchdayLabel: match.matchdayLabel,
    tournament: match.tournament,
    round: match.round,
    homeTeam: {
      ...match.homeTeam,
      tla: match.homeTeam.code,
    },
    awayTeam: {
      ...match.awayTeam,
      tla: match.awayTeam.code,
    },
    userGameId: "gameMatches" in match ? match.gameMatches[0]?.gameId ?? null : null,
  }));

  return data({
    currentUser: currentUser
      ? {
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          displayName: currentUser.displayName,
        }
      : null,
    matches,
    todayKey: toDateInputValue(now),
  });
}

export default function MatchesPage() {
  const { currentUser, matches, todayKey } = useLoaderData<typeof loader>();
  const dateTabs = useMemo(() => buildDateTabs(todayKey), [todayKey]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("all");
  const [selectedDate, setSelectedDate] = useState(() => {
    const tabDateKeys = new Set(dateTabs.map((tab) => tab.key));
    const nearestMatch = matches.find((match) => {
      const key = getMatchDateKey(match.startTime);
      return key >= todayKey && tabDateKeys.has(key);
    });

    return nearestMatch ? getMatchDateKey(nearestMatch.startTime) : todayKey;
  });

  const visibleMatches = useMemo(() => {
    return matches.filter((match) => {
      const tournamentMatches =
        selectedTournamentId === "all" ||
        match.tournament?.id === selectedTournamentId;
      const dateMatches = getMatchDateKey(match.startTime) === selectedDate;

      return tournamentMatches && dateMatches;
    });
  }, [matches, selectedDate, selectedTournamentId]);

  const matchesForDate = useMemo(
    () => matches.filter((match) => getMatchDateKey(match.startTime) === selectedDate),
    [matches, selectedDate]
  );

  const tournamentFilters = useMemo(() => {
    const tournamentsById = new Map<string, TournamentFilter>();

    for (const match of matchesForDate) {
      if (!match.tournament) continue;

      const current = tournamentsById.get(match.tournament.id);

      tournamentsById.set(match.tournament.id, {
        id: match.tournament.id,
        name: match.tournament.name,
        logo: match.tournament.logo,
        count: (current?.count ?? 0) + 1,
      });
    }

    return [...tournamentsById.values()].sort((a, b) => b.count - a.count);
  }, [matchesForDate]);

  return (
    <main className="theme-page relative min-h-screen overflow-hidden px-3 pb-28 pt-4 sm:px-5 sm:py-6">
      <MatchesBackground />

      <div className="relative mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-5xl flex-col gap-4 sm:min-h-[calc(100dvh-3rem)]">
        <MatchesHeader currentUser={currentUser} />

        <section className="flex min-h-[calc(100dvh-15rem)] flex-1 flex-col rounded-[1.75rem] border border-[var(--border)] bg-[var(--panel)] p-3 shadow-2xl shadow-black/10 sm:min-h-[calc(100dvh-12rem)] sm:p-5">
          <DateTabs
            tabs={dateTabs}
            selectedDate={selectedDate}
            onChange={(date) => {
              setSelectedDate(date);
              setSelectedTournamentId("all");
            }}
          />

          <TournamentFilters
            tournaments={tournamentFilters}
            selectedTournamentId={selectedTournamentId}
            totalCount={matchesForDate.length}
            onChange={setSelectedTournamentId}
          />

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-2">
              {visibleMatches.length ? (
                visibleMatches.map((match) => (
                  <GlobalMatchCard key={match.id} match={match} />
                ))
              ) : (
                <div className="rounded-[1.25rem] bg-[var(--card-highlight)] p-5 text-sm font-semibold theme-text-soft">
                  На цей фільтр матчів немає. Спробуй іншу дату або турнір.
                </div>
              )}
            </div>
          </div>
        </section>

        <MatchesBottomNav active="matches" />
      </div>
    </main>
  );
}

function MatchesHeader({
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
    <header className="grid grid-cols-[auto_1fr_auto] items-center gap-3 pt-1 sm:gap-5">
      <Link
        to="/"
        className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] bg-[var(--panel-strong)] shadow-xl shadow-black/10 sm:h-28 sm:w-28 sm:rounded-[1.75rem]"
        aria-label="Lobby"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent-text)] sm:h-16 sm:w-16">
          <IconBall className="h-7 w-7 sm:h-10 sm:w-10" />
        </div>
      </Link>

      <div className="min-w-0">
        <div className="theme-accent text-sm font-black uppercase tracking-[0.18em]">
          Lobby
        </div>
        <h1 className="mt-1 truncate text-3xl font-black leading-none sm:text-5xl">
          Predict League
        </h1>
        <div className="mt-3 h-2 max-w-md overflow-hidden rounded-full bg-[var(--panel-strong)]">
          <div className="h-full w-2/3 rounded-full bg-[var(--accent)]" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <Link
          to="/me"
          className="hidden h-14 min-w-14 items-center justify-center rounded-2xl bg-[var(--panel-strong)] px-4 text-sm font-black text-[var(--text-soft)] transition hover:bg-[var(--card-highlight)] hover:text-[var(--text)] sm:inline-flex sm:h-16 sm:min-w-16"
          title={displayName}
          aria-label="Профіль"
        >
          <IconUser className="h-7 w-7" />
        </Link>

        <Form method="post" action="/logout">
          <button
            type="submit"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--panel-strong)] text-[var(--text-soft)] transition hover:bg-[var(--card-highlight)] hover:text-[var(--text)] sm:h-16 sm:w-16"
            aria-label="Вийти"
          >
            <IconLogout className="h-7 w-7" />
          </button>
        </Form>
      </div>
    </header>
  );
}

function DateTabs({
  tabs,
  selectedDate,
  onChange,
}: {
  tabs: DateTab[];
  selectedDate: string;
  onChange: (date: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => {
        const isActive = selectedDate === tab.key;

        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={[
              "flex min-h-14 min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-[1rem] px-3 text-xs font-black transition",
              isActive
                ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                : "theme-muted hover:bg-[var(--panel-strong)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            <span className="text-[10px] uppercase tracking-[0.12em]">{tab.label}</span>
            <span className="mt-0.5 text-sm">{tab.day}</span>
            {tab.isToday ? (
              <span className="mt-1 h-1 w-6 rounded-full bg-current opacity-70" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function MatchStatusDot({ status }: { status: string }) {
  const isLive = isLiveStatus(status);
  const isFinished = isFinishedStatus(status);
  const label = getStatusLabel(status);

  return (
    <span
      className={[
        "relative flex h-3.5 w-3.5 shrink-0 rounded-full",
        isLive
          ? "bg-[var(--danger)]"
          : isFinished
            ? "bg-[var(--success)]"
            : "bg-[var(--accent)]",
      ].join(" ")}
      title={label}
      aria-label={label}
    >
      {isLive ? (
        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--danger)] opacity-40" />
      ) : null}
    </span>
  );
}

function TeamIcon({ team }: { team: TeamLike }) {
  const logoSrc = getTeamLogoSrc(team);
  const flag = getTeamFlagEmoji(team);
  const name = getTeamDisplayName(team);
  const fallback = (team.code || team.tla || team.shortName || team.name)
    .slice(0, 3)
    .toUpperCase();

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--panel)] transition group-hover:bg-[var(--panel-strong)] sm:h-10 sm:w-10"
      title={name}
      aria-label={name}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={name}
          className="h-6 w-6 object-contain sm:h-7 sm:w-7"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-lg leading-none">{flag || fallback}</span>
      )}
    </span>
  );
}

function TournamentFilters({
  tournaments,
  selectedTournamentId,
  totalCount,
  onChange,
}: {
  tournaments: TournamentFilter[];
  selectedTournamentId: string;
  totalCount: number;
  onChange: (id: string) => void;
}) {
  const visible = tournaments.slice(0, 4);

  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      <TournamentChip
        label="Всі"
        count={totalCount}
        active={selectedTournamentId === "all"}
        onClick={() => onChange("all")}
      />

      {visible.map((tournament) => (
        <TournamentChip
          key={tournament.id}
          label={tournament.name}
          count={tournament.count}
          logo={tournament.logo}
          active={selectedTournamentId === tournament.id}
          onClick={() => onChange(tournament.id)}
        />
      ))}
    </div>
  );
}

function TournamentChip({
  label,
  count,
  logo,
  active,
  onClick,
}: {
  label: string;
  count: number;
  logo?: string | null;
  active: boolean;
  onClick: () => void;
}) {
  const logoSrc = getTournamentLogoSrc({ logo });

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex min-h-12 shrink-0 items-center gap-2 rounded-[1rem] px-3 text-sm font-black transition",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
          : "text-[var(--text-soft)] hover:bg-[var(--panel-strong)]",
      ].join(" ")}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--panel-strong)]">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={label}
            className="h-5 w-5 object-contain"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="text-[10px] font-black">{label.slice(0, 2).toUpperCase()}</span>
        )}
      </span>
      <span className="max-w-32 truncate">{label}</span>
      <span className="rounded-full bg-[var(--panel-strong)] px-2 py-0.5 text-xs">
        {count}
      </span>
    </button>
  );
}

function GlobalMatchCard({ match }: { match: MatchItem }) {
  const homeName = getTeamDisplayName(match.homeTeam);
  const awayName = getTeamDisplayName(match.awayTeam);
  const matchDate = formatDateLabel(match.startTime);
  const matchTime = formatTimeLabel(match.startTime);

  return (
    <div
      className="group flex min-h-[3.45rem] items-center gap-2 rounded-[1.05rem] bg-[var(--card-highlight)] px-3 py-2 transition hover:bg-[var(--panel-strong)] sm:min-h-[3.75rem] sm:gap-3 sm:px-4"
      title={`${homeName} - ${awayName}`}
      aria-label={`Матч ${homeName} проти ${awayName}`}
    >
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--accent-text)]"
        aria-label="Додати матч в очікувані"
        title="Додати матч в очікувані"
      >
        <IconStar className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TeamIcon team={match.homeTeam} />

        <span className="shrink-0 text-[10px] font-black uppercase text-[var(--muted)] sm:text-xs">
          vs
        </span>

        <TeamIcon team={match.awayTeam} />
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span
          className="text-xs font-black text-[var(--text-soft)] sm:text-sm"
          title={matchTime}
        >
          {matchDate}
        </span>
        <MatchStatusDot status={match.status} />
      </div>
    </div>
  );
}

function MatchesBottomNav({ active }: { active: "game" | "matches" | "tables" | "account" }) {
  const items = [
    { id: "game", label: "Лобі", href: "/", icon: <IconHome /> },
    { id: "matches", label: "Матчі", href: "/matches", icon: <IconCalendar /> },
    { id: "tables", label: "Таблиця", href: "/tables", icon: <IconTable /> },
    { id: "account", label: "Акаунт", href: "/me", icon: <IconUser /> },
  ];

  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[1.35rem] bg-[var(--panel)]/95 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-xl sm:sticky sm:inset-x-auto sm:bottom-0 sm:max-w-none sm:rounded-[1.5rem] sm:p-2">
      {items.map((item) => (
        <Link
          key={item.id}
          to={item.href}
          className={[
            "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-[1rem] text-[11px] font-bold transition-colors sm:min-h-14 sm:text-sm",
            item.id === active
              ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
              : "theme-muted hover:bg-[var(--panel-strong)] hover:text-[var(--text)]",
          ].join(" ")}
        >
          <span className="h-6 w-6 sm:h-7 sm:w-7">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function MatchesBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-[-140px] top-[-140px] h-80 w-80 rounded-full bg-[var(--hero-glow)] opacity-45" />
      <div className="absolute right-[-140px] top-44 h-80 w-80 rounded-full bg-[var(--hero-glow-2)] opacity-45" />
    </div>
  );
}

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

function IconHome({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <path
        d="M4 11L12 4L20 11V20H15V14H9V20H4V11Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}

function IconTable({ className }: { className?: string }) {
  return (
    <SvgIcon className={className}>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M4 10H20M10 4V20M15 4V20" stroke="currentColor" strokeWidth="2" />
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
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}
