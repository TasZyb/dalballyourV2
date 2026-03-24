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
    take: 100,
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

  return data({
    currentUser,
    gameId,
    upcomingMatches,
    liveMatches,
    finishedMatches,
    canceledMatches,
    counts: {
      upcoming: upcomingMatches.length,
      live: liveMatches.length,
      finished: finishedMatches.length,
      canceled: canceledMatches.length,
      total: matches.length,
    },
  });
}

function formatMatchDate(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
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
      return "Завершено";
    case "CANCELED":
      return "Скасовано";
    case "POSTPONED":
      return "Перенесено";
    default:
      return status;
  }
}

function getStatusClasses(status: string) {
  switch (status) {
    case "LIVE":
      return "bg-red-500/15 text-red-300 border-red-500/20";
    case "FINISHED":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/20";
    case "SCHEDULED":
      return "bg-white/8 text-white/70 border-white/10";
    case "CANCELED":
      return "bg-zinc-500/15 text-zinc-300 border-zinc-500/20";
    case "POSTPONED":
      return "bg-amber-500/15 text-amber-300 border-amber-500/20";
    default:
      return "bg-white/8 text-white/70 border-white/10";
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
          <div className="hidden truncate text-[10px] text-white/45 sm:block sm:text-[11px]">
            {team.tla || team.name}
          </div>
        </div>
      )}

      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 sm:h-9 sm:w-9">
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
          <div className="hidden truncate text-[10px] text-white/45 sm:block sm:text-[11px]">
            {team.tla || team.name}
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
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5">
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

          <span className="max-w-[140px] truncate text-[11px] text-white/75 sm:max-w-none">
            {tournament.name}
          </span>
        </div>
      )}

      {label ? (
        <div className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/55">
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
      to={`/games/${gameId}/predict?matchId=${match.id}`}
      className="block rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.05] sm:px-3.5 sm:py-3"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TournamentBadge
            tournament={match.tournament}
            label={tournamentSubLabel}
          />

          <div className="flex shrink-0 items-center gap-2 text-[11px] text-white/40 sm:text-xs">
            <span>{formatMatchDate(match.startTime)}</span>
            <span className="text-white/20">•</span>
            <span>{formatMatchTime(match.startTime)}</span>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
          <TeamCell team={match.homeTeam} align="left" />

          <div className="flex min-w-[70px] flex-col items-center justify-center sm:min-w-[78px]">
            <div className="text-base font-black tracking-tight text-white sm:text-lg">
              {isFinished || isLive
                ? `${match.homeScore ?? 0} : ${match.awayScore ?? 0}`
                : "vs"}
            </div>

            <div
              className={`mt-0.5 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] ${getStatusClasses(
                match.status
              )}`}
            >
              {getStatusLabel(match.status)}
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
    <section id={id} className="space-y-3 scroll-mt-24">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white sm:text-xl">{title}</h2>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
          {count}
        </span>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-white/45">
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
    counts,
  } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
              Matches
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Усі матчі гри
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Простий список усіх матчів цієї гри: найближчі, live, завершені та
              скасовані.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="#upcoming"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Скоро
            </a>
            <a
              href="#live"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              LIVE
            </a>
            <a
              href="#finished"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Завершені
            </a>
            {counts.canceled > 0 && (
              <a
                href="#canceled"
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                Скасовані
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              Усього
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {counts.total}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-white/35">
              Скоро
            </div>
            <div className="mt-2 text-2xl font-black text-white">
              {counts.upcoming}
            </div>
          </div>

          <div className="rounded-2xl border border-red-500/10 bg-red-500/[0.06] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-red-200/60">
              LIVE
            </div>
            <div className="mt-2 text-2xl font-black text-red-200">
              {counts.live}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.06] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/60">
              Завершені
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-200">
              {counts.finished}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-500/10 bg-zinc-500/[0.06] p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-200/60">
              Скасовані
            </div>
            <div className="mt-2 text-2xl font-black text-zinc-200">
              {counts.canceled}
            </div>
          </div>
        </div>
      </section>

      <MatchesGroup
        id="upcoming"
        title="Найближчі матчі"
        count={counts.upcoming}
        matches={upcomingMatches}
        emptyText="Майбутніх матчів зараз немає."
        gameId={gameId}
      />

      <MatchesGroup
        id="live"
        title="LIVE матчі"
        count={counts.live}
        matches={liveMatches}
        emptyText="LIVE матчів зараз немає."
        gameId={gameId}
      />

      <MatchesGroup
        id="finished"
        title="Завершені матчі"
        count={counts.finished}
        matches={finishedMatches}
        emptyText="Завершених матчів поки що немає."
        gameId={gameId}
      />

      {counts.canceled > 0 && (
        <MatchesGroup
          id="canceled"
          title="Скасовані матчі"
          count={counts.canceled}
          matches={canceledMatches}
          emptyText="Скасованих матчів немає."
          gameId={gameId}
        />
      )}
    </div>
  );
}