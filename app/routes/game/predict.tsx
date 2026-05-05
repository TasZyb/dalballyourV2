import {
  Form,
  Link,
  redirect,
  useLoaderData,
  useActionData,
  useNavigation,
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";

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

function getPredictionDeadline(startTime: Date, lockMinutesBeforeStart: number) {
  return new Date(startTime.getTime() - lockMinutesBeforeStart * 60 * 1000);
}

function isPredictionLocked(params: {
  matchStatus: string;
  startTime: Date;
  gameMatchIsLocked: boolean;
  predictionClosesAt: Date | null;
  gameLockMinutesBeforeStart: number;
}) {
  const now = new Date();

  if (params.gameMatchIsLocked) return true;
  if (params.matchStatus !== "SCHEDULED") return true;

  const deadline =
    params.predictionClosesAt ??
    getPredictionDeadline(params.startTime, params.gameLockMinutesBeforeStart);

  return now >= deadline;
}

function getDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!currentUser) {
    throw redirect("/login");
  }

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: "ACTIVE",
    },
  });

  if (!membership) {
    throw redirect("/");
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      lockMinutesBeforeStart: true,
      allowMemberPredictionsEdit: true,
      timezone: true,
    },
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

  const url = new URL(request.url);
  const selectedMatchIdFromUrl = url.searchParams.get("matchId");

  const gameMatches = await prisma.gameMatch.findMany({
    where: { gameId },
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
              userId: currentUser.id,
            },
            take: 1,
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

  const compactMatches = gameMatches.map((gameMatch) => {
    const myPrediction = gameMatch.match.predictions[0] ?? null;

    const locked = isPredictionLocked({
      matchStatus: gameMatch.match.status,
      startTime: gameMatch.match.startTime,
      gameMatchIsLocked: gameMatch.isLocked,
      predictionClosesAt: gameMatch.predictionClosesAt,
      gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
    });

    const deadline =
      gameMatch.predictionClosesAt ??
      getPredictionDeadline(
        gameMatch.match.startTime,
        game.lockMinutesBeforeStart
      );

    return {
      gameMatchId: gameMatch.id,
      isLocked: locked,
      predictionDeadline: deadline,
      customWeight: gameMatch.customWeight,
      match: {
        id: gameMatch.match.id,
        status: gameMatch.match.status,
        startTime: gameMatch.match.startTime,
        tournament: gameMatch.match.tournament,
        round: gameMatch.match.round,
        stageLabel: gameMatch.match.stageLabel,
        matchdayLabel: gameMatch.match.matchdayLabel,
        homeTeam: gameMatch.match.homeTeam,
        awayTeam: gameMatch.match.awayTeam,
        myPrediction,
      },
    };
  });

  const pickerMatches = compactMatches.filter(
    (item) =>
      item.match.status !== "FINISHED" &&
      item.match.status !== "CANCELED" &&
      item.match.status !== "POSTPONED"
  );

  const selectedMatchId =
    selectedMatchIdFromUrl &&
    pickerMatches.some((item) => item.match.id === selectedMatchIdFromUrl)
      ? selectedMatchIdFromUrl
      : null;

  let selectedMatchBlock: any = null;
  let participantPredictions: any[] = [];

  if (selectedMatchId) {
    const selectedGameMatch = await prisma.gameMatch.findFirst({
      where: {
        gameId,
        matchId: selectedMatchId,
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
            },
          },
        },
      },
    });

    if (selectedGameMatch) {
      const selectedLocked = isPredictionLocked({
        matchStatus: selectedGameMatch.match.status,
        startTime: selectedGameMatch.match.startTime,
        gameMatchIsLocked: selectedGameMatch.isLocked,
        predictionClosesAt: selectedGameMatch.predictionClosesAt,
        gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
      });

      const selectedDeadline =
        selectedGameMatch.predictionClosesAt ??
        getPredictionDeadline(
          selectedGameMatch.match.startTime,
          game.lockMinutesBeforeStart
        );

      selectedMatchBlock = {
        gameMatchId: selectedGameMatch.id,
        isLocked: selectedLocked,
        predictionDeadline: selectedDeadline,
        customWeight: selectedGameMatch.customWeight,
        match: {
          ...selectedGameMatch.match,
          myPrediction:
            selectedGameMatch.match.predictions.find(
              (p) => p.userId === currentUser.id
            ) ?? null,
        },
      };

      const activeMembers = await prisma.gameMember.findMany({
        where: {
          gameId,
          status: "ACTIVE",
        },
        include: {
          user: true,
        },
      });

      participantPredictions = activeMembers
        .map((member) => {
          const prediction =
            selectedGameMatch.match.predictions.find(
              (p) => p.userId === member.userId
            ) ?? null;

          return {
            userId: member.user.id,
            name: getDisplayName(member.user),
            isMe: member.user.id === currentUser.id,
            role: member.role,
            prediction,
          };
        })
        .sort((a, b) => {
          if (a.isMe) return -1;
          if (b.isMe) return 1;
          if (a.prediction && !b.prediction) return -1;
          if (!a.prediction && b.prediction) return 1;
          return a.name.localeCompare(b.name, "uk");
        });
    }
  }

  return data({
    currentUser,
    game,
    compactMatches,
    pickerMatches,
    selectedMatchBlock,
    participantPredictions,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!currentUser) {
    throw redirect("/login");
  }

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const formData = await request.formData();

  const matchId = String(formData.get("matchId") || "");
  const predictedHome = Number(formData.get("predictedHome"));
  const predictedAway = Number(formData.get("predictedAway"));

  if (!matchId) {
    return data({ error: "Матч не знайдено." }, { status: 400 });
  }

  if (
    Number.isNaN(predictedHome) ||
    Number.isNaN(predictedAway) ||
    predictedHome < 0 ||
    predictedAway < 0
  ) {
    return data({ error: "Введи коректний рахунок." }, { status: 400 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: "ACTIVE",
    },
  });

  if (!membership) {
    return data({ error: "Ти не є учасником цієї гри." }, { status: 403 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      lockMinutesBeforeStart: true,
      allowMemberPredictionsEdit: true,
      defaultRoundWeight: true,
    },
  });

  if (!game) {
    return data({ error: "Гру не знайдено." }, { status: 404 });
  }

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

  if (!gameMatch) {
    return data({ error: "Матч не входить у цю гру." }, { status: 404 });
  }

  const locked = isPredictionLocked({
    matchStatus: gameMatch.match.status,
    startTime: gameMatch.match.startTime,
    gameMatchIsLocked: gameMatch.isLocked,
    predictionClosesAt: gameMatch.predictionClosesAt,
    gameLockMinutesBeforeStart: game.lockMinutesBeforeStart,
  });

  if (locked) {
    return data(
      { error: "Прогноз на цей матч уже закритий." },
      { status: 400 }
    );
  }

  const existingPrediction = await prisma.prediction.findUnique({
    where: {
      userId_gameId_matchId: {
        userId: currentUser.id,
        gameId,
        matchId,
      },
    },
  });

  if (existingPrediction && !game.allowMemberPredictionsEdit) {
    return data(
      { error: "У цій грі редагування прогнозів вимкнене." },
      { status: 400 }
    );
  }

  const weightUsed =
    gameMatch.customWeight ??
    gameMatch.match.round?.defaultWeight ??
    game.defaultRoundWeight ??
    1;

  await prisma.prediction.upsert({
    where: {
      userId_gameId_matchId: {
        userId: currentUser.id,
        gameId,
        matchId,
      },
    },
    create: {
      userId: currentUser.id,
      gameId,
      matchId,
      predictedHome,
      predictedAway,
      pointsAwarded: 0,
      weightUsed,
      weightedPointsAwarded: 0,
      multiplierUsed: 1,
      wasExact: false,
      wasOutcomeOnly: false,
      wasWrong: false,
      submittedAt: new Date(),
    },
    update: {
      predictedHome,
      predictedAway,
      weightUsed,
      updatedAt: new Date(),
    },
  });

  throw redirect(`/games/${gameId}/predict?matchId=${matchId}`);
}

function formatMatchDate(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(date));
}

function formatMatchDateFull(date: Date | string) {
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

function getTeamLogoSrc(team: any) {
  if (team.logo) return team.logo;
  if (team.shortName) return `/teams/${team.shortName}.svg`;
  return null;
}

function getTournamentLogoSrc(tournament?: any) {
  if (!tournament) return null;
  if (tournament.logo) return `/teams/${tournament.logo}.svg`;
  return null;
}

function getTournamentSubLabel(match: any) {
  return match.round?.name || match.stageLabel || match.matchdayLabel || null;
}

function TeamLogo({
  team,
  size = "md",
}: {
  team: any;
  size?: "sm" | "md" | "lg";
}) {
  const logoSrc = getTeamLogoSrc(team);

  const sizeClass =
    size === "sm"
      ? "h-10 w-10"
      : size === "lg"
      ? "h-16 w-16 sm:h-20 sm:w-20"
      : "h-12 w-12 sm:h-14 sm:w-14";

  const imgClass =
    size === "sm"
      ? "h-6 w-6"
      : size === "lg"
      ? "h-10 w-10 sm:h-12 sm:w-12"
      : "h-7 w-7 sm:h-8 sm:w-8";

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.07]`}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={team.name}
          className={`${imgClass} object-contain`}
          loading="lazy"
        />
      ) : (
        <span className="text-[9px] font-black uppercase tracking-wide text-white/65">
          {(team.shortName || team.name).slice(0, 3)}
        </span>
      )}
    </div>
  );
}

function TinyIconClock() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v5l3 2" />
    </svg>
  );
}

function TinyIconLive() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}

function TinyIconUsers() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1" />
      <circle cx="10" cy="7" r="3" />
      <path d="M20 19v-1a4 4 0 0 0-3-3.87" />
      <path d="M16 4.13a3 3 0 0 1 0 5.74" />
    </svg>
  );
}

function TinyIconArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M5 12h14" />
      <path d="M13 5l7 7-7 7" />
    </svg>
  );
}

function TinyIconBall() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M9 9l3-2 3 2v3l-3 2-3-2z" />
    </svg>
  );
}

function TinyIconSpark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4 fill-none stroke-current stroke-2"
    >
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
    </svg>
  );
}

function MatchPickerCard({
  item,
  isActive,
}: {
  item: any;
  isActive: boolean;
}) {
  const match = item.match;
  const label = getTournamentSubLabel(match);
  const isLockedCard = item.isLocked;
  const leagueLogo = getTournamentLogoSrc(match.tournament);

  return (
    <Link
      to={`?matchId=${match.id}`}
      className={`group relative block min-w-[235px] overflow-hidden rounded-[28px] border p-3 transition ${
        isActive
          ? "border-white/20 bg-white/[0.11] shadow-[0_18px_40px_rgba(0,0,0,0.18)]"
          : "border-white/8 bg-white/[0.05] hover:-translate-y-[1px] hover:border-white/15 hover:bg-white/[0.08]"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_55%)]" />

      <div className="relative space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">
              <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white/85">
                {leagueLogo ? (
                  <img
                    src={leagueLogo}
                    alt={match.tournament?.name || "Tournament"}
                    className="h-3.5 w-3.5 object-contain"
                    loading="lazy"
                  />
                ) : (
                  <TinyIconBall />
                )}
              </div>
              <span className="truncate">
                {match.tournament?.name || "Матч"}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            {match.status === "LIVE" ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-red-200">
                <TinyIconLive />
                Live
              </span>
            ) : null}

            {match.myPrediction ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200">
                <TinyIconSpark />
                Мій
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamLogo team={match.homeTeam} size="sm" />
            <div className="truncate text-[11px] font-black text-white">
              {match.homeTeam.shortName || match.homeTeam.name}
            </div>
          </div>

          <div className="min-w-[64px] text-center">
            <div className="text-base font-black tracking-tight text-white">
              {match.myPrediction
                ? `${match.myPrediction.predictedHome}:${match.myPrediction.predictedAway}`
                : "VS"}
            </div>

            <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/35">
              {isLockedCard ? "Закрито" : "Open"}
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
            <TeamLogo team={match.awayTeam} size="sm" />
            <div className="truncate text-[11px] font-black text-white">
              {match.awayTeam.shortName || match.awayTeam.name}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/45">
          <span>{formatMatchDate(match.startTime)}</span>
          <span className="text-white/20">•</span>
          <span>{formatMatchTime(match.startTime)}</span>
          {label ? (
            <>
              <span className="text-white/20">•</span>
              <span className="truncate">{label}</span>
            </>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function QuickScoreInput({
  name,
  teamName,
  defaultValue,
  disabled = false,
}: {
  name: string;
  teamName: string;
  defaultValue?: number | string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
        {teamName}
      </div>

      <input
        type="number"
        min={0}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder="0"
        className="h-16 w-full rounded-[24px] border border-white/10 bg-white/[0.05] px-4 text-center text-3xl font-black tracking-tight text-white outline-none transition placeholder:text-white/20 focus:border-white/20 focus:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60 sm:h-20 sm:text-4xl"
      />
    </div>
  );
}

function PredictionPersonRow({ item }: { item: any }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        item.isMe
          ? "border-emerald-400/25 bg-emerald-500/10"
          : "border-white/8 bg-white/[0.04]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-semibold text-white">
            {item.name}
          </div>

          {item.isMe ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
              Ти
            </span>
          ) : null}
        </div>

        <div className="mt-1 text-xs text-white/40">
          {item.prediction ? "Подано прогноз" : "Ще без прогнозу"}
        </div>
      </div>

      <div className="shrink-0">
        {item.prediction ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm font-black text-white">
            {item.prediction.predictedHome}:{item.prediction.predictedAway}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-1.5 text-sm text-white/30">
            —
          </div>
        )}
      </div>
    </div>
  );
}

export default function PredictPage() {
  const navigation = useNavigation();

  const { game, pickerMatches, selectedMatchBlock, participantPredictions } =
    useLoaderData<typeof loader>();

  const actionData = useActionData<typeof action>();

  const isRouteLoading = navigation.state === "loading";
  const isSubmitting = navigation.state === "submitting";
  const isBusy = isRouteLoading || isSubmitting;

  const selected = selectedMatchBlock;
  const selectedMatch = selected?.match ?? null;
  const myPrediction = selectedMatch?.myPrediction ?? null;
  const tournamentSubLabel = selectedMatch
    ? getTournamentSubLabel(selectedMatch)
    : null;

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`mx-auto max-w-5xl space-y-6 px-1 transition sm:px-0 ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        <section className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                <TinyIconBall />
                Predict
              </div>

              <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                Прогнози
              </h1>

              <div className="mt-2 text-sm text-white/45">
                Обери матч і постав рахунок
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                to="../matches"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.08] hover:text-white"
              >
                <TinyIconBall />
                Матчі
              </Link>

              <Link
                to="../leaderboard"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.08] hover:text-white"
              >
                <TinyIconUsers />
                Таблиця
              </Link>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-white">
              <TinyIconClock />
              <h2 className="text-base font-bold sm:text-lg">Вибір матчу</h2>
            </div>

            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
              {pickerMatches.length}
            </div>
          </div>

          {pickerMatches.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {pickerMatches.map((item) => (
                <MatchPickerCard
                  key={item.gameMatchId}
                  item={item}
                  isActive={selectedMatch?.id === item.match.id}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
              Немає матчів для прогнозу
            </div>
          )}
        </section>

        {!selectedMatch ? (
          <section className="rounded-[30px] border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60">
              <TinyIconArrow />
            </div>

            <h3 className="mt-4 text-lg font-black text-white">
              Спочатку обери матч
            </h3>

            <p className="mt-2 text-sm text-white/45">
              Після вибору тут з’явиться швидкий прогноз і ставки учасників
            </p>
          </section>
        ) : (
          <div className="space-y-5">
            <section className="rounded-[32px] border border-white/10 bg-white/[0.05] px-4 py-5 sm:px-6 sm:py-6">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedMatch.tournament ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
                        <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white/85">
                          {getTournamentLogoSrc(selectedMatch.tournament) ? (
                            <img
                              src={getTournamentLogoSrc(selectedMatch.tournament)!}
                              alt={selectedMatch.tournament.name}
                              className="h-3.5 w-3.5 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <TinyIconBall />
                          )}
                        </div>
                        <span>{selectedMatch.tournament.name}</span>
                      </div>
                    ) : null}

                    {tournamentSubLabel ? (
                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55">
                        {tournamentSubLabel}
                      </div>
                    ) : null}
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/65">
                    <span
                      className={`h-2 w-2 rounded-full ${getStatusDotClass(
                        selectedMatch.status
                      )}`}
                    />
                    {getStatusLabel(selectedMatch.status)}
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
                  <div className="flex min-w-0 flex-col items-center gap-3 text-center">
                    <TeamLogo team={selectedMatch.homeTeam} size="lg" />
                    <div className="text-base font-black text-white sm:text-xl">
                      {selectedMatch.homeTeam.shortName ||
                        selectedMatch.homeTeam.name}
                    </div>
                  </div>

                  <div className="flex min-w-[96px] flex-col items-center">
                    <div className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                      {myPrediction
                        ? `${myPrediction.predictedHome}:${myPrediction.predictedAway}`
                        : "VS"}
                    </div>

                    <div className="mt-2 text-center text-xs text-white/45 sm:text-sm">
                      {formatMatchDateFull(selectedMatch.startTime)}
                      <br />
                      {formatMatchTime(selectedMatch.startTime)}
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-col items-center gap-3 text-center">
                    <TeamLogo team={selectedMatch.awayTeam} size="lg" />
                    <div className="text-base font-black text-white sm:text-xl">
                      {selectedMatch.awayTeam.shortName ||
                        selectedMatch.awayTeam.name}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-white/55">
                    <TinyIconClock />
                    Дедлайн:{" "}
                    {new Date(selected.predictionDeadline).toLocaleString("uk-UA")}
                  </div>

                  {selected.customWeight ? (
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-white/55">
                      Вага: {selected.customWeight}x
                    </div>
                  ) : null}

                  {myPrediction ? (
                    <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">
                      Прогноз уже є
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-white/[0.05] px-4 py-5 sm:px-6 sm:py-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-white">
                    <TinyIconBall />
                    <h3 className="text-lg font-black sm:text-xl">
                      Швидкий прогноз
                    </h3>
                  </div>

                  <div className="mt-1 text-sm text-white/45">
                    Просто введи рахунок
                  </div>
                </div>

                {myPrediction ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/60">
                    Поточний: {myPrediction.predictedHome}:
                    {myPrediction.predictedAway}
                  </div>
                ) : null}
              </div>

              {actionData?.error ? (
                <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {actionData.error}
                </div>
              ) : null}

              {selected.isLocked ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                    Прогноз на цей матч уже закритий
                  </div>

                  {myPrediction ? (
                    <div className="inline-flex rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                      Мій прогноз: {myPrediction.predictedHome}:
                      {myPrediction.predictedAway}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-white/45">
                      Ти не встиг подати прогноз
                    </div>
                  )}
                </div>
              ) : (
                <Form method="post" className="space-y-4">
                  <input type="hidden" name="matchId" value={selectedMatch.id} />

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
                    <QuickScoreInput
                      name="predictedHome"
                      teamName={
                        selectedMatch.homeTeam.shortName ||
                        selectedMatch.homeTeam.name
                      }
                      defaultValue={myPrediction?.predictedHome ?? ""}
                      disabled={isSubmitting}
                    />

                    <div className="pt-7 text-center text-3xl font-black text-white/25 sm:text-5xl">
                      :
                    </div>

                    <QuickScoreInput
                      name="predictedAway"
                      teamName={
                        selectedMatch.awayTeam.shortName ||
                        selectedMatch.awayTeam.name
                      }
                      defaultValue={myPrediction?.predictedAway ?? ""}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="inline-flex h-14 items-center justify-center gap-2 rounded-[22px] border border-white/15 bg-white px-5 text-sm font-black text-black transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <TinyIconBall />
                      {isSubmitting
                        ? "Зберігаю..."
                        : myPrediction
                        ? "Оновити прогноз"
                        : "Зберегти прогноз"}
                    </button>

                    <Link
                      to={`../predict-advanced/${selectedMatch.id}`}
                      className="inline-flex h-14 items-center justify-center gap-2 rounded-[22px] border border-white/10 bg-white/[0.05] px-5 text-sm font-bold text-white transition hover:-translate-y-[1px] hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      <TinyIconArrow />
                      Детальний прогноз
                    </Link>
                  </div>
                </Form>
              )}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.05] px-4 py-5 sm:px-6 sm:py-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-white">
                  <TinyIconUsers />
                  <h3 className="text-lg font-black sm:text-xl">
                    Хто як поставив
                  </h3>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
                  {participantPredictions.length}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {participantPredictions.length > 0 ? (
                  participantPredictions.map((item) => (
                    <PredictionPersonRow key={item.userId} item={item} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/45">
                    Поки що тут немає прогнозів
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </>
  );
}