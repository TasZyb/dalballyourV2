import { Link, useLoaderData, data, type LoaderFunctionArgs } from "react-router";
import { Form } from "react-router";
import { useMemo, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

/**
 * =========================================================
 * TYPES
 * =========================================================
 */

type LeagueLobbyCard = {
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

type CareerLobbyCard = {
  id: string;
  name: string;
  slug: string | null;
  status: string;

  favoriteTeamId: string | null;
  favoriteTeamName: string | null;
  favoriteTeamLogo: string | null;

  matchesCount: number;
  pendingPredictionsCount: number;
  submittedPredictionsCount: number;
  exactHitsCount: number;

  bannerUrl: string | null;

  nextMatch: {
    id: string;
    startTime: Date;
    homeTeam: string;
    awayTeam: string;
    status: string;
  } | null;
};

type LobbySpotlight =
  | {
      type: "career";
      gameId: string;
      gameName: string;
      teamName: string | null;
      teamLogo: string | null;
      pendingPredictionsCount: number;
      nextMatch: {
        id: string;
        startTime: Date;
        homeTeam: string;
        awayTeam: string;
        status: string;
      } | null;
    }
  | {
      type: "league";
      gameId: string;
      gameName: string;
      membersCount: number;
      liveMatchesCount: number;
      pendingPredictionsCount: number;
      nextMatch: {
        id: string;
        startTime: Date;
        homeTeam: string;
        awayTeam: string;
        status: string;
      } | null;
    }
  | null;

type LobbyStats = {
  leagueGamesCount: number;
  careerGamesCount: number;
  totalLiveMatches: number;
  totalPendingPredictions: number;
  totalExactHits: number;
};

function isMatchClosed(match: {
  status: string;
  startTime: Date | string;
}) {
  const startTime = new Date(match.startTime);
  const now = new Date();

  if (
    match.status === "FINISHED" ||
    match.status === "CANCELED" ||
    match.status === "POSTPONED"
  ) {
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

/**
 * =========================================================
 * LOADER
 * =========================================================
 *
 * ЗАРАЗ ТУТ СПЕЦІАЛЬНО ДАНО СКЕЛЕТ.
 * КОЛИ ДОДАСИ mode / favoriteTeamId В Game — просто розділиш дані.
 */

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return data({
      currentUser: null,
      leagueGames: [] as LeagueLobbyCard[],
      careerGames: [] as CareerLobbyCard[],
      spotlight: null as LobbySpotlight,
      stats: {
        leagueGamesCount: 0,
        careerGamesCount: 0,
        totalLiveMatches: 0,
        totalPendingPredictions: 0,
        totalExactHits: 0,
      } satisfies LobbyStats,
    });
  }

  /**
   * ---------------------------------------------------------
   * ТИМЧАСОВО:
   * тут можеш поки підтягнути всі ігри як раніше
   * і руками розкласти їх на leagueGames / careerGames.
   *
   * КОЛИ ДОДАСИ:
   *   mode GameMode
   *   favoriteTeamId String?
   * в model Game
   *
   * зможеш робити нормальний поділ.
   * ---------------------------------------------------------
   */

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
          // favoriteTeam: true, // <- коли додаси relation
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

  /**
   * ---------------------------------------------------------
   * DEMO-РОЗКЛАДКА:
   * поки ти ще не додав mode в БД, тут можна залишити:
   * всі поточні ігри -> leagueGames
   * careerGames -> []
   *
   * ПІСЛЯ МІГРАЦІЇ:
   * membership.game.mode === "CAREER" ? career : league
   * ---------------------------------------------------------
   */

  const leagueGames: LeagueLobbyCard[] = memberships.map((membership) => {
    const gameMatches = membership.game.gameMatches;
    const predictions = membership.game.predictions;

    const predictedMatchIds = new Set(predictions.map((prediction) => prediction.matchId));

    const nextMatchRaw =
      gameMatches.find((gm) => {
        const start = new Date(gm.match.startTime);
        return (
          start >= new Date() &&
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
              nextMatchRaw.match.homeTeam.shortName || nextMatchRaw.match.homeTeam.name,
            awayTeam:
              nextMatchRaw.match.awayTeam.shortName || nextMatchRaw.match.awayTeam.name,
            status: nextMatchRaw.match.status,
          }
        : null,
    };
  });

  const careerGames: CareerLobbyCard[] = [];

  const totalLiveMatches = leagueGames.reduce((sum, game) => sum + game.liveMatchesCount, 0);
  const totalPendingPredictions =
    leagueGames.reduce((sum, game) => sum + game.pendingPredictionsCount, 0) +
    careerGames.reduce((sum, game) => sum + game.pendingPredictionsCount, 0);

  const totalExactHits =
    leagueGames.reduce((sum, game) => sum + game.exactHitsCount, 0) +
    careerGames.reduce((sum, game) => sum + game.exactHitsCount, 0);

  const spotlight: LobbySpotlight =
    careerGames[0]
      ? {
          type: "career",
          gameId: careerGames[0].id,
          gameName: careerGames[0].name,
          teamName: careerGames[0].favoriteTeamName,
          teamLogo: careerGames[0].favoriteTeamLogo,
          pendingPredictionsCount: careerGames[0].pendingPredictionsCount,
          nextMatch: careerGames[0].nextMatch,
        }
      : leagueGames[0]
      ? {
          type: "league",
          gameId: leagueGames[0].id,
          gameName: leagueGames[0].name,
          membersCount: leagueGames[0].membersCount,
          liveMatchesCount: leagueGames[0].liveMatchesCount,
          pendingPredictionsCount: leagueGames[0].pendingPredictionsCount,
          nextMatch: leagueGames[0].nextMatch,
        }
      : null;

  return data({
    currentUser,
    leagueGames,
    careerGames,
    spotlight,
    stats: {
      leagueGamesCount: leagueGames.length,
      careerGamesCount: careerGames.length,
      totalLiveMatches,
      totalPendingPredictions,
      totalExactHits,
    } satisfies LobbyStats,
  });
}

/**
 * =========================================================
 * PAGE
 * =========================================================
 */

export default function LobbyPage() {
  const { currentUser, leagueGames, careerGames, spotlight, stats } =
    useLoaderData<typeof loader>();

  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-hidden bg-[#060b12] text-white">
      <LobbyBackground />

      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <LobbyHeader currentUser={currentUser} onOpenHelp={() => setHelpOpen(true)} />

        <LobbyHeroModeSelect currentUser={currentUser} />

        <LobbyMainSpotlight spotlight={spotlight} />

        <LobbyQuickStats stats={stats} />

        <LobbyEntryActions />

        <CareerGamesSection games={careerGames} />

        <LeagueGamesSection games={leagueGames} />
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}

/**
 * =========================================================
 * LAYOUT / SECTIONS
 * =========================================================
 */

function LobbyBackground() {
  return (
    <div className="pointer-events-none fixed inset-0">
      <div className="absolute left-[-10%] top-[-10%] h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute right-[-10%] top-[10%] h-[24rem] w-[24rem] rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute bottom-[-10%] left-[20%] h-[26rem] w-[26rem] rounded-full bg-orange-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.015),transparent_20%,transparent_80%,rgba(255,255,255,0.015))]" />
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

/**
 * =========================================================
 * HEADER
 * =========================================================
 */

function LobbyHeader({
  currentUser,
  onOpenHelp,
}: {
  currentUser: { displayName?: string | null; name?: string | null; email?: string | null } | null;
  onOpenHelp: () => void;
}) {
  const displayName =
    currentUser?.displayName || currentUser?.name || currentUser?.email || "Гравець";

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] shadow-lg shadow-black/30">
          <LeagueLogoMark className="h-8 w-8" />
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/40">
            Football lobby
          </div>
          <div className="mt-1 text-2xl font-black tracking-tight text-white">
            Predict
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 md:block">
          Привіт, <span className="font-semibold text-white">{displayName}</span>
        </div>

        <HeaderIconButton title="Інструкція" onClick={onOpenHelp}>
          <IconBook />
        </HeaderIconButton>

        <Link
          to="/me"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/7 text-white/80 transition hover:bg-white/12 hover:text-white active:scale-[0.98] sm:h-11 sm:w-11 sm:rounded-2xl"
          title="Профіль"
          aria-label="Профіль"
        >
          <IconUser />
        </Link>

        <Form method="post" action="/logout">
          <button
            type="submit"
            title="Вийти"
            aria-label="Вийти"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/7 text-white/80 transition hover:bg-white/12 hover:text-white active:scale-[0.98] sm:h-11 sm:w-11 sm:rounded-2xl"
          >
            <IconLogout />
          </button>
        </Form>
      </div>
    </header>
  );
}

/**
 * =========================================================
 * HERO / MODE SELECT
 * =========================================================
 */

function LobbyHeroModeSelect({
  currentUser,
}: {
  currentUser: unknown;
}) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1018] p-5 shadow-2xl shadow-black/30 sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]" />
      <CardPitchLines />

      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          Головне лобі
        </div>

        <h1 className="mt-4 max-w-4xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
          Обери, як хочеш грати: з друзями чи побудувати свою кар’єру за клуб
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base sm:leading-7">
          Відкривай дружні ліги, запрошуй друзів, або запускай сольну кар’єру
          й прогнозуй матчі улюбленої команди по максимуму.
        </p>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <LeagueModeCard />
          <CareerModeCard />
        </div>
      </div>
    </section>
  );
}

function LeagueModeCard() {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.05] p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.12),transparent_28%)]" />

      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
          Friends mode
        </div>

        <h3 className="mt-4 text-2xl font-black text-white">Дружня ліга</h3>

        <p className="mt-2 max-w-md text-sm leading-6 text-white/65">
          Створи свою лігу, запроси друзів, дивись live-матчі та змагайся за
          таблицю прогнозів.
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ModeFeatureChip label="Таблиця" />
          <ModeFeatureChip label="Live" />
          <ModeFeatureChip label="Код входу" />
        </div>

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            to="/create/league"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
          >
            <IconPlus className="h-4 w-4" />
            Створити лігу
          </Link>

          <Link
            to="/join"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            <IconEnter className="h-4 w-4" />
            Приєднатись
          </Link>
        </div>
      </div>
    </div>
  );
}

function CareerModeCard() {
  return (
    <div className="relative overflow-hidden rounded-[1.75rem] border border-orange-400/20 bg-[linear-gradient(180deg,rgba(245,130,18,0.08),rgba(255,255,255,0.03))] p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.14),transparent_30%)]" />

      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-200">
          Solo mode
        </div>

        <h3 className="mt-4 text-2xl font-black text-white">Сольна кар’єра</h3>

        <p className="mt-2 max-w-md text-sm leading-6 text-white/65">
          Обери улюблений клуб, прогнозуй його матчі, вгадуй склади,
          голеадорів і будуй свою фанатську кар’єру.
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ModeFeatureChip label="Склади" />
          <ModeFeatureChip label="Голеадори" />
          <ModeFeatureChip label="Досягнення" />
        </div>

        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link
            to="/create/career"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F58212] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
          >
            <IconSpark className="h-4 w-4" />
            Почати кар’єру
          </Link>
        </div>
      </div>
    </div>
  );
}

function ModeFeatureChip({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-xs font-semibold text-white/75">
      {label}
    </div>
  );
}

/**
 * =========================================================
 * SPOTLIGHT
 * =========================================================
 */

function LobbyMainSpotlight({ spotlight }: { spotlight: LobbySpotlight }) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-[1.75rem] border border-white/10 bg-[#0b1018] p-5 shadow-xl shadow-black/20">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Фокус зараз
        </div>

        {!spotlight ? (
          <>
            <h3 className="mt-3 text-2xl font-black text-white">
              Поки ще немає активної гри
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
              Почни з дружньої ліги або створи сольну кар’єру за своїй улюблений клуб.
            </p>
          </>
        ) : spotlight.type === "career" ? (
          <>
            <h3 className="mt-3 text-2xl font-black text-white">
              {spotlight.teamName ? `${spotlight.teamName} Career` : spotlight.gameName}
            </h3>

            <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
              Твоя основна активність зараз — сольна кар’єра. Готуй прогноз до
              найближчого матчу і не пропусти свій розбір.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MiniMetric label="Режим" valueLabel="Career" />
              <MiniMetric label="Без прогнозу" value={spotlight.pendingPredictionsCount} />
              <MiniMetric
                label="Наступний матч"
                valueLabel={spotlight.nextMatch ? "Є" : "Немає"}
              />
            </div>

            <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-xs text-white/45">Найближчий матч</div>

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
                  Поки немає найближчого запланованого матчу.
                </div>
              )}
            </div>

            <Link
              to={`/games/${spotlight.gameId}`}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
            >
              Продовжити кар’єру
            </Link>
          </>
        ) : (
          <>
            <h3 className="mt-3 text-2xl font-black text-white">{spotlight.gameName}</h3>

            <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
              Найактивніша дружня ліга прямо зараз. Заходь у гру, дивись live і не
              пропускай свої прогнози.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniMetric label="Режим" valueLabel="League" />
              <MiniMetric label="Гравців" value={spotlight.membersCount} />
              <MiniMetric label="LIVE" value={spotlight.liveMatchesCount} />
              <MiniMetric label="Без прогнозу" value={spotlight.pendingPredictionsCount} />
            </div>

            <div className="mt-5 rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
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
                  Зараз немає найближчого матчу.
                </div>
              )}
            </div>

            <Link
              to={`/games/${spotlight.gameId}`}
              className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
            >
              Відкрити лігу
            </Link>
          </>
        )}
      </div>

      <div className="rounded-[1.75rem] border border-white/10 bg-[#0b1018] p-5 shadow-xl shadow-black/20">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Швидкий доступ
        </div>

        <div className="mt-4 grid gap-3">
          <QuickActionCard
            title="Створити лігу"
            description="Запусти дружню гру для компанії."
            href="/create/league"
          />
          <QuickActionCard
            title="Почати кар’єру"
            description="Обери клуб і грай сольний сезон."
            href="/create/career"
          />
          <QuickActionCard
            title="Приєднатись по коду"
            description="Увійди в існуючу лігу друзів."
            href="/join"
          />
        </div>
      </div>
    </section>
  );
}

function QuickActionCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="group rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 transition hover:border-white/20 hover:bg-white/[0.06]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-white">{title}</div>
          <div className="mt-1 text-sm leading-6 text-white/55">{description}</div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition group-hover:text-white">
          <IconEnter className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

/**
 * =========================================================
 * STATS
 * =========================================================
 */

function LobbyQuickStats({ stats }: { stats: LobbyStats }) {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <MiniMetric label="Ліг" value={stats.leagueGamesCount} />
      <MiniMetric label="Кар’єр" value={stats.careerGamesCount} />
      <MiniMetric label="LIVE" value={stats.totalLiveMatches} />
      <MiniMetric label="Без прогнозу" value={stats.totalPendingPredictions} />
      <MiniMetric label="Точних влучань" value={stats.totalExactHits} />
    </section>
  );
}

function MiniMetric({
  label,
  value,
  valueLabel,
}: {
  label: string;
  value?: number;
  valueLabel?: string;
}) {
  return (
    <div className="rounded-[1.15rem] border border-white/10 bg-white/[0.05] px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/40">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black text-white">
        {valueLabel ?? value ?? 0}
      </div>
    </div>
  );
}

/**
 * =========================================================
 * ENTRY ACTIONS
 * =========================================================
 */

function LobbyEntryActions() {
  return (
    <PageSection title="Швидкий старт" subtitle="Entry points">
      <div className="grid gap-3 md:grid-cols-3">
        <EntryActionTile
          title="Створити дружню лігу"
          description="Для гри з друзями, таблиці та спільних прогнозів."
          href="/create/league"
          accent="blue"
        />

        <EntryActionTile
          title="Почати сольну кар’єру"
          description="Для матчів улюбленого клубу, складів і голеадорів."
          href="/create/career"
          accent="orange"
        />

        <EntryActionTile
          title="Приєднатись по коду"
          description="Швидкий вхід у вже створену лігу."
          href="/join"
          accent="neutral"
        />
      </div>
    </PageSection>
  );
}

function EntryActionTile({
  title,
  description,
  href,
  accent,
}: {
  title: string;
  description: string;
  href: string;
  accent: "blue" | "orange" | "neutral";
}) {
  const accentClass =
    accent === "blue"
      ? "from-blue-500/10 to-transparent border-blue-400/15"
      : accent === "orange"
      ? "from-orange-500/10 to-transparent border-orange-400/15"
      : "from-white/5 to-transparent border-white/10";

  return (
    <Link
      to={href}
      className={`group rounded-[1.5rem] border bg-gradient-to-br ${accentClass} p-5 transition hover:-translate-y-1 hover:border-white/20`}
    >
      <div className="text-lg font-black text-white">{title}</div>
      <p className="mt-2 text-sm leading-6 text-white/60">{description}</p>

      <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white/80">
        Відкрити
        <IconEnter className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

/**
 * =========================================================
 * CAREER SECTION
 * =========================================================
 */

function CareerGamesSection({ games }: { games: CareerLobbyCard[] }) {
  return (
    <PageSection
      title="Твої кар’єри"
      subtitle="Solo mode"
      action={
        <Link
          to="/create/career"
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          <IconPlus className="h-4 w-4" />
          Нова кар’єра
        </Link>
      }
    >
      {games.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {games.map((game) => (
            <CareerGameCard key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <EmptyCareerState />
      )}
    </PageSection>
  );
}

function CareerGameCard({ game }: { game: CareerLobbyCard }) {
  return (
    <Link
      to={`/career/${game.id}`}
      className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b1018] p-5 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1.5 hover:border-orange-300/20"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.12),transparent_26%)]" />

      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-200">
          Career
        </div>

        <div className="mt-4 flex items-start gap-3">
          {game.favoriteTeamLogo ? (
            <img
              src={game.favoriteTeamLogo}
              alt={game.favoriteTeamName || game.name}
              className="h-14 w-14 rounded-2xl border border-white/10 object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
              <LeagueLogoMark className="h-8 w-8" />
            </div>
          )}

          <div className="min-w-0">
            <div className="truncate text-xl font-black text-white">{game.name}</div>
            <div className="mt-1 text-sm text-white/55">
              {game.favoriteTeamName || "Улюблений клуб"}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <CardTinyStat label="Матчів" value={game.matchesCount} />
          <CardTinyStat label="Без прогнозу" value={game.pendingPredictionsCount} />
          <CardTinyStat label="Точних" value={game.exactHitsCount} />
        </div>

        <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs text-white/45">Найближчий матч</div>

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
              Наразі немає найближчого матчу.
            </div>
          )}
        </div>

        <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white/85">
          Продовжити кар’єру
          <IconEnter className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function EmptyCareerState() {
  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b1018] px-5 py-6 shadow-xl shadow-black/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.12),transparent_30%)]" />

      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-200">
          Solo mode
        </div>

        <h4 className="mt-4 text-2xl font-black text-white">
          Почни свою першу кар’єру
        </h4>

        <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
          Обери клуб, за який хочеш “жити сезон”, і прогнозуй матчі максимально
          детально: рахунок, склад, голеадорів, хід гри.
        </p>

        <div className="mt-5">
          <Link
            to="/create/career"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F58212] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
          >
            <IconSpark className="h-4 w-4" />
            Створити кар’єру
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * =========================================================
 * LEAGUE SECTION
 * =========================================================
 */

function LeagueGamesSection({ games }: { games: LeagueLobbyCard[] }) {
  return (
    <PageSection
      title="Твої ліги"
      subtitle="Friends mode"
      action={
        <div className="flex gap-2">
          <Link
            to="/create/league"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
          >
            <IconPlus className="h-4 w-4" />
            Нова ліга
          </Link>

          <Link
            to="/join"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/12"
          >
            <IconEnter className="h-4 w-4" />
            Join
          </Link>
        </div>
      }
    >
      {games.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {games.map((game) => (
            <LeagueGameCard key={game.id} game={game} />
          ))}
        </div>
      ) : (
        <EmptyLeagueState />
      )}
    </PageSection>
  );
}

function LeagueGameCard({ game }: { game: LeagueLobbyCard }) {
  const progress =
    game.matchesCount > 0
      ? Math.round((game.finishedMatchesCount / game.matchesCount) * 100)
      : 0;
  console.log(game);
  
  const initials = useMemo(() => {
    return game.name
      .split(" ")
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }, [game.name]);

  return (
    <Link
      to={`/games/${game.id}`}
      className="group relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b1018] shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1.5 hover:border-white/20"
    >
      {game.bannerUrl ? (
        <>
          <img
            src={game.bannerUrl}
            alt={game.name}
            className="absolute inset-0 h-full w-full object-cover opacity-20 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-30"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,18,0.18),rgba(7,10,18,0.88))]" />
        </>
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]" />
      )}

      <div className="relative z-10 p-5">
        <div className="flex items-start gap-3">
          <GameAvatar avatarUrl={game.avatarUrl} fallback={game.name} initials={initials} />

          <div className="min-w-0">
            <div className="truncate text-xl font-black text-white">{game.name}</div>
            <div className="mt-1 text-sm text-white/55">
              {game.linkedTournamentName || "Custom league"}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <CardTinyStat label="Гравців" value={game.membersCount} />
          <CardTinyStat label="LIVE" value={game.liveMatchesCount} />
          <CardTinyStat label="Без прогнозу" value={game.pendingPredictionsCount} />
        </div>

        <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-white/45">Прогрес сезону</div>
            <div className="text-xs font-semibold text-white/55">{progress}%</div>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="mt-4 text-xs text-white/45">Найближчий матч</div>

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
              Зараз немає найближчого матчу.
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="text-sm text-white/55">Owner: {game.ownerName}</div>
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-white/85">
            Відкрити
            <IconEnter className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyLeagueState() {
  return (
    <div className="relative overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b1018] px-5 py-6 shadow-xl shadow-black/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(96,165,250,0.14),transparent_30%)]" />

      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/60">
          Friends mode
        </div>

        <h4 className="mt-4 text-2xl font-black text-white">
          У тебе ще немає дружньої ліги
        </h4>

        <p className="mt-2 max-w-xl text-sm leading-6 text-white/65">
          Створи свою лігу для друзів або приєднайся до вже існуючої по коду.
        </p>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link
            to="/create/league"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
          >
            <IconPlus className="h-4 w-4" />
            Створити лігу
          </Link>

          <Link
            to="/join"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            <IconEnter className="h-4 w-4" />
            Приєднатись
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * =========================================================
 * SHARED SMALL UI
 * =========================================================
 */

function GameAvatar({
  avatarUrl,
  fallback,
  initials,
}: {
  avatarUrl: string | null;
  fallback: string;
  initials: string;
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
      <span className="text-sm font-black text-white">{initials}</span>
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

/**
 * =========================================================
 * HELP MODAL
 * =========================================================
 */

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
                Як працює нове лобі
              </h3>
            </div>

            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-lg text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-3">
            <HelpStep
              number="1"
              title="Обери режим"
              text="Дружня ліга для гри з друзями або сольна кар’єра за свій клуб."
            />
            <HelpStep
              number="2"
              title="Зайди в активність"
              text="Використай spotlight або секції нижче, щоб швидко продовжити гру."
            />
            <HelpStep
              number="3"
              title="Роби прогнози"
              text="Не пропускай матчі, склади й голеадорів — все крутиться навколо твоїх передматчевих рішень."
            />
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

function HelpStep({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4 sm:rounded-[1.5rem]">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm font-black text-white">
        {number}
      </div>
      <h4 className="text-base font-black text-white">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-white/65">{text}</p>
    </div>
  );
}

/**
 * =========================================================
 * ICONS / LOGO
 * =========================================================
 */

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