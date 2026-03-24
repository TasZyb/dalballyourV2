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

  throw redirect(`?matchId=${matchId}`);
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

function TeamCell({
  team,
  align = "left",
  strong = false,
}: {
  team: any;
  align?: "left" | "right";
  strong?: boolean;
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
          <div
            className={`truncate ${
              strong
                ? "text-sm font-bold text-white sm:text-base"
                : "text-[13px] font-semibold text-white sm:text-sm"
            }`}
          >
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
          <div
            className={`truncate ${
              strong
                ? "text-sm font-bold text-white sm:text-base"
                : "text-[13px] font-semibold text-white sm:text-sm"
            }`}
          >
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
  tournament?: any;
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

function MatchPickerItem({
  item,
  selectedMatchId,
}: {
  item: any;
  selectedMatchId: string | null;
}) {
  const match = item.match;
  const isActive = selectedMatchId === match.id;
  const tournamentSubLabel = getTournamentSubLabel(match);

  return (
    <Link
      to={`?matchId=${match.id}`}
      className={`block rounded-2xl border px-3 py-2.5 transition ${
        isActive
          ? "border-white/20 bg-white/[0.08]"
          : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TournamentBadge
            tournament={match.tournament}
            label={tournamentSubLabel}
          />

          <div className="flex shrink-0 items-center gap-1.5">
            {match.myPrediction ? (
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
                Є прогноз
              </span>
            ) : null}

            {item.isLocked ? (
              <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65">
                Закрито
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <TeamCell team={match.homeTeam} align="left" />
          <div className="flex min-w-[72px] flex-col items-center justify-center">
            <div className="text-sm font-black tracking-tight text-white">
              {match.myPrediction
                ? `${match.myPrediction.predictedHome}:${match.myPrediction.predictedAway}`
                : "vs"}
            </div>
            <div className="mt-0.5 text-[10px] text-white/40">
              {formatMatchDate(match.startTime)} • {formatMatchTime(match.startTime)}
            </div>
          </div>
          <TeamCell team={match.awayTeam} align="right" />
        </div>
      </div>
    </Link>
  );
}

function ParticipantPredictionRow({ item }: { item: any }) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 ${
        item.isMe
          ? "border-emerald-400/25 bg-emerald-500/10"
          : "border-white/8 bg-white/[0.03]"
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
            : "Прогноз ще не подано"}
        </div>
      </div>

      <div className="shrink-0">
        {item.prediction ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm font-black text-white">
            {item.prediction.predictedHome}:{item.prediction.predictedAway}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-1.5 text-sm text-white/35">
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

  const selectedMatchId = selectedMatchBlock?.match?.id ?? null;
  const selected = selectedMatchBlock;
  const selectedMatch = selected?.match;
  const myPrediction = selectedMatch?.myPrediction ?? null;
  const tournamentSubLabel = selectedMatch
    ? getTournamentSubLabel(selectedMatch)
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
              Predict
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
              Прогнози на матчі
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Обери матч, постав рахунок і одразу подивись, хто вже подав свій прогноз у грі{" "}
              <span className="font-semibold text-white">{game.name}</span>.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              to="../matches"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Усі матчі
            </Link>
            <Link
              to="../leaderboard"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              Таблиця
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-white sm:text-xl">Матчі</h2>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
              {compactMatches.length}
            </span>
          </div>

          {compactMatches.length > 0 ? (
            <div className="space-y-2">
              {compactMatches.map((item) => (
                <MatchPickerItem
                  key={item.gameMatchId}
                  item={item}
                  selectedMatchId={selectedMatchId}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-white/45">
              У цій грі поки немає матчів.
            </div>
          )}
        </aside>

        <div className="space-y-6">
          {selectedMatch ? (
            <>
              <section className="space-y-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4 sm:px-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <TournamentBadge
                        tournament={selectedMatch.tournament}
                        label={tournamentSubLabel}
                      />

                      <div
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${getStatusClasses(
                          selectedMatch.status
                        )}`}
                      >
                        {getStatusLabel(selectedMatch.status)}
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <TeamCell team={selectedMatch.homeTeam} align="left" strong />
                      <div className="flex min-w-[84px] flex-col items-center justify-center">
                        <div className="text-lg font-black tracking-tight text-white sm:text-xl">
                          {myPrediction
                            ? `${myPrediction.predictedHome}:${myPrediction.predictedAway}`
                            : "vs"}
                        </div>
                        <div className="mt-1 text-[11px] text-white/45">
                          {formatMatchDate(selectedMatch.startTime)} •{" "}
                          {formatMatchTime(selectedMatch.startTime)}
                        </div>
                      </div>
                      <TeamCell team={selectedMatch.awayTeam} align="right" strong />
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-white/50">
                      <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                        Дедлайн:{" "}
                        {new Date(selected.predictionDeadline).toLocaleString("uk-UA")}
                      </div>

                      {selected?.customWeight ? (
                        <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                          Вага: {selected.customWeight}x
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.04] px-4 py-4 sm:px-5">
                  {selected.isLocked ? (
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-white/70">
                        Прогноз на цей матч уже закритий.
                      </div>

                      {myPrediction ? (
                        <div className="inline-flex rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">
                          Мій прогноз: {myPrediction.predictedHome}:{myPrediction.predictedAway}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm text-white/45">
                          Ти не встиг подати прогноз.
                        </div>
                      )}
                    </div>
                  ) : (
                    <Form method="post" className="space-y-4">
                      <input type="hidden" name="matchId" value={selectedMatch.id} />

                      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 sm:gap-4">
                        <div>
                          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                            {selectedMatch.homeTeam.shortName || selectedMatch.homeTeam.name}
                          </label>
                          <input
                            type="number"
                            min={0}
                            name="predictedHome"
                            defaultValue={myPrediction?.predictedHome ?? ""}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xl font-black text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                            placeholder="0"
                          />
                        </div>

                        <div className="pb-3 text-lg font-black text-white/30">:</div>

                        <div>
                          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">
                            {selectedMatch.awayTeam.shortName || selectedMatch.awayTeam.name}
                          </label>
                          <input
                            type="number"
                            min={0}
                            name="predictedAway"
                            defaultValue={myPrediction?.predictedAway ?? ""}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-xl font-black text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-sm text-white/50">
                          {myPrediction
                            ? `Поточний прогноз: ${myPrediction.predictedHome}:${myPrediction.predictedAway}`
                            : "Ти ще не подавав прогноз на цей матч"}
                        </div>

                        <button
                          type="submit"
                          className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-bold text-black transition hover:opacity-90"
                        >
                          {myPrediction ? "Оновити прогноз" : "Зберегти прогноз"}
                        </button>
                      </div>
                    </Form>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-white sm:text-xl">
                    Прогнози учасників
                  </h3>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/55">
                    {participantPredictions.length}
                  </span>
                </div>

                {participantPredictions.length > 0 ? (
                  <div className="space-y-2">
                    {participantPredictions.map((item) => (
                      <ParticipantPredictionRow key={item.userId} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-white/45">
                    Поки що тут немає прогнозів.
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-white/50">
              Немає доступного матчу для вибору.
            </section>
          )}
        </div>
      </section>
    </div>
  );
}