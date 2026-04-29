// app/routes/super-admin/game-details.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const gameId = params.gameId;
  if (!gameId) {
    throw new Response("Game ID is required", { status: 400 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          displayName: true,
          email: true,
        },
      },
      linkedTournament: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      members: {
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
      },
      gameMatches: {
        orderBy: {
          match: {
            startTime: "desc",
          },
        },
        take: 12,
        include: {
          match: {
            include: {
              homeTeam: true,
              awayTeam: true,
              round: true,
            },
          },
        },
      },
      _count: {
        select: {
          members: true,
          predictions: true,
          gameMatches: true,
        },
      },
    },
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

  return { game };
}

export default function SuperAdminGameDetailsPage() {
  const data = useLoaderData<typeof loader>();
  const { game } = data;

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/10 bg-white/5 p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-200/80">
              Game details
            </div>
            <h1 className="mt-2 text-3xl font-black">{game.name}</h1>
            <div className="mt-2 text-sm text-white/60">
              Owner:{" "}
              {game.owner.displayName ||
                game.owner.name ||
                game.owner.email ||
                "Unknown"}
            </div>
            <div className="mt-1 text-sm text-white/60">
              Tournament: {game.linkedTournament?.name || "—"}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              {game.mode}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              {game.status}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              Members: {game._count.members}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              Predictions: {game._count.predictions}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              Matches: {game._count.gameMatches}
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">Members</h2>
            <Link
              to={`/x9p_admin_47taras/users?gameId=${game.id}`}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-bold"
            >
              Open users
            </Link>
          </div>

          <div className="grid gap-3">
            {game.members.map((member) => (
              <div
                key={member.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="font-bold">
                      {member.user.displayName ||
                        member.user.name ||
                        member.user.email ||
                        "Unknown"}
                    </div>
                    <div className="text-sm text-white/55">
                      {member.user.email || "—"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full border border-white/10 px-3 py-1">
                      {member.role}
                    </span>
                    <span className="rounded-full border border-white/10 px-3 py-1">
                      {member.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {game.members.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
                Учасників немає.
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-black">Recent matches</h2>
            <Link
              to={`/x9p_admin_47taras/predictions?gameId=${game.id}`}
              className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-bold"
            >
              Manual predictions
            </Link>
          </div>

          <div className="grid gap-3">
            {game.gameMatches.map((gm) => (
              <div
                key={gm.id}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="text-sm text-white/55">
                  {new Date(gm.match.startTime).toLocaleString()}
                </div>
                <div className="mt-1 font-bold">
                  {gm.match.homeTeam.name} vs {gm.match.awayTeam.name}
                </div>
                <div className="mt-1 text-sm text-white/60">
                  {gm.match.round?.name || "No round"} · {gm.match.status}
                </div>
              </div>
            ))}

            {game.gameMatches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
                У цій грі ще немає матчів.
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}