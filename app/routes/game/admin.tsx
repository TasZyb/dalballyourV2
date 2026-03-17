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
import {
  GameMemberRole,
  MatchStatus,
  MembershipStatus,
} from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

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
  if (predictedHome === realHome && predictedAway === realAway) {
    return 3;
  }

  const predictedResult = getMatchOutcome(predictedHome, predictedAway);
  const realResult = getMatchOutcome(realHome, realAway);

  if (predictedResult === realResult) {
    return 1;
  }

  return 0;
}

async function requireGameAdmin(request: Request, gameId: string) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: MembershipStatus.ACTIVE,
      role: {
        in: [GameMemberRole.OWNER, GameMemberRole.ADMIN],
      },
    },
    include: {
      game: true,
      user: true,
    },
  });

  if (!membership) {
    throw redirect(`/games/${gameId}`);
  }

  return {
    currentUser,
    membership,
    game: membership.game,
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
    match.status !== MatchStatus.FINISHED ||
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
    const weightedPointsAwarded =
      pointsAwarded * weightUsed * multiplierUsed;

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

  const { currentUser, game, membership } = await requireGameAdmin(
    request,
    gameId
  );

  const [teams, tournaments, members, gameMatches, rounds] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.tournament.findMany({
      include: {
        season: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.gameMember.findMany({
      where: {
        gameId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        user: true,
      },
      orderBy: {
        joinedAt: "asc",
      },
    }),
    prisma.gameMatch.findMany({
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
      take: 30,
    }),
    prisma.round.findMany({
      include: {
        tournament: true,
      },
      orderBy: [{ tournamentId: "asc" }, { order: "asc" }],
    }),
  ]);

  return data({
    currentUser,
    game,
    myRole: membership.role,
    teams,
    tournaments,
    rounds,
    members,
    gameMatches,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  await requireGameAdmin(request, gameId);

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "createAndAddMatch") {
    const tournamentId = String(formData.get("tournamentId") || "");
    const roundIdRaw = String(formData.get("roundId") || "");
    const homeTeamId = String(formData.get("homeTeamId") || "");
    const awayTeamId = String(formData.get("awayTeamId") || "");
    const startTimeRaw = String(formData.get("startTime") || "");
    const customWeightRaw = String(formData.get("customWeight") || "");
    const predictionClosesAtRaw = String(
      formData.get("predictionClosesAt") || ""
    );

    if (!tournamentId || !homeTeamId || !awayTeamId || !startTimeRaw) {
      return data(
        { error: "Заповни всі обов’язкові поля матчу." },
        { status: 400 }
      );
    }

    if (homeTeamId === awayTeamId) {
      return data(
        { error: "Команда не може грати сама проти себе." },
        { status: 400 }
      );
    }

    const match = await prisma.match.create({
      data: {
        tournamentId,
        roundId: roundIdRaw || null,
        homeTeamId,
        awayTeamId,
        startTime: new Date(startTimeRaw),
        status: MatchStatus.SCHEDULED,
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

  if (intent === "addExistingMatchToGame") {
    const matchId = String(formData.get("matchId") || "");
    const customWeightRaw = String(formData.get("customWeight") || "");
    const predictionClosesAtRaw = String(
      formData.get("predictionClosesAt") || ""
    );

    if (!matchId) {
      return data({ error: "Оберіть матч." }, { status: 400 });
    }

    await prisma.gameMatch.create({
      data: {
        gameId,
        matchId,
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
    const statusRaw = String(formData.get("status") || "SCHEDULED");

    if (!matchId) {
      return data({ error: "Матч не знайдено." }, { status: 400 });
    }

    const homeScore =
      homeScoreRaw === "" ? null : Number(homeScoreRaw);
    const awayScore =
      awayScoreRaw === "" ? null : Number(awayScoreRaw);

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
        status: statusRaw as MatchStatus,
        lockedAt:
          statusRaw === "SCHEDULED" ? null : new Date(),
      },
    });

    if (statusRaw === "FINISHED") {
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

export default function GameAdminPage() {
  const {
    game,
    teams,
    tournaments,
    rounds,
    members,
    gameMatches,
  } = useLoaderData<typeof loader>();

  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Game Admin
            </div>

            <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Адмінка гри {game.name}
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65 sm:text-base">
              Тут власник або адмін гри може створювати матчі, додавати їх у
              лігу, керувати вагою, дедлайнами, lock-станом, зберігати
              результати та перевіряти прогнози учасників.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
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
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
            <div className="mb-5">
              <h2 className="text-2xl font-black">Створити матч і додати в гру</h2>
              <p className="mt-1 text-sm text-white/50">
                Створює глобальний матч у базі і одразу прикріплює його до цієї гри.
              </p>
            </div>

            <Form method="post" className="space-y-5">
              <input type="hidden" name="intent" value="createAndAddMatch" />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-white/75">
                    Турнір
                  </label>
                  <select
                    name="tournamentId"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                    required
                  >
                    <option value="">Оберіть турнір</option>
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
                    Домашня команда
                  </label>
                  <select
                    name="homeTeamId"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                    required
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
                    Раунд
                  </label>
                  <select
                    name="roundId"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                  >
                    <option value="">Без раунду</option>
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
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/75">
                    Вага в грі
                  </label>
                  <input
                    name="customWeight"
                    type="number"
                    min="1"
                    placeholder="1"
                    className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
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
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting ? "Збереження..." : "Створити матч"}
              </button>
            </Form>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
            <div className="mb-5">
              <h2 className="text-2xl font-black">Учасники гри</h2>
              <p className="mt-1 text-sm text-white/50">
                Це люди, які можуть подавати прогнози в цій лізі.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                >
                  <div className="font-bold">
                    {member.user.displayName ||
                      member.user.name ||
                      member.user.email}
                  </div>
                  <div className="mt-1 text-sm text-white/50">
                    {member.role} · joined{" "}
                    {new Date(member.joinedAt).toLocaleDateString("uk-UA")}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
            <div className="mb-5">
              <h2 className="text-2xl font-black">Матчі цієї гри</h2>
              <p className="mt-1 text-sm text-white/50">
                Тут керуєш результатами, вагою, lock і бачиш прогнози тільки цієї гри.
              </p>
            </div>

            <div className="space-y-6">
              {gameMatches.map((gameMatch) => {
                const match = gameMatch.match;

                return (
                  <div
                    key={gameMatch.id}
                    className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4 sm:p-5"
                  >
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-xl font-black">
                          {match.homeTeam.name} — {match.awayTeam.name}
                        </h3>
                        <p className="mt-1 text-sm text-white/50">
                          {match.tournament.name}
                          {match.round ? ` · ${match.round.name}` : ""}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/75">
                        {new Date(match.startTime).toLocaleString("uk-UA")}
                      </div>
                    </div>

                    <div className="mb-5 flex flex-wrap gap-3">
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                        {match.status}
                      </span>

                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                        Вага: {gameMatch.customWeight ?? "auto"}
                      </span>

                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80">
                        {gameMatch.isLocked ? "Locked" : "Open"}
                      </span>

                      {match.homeScore !== null && match.awayScore !== null ? (
                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                          Рахунок: {match.homeScore}:{match.awayScore}
                        </span>
                      ) : null}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <Form
                        method="post"
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
                      >
                        <input
                          type="hidden"
                          name="intent"
                          value="saveResult"
                        />
                        <input type="hidden" name="matchId" value={match.id} />

                        <div className="mb-4 text-sm font-semibold text-white/70">
                          Результат матчу
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <input
                            name="homeScore"
                            type="number"
                            min="0"
                            defaultValue={match.homeScore ?? ""}
                            placeholder="Голи 1"
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                          />

                          <input
                            name="awayScore"
                            type="number"
                            min="0"
                            defaultValue={match.awayScore ?? ""}
                            placeholder="Голи 2"
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                          />

                          <select
                            name="status"
                            defaultValue={match.status}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                          >
                            <option value="SCHEDULED">SCHEDULED</option>
                            <option value="LIVE">LIVE</option>
                            <option value="FINISHED">FINISHED</option>
                            <option value="CANCELED">CANCELED</option>
                            <option value="POSTPONED">POSTPONED</option>
                          </select>
                        </div>

                        <button
                          type="submit"
                          className="mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
                        >
                          Зберегти результат
                        </button>
                      </Form>

                      <Form
                        method="post"
                        className="rounded-2xl border border-white/10 bg-white/5 p-4"
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

                        <div className="mb-4 text-sm font-semibold text-white/70">
                          Налаштування матчу в грі
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          <input
                            name="customWeight"
                            type="number"
                            min="1"
                            defaultValue={gameMatch.customWeight ?? ""}
                            placeholder="Вага"
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
                          />

                          <input
                            name="predictionClosesAt"
                            type="datetime-local"
                            defaultValue={
                              gameMatch.predictionClosesAt
                                ? new Date(gameMatch.predictionClosesAt)
                                    .toISOString()
                                    .slice(0, 16)
                                : ""
                            }
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
                          />

                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
                            <input
                              type="checkbox"
                              name="includeInLeaderboard"
                              defaultChecked={gameMatch.includeInLeaderboard}
                            />
                            Включати в таблицю
                          </label>

                          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/75">
                            <input
                              type="checkbox"
                              name="isLocked"
                              defaultChecked={gameMatch.isLocked}
                            />
                            Locked вручну
                          </label>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="submit"
                            className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
                          >
                            Зберегти налаштування
                          </button>

                          <Form method="post">
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
                              className="rounded-2xl border border-red-400/20 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-500/15"
                            >
                              Прибрати з гри
                            </button>
                          </Form>
                        </div>
                      </Form>
                    </div>

                    <div className="mt-5 overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/5">
                      <div className="grid grid-cols-4 bg-black/20 px-4 py-3 text-sm font-semibold text-white/55">
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
                              className="grid grid-cols-4 items-center px-4 py-4 text-sm"
                            >
                              <div className="font-medium text-white/85">
                                {prediction.user.displayName ||
                                  prediction.user.name ||
                                  prediction.user.email}
                              </div>

                              <div>
                                {prediction.predictedHome}:
                                {prediction.predictedAway}
                              </div>

                              <div>
                                {prediction.weightedPointsAwarded}{" "}
                                <span className="text-white/40">
                                  ({prediction.pointsAwarded} raw)
                                </span>
                              </div>

                              <div className="text-right">
                                <Form method="post">
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
                                    className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
                                  >
                                    Видалити
                                  </button>
                                </Form>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-8 text-center text-sm text-white/45">
                            Для цього матчу в цій грі ще немає прогнозів
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {gameMatches.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-white/50">
                  У цій грі ще немає матчів.
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
            <h3 className="text-lg font-black">Швидка статистика гри</h3>

            <div className="mt-5 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-sm text-white/45">Матчів у грі</div>
                <div className="mt-2 text-2xl font-black">
                  {gameMatches.length}
                </div>
              </div>

              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-sm text-white/45">Учасників</div>
                <div className="mt-2 text-2xl font-black">
                  {members.length}
                </div>
              </div>

              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-sm text-white/45">Команд</div>
                <div className="mt-2 text-2xl font-black">
                  {teams.length}
                </div>
              </div>

              <div className="rounded-2xl bg-black/20 p-4">
                <div className="text-sm text-white/45">Турнірів</div>
                <div className="mt-2 text-2xl font-black">
                  {tournaments.length}
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}