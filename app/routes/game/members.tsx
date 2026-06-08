import {
  Link,
  data,
  useLoaderData,
  useNavigation,
  type LoaderFunctionArgs,
} from "react-router";
import { GameMemberRole, MembershipStatus } from "@prisma/client";
import { FootballLoader } from "~/components/FootballLoader";
import { PlayerFifaCard, type PlayerCardView } from "~/components/PlayerFifaCard";
import { getCurrentUser } from "~/lib/auth.server";
import { prisma } from "~/lib/db.server";
import { syncGamePlayerCards } from "~/lib/player-card-rating.server";
import {
  guestPreviewUser,
  isGuestPreviewGame,
} from "~/lib/guest-preview.server";

type MemberView = PlayerCardView & {
  role: GameMemberRole;
  joinedAt: string;
  lastSeenAt: string | null;
  rank: number;
  weightedPoints: number;
  currentStreak: number;
  finishedPicks: number;
};

function getDisplayName(user: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
}) {
  return user.displayName || user.name || user.email || "Гравець";
}

function formatDate(date: Date | string | null) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getRoleLabel(role: GameMemberRole) {
  if (role === GameMemberRole.OWNER) return "Owner";
  if (role === GameMemberRole.ADMIN) return "Admin";
  return "Member";
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!gameId) throw new Response("Game not found", { status: 404 });

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      slug: true,
      members: {
        where: { status: MembershipStatus.ACTIVE },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              email: true,
              image: true,
              lastSeenAt: true,
            },
          },
        },
        orderBy: [{ joinedAt: "asc" }],
      },
      playerCards: {
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
      },
    },
  });

  if (!game) throw new Response("Game not found", { status: 404 });

  const isGuestPreview = isGuestPreviewGame(game);

  if (!currentUser && !isGuestPreview) {
    throw new Response("Unauthorized", { status: 401 });
  }

  if (currentUser || !isGuestPreview) {
    await syncGamePlayerCards(gameId);
  }

  const cardByUserId = new Map(
    game.playerCards.map((card, index) => [card.userId, { card, rank: index + 1 }])
  );

  const members: MemberView[] = game.members
    .map((member) => {
      const rankedCard = cardByUserId.get(member.userId);
      const card = rankedCard?.card;
      const name = getDisplayName(card?.user ?? member.user);

      return {
        id: member.userId,
        name,
        image: card?.user.image ?? member.user.image,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
        lastSeenAt: member.user.lastSeenAt?.toISOString() ?? null,
        rank: rankedCard?.rank ?? 999,
        weightedPoints: card?.weightedPoints ?? 0,
        exactHits: card?.exactHits ?? 0,
        accuracyRate: card?.accuracyRate ?? 0,
        bestStreak: card?.bestStreak ?? 0,
        currentStreak: card?.currentStreak ?? 0,
        finishedPicks: card?.finishedPicks ?? 0,
        card: {
          rating: card?.rating ?? 40,
          ratingDelta: card?.ratingDelta ?? 0,
          photoUrl: card?.photoUrl ?? member.user.image,
          clubTeam: card?.clubTeam ?? null,
        },
      };
    })
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return a.name.localeCompare(b.name, "uk");
    });

  const topRated = members[0] ?? null;
  const exactLeader = [...members].sort((a, b) => b.exactHits - a.exactHits)[0] ?? null;
  const formLeader =
    [...members].sort((a, b) => b.currentStreak - a.currentStreak)[0] ?? null;

  return data({
    game: { id: game.id, name: game.name },
    currentUserId: currentUser?.id ?? guestPreviewUser.id,
    members,
    highlights: {
      topRated,
      exactLeader,
      formLeader,
    },
  });
}

function Highlight({
  label,
  player,
  value,
}: {
  label: string;
  player: MemberView | null;
  value: (player: MemberView) => string | number;
}) {
  return (
    <div className="rounded-[22px] border border-white/[0.14] bg-white/[0.08] p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/[0.58]">
        {label}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-black text-white">
            {player?.name ?? "—"}
          </div>
          <div className="mt-1 text-2xl font-black tabular-nums text-white">
            {player ? value(player) : "—"}
          </div>
        </div>
        {player ? <PlayerFifaCard player={player} compact /> : null}
      </div>
    </div>
  );
}

export default function GameMembersPage() {
  const navigation = useNavigation();
  const { game, currentUserId, members, highlights } =
    useLoaderData<typeof loader>();
  const isBusy =
    navigation.state === "loading" || navigation.state === "submitting";

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`mx-auto max-w-6xl space-y-4 transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        <section className="football-pitch-card relative overflow-hidden rounded-[30px] p-4">
          <div className="football-field-lines" />

          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-white/[0.60]">
                Club House
              </div>
              <h1 className="mt-1 text-3xl font-black text-white sm:text-4xl">
                Гравці {game.name}
              </h1>
            </div>

            <Link
              to={`/games/${game.id}/profile`}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-emerald-950"
            >
              Моя картка
            </Link>
          </div>
        </section>

        <section className="football-pitch-card grid gap-3 rounded-[30px] p-3 md:grid-cols-3">
          <Highlight
            label="Найвищий OVR"
            player={highlights.topRated}
            value={(player) => player.card.rating}
          />
          <Highlight
            label="Снайпер точних"
            player={highlights.exactLeader}
            value={(player) => player.exactHits}
          />
          <Highlight
            label="Найкраща форма"
            player={highlights.formLeader}
            value={(player) => player.currentStreak}
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => {
            const isMe = member.id === currentUserId;

            return (
              <article
                key={member.id}
                className={`relative overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--panel-strong)] p-3 ${
                  isMe ? "ring-1 ring-[var(--accent)]/35" : ""
                }`}
              >
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(to_right,#16a34a,#f8fafc,#16a34a)]" />
                <div className="flex gap-3">
                  <PlayerFifaCard player={member} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-base font-black text-[var(--text)]">
                          {member.name}
                        </div>
                        <div className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">
                          #{member.rank} · {getRoleLabel(member.role)}
                        </div>
                      </div>

                      {isMe ? (
                        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-1 text-[10px] font-black text-[var(--accent)]">
                          ME
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl bg-[var(--card-highlight)] px-2 py-2">
                        <div className="text-[9px] font-black uppercase text-[var(--muted)]">
                          Очки
                        </div>
                        <div className="text-sm font-black tabular-nums text-[var(--text)]">
                          {member.weightedPoints}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[var(--card-highlight)] px-2 py-2">
                        <div className="text-[9px] font-black uppercase text-[var(--muted)]">
                          Точні
                        </div>
                        <div className="text-sm font-black tabular-nums text-[var(--text)]">
                          {member.exactHits}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-[var(--card-highlight)] px-2 py-2">
                        <div className="text-[9px] font-black uppercase text-[var(--muted)]">
                          Матчі
                        </div>
                        <div className="text-sm font-black tabular-nums text-[var(--text)]">
                          {member.finishedPicks}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-[var(--text-soft)]">
                      В клубі з {formatDate(member.joinedAt)}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </>
  );
}
