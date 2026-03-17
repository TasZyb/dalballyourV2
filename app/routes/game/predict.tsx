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

function MatchPickerItem({
  item,
  selectedMatchId,
}: {
  item: any;
  selectedMatchId: string | null;
}) {
  const match = item.match;
  const isActive = selectedMatchId === match.id;

  return (
    <Link
      to={`?matchId=${match.id}`}
      className={`block rounded-2xl border px-3 py-3 transition ${
        isActive
          ? "border-white bg-white text-black"
          : "border-white/10 bg-black/20 text-white hover:border-white/20 hover:bg-white/[0.06]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">
            {match.homeTeam.shortName || match.homeTeam.name}{" "}
            <span className={isActive ? "text-black/50" : "text-white/35"}>
              vs
            </span>{" "}
            {match.awayTeam.shortName || match.awayTeam.name}
          </div>

          <div
            className={`mt-1 text-xs ${
              isActive ? "text-black/60" : "text-white/45"
            }`}
          >
            {new Date(match.startTime).toLocaleString("uk-UA")}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {match.myPrediction ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                isActive
                  ? "bg-black/10 text-black/75"
                  : "border border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
              }`}
            >
              Є прогноз
            </span>
          ) : null}

          {item.isLocked ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${
                isActive
                  ? "bg-black/10 text-black/75"
                  : "border border-white/10 bg-white/10 text-white/70"
              }`}
            >
              Закрито
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export default function PredictPage() {
  const { game, compactMatches, selectedMatchBlock, participantPredictions } =
    useLoaderData<typeof loader>();

  const selectedMatchId = selectedMatchBlock?.match?.id ?? null;
  const selected = selectedMatchBlock;
  const selectedMatch = selected?.match;
  const myPrediction = selectedMatch?.myPrediction ?? null;

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Predict
            </div>

            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Обери матч і зроби прогноз
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
              У грі <span className="font-semibold text-white">{game.name}</span>{" "}
              ти обираєш матч, ставиш рахунок і одразу бачиш, хто що поставив.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="../matches"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Усі матчі
            </Link>

            <Link
              to="../leaderboard"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Таблиця
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:rounded-[2rem] sm:p-5">
          <div className="mb-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
              Матчі
            </div>
            <h2 className="mt-1 text-xl font-black">Вибір матчу</h2>
          </div>

          <div className="space-y-3">
            {compactMatches.length > 0 ? (
              compactMatches.map((item) => (
                <MatchPickerItem
                  key={item.gameMatchId}
                  item={item}
                  selectedMatchId={selectedMatchId}
                />
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
                У цій грі поки немає матчів.
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {selectedMatch ? (
            <>
              <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                      <span>{selectedMatch.tournament.name}</span>
                      {selectedMatch.round ? (
                        <>
                          <span className="text-white/20">•</span>
                          <span>{selectedMatch.round.name}</span>
                        </>
                      ) : null}
                      {selected?.customWeight ? (
                        <>
                          <span className="text-white/20">•</span>
                          <span>Вага {selected.customWeight}x</span>
                        </>
                      ) : null}
                    </div>

                    <h2 className="mt-3 text-2xl font-black sm:text-3xl">
                      {selectedMatch.homeTeam.name}{" "}
                      <span className="text-white/30">vs</span>{" "}
                      {selectedMatch.awayTeam.name}
                    </h2>

                    <div className="mt-4 flex flex-wrap gap-3 text-sm text-white/60">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        {new Date(selectedMatch.startTime).toLocaleString("uk-UA")}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        Статус: {getStatusLabel(selectedMatch.status)}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                        Дедлайн:{" "}
                        {new Date(selected.predictionDeadline).toLocaleString(
                          "uk-UA"
                        )}
                      </div>
                    </div>
                  </div>

                  <Link
                    to={`../matches/${selectedMatch.id}`}
                    className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    Деталі матчу
                  </Link>
                </div>

                <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-black/20 p-4 sm:p-5">
                  {selected.isLocked ? (
                    <div className="space-y-3">
                      <div className="text-sm font-semibold text-white/70">
                        Прогноз на цей матч уже закритий.
                      </div>

                      {myPrediction ? (
                        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-emerald-200">
                          Мій прогноз: {myPrediction.predictedHome}:
                          {myPrediction.predictedAway}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-3 text-white/45">
                          Ти не встиг подати прогноз.
                        </div>
                      )}
                    </div>
                  ) : (
                    <Form method="post" className="space-y-4">
                      <input
                        type="hidden"
                        name="matchId"
                        value={selectedMatch.id}
                      />

                      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                            {selectedMatch.homeTeam.shortName ||
                              selectedMatch.homeTeam.name}
                          </label>
                          <input
                            type="number"
                            min={0}
                            name="predictedHome"
                            defaultValue={myPrediction?.predictedHome ?? ""}
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center text-xl font-black text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                            placeholder="0"
                          />
                        </div>

                        <div className="pb-4 text-lg font-black text-white/35">
                          :
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                            {selectedMatch.awayTeam.shortName ||
                              selectedMatch.awayTeam.name}
                          </label>
                          <input
                            type="number"
                            min={0}
                            name="predictedAway"
                            defaultValue={myPrediction?.predictedAway ?? ""}
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-center text-xl font-black text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
                            placeholder="0"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-white/55">
                          {myPrediction
                            ? `Поточний прогноз: ${myPrediction.predictedHome}:${myPrediction.predictedAway}`
                            : "Ти ще не подавав прогноз на цей матч"}
                        </div>

                        <button
                          type="submit"
                          className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
                        >
                          {myPrediction ? "Оновити прогноз" : "Зберегти прогноз"}
                        </button>
                      </div>
                    </Form>
                  )}
                </div>
              </section>

              <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
                <div className="mb-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                    Прогнози учасників
                  </div>
                  <h3 className="mt-1 text-xl font-black sm:text-2xl">
                    Хто що поставив на цей матч
                  </h3>
                </div>

                <div className="space-y-3">
                  {participantPredictions.length > 0 ? (
                    participantPredictions.map((item) => (
                      <div
                        key={item.userId}
                        className={`flex flex-col gap-3 rounded-[1.4rem] border p-4 sm:flex-row sm:items-center sm:justify-between ${
                          item.isMe
                            ? "border-emerald-400/30 bg-emerald-500/10"
                            : "border-white/10 bg-black/20"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-base font-bold">
                              {item.name}
                            </div>
                            {item.isMe ? (
                              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                                Це ти
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-1 text-sm text-white/45">
                            {item.prediction
                              ? `Подано: ${new Date(
                                  item.prediction.submittedAt
                                ).toLocaleString("uk-UA")}`
                              : "Прогноз ще не подано"}
                          </div>
                        </div>

                        <div className="shrink-0">
                          {item.prediction ? (
                            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-center">
                              <div className="text-[10px] uppercase tracking-[0.16em] text-white/40">
                                Прогноз
                              </div>
                              <div className="mt-1 text-xl font-black">
                                {item.prediction.predictedHome}:
                                {item.prediction.predictedAway}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-2 text-sm text-white/45">
                              —
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
                      Поки що тут немає прогнозів.
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : (
            <section className="rounded-[1.75rem] border border-dashed border-white/10 bg-white/5 p-8 text-white/60 backdrop-blur-xl sm:rounded-[2rem]">
              Немає доступного матчу для вибору.
            </section>
          )}
        </div>
      </section>
    </div>
  );
}