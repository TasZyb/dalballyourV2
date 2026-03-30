import {
  Form,
  Link,
  redirect,
  useLoaderData,
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

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
      return "border-red-500/30 bg-red-500/12 text-red-200";
    case "FINISHED":
      return "border-emerald-500/30 bg-emerald-500/12 text-emerald-200";
    case "SCHEDULED":
      return "border-white/10 bg-white/6 text-white/70";
    case "CANCELED":
      return "border-zinc-500/30 bg-zinc-500/12 text-zinc-300";
    case "POSTPONED":
      return "border-amber-500/30 bg-amber-500/12 text-amber-200";
    default:
      return "border-white/10 bg-white/6 text-white/70";
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

  const openFirstMatch =
    compactMatches.find((item) => !item.isLocked)?.match.id ??
    compactMatches[0]?.match.id ??
    null;

  const selectedMatchId = selectedMatchIdFromUrl ?? openFirstMatch;

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
      ? "h-8 w-8"
      : size === "lg"
      ? "h-20 w-20 sm:h-24 sm:w-24"
      : "h-12 w-12 sm:h-14 sm:w-14";

  const imgClass =
    size === "sm"
      ? "h-5 w-5"
      : size === "lg"
      ? "h-12 w-12 sm:h-14 sm:w-14"
      : "h-7 w-7 sm:h-8 sm:w-8";

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.06]`}
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

function TournamentPill({
  tournament,
  label,
}: {
  tournament?: any;
  label?: string | null;
}) {
  if (!tournament && !label) return null;

  const logoSrc = getTournamentLogoSrc(tournament);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tournament ? (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-white/70">
          <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-white/85">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={tournament.name}
                className="h-3.5 w-3.5 object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-[8px] font-bold text-black/70">
                {tournament.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <span className="max-w-[180px] truncate">{tournament.name}</span>
        </div>
      ) : null}

      {label ? (
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55">
          {label}
        </div>
      ) : null}
    </div>
  );
}

function MatchCarouselCard({
  item,
  isActive,
}: {
  item: any;
  isActive: boolean;
}) {
  const match = item.match;
  const leagueName = match.tournament?.name || "Ліга";

  return (
    <Link
      to={`/games/${item.match.id ? "" : ""}`}
      onClick={(e) => {
        e.preventDefault();
        window.location.href = `?matchId=${match.id}`;
      }}
      className={`block min-w-[185px] snap-start rounded-2xl border px-3 py-3 transition sm:min-w-[210px] ${
        isActive
          ? "border-white/20 bg-white/[0.10] shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
          : "border-white/8 bg-white/[0.04] hover:border-white/15 hover:bg-white/[0.07]"
      }`}
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
            {leagueName}
          </div>

          {match.myPrediction ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-200">
              Є
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
            <TeamLogo team={match.homeTeam} size="sm" />
            <div className="truncate text-[11px] font-bold text-white">
              {match.homeTeam.shortName || match.homeTeam.name}
            </div>
          </div>

          <div className="min-w-[48px] text-center">
            <div className="text-sm font-black tracking-tight text-white">
              {match.myPrediction
                ? `${match.myPrediction.predictedHome}:${match.myPrediction.predictedAway}`
                : "VS"}
            </div>
          </div>

          <div className="flex min-w-0 flex-col items-center gap-1 text-center">
            <TeamLogo team={match.awayTeam} size="sm" />
            <div className="truncate text-[11px] font-bold text-white">
              {match.awayTeam.shortName || match.awayTeam.name}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ScoreStepperInput({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: number | string;
}) {
  return (
    <div className="space-y-3">
      <div className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>

      <input
        type="number"
        min={0}
        name={name}
        defaultValue={defaultValue}
        placeholder="0"
        className="h-20 w-full rounded-[28px] border border-white/10 bg-white/[0.05] px-4 text-center text-4xl font-black tracking-tight text-white outline-none transition placeholder:text-white/20 focus:border-white/20 focus:bg-white/[0.08] sm:h-24 sm:text-5xl"
      />
    </div>
  );
}

function ParticipantPredictionRow({ item }: { item: any }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
        item.isMe
          ? "border-emerald-400/25 bg-emerald-500/10"
          : "border-white/8 bg-white/[0.04]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-sm font-semibold text-white">
            {item.name}
          </div>

          {item.isMe ? (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
              Це ти
            </span>
          ) : null}
        </div>

        <div className="mt-1 text-xs text-white/40">
          {item.prediction
            ? `Подано ${new Date(item.prediction.submittedAt).toLocaleString(
                "uk-UA"
              )}`
            : "Ще без прогнозу"}
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
  const { game, compactMatches, selectedMatchBlock, participantPredictions } =
    useLoaderData<typeof loader>();

  const selected = selectedMatchBlock;
  const selectedMatch = selected?.match;
  const selectedMatchId = selectedMatch?.id ?? null;
  const myPrediction = selectedMatch?.myPrediction ?? null;
  const tournamentSubLabel = selectedMatch
    ? getTournamentSubLabel(selectedMatch)
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-1 sm:px-0">
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/40">
              Match predict
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-4xl">
              Прогнози на матчі
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Обери матч, введи рахунок і за бажанням переходь до розширеного
              прогнозу для гри{" "}
              <span className="font-semibold text-white">{game.name}</span>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="../matches"
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.08] hover:text-white"
            >
              Усі матчі
            </Link>
            <Link
              to="../leaderboard"
              className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/[0.08] hover:text-white"
            >
              Таблиця
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white sm:text-xl">Матчі</h2>
            <p className="text-sm text-white/45">
              На телефоні — свайп, на десктопі — сітка
            </p>
          </div>

          <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-white/55">
            {compactMatches.length}
          </div>
        </div>

        {compactMatches.length > 0 ? (
          <>
            <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 md:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {compactMatches.map((item) => (
                <Link
                  key={item.gameMatchId}
                  to={`?matchId=${item.match.id}`}
                  className="contents"
                >
                  <MatchCarouselCard
                    item={item}
                    isActive={selectedMatchId === item.match.id}
                  />
                </Link>
              ))}
            </div>

            <div className="hidden grid-cols-3 gap-2 md:grid xl:grid-cols-4">
              {compactMatches.map((item) => (
                <Link
                  key={item.gameMatchId}
                  to={`?matchId=${item.match.id}`}
                  className="contents"
                >
                  <MatchCarouselCard
                    item={item}
                    isActive={selectedMatchId === item.match.id}
                  />
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-5 py-8 text-sm text-white/45">
            У цій грі поки немає матчів.
          </div>
        )}
      </section>

      {selectedMatch ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.05] shadow-[0_30px_80px_rgba(0,0,0,0.18)]">
              <div className="relative overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_50%)]" />

                <div className="relative space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <TournamentPill
                      tournament={selectedMatch.tournament}
                      label={tournamentSubLabel}
                    />

                    <div
                      className={`inline-flex rounded-full border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${getStatusClasses(
                        selectedMatch.status
                      )}`}
                    >
                      {getStatusLabel(selectedMatch.status)}
                    </div>
                  </div>

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
                    <div className="flex min-w-0 flex-col items-center gap-3 text-center">
                      <TeamLogo team={selectedMatch.homeTeam} size="lg" />
                      <div>
                        <div className="text-base font-black text-white sm:text-2xl">
                          {selectedMatch.homeTeam.shortName ||
                            selectedMatch.homeTeam.name}
                        </div>
                        <div className="mt-1 text-xs text-white/45 sm:text-sm">
                          Господарі
                        </div>
                      </div>
                    </div>

                    <div className="flex min-w-[90px] flex-col items-center">
                      <div className="text-3xl font-black tracking-tight text-white sm:text-5xl">
                        {myPrediction
                          ? `${myPrediction.predictedHome}:${myPrediction.predictedAway}`
                          : "VS"}
                      </div>
                      <div className="mt-2 text-center text-[11px] leading-5 text-white/50 sm:text-sm">
                        {formatMatchDate(selectedMatch.startTime)}
                        <br />
                        {formatMatchTime(selectedMatch.startTime)}
                      </div>
                    </div>

                    <div className="flex min-w-0 flex-col items-center gap-3 text-center">
                      <TeamLogo team={selectedMatch.awayTeam} size="lg" />
                      <div>
                        <div className="text-base font-black text-white sm:text-2xl">
                          {selectedMatch.awayTeam.shortName ||
                            selectedMatch.awayTeam.name}
                        </div>
                        <div className="mt-1 text-xs text-white/45 sm:text-sm">
                          Гості
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-white/55">
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      Дедлайн:{" "}
                      {new Date(selected.predictionDeadline).toLocaleString(
                        "uk-UA"
                      )}
                    </div>

                    {selected.customWeight ? (
                      <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                        Вага туру: {selected.customWeight}x
                      </div>
                    ) : null}

                    {myPrediction ? (
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-200">
                        Мій прогноз уже збережений
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-white/10 bg-white/[0.05] px-4 py-5 sm:px-6 sm:py-6">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/40">
                    Quick predict
                  </p>
                  <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
                    Швидкий прогноз
                  </h3>
                  <p className="mt-1 text-sm text-white/50">
                    Задай базовий рахунок або перейди до детального прогнозу на матч.
                  </p>
                </div>

                {myPrediction ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/60">
                    Поточний: {myPrediction.predictedHome}:{myPrediction.predictedAway}
                  </div>
                ) : null}
              </div>

              {selected.isLocked ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
                    Прогноз на цей матч уже закритий.
                  </div>

                  {myPrediction ? (
                    <div className="inline-flex rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                      Мій прогноз: {myPrediction.predictedHome}:{myPrediction.predictedAway}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 px-4 py-4 text-sm text-white/45">
                      Ти не встиг подати прогноз.
                    </div>
                  )}
                </div>
              ) : (
                <Form method="post" className="space-y-5">
                  <input type="hidden" name="matchId" value={selectedMatch.id} />

                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
                    <ScoreStepperInput
                      label={selectedMatch.homeTeam.shortName || selectedMatch.homeTeam.name}
                      name="predictedHome"
                      defaultValue={myPrediction?.predictedHome ?? ""}
                    />

                    <div className="pt-8 text-center text-3xl font-black text-white/25 sm:text-5xl">
                      :
                    </div>

                    <ScoreStepperInput
                      label={selectedMatch.awayTeam.shortName || selectedMatch.awayTeam.name}
                      name="predictedAway"
                      defaultValue={myPrediction?.predictedAway ?? ""}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="submit"
                      className="inline-flex h-14 items-center justify-center rounded-[22px] border border-white/15 bg-white px-5 text-sm font-black text-black shadow-[0_14px_34px_rgba(255,255,255,0.10)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_40px_rgba(255,255,255,0.14)]"
                    >
                      {myPrediction ? "Оновити прогноз" : "Зберегти прогноз"}
                    </button>

                    <Link
                      to={`../predict-advanced/${selectedMatch.id}`}
                      className="inline-flex h-14 items-center justify-center rounded-[22px] border border-white/10 bg-white/[0.05] px-5 text-sm font-bold text-white backdrop-blur-sm transition-all duration-200 hover:-translate-y-[1px] hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      {myPrediction ? "Відкрити детальний" : "Детальний прогноз"}
                    </Link>
                  </div>
                </Form>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            <section className="rounded-[28px] border border-white/10 bg-white/[0.05] px-4 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                    Match info
                  </p>
                  <h3 className="mt-2 text-lg font-black text-white">
                    Поточний матч
                  </h3>
                </div>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                  <div className="text-white/40">Дата</div>
                  <div className="mt-1 font-semibold text-white">
                    {formatMatchDate(selectedMatch.startTime)}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                  <div className="text-white/40">Час</div>
                  <div className="mt-1 font-semibold text-white">
                    {formatMatchTime(selectedMatch.startTime)}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                  <div className="text-white/40">Турнір</div>
                  <div className="mt-1 font-semibold text-white">
                    {selectedMatch.tournament?.name || "—"}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-3">
                  <div className="text-white/40">Раунд</div>
                  <div className="mt-1 font-semibold text-white">
                    {tournamentSubLabel || "—"}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.05] px-4 py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                    Players
                  </p>
                  <h3 className="mt-2 text-lg font-black text-white">
                    Прогнози учасників
                  </h3>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/55">
                  {participantPredictions.length}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {participantPredictions.length > 0 ? (
                  participantPredictions.map((item) => (
                    <ParticipantPredictionRow key={item.userId} item={item} />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-white/45">
                    Поки що тут немає прогнозів.
                  </div>
                )}
              </div>
            </section>
          </aside>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-white/50">
          Немає доступного матчу для вибору.
        </section>
      )}
    </div>
  );
}