import { Link, useLoaderData, data, type LoaderFunctionArgs } from "react-router";
import { Form } from "react-router";
import { useMemo, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type LobbyGameCard = {
  id: string;
  name: string;
  slug: string | null;
  inviteCode: string;
  visibility: string;
  status: string;
  membersCount: number;
  matchesCount: number;
  ownerId: string;
  ownerName: string;
  linkedTournamentName: string | null;
  createdAt: Date;
  bannerUrl: string | null;
  avatarUrl: string | null;

  liveMatchesCount: number;
  finishedMatchesCount: number;
  pendingPredictionsCount: number;
  submittedPredictionsCount: number;
  exactHitsCount: number;

  nextMatch: {
    id: string;
    startTime: Date;
    homeTeam: string;
    awayTeam: string;
    status: string;
  } | null;
};

function isMatchClosed(match: {
  status: string;
  startTime: Date | string;
}) {
  const startTime = new Date(match.startTime);
  const now = new Date();

  if (match.status === "FINISHED" || match.status === "CANCELED" || match.status === "POSTPONED") {
    return true;
  }

  return startTime <= now;
}

function formatMatchDate(value: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return data({
      currentUser: null,
      games: [],
      stats: null,
      spotlight: null,
    });
  }

  const now = new Date();

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
                  tournament: true,
                  round: true,
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
              wasOutcomeOnly: true,
              wasWrong: true,
              submittedAt: true,
            },
          },
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  const games: LobbyGameCard[] = memberships.map((membership) => {
    const gameMatches = membership.game.gameMatches;
    const predictions = membership.game.predictions;

    const predictedMatchIds = new Set(predictions.map((prediction) => prediction.matchId));

    const nextMatchRaw =
      gameMatches.find((gm) => {
        const start = new Date(gm.match.startTime);
        return (
          start >= now &&
          gm.match.status !== "FINISHED" &&
          gm.match.status !== "CANCELED" &&
          gm.match.status !== "POSTPONED"
        );
      }) ?? null;

    const liveMatchesCount = gameMatches.filter((gm) => gm.match.status === "LIVE").length;

    const finishedMatchesCount = gameMatches.filter(
      (gm) => gm.match.status === "FINISHED"
    ).length;

    const pendingPredictionsCount = gameMatches.filter((gm) => {
      if (gm.isLocked) return false;
      if (isMatchClosed(gm.match)) return false;
      return !predictedMatchIds.has(gm.match.id);
    }).length;

    return {
      id: membership.game.id,
      name: membership.game.name,
      slug: membership.game.slug,
      inviteCode: membership.game.inviteCode,
      visibility: membership.game.visibility,
      status: membership.game.status,
      membersCount: membership.game._count.members,
      matchesCount: membership.game._count.gameMatches,
      ownerId: membership.game.ownerId,
      ownerName:
        membership.game.owner.displayName ||
        membership.game.owner.name ||
        membership.game.owner.email ||
        "Гравець",
      linkedTournamentName: membership.game.linkedTournament?.name ?? null,
      createdAt: membership.game.createdAt,
      bannerUrl: membership.game.bannerUrl ?? null,
      avatarUrl: membership.game.avatarUrl ?? null,
      liveMatchesCount,
      finishedMatchesCount,
      pendingPredictionsCount,
      submittedPredictionsCount: predictions.length,
      exactHitsCount: predictions.filter((prediction) => prediction.wasExact).length,
      nextMatch: nextMatchRaw
        ? {
            id: nextMatchRaw.match.id,
            startTime: nextMatchRaw.match.startTime,
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

  const ownerGamesCount = memberships.filter(
    (membership) => membership.role === "OWNER" || membership.role === "ADMIN"
  ).length;

  const totalMatches = games.reduce((sum, game) => sum + game.matchesCount, 0);
  const totalPendingPredictions = games.reduce(
    (sum, game) => sum + game.pendingPredictionsCount,
    0
  );
  const totalLiveMatches = games.reduce(
    (sum, game) => sum + game.liveMatchesCount,
    0
  );
  const totalExactHits = games.reduce((sum, game) => sum + game.exactHitsCount, 0);

  const spotlight =
    [...games]
      .filter((game) => game.liveMatchesCount > 0 || game.nextMatch)
      .sort((a, b) => {
        if (a.liveMatchesCount > 0 && b.liveMatchesCount === 0) return -1;
        if (a.liveMatchesCount === 0 && b.liveMatchesCount > 0) return 1;

        const aTime = a.nextMatch ? new Date(a.nextMatch.startTime).getTime() : Infinity;
        const bTime = b.nextMatch ? new Date(b.nextMatch.startTime).getTime() : Infinity;

        return aTime - bTime;
      })[0] ?? null;

  return data({
    currentUser,
    games,
    spotlight,
    stats: {
      gamesCount: games.length,
      ownerGamesCount,
      totalMatches,
      totalPendingPredictions,
      totalLiveMatches,
      totalExactHits,
    },
  });
}

function LeagueLogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Soccer ball logo"
    >
      <defs>
        <radialGradient
          id="ballBody"
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          gradientTransform="translate(24 20) rotate(45) scale(34)"
        >
          <stop offset="0%" stopColor="#33424D" />
          <stop offset="100%" stopColor="#0F1B23" />
        </radialGradient>

        <linearGradient id="ballStroke" x1="10" y1="8" x2="54" y2="56">
          <stop offset="0%" stopColor="#FF9A2F" />
          <stop offset="100%" stopColor="#D87008" />
        </linearGradient>

        <linearGradient id="ballHighlight" x1="18" y1="14" x2="34" y2="30">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>

        <filter id="ballShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="3"
            floodColor="#000000"
            floodOpacity="0.28"
          />
        </filter>
      </defs>

      <g filter="url(#ballShadow)">
        <circle
          cx="32"
          cy="32"
          r="23"
          fill="url(#ballBody)"
          stroke="url(#ballStroke)"
          strokeWidth="2.8"
        />
        <ellipse cx="27" cy="22" rx="13" ry="8" fill="url(#ballHighlight)" />

        <path
          d="M32 22.4L38.3 27L35.9 34.3H28.1L25.7 27L32 22.4Z"
          fill="#1A2831"
          stroke="url(#ballStroke)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        <path
          d="M32 16.6L39.6 19.7L38.3 27L32 22.4L25.7 27L24.4 19.7L32 16.6Z"
          fill="#263641"
          stroke="url(#ballStroke)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        <path
          d="M19.5 23.2L24.4 19.7L25.7 27L21.6 34.1L15.8 31.3L15.2 25.9L19.5 23.2Z"
          fill="#15232B"
          stroke="url(#ballStroke)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        <path
          d="M44.5 23.2L39.6 19.7L38.3 27L42.4 34.1L48.2 31.3L48.8 25.9L44.5 23.2Z"
          fill="#18262F"
          stroke="url(#ballStroke)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        <path
          d="M21.6 34.1L28.1 34.3L31 41.6L25.8 47.1L18.8 42.7L17.7 37.7L21.6 34.1Z"
          fill="#122029"
          stroke="url(#ballStroke)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        <path
          d="M42.4 34.1L35.9 34.3L33 41.6L38.2 47.1L45.2 42.7L46.3 37.7L42.4 34.1Z"
          fill="#13222B"
          stroke="url(#ballStroke)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        <path
          d="M31 41.6H33L38.2 47.1L32 51.2L25.8 47.1L31 41.6Z"
          fill="#172730"
          stroke="url(#ballStroke)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        <path
          d="M18.2 20.4C15.8 22.7 14.2 25.8 13.8 29.4L17.6 25.3L18.2 20.4Z"
          fill="#F8FAFC"
          opacity="0.95"
        />
        <path
          d="M45.8 20.4C48.2 22.7 49.8 25.8 50.2 29.4L46.4 25.3L45.8 20.4Z"
          fill="#F8FAFC"
          opacity="0.95"
        />
        <path
          d="M20.4 44.4C23.4 47.1 27.5 48.8 32 49.1C28.4 48.7 25.2 47.7 22.6 45.8L20.4 44.4Z"
          fill="#F8FAFC"
          opacity="0.95"
        />
        <path
          d="M43.6 44.4C40.6 47.1 36.5 48.8 32 49.1C35.6 48.7 38.8 47.7 41.4 45.8L43.6 44.4Z"
          fill="#F8FAFC"
          opacity="0.95"
        />
      </g>
    </svg>
  );
}

function IconBook({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M6 5.5C6 4.67 6.67 4 7.5 4H18a1 1 0 0 1 1 1v13.5a1 1 0 0 1-1 1H8.2A2.2 2.2 0 0 0 6 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 5.5V21M6 5.5C6 6.33 6.67 7 7.5 7H19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUser({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.75 19.25C5.9 16.84 8.47 15.25 12 15.25s6.1 1.59 7.25 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconLogout({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M10 4H6.75A1.75 1.75 0 0 0 5 5.75v12.5C5 19.22 5.78 20 6.75 20H10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPlus({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconEnter({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M14 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 12H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSpark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HeaderIconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/7 text-white/80 transition hover:bg-white/12 hover:text-white active:scale-[0.98] sm:h-11 sm:w-11 sm:rounded-2xl"
    >
      {children}
    </button>
  );
}

function HelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b1018] shadow-2xl shadow-black/50 sm:rounded-[2rem]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]" />

        <div className="relative z-10 p-4 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-white/40 sm:text-[11px]">
                Інструкція
              </div>
              <h3 className="mt-2 text-xl font-black text-white sm:text-3xl">
                Як користуватись лігою
              </h3>
            </div>

            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 sm:rounded-[1.5rem]">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-black text-white">
                1
              </div>
              <h4 className="text-base font-black text-white">Створи або зайди</h4>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Створи свою гру або приєднайся до існуючої по коду.
              </p>
            </div>

            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 sm:rounded-[1.5rem]">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-black text-white">
                2
              </div>
              <h4 className="text-base font-black text-white">Відкрий лігу</h4>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Усередині будуть матчі, таблиця, учасники та прогнози.
              </p>
            </div>

            <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 sm:rounded-[1.5rem]">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-black text-white">
                3
              </div>
              <h4 className="text-base font-black text-white">Роби прогнози</h4>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Вгадуй рахунки, набирай бали та змагайся з друзями.
              </p>
            </div>
          </div>

          <div className="mt-5 flex justify-end sm:mt-6">
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
            >
              Зрозуміло
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageSection({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="min-w-0">
          {subtitle ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40 sm:text-xs">
              {subtitle}
            </div>
          ) : null}
          <h2 className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">
            {title}
          </h2>
        </div>

        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {children}
    </section>
  );
}

function EmptyGamesState() {
  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b1018] px-4 py-5 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:px-6 sm:py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.12),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]" />

      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60 sm:text-[11px]">
          Поки порожньо
        </div>

        <h4 className="mt-3 text-xl font-black sm:mt-4 sm:text-3xl">
          У тебе ще немає жодної гри
        </h4>

        <p className="mt-2 max-w-xl text-sm leading-6 text-white/65 sm:mt-3 sm:text-base">
          Створи свою лігу або приєднайся до вже існуючої по коду.
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5 sm:mt-6 sm:gap-3">
          <Link
            to="/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:opacity-90 sm:rounded-2xl sm:px-5 sm:py-3"
          >
            <IconPlus className="h-4 w-4" />
            Створити
          </Link>

          <Link
            to="/join"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 sm:rounded-2xl sm:px-5 sm:py-3"
          >
            <IconEnter className="h-4 w-4" />
            Приєднатися
          </Link>
        </div>
      </div>
    </div>
  );
}

function CardPitchLines() {
  return (
    <svg
      viewBox="0 0 400 260"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <rect x="24" y="24" width="352" height="212" rx="28" stroke="rgba(255,255,255,0.08)" />
      <path d="M200 24V236" stroke="rgba(255,255,255,0.07)" />
      <circle cx="200" cy="130" r="34" stroke="rgba(255,255,255,0.08)" />
      <path
        d="M24 82H74C88 82 100 94 100 108V152C100 166 88 178 74 178H24"
        stroke="rgba(255,255,255,0.07)"
      />
      <path
        d="M376 82H326C312 82 300 94 300 108V152C300 166 312 178 326 178H376"
        stroke="rgba(255,255,255,0.07)"
      />
    </svg>
  );
}

function GameAvatar({
  avatarUrl,
  fallback,
}: {
  avatarUrl: string | null;
  fallback: string;
}) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={fallback}
        className="h-12 w-12 rounded-2xl border border-white/10 object-cover shadow-lg shadow-black/30 sm:h-14 sm:w-14"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-lg shadow-black/30 sm:h-14 sm:w-14">
      <LeagueLogoMark className="h-8 w-8 sm:h-9 sm:w-9" />
    </div>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.05] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black text-white">{value}</div>
    </div>
  );
}

function CardTinyStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.05] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function SpotlightPanel({
  spotlight,
  stats,
}: {
  spotlight: LobbyGameCard | null;
  stats: {
    gamesCount: number;
    ownerGamesCount: number;
    totalMatches: number;
    totalPendingPredictions: number;
    totalLiveMatches: number;
    totalExactHits: number;
  };
}) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1018] p-5 shadow-2xl shadow-black/30 sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]" />
      <CardPitchLines />

      <div className="relative z-10 grid gap-6 lg:grid-cols-[1.5fr_0.95fr]">
        <div>
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            Ігрове лобі
          </div>

          <h2 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
            Заходь у гру, лови матчі й не пропускай свої прогнози
          </h2>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base sm:leading-7">
            Тут швидкий доступ до всіх твоїх ліг: live-матчі, незроблені прогнози,
            найближчі ігри та короткий огляд сезону.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniMetric label="Ліг" value={stats.gamesCount} />
            <MiniMetric label="LIVE" value={stats.totalLiveMatches} />
            <MiniMetric label="Без прогнозу" value={stats.totalPendingPredictions} />
            <MiniMetric label="Точних влучань" value={stats.totalExactHits} />
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-white/10 bg-black/25 p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F58212]">
            <IconSpark className="h-4 w-4" />
            Фокус зараз
          </div>

          {spotlight ? (
            <>
              <div className="mt-3 text-2xl font-black text-white">
                {spotlight.name}
              </div>

              <div className="mt-1 text-sm text-white/55">
                {spotlight.linkedTournamentName || "Custom league"}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2.5">
                <CardTinyStat label="Гравців" value={spotlight.membersCount} />
                <CardTinyStat label="LIVE" value={spotlight.liveMatchesCount} />
              </div>

              <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs text-white/45">Найближча подія</div>

                {spotlight.nextMatch ? (
                  <>
                    <div className="mt-2 text-base font-black text-white">
                      {spotlight.nextMatch.homeTeam} — {spotlight.nextMatch.awayTeam}
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      {formatMatchDate(spotlight.nextMatch.startTime)}
                    </div>
                  </>
                ) : (
                  <div className="mt-2 text-sm text-white/55">
                    Зараз немає найближчого запланованого матчу.
                  </div>
                )}
              </div>

              <Link
                to={`/games/${spotlight.id}`}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
              >
                Відкрити лігу
              </Link>
            </>
          ) : (
            <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60">
              Поки ще немає активної ліги з матчами або live-рухом.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PremiumGameCard({ game }: { game: LobbyGameCard }) {
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
      className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b1018] shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1.5 hover:border-white/20 sm:rounded-[2rem]"
    >
      {game.bannerUrl ? (
        <>
          <img
            src={game.bannerUrl}
            alt={game.name}
            className="absolute inset-0 h-full w-full object-cover opacity-25 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-35"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,18,0.12),rgba(7,10,18,0.72),rgba(7,10,18,0.95))]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_24%),linear-gradient(135deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]" />
      )}

      <div className="absolute inset-0 opacity-60">
        <CardPitchLines />
      </div>

      <div className="relative z-10 flex h-full flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <GameAvatar avatarUrl={game.avatarUrl} fallback={game.name} />

            <div className="min-w-0">
              <div className="truncate text-lg font-black text-white">
                {game.name}
              </div>

              <div className="mt-1 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/60">
                  {game.linkedTournamentName || "Custom league"}
                </span>

                {game.liveMatchesCount > 0 ? (
                  <span className="animate-pulse rounded-full border border-red-400/20 bg-red-400/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-200">
                    LIVE {game.liveMatchesCount}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-right">
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/40">
              Код
            </div>
            <div className="mt-1 text-sm font-black tracking-[0.16em] text-white">
              {game.inviteCode}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <CardTinyStat label="Гравців" value={game.membersCount} />
          <CardTinyStat label="Матчів" value={game.matchesCount} />
          <CardTinyStat label="Точних" value={game.exactHitsCount} />
        </div>

        {game.pendingPredictionsCount > 0 ? (
          <div className="mt-4 rounded-[1.1rem] border border-amber-400/20 bg-amber-400/10 px-3.5 py-3 text-sm font-medium text-amber-100">
            Треба зробити ще {game.pendingPredictionsCount} прогноз(и)
          </div>
        ) : (
          <div className="mt-4 rounded-[1.1rem] border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm font-medium text-emerald-100">
            Усі доступні прогнози по цій лізі вже закриті або зроблені
          </div>
        )}

        <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-black/25 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/45">Прогрес прогнозів</div>
            <div className="text-xs font-semibold text-white/75">{progress}%</div>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-2 text-xs text-white/55">
            Завершено {game.finishedMatchesCount} з {game.matchesCount}
          </div>
        </div>

        <div className="mt-4 flex-1 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F58212]">
            Наступна подія
          </div>

          {game.nextMatch ? (
            <>
              <div className="mt-2 text-base font-black text-white">
                {game.nextMatch.homeTeam} — {game.nextMatch.awayTeam}
              </div>
              <div className="mt-1 text-sm text-white/55">
                {formatMatchDate(game.nextMatch.startTime)}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-white/55">
              Поки немає майбутніх матчів у цій лізі.
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="min-w-0 text-sm text-white/50">
            <span className="truncate">
              Власник: <span className="text-white/75">{game.ownerName}</span>
            </span>
          </div>

          <div className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-white/7 px-4 py-2 text-sm font-bold text-white transition group-hover:bg-white/12">
            Відкрити
            <span className="transition group-hover:translate-x-0.5">→</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function StartStrip({
  currentUser,
  onHelp,
}: {
  currentUser: {
    name?: string | null;
    email?: string | null;
  };
  onHelp: () => void;
}) {
  const username = currentUser?.name || currentUser?.email || "Гравець";

  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b1018] p-4 shadow-xl shadow-black/20 sm:rounded-[2rem] sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]" />

      <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/42 sm:text-xs">
            Повернення в гру
          </div>

          <h2 className="mt-1 truncate text-2xl font-black tracking-tight text-white sm:text-3xl">
            Привіт, {username}
          </h2>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/68 sm:text-base">
            Обери лігу, в якій хочеш продовжити, або створи нову кімнату для друзів.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:opacity-90 sm:rounded-2xl sm:px-5 sm:py-3"
          >
            <IconPlus className="h-4 w-4" />
            Створити
          </Link>

          <Link
            to="/join"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 sm:rounded-2xl sm:px-5 sm:py-3"
          >
            <IconEnter className="h-4 w-4" />
            Приєднатись
          </Link>

          <button
            onClick={onHelp}
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/8 px-3 py-2.5 text-white/80 transition hover:bg-white/12 hover:text-white sm:rounded-2xl sm:px-4 sm:py-3"
            aria-label="Інструкція"
            title="Інструкція"
          >
            <IconBook className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-[1.15rem] border border-white/8 bg-white/[0.04] px-4 py-3 sm:rounded-[1.4rem] sm:px-5 sm:py-4">
      <div className="text-xs text-white/42 sm:text-sm">{label}</div>
      <div className="mt-1 text-2xl font-black text-white sm:mt-2 sm:text-3xl">
        {value}
      </div>
    </div>
  );
}

export default function LobbyPage() {
  const { currentUser, games, stats, spotlight } = useLoaderData<typeof loader>();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="relative min-h-screen overflow-x-hidden theme-page text-white">
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />

      <header className="sticky top-0 z-30 border-b border-white/8 bg-black/20 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-3 sm:px-5 md:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-lg shadow-black/30 sm:h-14 sm:w-14">
                <LeagueLogoMark className="h-8 w-8 sm:h-9 sm:w-9" />
              </div>

              <div className="min-w-0">
                <div className="truncate text-[9px] font-semibold uppercase tracking-[0.28em] text-white/40 sm:text-[10px]">
                  Match Predictor League
                </div>
                <h1 className="truncate text-lg font-black tracking-tight sm:text-2xl">
                  Lobby
                </h1>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <HeaderIconButton onClick={() => setHelpOpen(true)} title="Інструкція">
              <IconBook className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </HeaderIconButton>

            {currentUser ? (
              <>
                <Link
                  to="/me"
                  title="Кабінет"
                  aria-label="Кабінет"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/7 text-white/80 transition hover:bg-white/12 hover:text-white active:scale-[0.98] sm:h-11 sm:w-11 sm:rounded-2xl"
                >
                  <IconUser className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                </Link>

                <Form method="post" action="/logout">
                  <button
                    type="submit"
                    title="Вийти"
                    aria-label="Вийти"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/7 text-white/80 transition hover:bg-white/12 hover:text-white active:scale-[0.98] sm:h-11 sm:w-11 sm:rounded-2xl"
                  >
                    <IconLogout className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                  </button>
                </Form>
              </>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-5 sm:py-6 md:px-6 lg:px-8">
        {!currentUser ? (
          <div className="space-y-6">
            <PageSection title="Лобі гри" subtitle="Welcome">
              <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1018] p-5 shadow-2xl shadow-black/30 sm:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.15),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_25%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]" />
                <CardPitchLines />

                <div className="relative z-10">
                  <div className="mb-4">
                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60 sm:text-xs">
                      Лобі для друзів
                    </span>
                  </div>

                  <h2 className="max-w-3xl text-[1.9rem] font-black leading-[1.05] tracking-tight sm:text-4xl md:text-5xl">
                    Створюй свою гру, клич друзів і змагайся в прогнозах
                  </h2>

                  <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 sm:mt-5 sm:text-base sm:leading-7">
                    Це платформа для дружніх ліг прогнозів: створюй власні кімнати,
                    запрошуй друзів по коду та вгадуй результати матчів.
                  </p>

                  <div className="mt-6 flex flex-wrap gap-3">
                    <Link
                      to="/login"
                      className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
                    >
                      Увійти
                    </Link>
                  </div>
                </div>
              </div>
            </PageSection>
          </div>
        ) : (
          <div className="space-y-6">
            <StartStrip currentUser={currentUser} onHelp={() => setHelpOpen(true)} />

            {stats ? <SpotlightPanel spotlight={spotlight} stats={stats} /> : null}

            {stats ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Усього ігор" value={stats.gamesCount} />
                <StatCard label="Керуєш" value={stats.ownerGamesCount} />
                <StatCard label="LIVE" value={stats.totalLiveMatches} />
                <StatCard label="Без прогнозу" value={stats.totalPendingPredictions} />
              </div>
            ) : null}

            <PageSection
              title="Твої ліги"
              subtitle="Games"
              action={
                <Link
                  to="/create"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:opacity-90 sm:rounded-2xl"
                >
                  <IconPlus className="h-4 w-4" />
                  Створити
                </Link>
              }
            >
              {games.length === 0 ? (
                <EmptyGamesState />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {games.map((game) => (
                    <PremiumGameCard key={game.id} game={game} />
                  ))}
                </div>
              )}
            </PageSection>
          </div>
        )}
      </main>
    </div>
  );
}