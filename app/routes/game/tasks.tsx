import {
  Link,
  data,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from "react-router";
import type { ReactNode } from "react";
import { MatchStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { getTournamentLogoSrc } from "~/lib/logo-utils";

function getQuizDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function getTimeLeftToday() {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const diffMs = Math.max(0, endOfDay.getTime() - now.getTime());
  const hours = Math.floor(diffMs / 1000 / 60 / 60);
  const minutes = Math.floor((diffMs / 1000 / 60) % 60);

  if (hours <= 0) return `${minutes} хв`;
  return `${hours} год ${minutes} хв`;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!currentUser) throw redirect("/login");
  if (!gameId) throw new Response("Game not found", { status: 404 });

  const membership = await prisma.gameMember.findFirst({
    where: { gameId, userId: currentUser.id, status: "ACTIVE" },
  });

  if (!membership) throw redirect("/");

  const [game, wallet, availableBoosts, finishedMatches, tournaments, todayAttempt] =
    await Promise.all([
      prisma.game.findUnique({
        where: { id: gameId },
        select: { id: true, name: true },
      }),
      prisma.userWallet.findUnique({
        where: { userId: currentUser.id },
      }),
      prisma.predictionBoost.count({
        where: {
          userId: currentUser.id,
          gameId,
          status: "AVAILABLE",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
      prisma.match.count({
        where: {
          status: MatchStatus.FINISHED,
          homeScore: { not: null },
          awayScore: { not: null },
          gameMatches: { some: { gameId } },
        },
      }),
      prisma.tournament.findMany({
        where: {
          matches: {
            some: {
              gameMatches: { some: { gameId } },
            },
          },
        },
        include: {
          _count: {
            select: {
              matches: {
                where: {
                  gameMatches: { some: { gameId } },
                  status: MatchStatus.FINISHED,
                },
              },
            },
          },
        },
        orderBy: { name: "asc" },
        take: 8,
      }),
      prisma.dailyQuizAttempt.findUnique({
        where: {
          userId_gameId_quizDate: {
            userId: currentUser.id,
            gameId,
            quizDate: getQuizDate(),
          },
        },
      }),
    ]);

  if (!game) throw new Response("Game not found", { status: 404 });

  return data({
    game,
    wallet,
    availableBoosts,
    finishedMatches,
    tournaments,
    todayAttempt,
    timeLeftToday: getTimeLeftToday(),
  });
}

function StatIcon({ type }: { type: "coins" | "boosts" | "base" }) {
  if (type === "coins") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M9 12h6M12 8v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "boosts") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
        <path d="M13 2 5 14h6l-1 8 9-13h-6l1-7Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M5 5h14v14H5z" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h8M8 13h5M8 17h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SummaryBadge({
  type,
  value,
}: {
  type: "coins" | "boosts" | "base";
  value: string | number;
}) {
  return (
    <div className="task-summary-badge">
      <div className="task-summary-badge-icon">
        <StatIcon type={type} />
      </div>
      <div className="min-w-[24px] text-center text-sm font-black leading-none text-white">
        {value}
      </div>
    </div>
  );
}

function TaskIcon({
  type,
  className = "h-6 w-6",
}: {
  type: "quiz" | "league" | "lineup" | "club" | "ball" | "spark" | "arrow";
  className?: string;
}) {
  if (type === "league") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M8 6H5a3 3 0 0 0 3 5M16 6h3a3 3 0 0 1-3 5M12 12v4M9 20h6M10 16h4v4h-4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "lineup") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M4 5h16v14H4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 5v14M4 12h16" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="8" cy="8.5" r="1.4" fill="currentColor" />
        <circle cx="16" cy="8.5" r="1.4" fill="currentColor" />
        <circle cx="12" cy="15.5" r="1.4" fill="currentColor" />
      </svg>
    );
  }

  if (type === "club") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M9 10h6M9.8 14h4.4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "ball") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="m8.5 6.8 3.5 2.6 3.5-2.6M8.5 17.2l1.4-4.2L6.4 10M15.5 17.2 14.1 13l3.5-3M9.9 13h4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "spark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="m12 3 2.2 5.4L20 10.5l-5.4 2.2L12 19l-2.6-6.3L4 10.5l5.8-2.1L12 3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "arrow") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M7 5.5 15.5 3l3.2 11.3-8.5 2.4L7 5.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5.5 8.2h9V21h-9zM8.5 12h3M8.5 16h2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TaskRow({
  title,
  eyebrow,
  description,
  reward,
  to,
  tone,
  icon,
  locked = false,
  meta,
}: {
  title: string;
  eyebrow: string;
  description: string;
  reward: string;
  to?: string;
  tone: "green" | "blue" | "gold" | "violet";
  icon: ReactNode;
  locked?: boolean;
  meta: string;
}) {
  const content = (
    <div
      className={`task-row-card task-row-${tone} relative min-h-[82px] overflow-hidden rounded-[18px] px-3 py-3 transition sm:min-h-[86px] sm:px-4 ${
        locked ? "opacity-65" : "hover:-translate-y-0.5"
      }`}
    >
      <div className="relative z-10 grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[44px_minmax(0,1fr)_126px_72px] sm:gap-4">
        <div className="task-row-icon shrink-0">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/42">
              {eyebrow}
            </div>
            <div className="h-1 w-1 rounded-full bg-white/25" />
            <div className="text-[11px] font-black text-white/55">
              {meta}
            </div>
          </div>
          <h2 className="mt-1 truncate text-base font-black leading-tight text-white sm:text-lg">
            {title}
          </h2>
          <p className="mt-1 line-clamp-1 text-xs font-semibold leading-5 text-white/55 sm:text-sm">
            {description}
          </p>
        </div>

        <div className="hidden min-w-0 text-right sm:block">
          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-white/38">
            Нагорода
          </div>
          <div className="mt-1 truncate text-xs font-black text-white/62">
            {reward}
          </div>
        </div>

        <div className="task-row-action justify-self-end">
          {locked ? (
            "Скоро"
          ) : (
            <span className="inline-flex items-center gap-1">
              Грати
              <TaskIcon type="arrow" className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (!to || locked) return content;

  return (
    <Link to={to} prefetch="intent" className="block">
      {content}
    </Link>
  );
}

function ModeCard({
  title,
  eyebrow,
  reward,
  to,
  tone,
  icon,
  locked = false,
  meta,
}: {
  title: string;
  eyebrow: string;
  reward: string;
  to?: string;
  tone: "green" | "blue" | "gold" | "violet";
  icon: ReactNode;
  locked?: boolean;
  meta: string;
}) {
  const content = (
    <div
      className={`task-mode-game-card task-mode-game-${tone} relative min-h-[188px] overflow-hidden rounded-[24px] p-4 transition ${
        locked ? "opacity-65" : "hover:-translate-y-1"
      }`}
    >
      <div className="task-mode-mini-pitch" />
      <div className="relative z-10 flex h-full flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="task-mode-game-icon">{icon}</div>
          <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-black text-white/55">
            {meta}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/45">
            {eyebrow}
          </div>
          <h2 className="mt-1 text-2xl font-black leading-tight text-white">
            {title}
          </h2>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0 truncate text-xs font-black text-white/55">
              {reward}
            </div>
            <div className="task-mode-game-action">
              {locked ? (
                "Скоро"
              ) : (
                <span className="inline-flex items-center gap-1">
                  Грати
                  <TaskIcon type="arrow" className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!to || locked) return content;

  return (
    <Link to={to} prefetch="intent" className="block">
      {content}
    </Link>
  );
}

export default function TasksPage() {
  const {
    game,
    wallet,
    availableBoosts,
    finishedMatches,
    tournaments,
    todayAttempt,
    timeLeftToday,
  } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="tasks-game-hero relative overflow-hidden rounded-[30px] p-4 sm:p-6">
        <div className="tasks-game-lights" />
        <div className="tasks-game-pitch" />

        <div className="relative z-10 grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100/70">
              <TaskIcon type="spark" className="h-4 w-4" />
              <span>Football game</span>
            </div>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
              Матч-центр
            </h1>

            <div className="mt-5 grid grid-cols-3 gap-2 sm:flex sm:shrink-0 sm:items-center">
              <SummaryBadge type="coins" value={wallet?.balance ?? 0} />
              <SummaryBadge type="boosts" value={availableBoosts} />
              <SummaryBadge type="base" value={finishedMatches} />
            </div>
          </div>

          <div className="tasks-hero-scene" aria-hidden="true">
            <div className="tasks-scoreboard">
              <span>HOME</span>
              <strong>0:0</strong>
              <span>AWAY</span>
            </div>
            <div className="tasks-goal tasks-goal-top" />
            <div className="tasks-goal tasks-goal-bottom" />
            <div className="tasks-player-dot tasks-player-1" />
            <div className="tasks-player-dot tasks-player-2" />
            <div className="tasks-player-dot tasks-player-3" />
            <div className="tasks-player-dot tasks-player-4" />
            <div className="tasks-player-dot tasks-player-5" />
            <div className="tasks-player-dot tasks-player-6" />
            <div className="tasks-player-dot tasks-player-7" />
            <div className="tasks-player-dot tasks-player-8" />
            <div className="tasks-player-dot tasks-player-9" />
            <div className="tasks-player-dot tasks-player-10" />
            <div className="tasks-player-dot tasks-player-11" />
            <div className="tasks-hero-ball">
              <TaskIcon type="ball" className="h-10 w-10" />
            </div>
            <div className="tasks-kit-card tasks-kit-home">
              <span>10</span>
            </div>
            <div className="tasks-kit-card tasks-kit-away">
              <span>7</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <ModeCard
          title="Квіз"
          eyebrow="Challenge"
          reward={todayAttempt?.completedAt ? "вже пройдено" : "coins + x2 за ідеал"}
          to={`/games/${game.id}/tasks/daily`}
          tone="green"
          icon={<TaskIcon type="quiz" />}
          meta={`лишилось ${timeLeftToday}`}
        />
        <ModeCard
          title="Проходження ліги"
          eyebrow="League run"
          reward="league chest"
          tone="gold"
          icon={<TaskIcon type="league" />}
          locked
          meta={`лишилось ${timeLeftToday}`}
        />
        <ModeCard
          title="Збери склад"
          eyebrow="Lineup"
          reward="tactical boost"
          tone="blue"
          icon={<TaskIcon type="lineup" />}
          locked
          meta={`лишилось ${timeLeftToday}`}
        />
        <ModeCard
          title="Опізнай команду"
          eyebrow="Guess club"
          reward="mystery coins"
          tone="violet"
          icon={<TaskIcon type="club" />}
          locked
          meta={`лишилось ${timeLeftToday}`}
        />
      </section>

      {tournaments.length > 0 ? (
        <section className="rounded-[30px] border border-[var(--border)] bg-[var(--panel-strong)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                League material
              </div>
              <div className="mt-1 text-xl font-black text-[var(--text)]">
                Матеріал для майбутніх ліг
              </div>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tournaments.map((tournament) => {
              const logoSrc = getTournamentLogoSrc(tournament);

              return (
                <div
                  key={tournament.id}
                  className="min-w-[220px] rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/90">
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt={tournament.name}
                          className="h-6 w-6 object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-[10px] font-black text-black">
                          {tournament.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black text-[var(--text)]">
                        {tournament.name}
                      </div>
                      <div className="text-xs text-[var(--text-soft)]">
                        {tournament._count.matches} завершених матчів
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
