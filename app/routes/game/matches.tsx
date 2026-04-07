import {
  Link,
  useLoaderData,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type TeamLike = {
  id: string;
  name: string;
  shortName?: string | null;
  tla?: string | null;
  logo?: string | null;
  slug?: string | null;
};

type TournamentLike = {
  id: string;
  name: string;
  logo?: string | null;
  slug?: string | null;
  country?: string | null;
};

type MatchItem = {
  id: string;
  status: string;
  startTime: Date | string;
  homeScore: number | null;
  awayScore: number | null;
  stageLabel?: string | null;
  matchdayLabel?: string | null;
  homeTeam: TeamLike;
  awayTeam: TeamLike;
  tournament?: TournamentLike | null;
  round?: {
    id: string;
    name: string;
  } | null;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const gameMatches = await prisma.gameMatch.findMany({
    where: { gameId },
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
      match: {
        startTime: "desc",
      },
    },
  });

  const matches = gameMatches.map((item) => item.match);

  const upcomingMatches = matches
    .filter((match) => match.status === "SCHEDULED")
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

  const liveMatches = matches
    .filter((match) => match.status === "LIVE")
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

  const finishedMatches = matches
    .filter((match) => match.status === "FINISHED")
    .sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

  const canceledMatches = matches
    .filter((match) => match.status === "CANCELED")
    .sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

  const postponedMatches = matches
    .filter((match) => match.status === "POSTPONED")
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

  return data({
    currentUser,
    gameId,
    upcomingMatches,
    liveMatches,
    finishedMatches,
    canceledMatches,
    postponedMatches,
    counts: {
      upcoming: upcomingMatches.length,
      live: liveMatches.length,
      finished: finishedMatches.length,
      canceled: canceledMatches.length,
      postponed: postponedMatches.length,
      total: matches.length,
    },
  });
}

function formatMatchDate(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(date));
}

function formatMatchTime(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getStatusLabel(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "Скоро";
    case "LIVE":
      return "LIVE";
    case "FINISHED":
      return "Готово";
    case "CANCELED":
      return "Стоп";
    case "POSTPONED":
      return "Пауза";
    default:
      return status;
  }
}

function getStatusDotClass(status: string) {
  switch (status) {
    case "LIVE":
      return "bg-red-400";
    case "FINISHED":
      return "bg-emerald-400";
    case "POSTPONED":
      return "bg-amber-400";
    case "CANCELED":
      return "bg-zinc-400";
    default:
      return "bg-white/40";
  }
}

function getTeamLogoSrc(team: TeamLike) {
  if (team.logo) return team.logo;
  if (team.shortName) return `/teams/${team.shortName}.svg`;
  return null;
}

function getTournamentLogoSrc(tournament?: TournamentLike | null) {
  if (!tournament) return null;
  if (tournament.logo) return `/teams/${tournament.logo}.svg`;
  return null;
}

function getTournamentSubLabel(match: MatchItem) {
  return match.round?.name || match.stageLabel || match.matchdayLabel || null;
}

function StatPill({
  icon,
  value,
  tone = "default",
}: {
  icon: React.ReactNode;
  value: number;
  tone?: "default" | "live" | "done" | "warn" | "muted";
}) {
  const tones = {
    default: "border-white/10 bg-white/5 text-white/80",
    live: "border-red-500/20 bg-red-500/10 text-red-200",
    done: "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
    warn: "border-amber-500/20 bg-amber-500/10 text-amber-200",
    muted: "border-zinc-500/20 bg-zinc-500/10 text-zinc-300",
  };

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${tones[tone]}`}
    >
      <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
      <span>{value}</span>
    </div>
  );
}

function NavIconLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
    >
      <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </a>
  );
}

function TeamCell({
  team,
  align = "left",
}: {
  team: TeamLike;
  align?: "left" | "right";
}) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${
        align === "right" ? "justify-end text-right" : ""
      }`}
    >
      {align === "right" && (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white sm:text-sm">
            {team.shortName || team.name}
          </div>
        </div>
      )}

      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 sm:h-10 sm:w-10">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={team.name}
            className="h-5 w-5 object-contain sm:h-6 sm:w-6"
            loading="lazy"
          />
        ) : (
          <span className="text-[9px] font-bold text-white/55 sm:text-[10px]">
            {team.tla || team.name.slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>

      {align === "left" && (
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-white sm:text-sm">
            {team.shortName || team.name}
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentBadge({
  tournament,
  label,
}: {
  tournament?: TournamentLike | null;
  label?: string | null;
}) {
  if (!tournament && !label) return null;

  const logoSrc = getTournamentLogoSrc(tournament);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tournament && (
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={tournament.name}
                className="h-3 w-3 object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-[8px] font-bold text-black/70">
                {tournament.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <span className="max-w-[120px] truncate text-[11px] text-white/70 sm:max-w-none">
            {tournament.name}
          </span>
        </div>
      )}

      {label ? (
        <div className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-1 text-[11px] text-white/50">
          {label}
        </div>
      ) : null}
    </div>
  );
}

function MatchRow({
  match,
  gameId,
}: {
  match: MatchItem;
  gameId: string;
}) {
  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "LIVE";
  const tournamentSubLabel = getTournamentSubLabel(match);

  return (
    <Link
      to={`/games/${gameId}/matches/${match.id}`}
      className="block rounded-3xl border border-white/8 bg-white/[0.04] px-3 py-3 transition hover:border-white/15 hover:bg-white/[0.07]"
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/45">
          <div className="min-w-0">
            <TournamentBadge
              tournament={match.tournament}
              label={tournamentSubLabel}
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span>{formatMatchDate(match.startTime)}</span>
            <span className="text-white/20">•</span>
            <span>{formatMatchTime(match.startTime)}</span>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamCell team={match.homeTeam} align="left" />

          <div className="flex min-w-[68px] flex-col items-center justify-center">
            <div className="text-lg font-black tracking-tight text-white sm:text-xl">
              {isFinished || isLive
                ? `${match.homeScore ?? 0}:${match.awayScore ?? 0}`
                : "vs"}
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-white/55">
              <span
                className={`h-2 w-2 rounded-full ${getStatusDotClass(
                  match.status
                )}`}
              />
              <span>{getStatusLabel(match.status)}</span>
            </div>
          </div>

          <TeamCell team={match.awayTeam} align="right" />
        </div>
      </div>
    </Link>
  );
}

function MatchesGroup({
  id,
  title,
  count,
  matches,
  emptyText,
  gameId,
}: {
  id: string;
  title: string;
  count: number;
  matches: MatchItem[];
  emptyText: string;
  gameId: string;
}) {
  return (
    <section id={id} className="space-y-2.5 scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-white sm:text-lg">{title}</h2>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/55">
          {count}
        </span>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-white/40">
          {emptyText}
        </div>
      ) : (
        <div className="space-y-2">
          {matches.map((match) => (
            <MatchRow key={match.id} match={match} gameId={gameId} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function MatchesPage() {
  const {
    gameId,
    upcomingMatches,
    liveMatches,
    finishedMatches,
    canceledMatches,
    postponedMatches,
    counts,
  } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-black tracking-tight text-white">
              Матчі
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/45">
              <span>{counts.total} всього</span>
              <span className="text-white/20">•</span>
              <span>{counts.live} live</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <NavIconLink
              href="#upcoming"
              label="Скоро"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 fill-none stroke-current stroke-2"
                >
                  <circle cx="12" cy="12" r="8" />
                  <path d="M12 8v5l3 2" />
                </svg>
              }
            />

            <NavIconLink
              href="#live"
              label="Live"
              icon={
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                  <circle cx="12" cy="12" r="5" />
                </svg>
              }
            />

            <NavIconLink
              href="#finished"
              label="Готово"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 fill-none stroke-current stroke-2"
                >
                  <path d="M5 12l4 4L19 6" />
                </svg>
              }
            />

            {counts.postponed > 0 && (
              <NavIconLink
                href="#postponed"
                label="Пауза"
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 fill-none stroke-current stroke-2"
                  >
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 8v5l3 2" />
                  </svg>
                }
              />
            )}

            {counts.canceled > 0 && (
              <NavIconLink
                href="#canceled"
                label="Стоп"
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 fill-none stroke-current stroke-2"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                }
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatPill
            value={counts.total}
            icon={
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-none stroke-current stroke-2"
              >
                <circle cx="12" cy="12" r="8" />
                <path d="M9 9l3-2 3 2v3l-3 2-3-2z" />
              </svg>
            }
          />

          <StatPill
            value={counts.upcoming}
            tone="default"
            icon={
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-none stroke-current stroke-2"
              >
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v5l3 2" />
              </svg>
            }
          />

          <StatPill
            value={counts.live}
            tone="live"
            icon={
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
                <circle cx="12" cy="12" r="6" />
              </svg>
            }
          />

          <StatPill
            value={counts.finished}
            tone="done"
            icon={
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-none stroke-current stroke-2"
              >
                <path d="M5 12l4 4L19 6" />
              </svg>
            }
          />

          {counts.postponed > 0 && (
            <StatPill
              value={counts.postponed}
              tone="warn"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 fill-none stroke-current stroke-2"
                >
                  <path d="M12 7v5l3 2" />
                  <circle cx="12" cy="12" r="8" />
                </svg>
              }
            />
          )}

          {counts.canceled > 0 && (
            <StatPill
              value={counts.canceled}
              tone="muted"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 fill-none stroke-current stroke-2"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              }
            />
          )}
        </div>
      </section>

      <MatchesGroup
        id="upcoming"
        title="Скоро"
        count={counts.upcoming}
        matches={upcomingMatches}
        emptyText="Порожньо"
        gameId={gameId}
      />

      <MatchesGroup
        id="live"
        title="LIVE"
        count={counts.live}
        matches={liveMatches}
        emptyText="Зараз немає"
        gameId={gameId}
      />

      <MatchesGroup
        id="finished"
        title="Готово"
        count={counts.finished}
        matches={finishedMatches}
        emptyText="Поки немає"
        gameId={gameId}
      />

      {counts.postponed > 0 && (
        <MatchesGroup
          id="postponed"
          title="Пауза"
          count={counts.postponed}
          matches={postponedMatches}
          emptyText="Немає"
          gameId={gameId}
        />
      )}

      {counts.canceled > 0 && (
        <MatchesGroup
          id="canceled"
          title="Стоп"
          count={counts.canceled}
          matches={canceledMatches}
          emptyText="Немає"
          gameId={gameId}
        />
      )}
    </div>
  );
}