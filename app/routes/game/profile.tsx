import {
  Form,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { MembershipStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";
import { PlayerFifaCard, RatingDelta } from "~/components/PlayerFifaCard";
import { syncGamePlayerCards } from "~/lib/player-card-rating.server";
import {
  canUploadPlayerCardImages,
  uploadPlayerCardImage,
} from "~/lib/supabase-storage.server";

function getDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getRankTone(rank: number | null) {
  if (rank === 1) return "var(--success)";
  if (rank && rank <= 3) return "var(--accent)";
  return "var(--text)";
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!currentUser) throw redirect("/login");
  if (!gameId) throw new Response("Game not found", { status: 404 });

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: MembershipStatus.ACTIVE,
    },
    select: { id: true },
  });

  if (!membership) throw redirect("/");

  await syncGamePlayerCards(gameId);

  const [game, cards, teams] = await Promise.all([
    prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        name: true,
        linkedTournament: { select: { name: true } },
      },
    }),
    prisma.gamePlayerCard.findMany({
      where: { gameId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            displayName: true,
            email: true,
            image: true,
            favoriteTeamId: true,
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
    }),
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        shortName: true,
        logo: true,
        code: true,
      },
      orderBy: [{ name: "asc" }],
    }),
  ]);

  if (!game) throw new Response("Game not found", { status: 404 });

  const myRank = cards.findIndex((card) => card.userId === currentUser.id) + 1;
  const myCard = cards.find((card) => card.userId === currentUser.id);

  if (!myCard) {
    throw new Response("Player card not found", { status: 404 });
  }

  const player = {
    id: currentUser.id,
    name: getDisplayName(myCard.user),
    image: myCard.user.image,
    favoriteTeamId: myCard.user.favoriteTeamId,
    rank: myRank || null,
    weightedPoints: myCard.weightedPoints,
    rawPoints: myCard.rawPoints,
    bonusPoints: myCard.weightedPoints - myCard.rawPoints,
    exactHits: myCard.exactHits,
    correctResults: myCard.correctResults,
    wrongHits: myCard.wrongHits,
    predictions: myCard.predictions,
    finishedPicks: myCard.finishedPicks,
    currentStreak: myCard.currentStreak,
    bestStreak: myCard.bestStreak,
    accuracyRate: myCard.accuracyRate,
    exactRate: myCard.exactRate,
    card: {
      rating: myCard.rating,
      previousRating: myCard.previousRating,
      ratingDelta: myCard.ratingDelta,
      photoUrl: myCard.photoUrl,
      clubTeamId: myCard.clubTeamId,
      clubTeam: myCard.clubTeam,
      computedAt: myCard.computedAt.toISOString(),
    },
  };

  return data({
    game,
    player,
    teams,
    storageReady: canUploadPlayerCardImages(),
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!currentUser) throw redirect("/login");
  if (!gameId) {
    return data({ ok: false, error: "Game not found" }, { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: MembershipStatus.ACTIVE,
    },
    select: { id: true },
  });

  if (!membership) {
    return data(
      { ok: false, error: "Ти не є учасником цієї гри." },
      { status: 403 }
    );
  }

  const formData = await request.formData();
  const photoUrl = String(formData.get("photoUrl") || "").trim().slice(0, 500);
  const clubTeamId = String(formData.get("clubTeamId") || "").trim();
  const photoFile = formData.get("cardPhotoFile");

  if (photoUrl && !/^https?:\/\//i.test(photoUrl)) {
    return data(
      {
        ok: false,
        error: "Посилання на фото має починатися з http або https.",
      },
      { status: 400 }
    );
  }

  if (clubTeamId) {
    const team = await prisma.team.findUnique({
      where: { id: clubTeamId },
      select: { id: true },
    });

    if (!team) {
      return data({ ok: false, error: "Клуб не знайдено." }, { status: 400 });
    }
  }

  let finalPhotoUrl = photoUrl || currentUser.image || null;

  if (photoFile instanceof File && photoFile.size > 0) {
    try {
      finalPhotoUrl = await uploadPlayerCardImage({
        gameId,
        userId: currentUser.id,
        file: photoFile,
      });
    } catch (error) {
      return data(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Не вдалось завантажити фото.",
        },
        { status: 400 }
      );
    }
  }

  await syncGamePlayerCards(gameId);

  await prisma.gamePlayerCard.update({
    where: {
      gameId_userId: {
        gameId,
        userId: currentUser.id,
      },
    },
    data: {
      photoUrl: finalPhotoUrl,
      clubTeamId: clubTeamId || currentUser.favoriteTeamId || null,
    },
  });

  return data({ ok: true });
}

function StatTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="text-[10px] font-black uppercase tracking-[0.16em]"
        style={{ color: "var(--muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-black tabular-nums"
        style={{ color: "var(--text)" }}
      >
        {value}
      </div>
      {helper ? (
        <div className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>
          {helper}
        </div>
      ) : null}
    </div>
  );
}

export default function GameProfilePage() {
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const { game, player, teams, storageReady } = useLoaderData<typeof loader>();
  const isBusy = navigation.state !== "idle";

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`space-y-4 transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        <section
          className="overflow-hidden rounded-[28px]"
          style={{
            background: "var(--panel-strong)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[150px_minmax(0,1fr)] lg:items-center">
            <div className="flex justify-center lg:justify-start">
              <div className="scale-[1.35]">
                <PlayerFifaCard player={player} />
              </div>
            </div>

            <div className="min-w-0">
              <div
                className="text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                Мій профіль у грі
              </div>
              <h1
                className="mt-1 truncate text-3xl font-black"
                style={{ color: "var(--text)" }}
              >
                {player.name}
              </h1>
              <div
                className="mt-2 flex flex-wrap items-center gap-2 text-sm font-bold"
                style={{ color: "var(--text-soft)" }}
              >
                <span>{game.name}</span>
                {game.linkedTournament?.name ? (
                  <span>• {game.linkedTournament.name}</span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-black"
                  style={{
                    background: "var(--panel)",
                    color: getRankTone(player.rank),
                    border: "1px solid var(--border)",
                  }}
                >
                  #{player.rank ?? "—"} в грі
                </span>
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-black"
                  style={{
                    background: "var(--panel)",
                    color: "var(--accent)",
                    border: "1px solid var(--border)",
                  }}
                >
                  OVR {player.card.rating}
                  <RatingDelta value={player.card.ratingDelta} />
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Очки"
            value={player.weightedPoints}
            helper={`База ${player.rawPoints}, бонус ${player.bonusPoints}`}
          />
          <StatTile
            label="Точність"
            value={formatPercent(player.accuracyRate)}
            helper={`${player.correctResults}/${player.finishedPicks} вгадано`}
          />
          <StatTile
            label="Exact"
            value={player.exactHits}
            helper={`${formatPercent(player.exactRate)} точних рахунків`}
          />
          <StatTile
            label="Серія"
            value={player.currentStreak}
            helper={`Рекорд: ${player.bestStreak}`}
          />
        </section>

        <section
          className="rounded-[28px] p-4 sm:p-5"
          style={{
            background: "var(--panel-strong)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div>
              <div
                className="text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                Кастомізація картки
              </div>
              <h2
                className="mt-1 text-2xl font-black"
                style={{ color: "var(--text)" }}
              >
                Фото і клуб тільки для цієї гри
              </h2>
              <p
                className="mt-2 max-w-2xl text-sm"
                style={{ color: "var(--text-soft)" }}
              >
                Можна вставити URL або завантажити файл у Supabase Storage.
                Завантажений файл має пріоритет над URL.
              </p>

              <Form
                method="post"
                encType="multipart/form-data"
                className="mt-4 grid gap-3"
              >
                <label className="grid gap-2">
                  <span
                    className="text-xs font-black uppercase tracking-[0.14em]"
                    style={{ color: "var(--muted)" }}
                  >
                    Фото з компʼютера
                  </span>
                  <input
                    name="cardPhotoFile"
                    type="file"
                    accept="image/*"
                    className="min-h-12 rounded-2xl px-4 py-3 text-sm font-bold outline-none"
                    style={{
                      background: "var(--panel)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </label>

                <label className="grid gap-2">
                  <span
                    className="text-xs font-black uppercase tracking-[0.14em]"
                    style={{ color: "var(--muted)" }}
                  >
                    Або URL фото
                  </span>
                  <input
                    name="photoUrl"
                    defaultValue={player.card.photoUrl ?? ""}
                    placeholder="https://..."
                    className="min-h-12 rounded-2xl px-4 text-sm outline-none"
                    style={{
                      background: "var(--panel)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  />
                </label>

                <label className="grid gap-2">
                  <span
                    className="text-xs font-black uppercase tracking-[0.14em]"
                    style={{ color: "var(--muted)" }}
                  >
                    Клуб на картці
                  </span>
                  <select
                    name="clubTeamId"
                    defaultValue={
                      player.card.clubTeamId ?? player.favoriteTeamId ?? ""
                    }
                    className="min-h-12 rounded-2xl px-4 text-sm font-bold outline-none"
                    style={{
                      background: "var(--panel)",
                      color: "var(--text)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <option value="">Без клубу</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.shortName || team.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="submit"
                  className="min-h-12 rounded-2xl px-5 text-sm font-black transition active:scale-[0.98]"
                  style={{
                    background: "var(--accent)",
                    color: "var(--accent-contrast)",
                  }}
                >
                  Зберегти картку
                </button>
              </Form>

              {!storageReady ? (
                <div
                  className="mt-3 rounded-2xl px-4 py-3 text-xs font-bold"
                  style={{
                    background: "var(--panel)",
                    color: "var(--text-soft)",
                    border: "1px solid var(--border)",
                  }}
                >
                  Upload у Supabase готовий у коді, але треба додати
                  SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY в .env та створити
                  public bucket player-cards.
                </div>
              ) : null}

              {actionData?.error ? (
                <div
                  className="mt-3 text-sm font-bold"
                  style={{ color: "#ef4444" }}
                >
                  {actionData.error}
                </div>
              ) : actionData?.ok ? (
                <div
                  className="mt-3 text-sm font-bold"
                  style={{ color: "var(--success)" }}
                >
                  Картку оновлено.
                </div>
              ) : null}
            </div>

            <div
              className="rounded-[24px] p-4"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                className="text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                Зараз на картці
              </div>
              <div className="mt-4 flex justify-center">
                <div className="scale-125">
                  <PlayerFifaCard player={player} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
