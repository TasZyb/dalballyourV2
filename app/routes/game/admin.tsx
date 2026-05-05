import {
  Form,
  Link,
  useLoaderData,
  useNavigation,
  redirect,
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useMemo, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";

const GAME_MEMBER_ROLE = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;

const MEMBERSHIP_STATUS = {
  ACTIVE: "ACTIVE",
} as const;

const MATCH_STATUS = {
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  FINISHED: "FINISHED",
  CANCELED: "CANCELED",
  POSTPONED: "POSTPONED",
} as const;

type MatchStatusValue = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

function getMatchOutcome(home: number, away: number) {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

function calculateBasePoints(
  predictedHome: number,
  predictedAway: number,
  realHome: number,
  realAway: number
) {
  if (predictedHome === realHome && predictedAway === realAway) return 3;

  const predictedResult = getMatchOutcome(predictedHome, predictedAway);
  const realResult = getMatchOutcome(realHome, realAway);

  return predictedResult === realResult ? 1 : 0;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDatetimeLocal(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function generateInviteCode(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
}

async function getUniqueGameInviteCode() {
  for (let i = 0; i < 30; i++) {
    const code = `${generateInviteCode(4)}-${generateInviteCode(4)}`;

    const existing = await prisma.gameInvite.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error("Не вдалося згенерувати унікальний invite code");
}

async function getFallbackTournament() {
  return prisma.tournament.upsert({
    where: { name: "Без турніру" },
    update: {},
    create: {
      name: "Без турніру",
      slug: "no-tournament",
      type: "SYSTEM",
      isActive: true,
    },
  });
}

async function requireGameAdmin(request: Request, gameId: string) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
    include: {
      user: true,
    },
  });

  const isOwnerByGame = game.ownerId === currentUser.id;
  const isAdminByMembership =
    membership?.role === GAME_MEMBER_ROLE.OWNER ||
    membership?.role === GAME_MEMBER_ROLE.ADMIN;

  if (!isOwnerByGame && !isAdminByMembership) {
    throw redirect(`/games/${gameId}`);
  }

  return {
    currentUser,
    membership,
    game,
    myRole: isOwnerByGame
      ? GAME_MEMBER_ROLE.OWNER
      : membership?.role ?? GAME_MEMBER_ROLE.MEMBER,
  };
}

async function rescoreGameMatch(gameId: string, matchId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      defaultRoundWeight: true,
    },
  });

  const gameMatch = await prisma.gameMatch.findFirst({
    where: {
      gameId,
      matchId,
    },
    include: {
      match: {
        include: {
          round: true,
        },
      },
    },
  });

  if (!game || !gameMatch) return;

  const match = gameMatch.match;

  if (
    match.status !== MATCH_STATUS.FINISHED ||
    match.homeScore === null ||
    match.awayScore === null
  ) {
    await prisma.prediction.updateMany({
      where: {
        gameId,
        matchId,
      },
      data: {
        pointsAwarded: 0,
        weightedPointsAwarded: 0,
        wasExact: false,
        wasOutcomeOnly: false,
        wasWrong: false,
        scoreCalculatedAt: null,
      },
    });

    return;
  }

  const predictions = await prisma.prediction.findMany({
    where: {
      gameId,
      matchId,
    },
  });

  const weightUsed =
    gameMatch.customWeight ??
    match.round?.defaultWeight ??
    game.defaultRoundWeight ??
    1;

  for (const prediction of predictions) {
    const pointsAwarded = calculateBasePoints(
      prediction.predictedHome,
      prediction.predictedAway,
      match.homeScore,
      match.awayScore
    );

    const multiplierUsed = prediction.multiplierUsed ?? 1;
    const weightedPointsAwarded = pointsAwarded * weightUsed * multiplierUsed;

    await prisma.prediction.update({
      where: { id: prediction.id },
      data: {
        weightUsed,
        pointsAwarded,
        weightedPointsAwarded,
        wasExact: pointsAwarded === 3,
        wasOutcomeOnly: pointsAwarded === 1,
        wasWrong: pointsAwarded === 0,
        scoreCalculatedAt: new Date(),
      },
    });
  }
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const { currentUser, game, myRole } = await requireGameAdmin(request, gameId);

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
  });

  const tournaments = await prisma.tournament.findMany({
    include: {
      season: true,
      rounds: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  const members = await prisma.gameMember.findMany({
    where: {
      gameId,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
    include: {
      user: true,
    },
    orderBy: {
      joinedAt: "asc",
    },
  });

  const gameMatches = await prisma.gameMatch.findMany({
    where: {
      gameId,
    },
    include: {
      match: {
        include: {
          tournament: true,
          round: true,
          homeTeam: true,
          awayTeam: true,
          predictions: {
            where: {
              gameId,
            },
            include: {
              user: true,
            },
            orderBy: {
              submittedAt: "desc",
            },
          },
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

  const invites = await prisma.gameInvite.findMany({
    where: {
      gameId,
      revokedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const rounds = tournaments.flatMap((tournament) =>
    tournament.rounds.map((round) => ({
      ...round,
      tournament,
    }))
  );

  return data({
    currentUser,
    game,
    myRole,
    teams,
    tournaments,
    rounds,
    members,
    gameMatches,
    invites,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const { currentUser } = await requireGameAdmin(request, gameId);

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "createInvite") {
    const code = await getUniqueGameInviteCode();

    await prisma.gameInvite.create({
      data: {
        gameId,
        code,
        createdById: currentUser.id,
        roleOnJoin: GAME_MEMBER_ROLE.MEMBER,
        maxUses: null,
        usedCount: 0,
      },
    });

    return redirect(`/games/${gameId}/admin`);
  }

  if (intent === "createTournament") {
    const name = String(formData.get("name") || "").trim();
    const country = String(formData.get("country") || "").trim();
    const type = String(formData.get("type") || "").trim();
    const logo = String(formData.get("logo") || "").trim();

    if (!name) {
      return data({ error: "Вкажи назву турніру." }, { status: 400 });
    }

    await prisma.tournament.upsert({
      where: { name },
      update: {
        country: country || null,
        type: type || null,
        logo: logo || null,
        isActive: true,
      },
      create: {
        name,
        slug: slugify(name),
        country: country || null,
        type: type || null,
        logo: logo || null,
        isActive: true,
      },
    });

    return redirect(`/games/${gameId}/admin`);
  }

  if (intent === "createRound") {
    const tournamentId = String(formData.get("tournamentId") || "");
    const name = String(formData.get("name") || "").trim();
    const orderRaw = String(formData.get("order") || "");
    const defaultWeightRaw = String(formData.get("defaultWeight") || "1");

    if (!tournamentId || !name) {
      return data(
        { error: "Вибери турнір і вкажи назву етапу." },
        { status: 400 }
      );
    }

    const order = orderRaw ? Number(orderRaw) : null;
    const defaultWeight = Number(defaultWeightRaw);

    await prisma.round.upsert({
      where: {
        tournamentId_name: {
          tournamentId,
          name,
        },
      },
      update: {
        slug: slugify(name),
        order: order !== null && !Number.isNaN(order) ? order : null,
        defaultWeight: !Number.isNaN(defaultWeight) ? defaultWeight : 1,
      },
      create: {
        tournamentId,
        name,
        slug: slugify(name),
        order: order !== null && !Number.isNaN(order) ? order : null,
        defaultWeight: !Number.isNaN(defaultWeight) ? defaultWeight : 1,
      },
    });

    return redirect(`/games/${gameId}/admin`);
  }

  if (intent === "createAndAddMatch") {
    const tournamentIdRaw = String(formData.get("tournamentId") || "");
    const roundIdRaw = String(formData.get("roundId") || "");
    const homeTeamId = String(formData.get("homeTeamId") || "");
    const awayTeamId = String(formData.get("awayTeamId") || "");
    const startTimeRaw = String(formData.get("startTime") || "");
    const customWeightRaw = String(formData.get("customWeight") || "");
    const predictionClosesAtRaw = String(
      formData.get("predictionClosesAt") || ""
    );
    const venue = String(formData.get("venue") || "").trim();
    const stageLabel = String(formData.get("stageLabel") || "").trim();
    const matchdayLabel = String(formData.get("matchdayLabel") || "").trim();

    if (!homeTeamId || !awayTeamId || !startTimeRaw) {
      return data(
        { error: "Вибери команди і дату матчу." },
        { status: 400 }
      );
    }

    if (homeTeamId === awayTeamId) {
      return data(
        { error: "Команда не може грати сама проти себе." },
        { status: 400 }
      );
    }

    const fallbackTournament = tournamentIdRaw
      ? null
      : await getFallbackTournament();

    const tournamentId = tournamentIdRaw || fallbackTournament!.id;

    const match = await prisma.match.create({
      data: {
        tournamentId,
        roundId: roundIdRaw || null,
        homeTeamId,
        awayTeamId,
        startTime: new Date(startTimeRaw),
        status: MATCH_STATUS.SCHEDULED,
        venue: venue || null,
        stageLabel: stageLabel || null,
        matchdayLabel: matchdayLabel || null,
      },
    });

    await prisma.gameMatch.create({
      data: {
        gameId,
        matchId: match.id,
        customWeight: customWeightRaw ? Number(customWeightRaw) : null,
        predictionClosesAt: predictionClosesAtRaw
          ? new Date(predictionClosesAtRaw)
          : null,
        includeInLeaderboard: true,
        isLocked: false,
      },
    });

    return redirect(`/games/${gameId}/admin`);
  }

  if (intent === "updateGameMatchSettings") {
    const gameMatchId = String(formData.get("gameMatchId") || "");
    const customWeightRaw = String(formData.get("customWeight") || "");
    const predictionClosesAtRaw = String(
      formData.get("predictionClosesAt") || ""
    );
    const includeInLeaderboard =
      String(formData.get("includeInLeaderboard") || "") === "on";
    const isLocked = String(formData.get("isLocked") || "") === "on";

    if (!gameMatchId) {
      return data({ error: "GameMatch не знайдено." }, { status: 400 });
    }

    const target = await prisma.gameMatch.findFirst({
      where: {
        id: gameMatchId,
        gameId,
      },
    });

    if (!target) {
      return data({ error: "Матч гри не знайдено." }, { status: 404 });
    }

    await prisma.gameMatch.update({
      where: { id: gameMatchId },
      data: {
        customWeight: customWeightRaw ? Number(customWeightRaw) : null,
        predictionClosesAt: predictionClosesAtRaw
          ? new Date(predictionClosesAtRaw)
          : null,
        includeInLeaderboard,
        isLocked,
      },
    });

    await rescoreGameMatch(gameId, target.matchId);

    return redirect(`/games/${gameId}/admin`);
  }

  if (intent === "saveResult") {
    const matchId = String(formData.get("matchId") || "");
    const homeScoreRaw = String(formData.get("homeScore") || "");
    const awayScoreRaw = String(formData.get("awayScore") || "");
    const statusRaw = String(formData.get("status") || MATCH_STATUS.SCHEDULED);

    if (!matchId) {
      return data({ error: "Матч не знайдено." }, { status: 400 });
    }

    const homeScore = homeScoreRaw === "" ? null : Number(homeScoreRaw);
    const awayScore = awayScoreRaw === "" ? null : Number(awayScoreRaw);

    if (
      (homeScoreRaw !== "" && Number.isNaN(homeScore)) ||
      (awayScoreRaw !== "" && Number.isNaN(awayScore))
    ) {
      return data({ error: "Рахунок має бути числом." }, { status: 400 });
    }

    const gameMatch = await prisma.gameMatch.findFirst({
      where: {
        gameId,
        matchId,
      },
    });

    if (!gameMatch) {
      return data(
        { error: "Цей матч не входить у поточну гру." },
        { status: 404 }
      );
    }

    await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore,
        awayScore,
        status: statusRaw as MatchStatusValue,
        lockedAt:
          statusRaw === MATCH_STATUS.SCHEDULED ||
          statusRaw === MATCH_STATUS.POSTPONED
            ? null
            : new Date(),
      },
    });

    if (statusRaw === MATCH_STATUS.FINISHED) {
      await prisma.gameMatch.update({
        where: { id: gameMatch.id },
        data: {
          isLocked: true,
        },
      });
    }

    await rescoreGameMatch(gameId, matchId);

    return redirect(`/games/${gameId}/admin`);
  }

  if (intent === "deletePrediction") {
    const predictionId = String(formData.get("predictionId") || "");

    if (!predictionId) {
      return data({ error: "Прогноз не знайдено." }, { status: 400 });
    }

    const prediction = await prisma.prediction.findFirst({
      where: {
        id: predictionId,
        gameId,
      },
    });

    if (!prediction) {
      return data({ error: "Прогноз не знайдено." }, { status: 404 });
    }

    await prisma.prediction.delete({
      where: { id: predictionId },
    });

    return redirect(`/games/${gameId}/admin`);
  }

  if (intent === "removeMatchFromGame") {
    const gameMatchId = String(formData.get("gameMatchId") || "");

    if (!gameMatchId) {
      return data({ error: "Матч гри не знайдено." }, { status: 400 });
    }

    const gameMatch = await prisma.gameMatch.findFirst({
      where: {
        id: gameMatchId,
        gameId,
      },
    });

    if (!gameMatch) {
      return data({ error: "Матч гри не знайдено." }, { status: 404 });
    }

    await prisma.prediction.deleteMany({
      where: {
        gameId,
        matchId: gameMatch.matchId,
      },
    });

    await prisma.gameMatch.delete({
      where: { id: gameMatchId },
    });

    return redirect(`/games/${gameId}/admin`);
  }

  return data({ error: "Невідома дія." }, { status: 400 });
}

function AdminIcon({
  type,
}: {
  type: "game" | "cup" | "round" | "match" | "live" | "history";
}) {
  if (type === "cup") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M8 4h8v3c0 4-1.7 7-4 7S8 11 8 7V4Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M8 6H5c0 3 1.2 5 3.5 5M16 6h3c0 3-1.2 5-3.5 5M12 14v4M8.5 20h7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === "round") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M6 5h6v5H6V5ZM12 14h6v5h-6v-5Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 7.5h4v6.5M12 16.5H8V10"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === "live") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12 13.5h.01M12 17v.01"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === "history") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M5 12a7 7 0 1 0 2.05-4.95M5 5v4h4"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 8v4l3 2"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === "match") {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M7 8.5 12 6l5 2.5v7L12 18l-5-2.5v-7Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M12 6v12M7 8.5l5 3 5-3"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="M7 7h10v10H7V7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label =
    status === MATCH_STATUS.SCHEDULED
      ? "Заплановано"
      : status === MATCH_STATUS.LIVE
      ? "Live"
      : status === MATCH_STATUS.FINISHED
      ? "Завершено"
      : status === MATCH_STATUS.POSTPONED
      ? "Перенесено"
      : "Скасовано";

  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white/75">
      {status === MATCH_STATUS.LIVE ? (
        <span className="mr-2 h-1.5 w-1.5 rounded-full bg-red-400" />
      ) : null}
      {label}
    </span>
  );
}

function UserName({
  user,
}: {
  user: {
    displayName?: string | null;
    name?: string | null;
    email?: string | null;
  };
}) {
  return <>{user.displayName || user.name || user.email || "Без імені"}</>;
}

export default function GameAdminPage() {
  const { game, teams, tournaments, rounds, members, gameMatches, invites } =
    useLoaderData<typeof loader>();

  const navigation = useNavigation();

  const isRouteLoading = navigation.state === "loading";
  const isSubmitting = navigation.state === "submitting";
  const isBusy = isRouteLoading || isSubmitting;

  const [finishedLimit, setFinishedLimit] = useState(3);

  const { liveMatches, upcomingMatches, finishedMatches } = useMemo(() => {
    const live = gameMatches.filter(
      (gameMatch) => gameMatch.match.status === MATCH_STATUS.LIVE
    );

    const finished = gameMatches.filter(
      (gameMatch) => gameMatch.match.status === MATCH_STATUS.FINISHED
    );

    const upcoming = gameMatches.filter(
      (gameMatch) =>
        gameMatch.match.status !== MATCH_STATUS.LIVE &&
        gameMatch.match.status !== MATCH_STATUS.FINISHED
    );

    return {
      liveMatches: live,
      upcomingMatches: upcoming,
      finishedMatches: finished,
    };
  }, [gameMatches]);

  const activeMatches = [...liveMatches, ...upcomingMatches];
  const visibleFinishedMatches = finishedMatches.slice(0, finishedLimit);

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`space-y-6 pb-10 transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-6 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.22em] text-white/50">
                <AdminIcon type="game" />
                Game Admin
              </div>

              <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                Адмінка гри {game.name}
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60 sm:text-base">
                Основне керування грою: код для друзів, турніри, етапи, матчі,
                live-рахунок, дедлайни та результати прогнозів.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-500/10 p-4 lg:min-w-72">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-200/70">
                Код гри
              </div>
              <div className="mt-2 break-all text-3xl font-black tracking-[0.18em] text-emerald-100">
                {game.inviteCode}
              </div>
              <div className="mt-2 text-sm text-emerald-100/70">
                Цей код даєш друзям для входу в гру.
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to=".."
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              До гри
            </Link>

            <Link
              to="../matches"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Матчі
            </Link>

            <Link
              to="../leaderboard"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Таблиця
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="text-sm text-white/45">Матчів у грі</div>
            <div className="mt-2 text-3xl font-black">{gameMatches.length}</div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="text-sm text-white/45">Live зараз</div>
            <div className="mt-2 text-3xl font-black">{liveMatches.length}</div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="text-sm text-white/45">Учасників</div>
            <div className="mt-2 text-3xl font-black">{members.length}</div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <div className="text-sm text-white/45">Турнірів</div>
            <div className="mt-2 text-3xl font-black">{tournaments.length}</div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <AdminIcon type="match" />
                </div>

                <div>
                  <h2 className="text-2xl font-black">
                    Створити матч і додати в гру
                  </h2>
                  <p className="mt-1 text-sm text-white/50">
                    Турнір і етап можна не вказувати. Якщо турнір не вибрано,
                    матч піде в “Без турніру”.
                  </p>
                </div>
              </div>

              <Form method="post" className="space-y-5">
                <input type="hidden" name="intent" value="createAndAddMatch" />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Домашня команда
                    </label>
                    <select
                      name="homeTeamId"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                      required
                      disabled={isSubmitting}
                    >
                      <option value="">Оберіть команду</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Гостьова команда
                    </label>
                    <select
                      name="awayTeamId"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                      required
                      disabled={isSubmitting}
                    >
                      <option value="">Оберіть команду</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Турнір
                    </label>
                    <select
                      name="tournamentId"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                      disabled={isSubmitting}
                    >
                      <option value="">Без турніру</option>
                      {tournaments.map((tournament) => (
                        <option key={tournament.id} value={tournament.id}>
                          {tournament.name}
                          {tournament.season?.yearLabel
                            ? ` (${tournament.season.yearLabel})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Етап
                    </label>
                    <select
                      name="roundId"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                      disabled={isSubmitting}
                    >
                      <option value="">Без етапу</option>
                      {rounds.map((round) => (
                        <option key={round.id} value={round.id}>
                          {round.tournament.name} · {round.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Дата і час
                    </label>
                    <input
                      name="startTime"
                      type="datetime-local"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                      required
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Дедлайн прогнозу
                    </label>
                    <input
                      name="predictionClosesAt"
                      type="datetime-local"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Вага матчу
                    </label>
                    <input
                      name="customWeight"
                      type="number"
                      min="1"
                      placeholder="1"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Стадіон
                    </label>
                    <input
                      name="venue"
                      placeholder="Wembley"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Підпис етапу
                    </label>
                    <input
                      name="stageLabel"
                      placeholder="1/4 фіналу"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Тур / matchday
                    </label>
                    <input
                      name="matchdayLabel"
                      placeholder="Тур 1"
                      className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Збереження..." : "Створити матч"}
                </button>
              </Form>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <AdminIcon type="live" />
                </div>

                <div>
                  <h2 className="text-2xl font-black">Live і майбутні матчі</h2>
                  <p className="mt-1 text-sm text-white/50">
                    Тут адмін перемикає матч у Live, оновлює рахунок або завершує
                    гру.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {activeMatches.length > 0 ? (
                  activeMatches.map((gameMatch) => {
                    const match = gameMatch.match;

                    return (
                      <div
                        key={gameMatch.id}
                        className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:p-5"
                      >
                        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="mb-2">
                              <StatusBadge status={match.status} />
                            </div>

                            <h3 className="text-xl font-black">
                              {match.homeTeam.name} — {match.awayTeam.name}
                            </h3>

                            <p className="mt-1 text-sm text-white/50">
                              {match.tournament.name}
                              {match.round ? ` · ${match.round.name}` : ""}
                              {" · "}
                              {formatDate(match.startTime)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-3xl font-black">
                            {match.homeScore ?? "—"}:{match.awayScore ?? "—"}
                          </div>
                        </div>

                        <Form
                          method="post"
                          className="grid grid-cols-1 gap-3 md:grid-cols-5"
                        >
                          <input
                            type="hidden"
                            name="intent"
                            value="saveResult"
                          />
                          <input type="hidden" name="matchId" value={match.id} />

                          <input
                            name="homeScore"
                            type="number"
                            min="0"
                            defaultValue={match.homeScore ?? ""}
                            placeholder="Голи 1"
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                            disabled={isSubmitting}
                          />

                          <input
                            name="awayScore"
                            type="number"
                            min="0"
                            defaultValue={match.awayScore ?? ""}
                            placeholder="Голи 2"
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                            disabled={isSubmitting}
                          />

                          <select
                            name="status"
                            defaultValue={match.status}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                            disabled={isSubmitting}
                          >
                            <option value="SCHEDULED">Заплановано</option>
                            <option value="LIVE">Live</option>
                            <option value="FINISHED">Завершено</option>
                            <option value="CANCELED">Скасовано</option>
                            <option value="POSTPONED">Перенесено</option>
                          </select>

                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
                          >
                            {isSubmitting ? "Збереження..." : "Зберегти"}
                          </button>
                        </Form>

                        <Form
                          method="post"
                          className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4"
                        >
                          <input
                            type="hidden"
                            name="intent"
                            value="updateGameMatchSettings"
                          />
                          <input
                            type="hidden"
                            name="gameMatchId"
                            value={gameMatch.id}
                          />

                          <input
                            name="customWeight"
                            type="number"
                            min="1"
                            defaultValue={gameMatch.customWeight ?? ""}
                            placeholder="Вага"
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                            disabled={isSubmitting}
                          />

                          <input
                            name="predictionClosesAt"
                            type="datetime-local"
                            defaultValue={toDatetimeLocal(
                              gameMatch.predictionClosesAt
                            )}
                            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/20"
                            disabled={isSubmitting}
                          />

                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                            <input
                              type="checkbox"
                              name="includeInLeaderboard"
                              defaultChecked={gameMatch.includeInLeaderboard}
                              disabled={isSubmitting}
                            />
                            У таблиці
                          </label>

                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
                            <input
                              type="checkbox"
                              name="isLocked"
                              defaultChecked={gameMatch.isLocked}
                              disabled={isSubmitting}
                            />
                            Locked
                          </label>

                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-4"
                          >
                            {isSubmitting
                              ? "Збереження..."
                              : "Зберегти налаштування матчу"}
                          </button>
                        </Form>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/45">
                    Немає live або майбутніх матчів.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <AdminIcon type="history" />
                </div>

                <div>
                  <h2 className="text-2xl font-black">
                    Історія завершених матчів
                  </h2>
                  <p className="mt-1 text-sm text-white/50">
                    Внизу показуємо тільки 3 останні завершені матчі. Далі можна
                    догрузити ще 3.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {visibleFinishedMatches.length > 0 ? (
                  visibleFinishedMatches.map((gameMatch) => {
                    const match = gameMatch.match;

                    return (
                      <div
                        key={gameMatch.id}
                        className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:p-5"
                      >
                        <div className="mb-4 flex items-start justify-between gap-3">
                          <div>
                            <StatusBadge status={match.status} />

                            <h3 className="mt-2 text-xl font-black">
                              {match.homeTeam.name} — {match.awayTeam.name}
                            </h3>

                            <p className="mt-1 text-sm text-white/50">
                              {match.tournament.name}
                              {match.round ? ` · ${match.round.name}` : ""}
                              {" · "}
                              {formatDate(match.startTime)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-3xl font-black">
                            {match.homeScore}:{match.awayScore}
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/5">
                          <div className="grid grid-cols-[1fr_80px_80px_auto] gap-3 bg-black/20 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-white/45">
                            <div>Учасник</div>
                            <div>Прогноз</div>
                            <div>Бали</div>
                            <div className="text-right">Дії</div>
                          </div>

                          <div className="divide-y divide-white/10">
                            {match.predictions.length > 0 ? (
                              match.predictions.map((prediction) => (
                                <div
                                  key={prediction.id}
                                  className="grid grid-cols-[1fr_80px_80px_auto] items-center gap-3 px-4 py-4 text-sm"
                                >
                                  <div className="min-w-0 truncate font-semibold text-white/85">
                                    <UserName user={prediction.user} />
                                  </div>

                                  <div className="font-bold">
                                    {prediction.predictedHome}:
                                    {prediction.predictedAway}
                                  </div>

                                  <div className="font-bold">
                                    {prediction.weightedPointsAwarded}
                                    <span className="ml-1 text-white/35">
                                      ({prediction.pointsAwarded})
                                    </span>
                                  </div>

                                  <Form method="post" className="text-right">
                                    <input
                                      type="hidden"
                                      name="intent"
                                      value="deletePrediction"
                                    />
                                    <input
                                      type="hidden"
                                      name="predictionId"
                                      value={prediction.id}
                                    />
                                    <button
                                      type="submit"
                                      disabled={isSubmitting}
                                      className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Видалити
                                    </button>
                                  </Form>
                                </div>
                              ))
                            ) : (
                              <div className="px-4 py-8 text-center text-sm text-white/45">
                                Для цього матчу ще немає прогнозів.
                              </div>
                            )}
                          </div>
                        </div>

                        <Form method="post" className="mt-4">
                          <input
                            type="hidden"
                            name="intent"
                            value="removeMatchFromGame"
                          />
                          <input
                            type="hidden"
                            name="gameMatchId"
                            value={gameMatch.id}
                          />
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Прибрати матч з гри
                          </button>
                        </Form>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/45">
                    Завершених матчів поки немає.
                  </div>
                )}
              </div>

              {finishedLimit < finishedMatches.length ? (
                <button
                  type="button"
                  onClick={() => setFinishedLimit((value) => value + 3)}
                  className="mt-5 w-full rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/15"
                >
                  Показати ще 3
                </button>
              ) : null}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <AdminIcon type="cup" />
                </div>

                <div>
                  <h2 className="text-xl font-black">Додати турнір</h2>
                  <p className="mt-1 text-sm text-white/50">
                    ЛЧ, ЛЄ, АПЛ, Кубок тощо.
                  </p>
                </div>
              </div>

              <Form method="post" className="space-y-3">
                <input type="hidden" name="intent" value="createTournament" />

                <input
                  name="name"
                  required
                  placeholder="Ліга чемпіонів"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                  disabled={isSubmitting}
                />

                <input
                  name="country"
                  placeholder="Europe / England"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                  disabled={isSubmitting}
                />

                <input
                  name="type"
                  placeholder="LEAGUE / CUP"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                  disabled={isSubmitting}
                />

                <input
                  name="logo"
                  placeholder="/tournaments/ucl.svg"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                  disabled={isSubmitting}
                />

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Збереження..." : "Додати турнір"}
                </button>
              </Form>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                  <AdminIcon type="round" />
                </div>

                <div>
                  <h2 className="text-xl font-black">Додати етап</h2>
                  <p className="mt-1 text-sm text-white/50">
                    1 тур, 1/8, 1/4, півфінал, фінал.
                  </p>
                </div>
              </div>

              <Form method="post" className="space-y-3">
                <input type="hidden" name="intent" value="createRound" />

                <select
                  name="tournamentId"
                  required
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                  disabled={isSubmitting}
                >
                  <option value="">Оберіть турнір</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.name}
                    </option>
                  ))}
                </select>

                <input
                  name="name"
                  required
                  placeholder="1/4 фіналу"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                  disabled={isSubmitting}
                />

                <div className="grid grid-cols-2 gap-3">
                  <input
                    name="order"
                    type="number"
                    placeholder="Порядок"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                    disabled={isSubmitting}
                  />

                  <input
                    name="defaultWeight"
                    type="number"
                    min="1"
                    defaultValue={1}
                    placeholder="Вага"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                    disabled={isSubmitting}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Збереження..." : "Додати етап"}
                </button>
              </Form>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">Запрошення</h3>
                  <p className="mt-1 text-sm text-white/50">
                    Код гри та додаткові invite-коди.
                  </p>
                </div>

                <Form method="post">
                  <input type="hidden" name="intent" value="createInvite" />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + Код
                  </button>
                </Form>
              </div>

              <div className="mt-5 space-y-4">
                {invites.length > 0 ? (
                  invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="text-sm font-semibold text-white/70">
                        Invite
                      </div>

                      <div className="mt-1 break-all text-lg font-black tracking-[0.14em] text-white">
                        {invite.code}
                      </div>

                      <div className="mt-3 text-sm text-white/50">
                        Використано: {invite.usedCount}
                        {invite.maxUses === null
                          ? " / ∞"
                          : ` / ${invite.maxUses}`}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/45">
                    Додаткових invite-кодів ще немає.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <h3 className="text-lg font-black">Учасники</h3>

              <div className="mt-4 space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                  >
                    <div className="font-bold">
                      <UserName user={member.user} />
                    </div>

                    <div className="mt-1 text-sm text-white/50">
                      {member.role} ·{" "}
                      {new Date(member.joinedAt).toLocaleDateString("uk-UA")}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </>
  );
}