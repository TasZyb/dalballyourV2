// app/routes/super-admin/predictions.tsx
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const url = new URL(request.url);
  const selectedGameId = url.searchParams.get("gameId") || "";
  const selectedMatchId = url.searchParams.get("matchId") || "";

  const games = await prisma.game.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
    },
  });

  const matches = selectedGameId
    ? await prisma.gameMatch.findMany({
        where: { gameId: selectedGameId },
        orderBy: {
          match: {
            startTime: "desc",
          },
        },
        include: {
          match: {
            include: {
              homeTeam: true,
              awayTeam: true,
              round: true,
              tournament: true,
            },
          },
        },
      })
    : [];

  const members = selectedGameId
    ? await prisma.gameMember.findMany({
        where: { gameId: selectedGameId },
        orderBy: { joinedAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              email: true,
            },
          },
        },
      })
    : [];

  const existingPredictions =
    selectedGameId && selectedMatchId
      ? await prisma.prediction.findMany({
          where: {
            gameId: selectedGameId,
            matchId: selectedMatchId,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                displayName: true,
                email: true,
              },
            },
          },
          orderBy: {
            user: {
              email: "asc",
            },
          },
        })
      : [];

  const selectedGame = selectedGameId
    ? await prisma.game.findUnique({
        where: { id: selectedGameId },
        select: {
          id: true,
          name: true,
        },
      })
    : null;

  const selectedMatch =
    selectedGameId && selectedMatchId
      ? await prisma.match.findUnique({
          where: { id: selectedMatchId },
          include: {
            homeTeam: true,
            awayTeam: true,
            round: true,
            tournament: true,
          },
        })
      : null;

  return {
    games,
    matches,
    members,
    existingPredictions,
    selectedGameId,
    selectedMatchId,
    selectedGame,
    selectedMatch,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const formData = await request.formData();

  const gameId = String(formData.get("gameId") || "");
  const matchId = String(formData.get("matchId") || "");
  const userId = String(formData.get("userId") || "");
  const predictedHome = Number(formData.get("predictedHome"));
  const predictedAway = Number(formData.get("predictedAway"));

  if (!gameId || !matchId || !userId) {
    return {
      error: "Треба вибрати гру, матч і користувача.",
    };
  }

  if (Number.isNaN(predictedHome) || Number.isNaN(predictedAway)) {
    return {
      error: "Рахунок має бути числом.",
    };
  }

  await prisma.prediction.upsert({
    where: {
      userId_gameId_matchId: {
        userId,
        gameId,
        matchId,
      },
    },
    update: {
      predictedHome,
      predictedAway,
      submittedAt: new Date(),
    },
    create: {
      userId,
      gameId,
      matchId,
      predictedHome,
      predictedAway,
      submittedAt: new Date(),
    },
  });

  return {
    ok: true,
  };
}

export default function SuperAdminPredictionsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isLoadingGame =
    navigation.state === "loading" &&
    navigation.location?.pathname === "/x9p_admin_47taras/predictions";

  const isSubmittingPrediction = navigation.state === "submitting";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">Manual Predictions</h1>
        <p className="text-sm text-white/60">
          Ручне додавання або редагування прогнозів.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-lg font-black">1. Обери гру</h2>

          <Form method="get" className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-white/80">
                Гра
              </label>
              <select
                name="gameId"
                value={data.selectedGameId}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              >
                <option value="">— Обери гру —</option>
                {data.games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </div>
          </Form>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
            {data.selectedGame ? (
              <span>
                Обрана гра: <span className="font-bold text-white">{data.selectedGame.name}</span>
              </span>
            ) : (
              <span>Спочатку вибери гру, щоб підвантажити матчі та учасників.</span>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-lg font-black">2. Обери матч</h2>

          <Form method="get" className="grid gap-4">
            <input type="hidden" name="gameId" value={data.selectedGameId} />

            <div>
              <label className="mb-2 block text-sm font-semibold text-white/80">
                Матч
              </label>
              <select
                name="matchId"
                value={data.selectedMatchId}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                disabled={!data.selectedGameId || data.matches.length === 0}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white disabled:opacity-50"
              >
                <option value="">
                  {!data.selectedGameId
                    ? "Спочатку обери гру"
                    : data.matches.length === 0
                    ? "У цій грі немає матчів"
                    : "— Обери матч —"}
                </option>

                {data.matches.map((gm) => (
                  <option key={gm.match.id} value={gm.match.id}>
                    {gm.match.homeTeam.name} vs {gm.match.awayTeam.name}
                  </option>
                ))}
              </select>
            </div>
          </Form>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
            {data.selectedMatch ? (
              <div className="space-y-1">
                <div className="font-bold text-white">
                  {data.selectedMatch.homeTeam.name} vs {data.selectedMatch.awayTeam.name}
                </div>
                <div>
                  {data.selectedMatch.tournament?.name || "—"} ·{" "}
                  {data.selectedMatch.round?.name || "Без раунду"}
                </div>
                <div>{new Date(data.selectedMatch.startTime).toLocaleString()}</div>
              </div>
            ) : (
              <span>Після вибору гри тут з’явиться список доступних матчів.</span>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-cyan-400/15 bg-cyan-400/10 p-5">
        <h2 className="mb-4 text-lg font-black">3. Додай або зміни прогноз</h2>

        <Form method="post" className="grid gap-4">
          <input type="hidden" name="gameId" value={data.selectedGameId} />
          <input type="hidden" name="matchId" value={data.selectedMatchId} />

          <div>
            <label className="mb-2 block text-sm font-semibold text-white/80">
              Користувач
            </label>
            <select
              name="userId"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white disabled:opacity-50"
              disabled={!data.selectedGameId}
            >
              <option value="">— Обери користувача —</option>
              {data.members.map((member) => (
                <option key={member.user.id} value={member.user.id}>
                  {member.user.displayName || member.user.name || member.user.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-white/80">
                Home score
              </label>
              <input
                type="number"
                name="predictedHome"
                min={0}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-white/80">
                Away score
              </label>
              <input
                type="number"
                name="predictedAway"
                min={0}
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"
              />
            </div>
          </div>

          {actionData && "error" in actionData && actionData.error ? (
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {actionData.error}
            </div>
          ) : null}

          {actionData && "ok" in actionData && actionData.ok ? (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              Прогноз успішно збережено.
            </div>
          ) : null}

          <button
            type="submit"
            className="rounded-2xl bg-white px-4 py-3 font-bold text-slate-950 disabled:opacity-50"
            disabled={!data.selectedGameId || !data.selectedMatchId || isSubmittingPrediction}
          >
            {isSubmittingPrediction ? "Зберігаю..." : "Зберегти прогноз"}
          </button>
        </Form>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-xl font-black">Вже існуючі прогнози на цей матч</h2>

        <div className="grid gap-3">
          {data.existingPredictions.map((prediction) => (
            <div
              key={prediction.id}
              className="rounded-2xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-bold">
                    {prediction.user.displayName ||
                      prediction.user.name ||
                      prediction.user.email}
                  </div>
                  <div className="text-sm text-white/55">
                    {prediction.user.email || "—"}
                  </div>
                </div>

                <div className="text-xl font-black">
                  {prediction.predictedHome} : {prediction.predictedAway}
                </div>
              </div>
            </div>
          ))}

          {data.selectedGameId && data.selectedMatchId && data.existingPredictions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
              Прогнозів на цей матч ще немає.
            </div>
          ) : null}

          {!data.selectedMatchId ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
              Обери матч, щоб побачити існуючі прогнози.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}