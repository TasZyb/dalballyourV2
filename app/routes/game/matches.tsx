import {
  Link,
  useLoaderData,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { useState } from "react";
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

type SectionTone = "live" | "upcoming" | "done" | "warn" | "muted";

const LIVE_STATUSES = ["LIVE", "IN_PLAY", "PAUSED", "HALFTIME", "BREAK"];
const UPCOMING_STATUSES = ["SCHEDULED", "TIMED"];
const FINISHED_STATUSES = ["FINISHED"];
const CANCELED_STATUSES = ["CANCELED", "CANCELLED"];
const POSTPONED_STATUSES = ["POSTPONED"];

function isLiveStatus(status: string) {
  return LIVE_STATUSES.includes(status);
}

function isFinishedStatus(status: string) {
  return FINISHED_STATUSES.includes(status);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const gameMatches = await prisma.gameMatch.findMany({
    where: { gameId },
    select: {
      match: {
        select: {
          id: true,
          status: true,
          startTime: true,
          homeScore: true,
          awayScore: true,
          stageLabel: true,
          matchdayLabel: true,
          tournament: {
            select: {
              id: true,
              name: true,
              logo: true,
              slug: true,
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
              logo: true,
              code: true,
            },
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
              shortName: true,
              logo: true,
              code: true,
            },
          },
        },
      },
    },
    orderBy: {
      match: {
        startTime: "asc",
      },
    },
  });

  const matches = gameMatches.map((item) => ({
    ...item.match,
    homeTeam: {
      ...item.match.homeTeam,
      tla: item.match.homeTeam.code,
    },
    awayTeam: {
      ...item.match.awayTeam,
      tla: item.match.awayTeam.code,
    },
  }));

  const liveMatches = matches
    .filter((match) => LIVE_STATUSES.includes(match.status))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));

  const upcomingMatches = matches
    .filter((match) => UPCOMING_STATUSES.includes(match.status))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));

  const finishedMatches = matches
    .filter((match) => FINISHED_STATUSES.includes(match.status))
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));

  const canceledMatches = matches
    .filter((match) => CANCELED_STATUSES.includes(match.status))
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime));

  const postponedMatches = matches
    .filter((match) => POSTPONED_STATUSES.includes(match.status))
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));

  return data({
    currentUser,
    gameId,
    liveMatches,
    upcomingMatches,
    finishedMatches,
    canceledMatches,
    postponedMatches,
    counts: {
      live: liveMatches.length,
      upcoming: upcomingMatches.length,
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
    case "TIMED":
      return "Скоро";
    case "LIVE":
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
    case "HALFTIME":
    case "BREAK":
      return "Перерва";
    case "FINISHED":
      return "Завершено";
    case "CANCELED":
    case "CANCELLED":
      return "Скасовано";
    case "POSTPONED":
      return "Перенесено";
    default:
      return status;
  }
}

function getTeamLogoSrc(team: TeamLike) {
  if (team.logo) return team.logo;
  if (team.shortName) return `/teams/${team.shortName}.svg`;
  if (team.tla) return `/teams/${team.tla}.svg`;
  return null;
}

function getTournamentLogoSrc(tournament?: TournamentLike | null) {
  if (!tournament?.logo) return null;

  return tournament.logo.startsWith("/")
    ? tournament.logo
    : `/teams/${tournament.logo}.svg`;
}

function getTournamentSubLabel(match: MatchItem) {
  return match.round?.name || match.stageLabel || match.matchdayLabel || null;
}

function getSectionStyle(tone: SectionTone) {
  switch (tone) {
    case "live":
      return {
        panel: "border-red-400/20 bg-red-500/[0.045]",
        title: "text-[var(--danger-readable)]",
        badge:
          "bg-[var(--danger-soft)] text-[var(--danger-readable)] ring-[color-mix(in_srgb,var(--danger)_28%,transparent)]",
        line: "from-[var(--danger)]",
        row: "border-red-400/15 hover:bg-red-500/[0.08]",
        score: "text-[var(--danger-readable)]",
      };

    case "upcoming":
      return {
        panel: "border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-[var(--accent-soft)]",
        title: "text-[var(--accent-text)]",
        badge:
          "bg-[var(--accent-soft)] text-[var(--accent-text)] ring-[color-mix(in_srgb,var(--accent)_28%,transparent)]",
        line: "from-[var(--accent)]",
        row: "border-[color-mix(in_srgb,var(--accent)_16%,transparent)] hover:bg-[var(--accent-soft)]",
        score: "text-[var(--text)]",
      };

    case "done":
      return {
        panel: "border-emerald-400/15 bg-emerald-500/[0.035]",
        title: "text-[var(--success-readable)]",
        badge:
          "bg-[var(--success-soft)] text-[var(--success-readable)] ring-[color-mix(in_srgb,var(--success)_28%,transparent)]",
        line: "from-[var(--success)]",
        row: "border-emerald-400/10 opacity-85 hover:opacity-100 hover:bg-emerald-500/[0.05]",
        score: "text-[var(--success-readable)]",
      };

      case "warn":
        return {
          panel: "border-amber-400/15 bg-amber-500/[0.04]",
          title: "text-[var(--warning-readable)]",
          badge:
            "bg-[var(--warning-soft)] text-[var(--warning-readable)] ring-[color-mix(in_srgb,var(--warning)_28%,transparent)]",
          line: "from-[var(--warning)]",
          row: "border-amber-400/10 hover:bg-amber-500/[0.06]",
          score: "text-[var(--warning-readable)]",
        };

    case "muted":
      return {
        panel: "border-[var(--border)] bg-[var(--card-highlight)]",
        title: "text-[var(--muted)]",
        badge:
          "bg-[var(--card-highlight)] text-[var(--text-soft)] ring-[var(--border)]",
        line: "from-[var(--muted)]",
        row: "border-[var(--border)] opacity-75 hover:opacity-95 hover:bg-[var(--card-highlight)]",
        score: "text-[var(--text-soft)]",
      };
  }
}

function TeamLogo({ team }: { team: TeamLike }) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel)]">
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={team.name}
          className="h-5 w-5 object-contain"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-[9px] font-black text-[var(--text-soft)]">
          {(team.tla || team.shortName || team.name).slice(0, 3).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function TeamLine({
  team,
  align = "left",
}: {
  team: TeamLike;
  align?: "left" | "right";
}) {
  return (
    <div
      className={[
        "flex min-w-0 items-center gap-2",
        align === "right" ? "justify-end text-right" : "",
      ].join(" ")}
    >
      {align === "left" && <TeamLogo team={team} />}

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-[var(--text)]">
          {team.shortName || team.name}
        </div>

        <div className="truncate text-[10px] text-[var(--muted)]">
          {team.name}
        </div>
      </div>

      {align === "right" && <TeamLogo team={team} />}
    </div>
  );
}

function MatchMeta({ match }: { match: MatchItem }) {
  const label = getTournamentSubLabel(match);
  const logoSrc = getTournamentLogoSrc(match.tournament);

  return (
    <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--muted)]">
      {match.tournament ? (
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90 ring-1 ring-black/5">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={match.tournament.name}
                className="h-3.5 w-3.5 object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="text-[8px] font-black text-black/70">
                {match.tournament.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <span className="max-w-[140px] truncate">
            {match.tournament.name}
          </span>
        </div>
      ) : null}

      {label ? <span className="truncate opacity-70">• {label}</span> : null}
    </div>
  );
}

function StatusBadge({
  status,
  tone,
}: {
  status: string;
  tone: SectionTone;
}) {
  const style = getSectionStyle(tone);

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ring-1",
        style.badge,
      ].join(" ")}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {getStatusLabel(status)}
    </span>
  );
}

function MatchRow({
  match,
  gameId,
  tone,
  featured = false,
}: {
  match: MatchItem;
  gameId: string;
  tone: SectionTone;
  featured?: boolean;
}) {
  const style = getSectionStyle(tone);
  const hasScore = isFinishedStatus(match.status) || isLiveStatus(match.status);

  return (
    <Link
      to={`/games/${gameId}/matches/${match.id}`}
      className={[
        "block rounded-3xl border p-3 transition sm:p-4",
        "bg-[var(--panel)] hover:border-[var(--border-strong)]",
        style.row,
        featured ? "shadow-lg shadow-black/10" : "",
      ].join(" ")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <MatchMeta match={match} />

        <div className="shrink-0 text-right text-[10px] font-bold text-[var(--muted)]">
          {formatMatchDate(match.startTime)} ·{" "}
          {formatMatchTime(match.startTime)}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamLine team={match.homeTeam} />

        <div className="flex min-w-[82px] flex-col items-center">
          <div
            className={[
              "font-black tracking-tight",
              style.score,
              featured ? "text-3xl sm:text-4xl" : "text-2xl",
            ].join(" ")}
          >
            {hasScore
              ? `${match.homeScore ?? 0}:${match.awayScore ?? 0}`
              : "VS"}
          </div>

          <div className="mt-1">
            <StatusBadge status={match.status} tone={tone} />
          </div>
        </div>

        <TeamLine team={match.awayTeam} align="right" />
      </div>
    </Link>
  );
}

function SectionIcon({ tone }: { tone: SectionTone }) {
  if (tone === "live") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
        <circle cx="12" cy="12" r="5" />
      </svg>
    );
  }

  if (tone === "upcoming") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 fill-none stroke-current stroke-2"
      >
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
      </svg>
    );
  }

  if (tone === "done") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 fill-none stroke-current stroke-2"
      >
        <path d="M5 12l4 4L19 6" />
      </svg>
    );
  }

  if (tone === "warn") {
    return (
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 fill-none stroke-current stroke-2"
      >
        <path d="M12 7v5l3 2" />
        <circle cx="12" cy="12" r="8" />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 fill-none stroke-current stroke-2"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function MatchSection({
  id,
  title,
  subtitle,
  tone,
  matches,
  gameId,
  emptyText,
  initialVisible = 4,
}: {
  id: string;
  title: string;
  subtitle: string;
  tone: SectionTone;
  matches: MatchItem[];
  gameId: string;
  emptyText: string;
  initialVisible?: number;
}) {
  const [visible, setVisible] = useState(initialVisible);
  const style = getSectionStyle(tone);
  const visibleMatches = matches.slice(0, visible);
  const canShowMore = visible < matches.length;

  return (
    <section
      id={id}
      className={[
        "scroll-mt-24 rounded-[2rem] border p-4 sm:p-5",
        style.panel,
      ].join(" ")}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={["mt-0.5", style.title].join(" ")}>
            <SectionIcon tone={tone} />
          </div>

          <div>
            <h2 className={["text-lg font-black", style.title].join(" ")}>
              {title}
            </h2>

            <p className="mt-0.5 text-sm text-[var(--text-soft)]">
              {subtitle}
            </p>
          </div>
        </div>

        <div
          className={[
            "rounded-full px-3 py-1 text-xs font-black ring-1",
            style.badge,
          ].join(" ")}
        >
          {matches.length}
        </div>
      </div>

      <div
        className={[
          "mb-4 h-px bg-gradient-to-r to-transparent opacity-60",
          style.line,
        ].join(" ")}
      />

      {matches.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--text-soft)]">
          {emptyText}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visibleMatches.map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                gameId={gameId}
                tone={tone}
              />
            ))}
          </div>

          {canShowMore ? (
            <button
              type="button"
              onClick={() => setVisible((prev) => prev + 4)}
              className={[
                "mt-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition hover:bg-[var(--panel-strong)]",
                style.title,
              ].join(" ")}
            >
              Показати ще
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function TinyJump({
  href,
  label,
  count,
  tone,
}: {
  href: string;
  label: string;
  count: number;
  tone: SectionTone;
}) {
  const style = getSectionStyle(tone);

  return (
    <a
      href={href}
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.12em] ring-1 transition hover:bg-[var(--panel-strong)]",
        style.badge,
      ].join(" ")}
    >
      <span>{label}</span>
      <span className="opacity-70">{count}</span>
    </a>
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

  const heroMatch = liveMatches[0] || upcomingMatches[0] || null;

  const heroTone: SectionTone =
    heroMatch && isLiveStatus(heroMatch.status) ? "live" : "upcoming";

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="theme-panel rounded-[2rem] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="theme-muted text-xs font-black uppercase tracking-[0.25em]">
              Game matches
            </div>

            <h1 className="mt-2 text-3xl font-black tracking-tight text-[var(--text)]">
              Матчі
            </h1>

            <p className="mt-1 text-sm text-[var(--text-soft)]">
              Розділено по статусах, щоб не змішувати майбутні, live та
              завершені матчі.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <TinyJump
              href="#live"
              label="LIVE"
              count={counts.live}
              tone="live"
            />

            <TinyJump
              href="#upcoming"
              label="Скоро"
              count={counts.upcoming}
              tone="upcoming"
            />

            <TinyJump
              href="#finished"
              label="Готово"
              count={counts.finished}
              tone="done"
            />

            {counts.postponed > 0 ? (
              <TinyJump
                href="#postponed"
                label="Пауза"
                count={counts.postponed}
                tone="warn"
              />
            ) : null}

            {counts.canceled > 0 ? (
              <TinyJump
                href="#canceled"
                label="Стоп"
                count={counts.canceled}
                tone="muted"
              />
            ) : null}
          </div>
        </div>
      </section>

      {heroMatch ? (
        <section className="theme-panel rounded-[2rem] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-[var(--text)]">
                {isLiveStatus(heroMatch.status)
                  ? "Матч прямо зараз"
                  : "Найближчий матч"}
              </h2>

              <p className="text-sm text-[var(--text-soft)]">
                Головний матч винесено окремо, але він також залишається у
                своєму списку нижче.
              </p>
            </div>
          </div>

          <MatchRow
            match={heroMatch}
            gameId={gameId}
            tone={heroTone}
            featured
          />
        </section>
      ) : null}

      <MatchSection
        id="live"
        title="LIVE матчі"
        subtitle="Усі матчі, які зараз у грі або на перерві."
        tone="live"
        matches={liveMatches}
        gameId={gameId}
        emptyText="Зараз немає live матчів."
        initialVisible={4}
      />

      <MatchSection
        id="upcoming"
        title="Найближчі матчі"
        subtitle="Усі майбутні матчі гри."
        tone="upcoming"
        matches={upcomingMatches}
        gameId={gameId}
        emptyText="Найближчих матчів поки немає."
        initialVisible={6}
      />

      <MatchSection
        id="finished"
        title="Завершені матчі"
        subtitle="Історія зіграних матчів та результатів."
        tone="done"
        matches={finishedMatches}
        gameId={gameId}
        emptyText="Завершених матчів ще немає."
        initialVisible={4}
      />

      {counts.postponed > 0 ? (
        <MatchSection
          id="postponed"
          title="Перенесені матчі"
          subtitle="Матчі, які тимчасово поставлені на паузу."
          tone="warn"
          matches={postponedMatches}
          gameId={gameId}
          emptyText="Перенесених матчів немає."
          initialVisible={4}
        />
      ) : null}

      {counts.canceled > 0 ? (
        <MatchSection
          id="canceled"
          title="Скасовані матчі"
          subtitle="Матчі, які більше не активні."
          tone="muted"
          matches={canceledMatches}
          gameId={gameId}
          emptyText="Скасованих матчів немає."
          initialVisible={4}
        />
      ) : null}
    </div>
  );
}