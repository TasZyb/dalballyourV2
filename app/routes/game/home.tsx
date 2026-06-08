import {
  Link,
  useLoaderData,
  useNavigation,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { MatchStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";
import { PlayerFifaCard, type PlayerCardView } from "~/components/PlayerFifaCard";
import { getTeamLogoSrc, getTournamentLogoSrc } from "~/lib/logo-utils";
import { syncGamePlayerCards } from "~/lib/player-card-rating.server";
import { isGuestPreviewGame } from "~/lib/guest-preview.server";

type TeamLike = {
  id: string;
  name: string;
  shortName?: string | null;
  code?: string | null;
  logo?: string | null;
  country?: string | null;
};

type TournamentLike = {
  id: string;
  name: string;
  slug?: string | null;
  country?: string | null;
  logo?: string | null;
};

type HeroMatch = {
  id: string;
  status: string;
  startTime: Date | string;
  stageLabel?: string | null;
  matchdayLabel?: string | null;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: TeamLike;
  awayTeam: TeamLike;
  tournament: TournamentLike | null;
  round?: {
    id: string;
    name: string;
  } | null;
  gameMeta?: {
    customWeight?: number | null;
    bonusLabel?: string | null;
  } | null;
};

type TournamentOverview = {
  id: string;
  name: string;
  slug?: string | null;
  country?: string | null;
  logo?: string | null;
  totalMatches: number;
  liveMatches: number;
  upcomingMatches: number;
  finishedMatches: number;
};

type MyHighlights = {
  currentGoodStreak: number;
  exactHits: number;
  correctResults: number;
  openMatchesWithoutPrediction: number;
  bestTournamentName: string | null;
};

type NextChallenge = {
  matchId: string;
  startTime: Date | string;
  homeTeam: TeamLike;
  awayTeam: TeamLike;
  tournament: TournamentLike | null;
  round?: {
    id: string;
    name: string;
  } | null;
  bonusLabel?: string | null;
  customWeight?: number | null;
};

function getDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
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

function getTimeUntil(date: Date | string) {
  const now = new Date().getTime();
  const target = new Date(date).getTime();
  const diff = target - now;

  if (diff <= 0) return "Уже йде";

  const totalMinutes = Math.floor(diff / 1000 / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}д ${hours}г`;
  if (hours > 0) return `${hours}г ${minutes}хв`;
  return `${minutes}хв`;
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

function getStatusClasses(status: string) {
  switch (status) {
    case "LIVE":
      return "border-red-500/20 bg-red-500/15 text-red-300";
    case "FINISHED":
      return "border-emerald-500/20 bg-emerald-500/15 text-emerald-300";
    case "POSTPONED":
      return "border-amber-500/20 bg-amber-500/15 text-amber-300";
    case "CANCELED":
      return "border-zinc-500/20 bg-zinc-500/15 text-zinc-300";
    default:
      return "border-[var(--border)] bg-[var(--panel)] text-[var(--text-soft)]";
  }
}

function getTournamentSubLabel(match: {
  round?: { name: string } | null;
  stageLabel?: string | null;
  matchdayLabel?: string | null;
}) {
  return match.round?.name || match.stageLabel || match.matchdayLabel || null;
}

function getPredictionDeadline(startTime: Date, lockMinutesBeforeStart: number) {
  return new Date(startTime.getTime() - lockMinutesBeforeStart * 60 * 1000);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const gameId = params.gameId;
  const currentUser = await getCurrentUser(request);

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      slug: true,
      lockMinutesBeforeStart: true,
    },
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

  if (currentUser || !isGuestPreviewGame(game)) {
    await syncGamePlayerCards(gameId);
  }

  const upcomingAndLiveMatches = await prisma.match.findMany({
    where: {
      gameMatches: {
        some: { gameId },
      },
      status: {
        in: [MatchStatus.SCHEDULED, MatchStatus.LIVE],
      },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      tournament: true,
      round: true,
      gameMatches: {
        where: { gameId },
        select: {
          customWeight: true,
          bonusLabel: true,
          predictionClosesAt: true,
          isLocked: true,
        },
        take: 1,
      },
    },
    orderBy: {
      startTime: "asc",
    },
  });

  const nextMatchRaw = upcomingAndLiveMatches[0] ?? null;

  const nextMatch: HeroMatch | null = nextMatchRaw
    ? {
        id: nextMatchRaw.id,
        status: nextMatchRaw.status,
        startTime: nextMatchRaw.startTime,
        stageLabel: nextMatchRaw.stageLabel,
        matchdayLabel: nextMatchRaw.matchdayLabel,
        homeScore: nextMatchRaw.homeScore,
        awayScore: nextMatchRaw.awayScore,
        homeTeam: nextMatchRaw.homeTeam,
        awayTeam: nextMatchRaw.awayTeam,
        tournament: nextMatchRaw.tournament,
        round: nextMatchRaw.round,
        gameMeta: nextMatchRaw.gameMatches[0] ?? null,
      }
    : null;

  const allGameMatches = await prisma.match.findMany({
    where: {
      gameMatches: {
        some: { gameId },
      },
    },
    include: {
      tournament: true,
    },
  });

  const tournamentsMap = new Map<string, TournamentOverview>();

  for (const match of allGameMatches) {
    if (!match.tournament) continue;

    const current = tournamentsMap.get(match.tournament.id) ?? {
      id: match.tournament.id,
      name: match.tournament.name,
      slug: match.tournament.slug,
      country: match.tournament.country,
      logo: match.tournament.logo,
      totalMatches: 0,
      liveMatches: 0,
      upcomingMatches: 0,
      finishedMatches: 0,
    };

    current.totalMatches += 1;

    if (match.status === "LIVE") current.liveMatches += 1;
    if (match.status === "SCHEDULED") current.upcomingMatches += 1;
    if (match.status === "FINISHED") current.finishedMatches += 1;

    tournamentsMap.set(match.tournament.id, current);
  }

  const tournamentsOverview = Array.from(tournamentsMap.values()).sort((a, b) => {
    if (b.liveMatches !== a.liveMatches) return b.liveMatches - a.liveMatches;

    if (b.upcomingMatches !== a.upcomingMatches) {
      return b.upcomingMatches - a.upcomingMatches;
    }

    return b.totalMatches - a.totalMatches;
  });

  const playerCards = await prisma.gamePlayerCard.findMany({
    where: { gameId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          displayName: true,
          email: true,
          image: true,
        },
      },
      clubTeam: {
        select: {
          id: true,
          name: true,
          shortName: true,
          logo: true,
          code: true,
        },
      },
    },
    orderBy: [
      { rating: "desc" },
      { weightedPoints: "desc" },
      { exactHits: "desc" },
    ],
    take: 8,
  });

  const gameCards: PlayerCardView[] = playerCards.map((card) => ({
    id: card.userId,
    name: getDisplayName(card.user),
    image: card.user.image,
    weightedPoints: card.weightedPoints,
    correctResults: card.correctResults,
    currentStreak: card.currentStreak,
    finishedPicks: card.finishedPicks,
    exactHits: card.exactHits,
    accuracyRate: card.accuracyRate,
    bestStreak: card.bestStreak,
    card: {
      rating: card.rating,
      ratingDelta: card.ratingDelta,
      photoUrl: card.photoUrl,
      clubTeam: card.clubTeam,
    },
  }));

  let myHighlights: MyHighlights | null = null;
  let myNextChallenge: NextChallenge | null = null;

  if (currentUser) {
    const myPredictions = await prisma.prediction.findMany({
      where: {
        gameId,
        userId: currentUser.id,
      },
      include: {
        match: {
          include: {
            tournament: true,
          },
        },
      },
      orderBy: {
        match: {
          startTime: "desc",
        },
      },
    });

    let currentGoodStreak = 0;

    for (const prediction of myPredictions) {
      if (prediction.wasExact || prediction.wasOutcomeOnly) {
        currentGoodStreak += 1;
      } else {
        break;
      }
    }

    const exactHits = myPredictions.filter((p) => p.wasExact).length;

    const correctResults = myPredictions.filter(
      (p) => p.wasExact || p.wasOutcomeOnly
    ).length;

    const tournamentPoints = new Map<string, { name: string; points: number }>();

    for (const prediction of myPredictions) {
      const tournament = prediction.match.tournament;
      if (!tournament) continue;

      const current = tournamentPoints.get(tournament.id) ?? {
        name: tournament.name,
        points: 0,
      };

      current.points += prediction.weightedPointsAwarded ?? 0;
      tournamentPoints.set(tournament.id, current);
    }

    const bestTournament = Array.from(tournamentPoints.values()).sort(
      (a, b) => b.points - a.points
    )[0];

    const openGameMatches = await prisma.gameMatch.findMany({
      where: {
        gameId,
        match: {
          status: MatchStatus.SCHEDULED,
        },
      },
      include: {
        match: true,
      },
    });

    const myOpenPredictionIds = new Set(
      (
        await prisma.prediction.findMany({
          where: {
            gameId,
            userId: currentUser.id,
            match: {
              status: MatchStatus.SCHEDULED,
            },
          },
          select: {
            matchId: true,
          },
        })
      ).map((p) => p.matchId)
    );

    const openMatchesWithoutPrediction = openGameMatches.filter((gm) => {
      if (gm.isLocked) return false;

      const deadline =
        gm.predictionClosesAt ??
        getPredictionDeadline(gm.match.startTime, game.lockMinutesBeforeStart);

      if (new Date() >= deadline) return false;

      return !myOpenPredictionIds.has(gm.matchId);
    }).length;

    myHighlights = {
      currentGoodStreak,
      exactHits,
      correctResults,
      openMatchesWithoutPrediction,
      bestTournamentName: bestTournament?.name ?? null,
    };

    const nextChallengeRaw = await prisma.gameMatch.findFirst({
      where: {
        gameId,
        match: {
          status: MatchStatus.SCHEDULED,
        },
      },
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
      orderBy: [
        { customWeight: "desc" },
        { predictionClosesAt: "asc" },
        { match: { startTime: "asc" } },
      ],
    });

    if (nextChallengeRaw) {
      const existingPrediction = await prisma.prediction.findUnique({
        where: {
          userId_gameId_matchId: {
            userId: currentUser.id,
            gameId,
            matchId: nextChallengeRaw.matchId,
          },
        },
      });

      if (!existingPrediction) {
        myNextChallenge = {
          matchId: nextChallengeRaw.match.id,
          startTime: nextChallengeRaw.match.startTime,
          homeTeam: nextChallengeRaw.match.homeTeam,
          awayTeam: nextChallengeRaw.match.awayTeam,
          tournament: nextChallengeRaw.match.tournament,
          round: nextChallengeRaw.match.round,
          bonusLabel: nextChallengeRaw.bonusLabel,
          customWeight: nextChallengeRaw.customWeight,
        };
      }
    }
  }

  return data({
    game,
    nextMatch,
    tournamentsOverview,
    myHighlights,
    myNextChallenge,
    gameCards,
  });
}

function TeamChip({ team }: { team: TeamLike }) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel-strong)]">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={team.name}
            className="h-4.5 w-4.5 object-contain"
            loading="lazy"
          />
        ) : (
          <span className="text-[9px] font-black text-[var(--text-soft)]">
            {team.code || team.name.slice(0, 3).toUpperCase()}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-black text-[var(--text)]">
          {team.shortName || team.name}
        </div>
      </div>
    </div>
  );
}

function MiniTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "accent" | "success" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[var(--accent-soft)]"
      : tone === "success"
      ? "border-[color-mix(in_srgb,var(--success)_28%,transparent)] bg-[var(--success-soft)]"
      : tone === "warning"
      ? "border-[color-mix(in_srgb,var(--warning)_28%,transparent)] bg-[var(--warning-soft)]"
      : "border-[var(--border)] bg-[var(--panel)]";

  return (
    <div className={`rounded-2xl border px-3 py-2 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-black text-[var(--text)]">{value}</div>
    </div>
  );
}

function TournamentPill({
  tournament,
  label,
}: {
  tournament?: TournamentLike | null;
  label?: string | null;
}) {
  if (!tournament && !label) return null;

  const logoSrc = getTournamentLogoSrc(tournament);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tournament ? (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[10px] font-bold text-[var(--text-soft)]">
          <div className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-full bg-white/90">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={tournament.name}
                className="h-3 w-3 object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-[8px] font-black text-black/70">
                {tournament.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <span className="max-w-[110px] truncate">{tournament.name}</span>
        </div>
      ) : null}

      {label ? (
        <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card-highlight)] px-2 py-1 text-[10px] text-[var(--muted)]">
          {label}
        </div>
      ) : null}
    </div>
  );
}

function TeamHero({
  team,
}: {
  team: TeamLike;
}) {
  const logoSrc = getTeamLogoSrc(team);
  const label = team.shortName || team.name;
  const fallback = team.code || team.name.slice(0, 3).toUpperCase();

  return (
    <div className="relative flex min-w-0 flex-col items-center gap-3 overflow-hidden rounded-[28px] border border-white/[0.1] bg-white/[0.055] px-3 py-4">
      <div className="absolute inset-x-3 top-2 h-px bg-white/[0.12]" />
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/[0.92] shadow-[0_18px_40px_rgba(0,0,0,0.26)] sm:h-32 sm:w-32">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={team.name}
            className="h-16 w-16 object-contain sm:h-22 sm:w-22"
            loading="lazy"
          />
        ) : (
          <span className="text-xl font-black text-slate-950">{fallback}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="max-w-[130px] truncate text-center text-base font-black text-white sm:max-w-[210px] sm:text-2xl">
          {label}
        </div>
        {team.country ? (
          <div className="mt-1 truncate text-center text-[10px] font-bold uppercase tracking-[0.16em] text-white/[0.42]">
            {team.country}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BlurredTeamCrest({
  team,
  side,
}: {
  team: TeamLike;
  side: "left" | "right";
}) {
  const logoSrc = getTeamLogoSrc(team);

  if (!logoSrc) return null;

  return (
    <img
      src={logoSrc}
      alt=""
      aria-hidden="true"
      className={`pointer-events-none absolute top-20 h-56 w-56 select-none object-contain opacity-[0.07] blur-[2px] sm:h-72 sm:w-72 ${
        side === "left" ? "-left-16" : "-right-16"
      }`}
      loading="lazy"
    />
  );
}

function MatchScoreboard({ match }: { match: HeroMatch }) {
  const isPlayable = match.status === "SCHEDULED";
  const score =
    match.status === "LIVE" || match.status === "FINISHED"
      ? `${match.homeScore ?? 0}:${match.awayScore ?? 0}`
      : "VS";

  return (
    <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
      <TeamHero team={match.homeTeam} />

      <div className="flex min-w-[82px] flex-col items-center sm:min-w-[124px]">
        <div className="rounded-[24px] border border-white/[0.12] bg-black/[0.24] px-3 py-3 text-center backdrop-blur">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/[0.48]">
            {match.status === "LIVE" ? "Live" : "Game"}
          </div>
          <div className="mt-1 text-3xl font-black leading-none text-white sm:text-5xl">
            {score}
          </div>
        </div>

        <div className="mt-2 rounded-full border border-white/[0.16] bg-white/[0.12] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white">
          {isPlayable ? getTimeUntil(match.startTime) : getStatusLabel(match.status)}
        </div>
      </div>

      <TeamHero team={match.awayTeam} />
    </div>
  );
}

function GameStatStrip({ myHighlights }: { myHighlights: MyHighlights | null }) {
  const stats = myHighlights
    ? [
        { label: "Стрік", value: myHighlights.currentGoodStreak },
        { label: "Точні", value: myHighlights.exactHits },
        { label: "Вгадав", value: myHighlights.correctResults },
        { label: "Місії", value: myHighlights.openMatchesWithoutPrediction },
      ]
    : [
        { label: "Стрік", value: "—" },
        { label: "Точні", value: "—" },
        { label: "Вгадав", value: "—" },
        { label: "Місії", value: "—" },
      ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-center"
        >
          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
            {stat.label}
          </div>
          <div className="mt-1 text-lg font-black tabular-nums text-[var(--text)]">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function getGameMissions({
  gameId,
  nextMatch,
  myHighlights,
  myNextChallenge,
}: {
  gameId: string;
  nextMatch: HeroMatch | null;
  myHighlights: MyHighlights | null;
  myNextChallenge: NextChallenge | null;
}) {
  return [
    {
      title: "Закрий прогноз",
      meta:
        (myHighlights?.openMatchesWithoutPrediction ?? 0) > 0
          ? `${myHighlights?.openMatchesWithoutPrediction} відкрито`
          : "усе чисто",
      reward: "Kickoff Pack",
      to: myNextChallenge
        ? `/games/${gameId}/predict?matchId=${myNextChallenge.matchId}`
        : `/games/${gameId}/predict`,
      active: (myHighlights?.openMatchesWithoutPrediction ?? 0) > 0,
    },
    {
      title: "Матчевий чек",
      meta: nextMatch ? getTimeUntil(nextMatch.startTime) : "календар пустий",
      reward: "Matchday XP",
      to: nextMatch
        ? `/games/${gameId}/matches/${nextMatch.id}`
        : `/games/${gameId}/matches`,
      active: Boolean(nextMatch),
    },
    {
      title: "Прокачай картку",
      meta:
        (myHighlights?.currentGoodStreak ?? 0) > 0
          ? `стрік ${myHighlights?.currentGoodStreak}`
          : "форма з нуля",
      reward: "Skin progress",
      to: `/games/${gameId}/profile`,
      active: true,
    },
  ];
}

function getSkinDrops(myHighlights: MyHighlights | null, topCard?: PlayerCardView) {
  const rating = topCard?.card.rating ?? 40;
  const exactHits = myHighlights?.exactHits ?? 0;
  const streak = myHighlights?.currentGoodStreak ?? 0;

  return [
    {
      name: "Neon Pitch",
      status: rating >= 70 ? "Відкрито" : `OVR ${Math.max(0, 70 - rating)} до анлоку`,
      active: rating >= 70,
      className: "skin-neon",
    },
    {
      name: "Ice Gold",
      status: exactHits >= 3 ? "Відкрито" : `${exactHits}/3 точних`,
      active: exactHits >= 3,
      className: "skin-gold",
    },
    {
      name: "Streak Black",
      status: streak >= 3 ? "Відкрито" : `${streak}/3 стрік`,
      active: streak >= 3,
      className: "skin-black",
    },
  ];
}

function PackCard({
  title,
  subtitle,
  tone,
  to,
  locked = false,
}: {
  title: string;
  subtitle: string;
  tone: "green" | "blue" | "gold";
  to: string;
  locked?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`game-pack-card game-pack-${tone} group relative min-h-[156px] overflow-hidden rounded-[28px] p-4 transition hover:-translate-y-1 ${
        locked ? "opacity-70" : ""
      }`}
    >
      <div className="pack-shine" />
      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
            {locked ? "Locked pack" : "Ready pack"}
          </div>
          <div className="mt-2 text-2xl font-black leading-none text-white">
            {title}
          </div>
          <div className="mt-2 max-w-[170px] text-xs font-semibold leading-5 text-white/62">
            {subtitle}
          </div>
        </div>

        <div className="mt-4 inline-flex w-fit rounded-full border border-white/15 bg-white/12 px-3 py-1.5 text-[11px] font-black text-white">
          {locked ? "Прокачати" : "Відкрити"}
        </div>
      </div>
    </Link>
  );
}

function GameArcade({
  gameId,
  nextMatch,
  myHighlights,
  myNextChallenge,
  gameCards,
}: {
  gameId: string;
  nextMatch: HeroMatch | null;
  myHighlights: MyHighlights | null;
  myNextChallenge: NextChallenge | null;
  gameCards: PlayerCardView[];
}) {
  const missions = getGameMissions({
    gameId,
    nextMatch,
    myHighlights,
    myNextChallenge,
  });
  const skins = getSkinDrops(myHighlights, gameCards[0]);
  const hasOpenPredictions = (myHighlights?.openMatchesWithoutPrediction ?? 0) > 0;
  const hasHotStreak = (myHighlights?.currentGoodStreak ?? 0) >= 2;
  const hasBonusMatch = (nextMatch?.gameMeta?.customWeight ?? 1) > 1;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
            Game room
          </div>
          <h2 className="mt-1 text-xl font-black text-[var(--text)]">
            Паки, місії, скіни
          </h2>
        </div>
        <Link
          to={`/games/${gameId}/profile`}
          className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[11px] font-black text-[var(--text-soft)]"
        >
          Моя картка
        </Link>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="grid gap-3 sm:grid-cols-3">
          <PackCard
            title="Kickoff Pack"
            subtitle="Відкривається, коли є матчі без прогнозу."
            tone="green"
            to={myNextChallenge ? `/games/${gameId}/predict?matchId=${myNextChallenge.matchId}` : `/games/${gameId}/predict`}
            locked={!hasOpenPredictions}
          />
          <PackCard
            title="Form Pack"
            subtitle="Тримаєш стрік — відкриваєш стиль."
            tone="blue"
            to={`/games/${gameId}/profile`}
            locked={!hasHotStreak}
          />
          <PackCard
            title="Derby Pack"
            subtitle="Бонусні матчі, вага x2 і нерви."
            tone="gold"
            to={nextMatch ? `/games/${gameId}/matches/${nextMatch.id}` : `/games/${gameId}/matches`}
            locked={!hasBonusMatch}
          />
        </div>

        <div className="game-mission-board rounded-[28px] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">
                Daily run
              </div>
              <div className="mt-1 text-lg font-black text-white">
                Швидкі завдання
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black text-white/62">
              reset 24h
            </div>
          </div>

          <div className="space-y-2">
            {missions.map((mission) => (
              <Link
                key={mission.title}
                to={mission.to}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-3 transition hover:bg-white/[0.085]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-white">
                    {mission.title}
                  </div>
                  <div className="mt-0.5 text-xs text-white/45">
                    {mission.meta}
                  </div>
                </div>
                <div
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${
                    mission.active
                      ? "bg-emerald-400/15 text-emerald-100"
                      : "bg-white/8 text-white/35"
                  }`}
                >
                  {mission.reward}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="skin-shelf rounded-[28px] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/42">
              Card skins
            </div>
            <div className="mt-1 text-lg font-black text-white">
              Вітрина стилів
            </div>
          </div>
          <div className="text-xs font-bold text-white/42">
            працює від форми
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {skins.map((skin) => (
            <Link
              key={skin.name}
              to={`/games/${gameId}/profile`}
              className={`skin-token ${skin.className} overflow-hidden rounded-2xl p-3 transition hover:-translate-y-[1px] ${
                skin.active ? "" : "opacity-60"
              }`}
            >
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/50">
                {skin.active ? "Unlocked" : "Progress"}
              </div>
              <div className="mt-5 text-xl font-black text-white">
                {skin.name}
              </div>
              <div className="mt-1 text-xs font-bold text-white/55">
                {skin.status}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function DailyQuizHub({
  gameId,
  nextMatch,
  myHighlights,
}: {
  gameId: string;
  nextMatch: HeroMatch | null;
  myHighlights: MyHighlights | null;
}) {
  return (
    <section className="daily-quiz-hero relative overflow-hidden rounded-[32px] p-4 sm:p-5">
      <div className="tactical-lines" />
      <div className="light-sweep light-sweep-slow" />

      <div className="relative z-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div>
          <div className="inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/55">
            Daily quest
          </div>
          <h2 className="mt-3 text-2xl font-black text-white sm:text-3xl">
            Квіз дня за монети і x2 бустер
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/55">
            Питання формуються з історії завершених матчів: рахунок, суперники,
            турніри, а далі сюди додамо авторів голів і хет-тріки.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-xl">
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">
                Нагорода
              </div>
              <div className="mt-1 text-lg font-black text-white">до 80</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">
                Бустер
              </div>
              <div className="mt-1 text-lg font-black text-white">x2</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.07] px-3 py-3">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-white/40">
                Стрік
              </div>
              <div className="mt-1 text-lg font-black text-white">
                {myHighlights?.currentGoodStreak ?? 0}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 lg:w-[260px]">
          <Link
            to={`/games/${gameId}/tasks`}
            className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-white px-5 text-sm font-black text-black shadow-[0_16px_34px_rgba(0,0,0,0.24)]"
          >
            Пройти квіз
          </Link>
          <Link
            to={nextMatch ? `/games/${gameId}/predict?matchId=${nextMatch.id}` : `/games/${gameId}/predict`}
            className="inline-flex h-12 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.08] px-5 text-sm font-black text-white"
          >
            До прогнозів
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function GameHomePage() {
  const navigation = useNavigation();

  const {
    game,
    nextMatch,
    tournamentsOverview,
    myHighlights,
    myNextChallenge,
    gameCards,
  } = useLoaderData<typeof loader>();

  const isRouteLoading = navigation.state === "loading";
  const isSubmitting = navigation.state === "submitting";
  const isBusy = isRouteLoading || isSubmitting;

  const nextMatchLabel = nextMatch ? getTournamentSubLabel(nextMatch) : null;

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`mx-auto max-w-6xl space-y-4 transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        {nextMatch ? (
          <section className="matchday-card relative overflow-hidden rounded-[34px] p-4 sm:p-5">
            <div className="stadium-lights" />
            <div className="tactical-lines" aria-hidden="true" />
            <div className="light-sweep" aria-hidden="true" />
            <BlurredTeamCrest team={nextMatch.homeTeam} side="left" />
            <BlurredTeamCrest team={nextMatch.awayTeam} side="right" />

            <div className="relative z-10 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/[0.46]">
                  Next match
                </div>
                <h1 className="mt-1 truncate text-2xl font-black text-white sm:text-4xl">
                  {game.name}
                </h1>
              </div>

              <div
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] ${getStatusClasses(
                  nextMatch.status
                )}`}
              >
                {getStatusLabel(nextMatch.status)}
              </div>
            </div>

            <div className="relative z-10 mt-3 flex items-center justify-center">
              <TournamentPill
                tournament={nextMatch.tournament}
                label={nextMatchLabel}
              />
            </div>

            <div className="relative z-10 mt-4 sm:mt-6">
              <MatchScoreboard match={nextMatch} />
            </div>

            <div className="relative z-10 mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-center">
              <div className="rounded-2xl border border-white/[0.1] bg-white/[0.06] px-3 py-2 text-center text-xs font-bold text-white/[0.68] sm:text-left">
                {formatMatchDate(nextMatch.startTime)} •{" "}
                {formatMatchTime(nextMatch.startTime)}
                {(nextMatch.gameMeta?.customWeight ?? 1) > 1
                  ? ` • x${nextMatch.gameMeta?.customWeight}`
                  : nextMatch.gameMeta?.bonusLabel
                  ? ` • ${nextMatch.gameMeta.bonusLabel}`
                  : ""}
              </div>

              <Link
                to={`/games/${game.id}/predict`}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-black text-emerald-950 shadow-[0_16px_34px_rgba(0,0,0,0.24)]"
              >
                Зробити прогноз
              </Link>

              <Link
                to={`/games/${game.id}/matches/${nextMatch.id}`}
                className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.08] px-5 text-sm font-black text-white"
              >
                Матч-центр
              </Link>
            </div>
          </section>
        ) : (
          <section className="matchday-card relative overflow-hidden rounded-[34px] p-5">
            <div className="relative z-10">
              <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white/[0.46]">
                Next match
              </div>
              <h1 className="mt-1 text-3xl font-black text-white">
                {game.name}
              </h1>
              <p className="mt-3 text-sm font-bold text-white/[0.72]">
                Наступний матч скоро з’явиться в календарі.
              </p>
            </div>
          </section>
        )}

        <section className="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="theme-panel-strong rounded-[28px] p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                  Мій сезон
                </div>
                <div className="mt-1 text-lg font-black text-[var(--text)]">
                  {myHighlights?.bestTournamentName ?? "Форма набирається"}
                </div>
              </div>
              <Link
                to={`/games/${game.id}/profile`}
                className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-[11px] font-black text-[var(--text-soft)]"
              >
                Картка
              </Link>
            </div>

            <GameStatStrip myHighlights={myHighlights} />
          </div>

          {myNextChallenge ? (
            <Link
              to={`/games/${game.id}/matches/${myNextChallenge.matchId}`}
              className="match-ticket relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--panel-strong)] p-3 transition hover:translate-y-[-1px]"
            >
              <div className="absolute inset-y-5 -left-3 h-6 w-6 rounded-full bg-[var(--bg)]" />
              <div className="absolute inset-y-5 -right-3 h-6 w-6 rounded-full bg-[var(--bg)]" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                    Наступна місія
                  </div>
                  <div className="mt-1 text-lg font-black text-[var(--text)]">
                    Прогноз ще відкритий
                  </div>
                </div>
                <div className="rounded-full bg-[var(--warning-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--warning)]">
                  {getTimeUntil(myNextChallenge.startTime)}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-[var(--card-highlight)] px-3 py-3">
                <div className="truncate text-sm font-black text-[var(--text)]">
                  {myNextChallenge.homeTeam.shortName ||
                    myNextChallenge.homeTeam.name}
                </div>
                <div className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-xs font-black text-[var(--accent)]">
                  VS
                </div>
                <div className="truncate text-right text-sm font-black text-[var(--text)]">
                  {myNextChallenge.awayTeam.shortName ||
                    myNextChallenge.awayTeam.name}
                </div>
              </div>
            </Link>
          ) : (
            <div className="rounded-[28px] border border-[var(--border)] bg-[var(--panel-strong)] p-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--muted)]">
                Наступна місія
              </div>
              <div className="mt-1 text-lg font-black text-[var(--text)]">
                Усе закрито
              </div>
              <div className="mt-2 text-sm text-[var(--text-soft)]">
                Новий виклик з’явиться після оновлення календаря.
              </div>
            </div>
          )}
        </section>

        <DailyQuizHub
          gameId={game.id}
          nextMatch={nextMatch}
          myHighlights={myHighlights}
        />

        {gameCards.length > 0 ? (
          <section className="locker-room-card relative overflow-hidden rounded-[30px] p-3 sm:p-4">
            <div className="light-sweep light-sweep-slow" aria-hidden="true" />
            <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/[0.46]">
                  Locker Room
                </div>
                <h2 className="mt-1 text-2xl font-black text-white">
                  Форма гравців
                </h2>
              </div>
              <Link
                to={`/games/${game.id}/members`}
                className="rounded-full border border-white/[0.12] bg-white/[0.08] px-3 py-1.5 text-[11px] font-black text-white"
              >
                Squad
              </Link>
            </div>

            <div className="relative z-10 grid gap-3 lg:grid-cols-[auto_1fr] lg:items-center">
              <div className="flex items-center gap-3 rounded-[26px] border border-white/[0.1] bg-white/[0.055] p-3">
                <PlayerFifaCard player={gameCards[0]} featured />
                <div className="min-w-0">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-white/[0.46]">
                    Капітан
                  </div>
                  <div className="mt-1 truncate text-2xl font-black text-white">
                    {gameCards[0].name}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="rounded-2xl bg-white/[0.075] px-2 py-2 text-center">
                      <div className="text-[9px] font-black uppercase text-white/[0.48]">
                        OVR
                      </div>
                      <div className="text-lg font-black text-white">
                        {gameCards[0].card.rating}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.075] px-2 py-2 text-center">
                      <div className="text-[9px] font-black uppercase text-white/[0.48]">
                        EX
                      </div>
                      <div className="text-lg font-black text-white">
                        {gameCards[0].exactHits}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-white/[0.075] px-2 py-2 text-center">
                      <div className="text-[9px] font-black uppercase text-white/[0.48]">
                        ST
                      </div>
                      <div className="text-lg font-black text-white">
                        {gameCards[0].bestStreak}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="-mx-3 overflow-x-auto px-3 pb-2 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="card-depth-row flex min-w-max gap-2">
                  {gameCards.slice(1).map((player, index) => (
                    <div
                      key={player.id}
                      className="card-depth-item"
                      style={{
                        transform: `translateY(${index % 2 === 0 ? 0 : 10}px)`,
                      }}
                    >
                      <PlayerFifaCard player={player} compact />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[var(--text-soft)]">
              Активні турніри
            </h2>
            <Link
              to={`/games/${game.id}/matches`}
              className="text-xs font-black text-[var(--accent)]"
            >
              Календар
            </Link>
          </div>

          {tournamentsOverview.length > 0 ? (
            <div className="-mx-4 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max gap-2">
                {tournamentsOverview.map((tournament) => {
                  const logoSrc = getTournamentLogoSrc(tournament);

                  return (
                    <div
                      key={tournament.id}
                      className="w-[250px] rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-3"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-white/90">
                          {logoSrc ? (
                            <img
                              src={logoSrc}
                              alt={tournament.name}
                              className="h-6 w-6 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-[9px] font-black text-black/70">
                              {tournament.name.slice(0, 2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-black text-[var(--text)]">
                            {tournament.name}
                          </div>
                          <div className="text-[10px] text-[var(--muted)]">
                            {tournament.finishedMatches}/{tournament.totalMatches} матчів
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <MiniTile label="LIVE" value={tournament.liveMatches} tone="warning" />
                        <MiniTile label="Скоро" value={tournament.upcomingMatches} tone="accent" />
                        <MiniTile label="Done" value={tournament.finishedMatches} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="theme-panel rounded-2xl px-3 py-3 text-sm text-[var(--text-soft)]">
              Тут поки пусто.
            </div>
          )}
        </section>
      </div>
    </>
  );
}
