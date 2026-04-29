// app/routes/super-admin/games.tsx
import { Link, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const games = await prisma.game.findMany({
    orderBy: { updatedAt: "desc" },
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

  return { games };
}

export default function SuperAdminGamesPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Games</h1>
        <p className="text-sm text-white/60">
          Вибір гри для точкового адміністрування.
        </p>
      </div>

      <div className="grid gap-3">
        {data.games.map((game) => (
          <Link
            key={game.id}
            to={`/x9p_admin_47taras/games/${game.id}`}
            className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xl font-black">{game.name}</div>
                <div className="mt-1 text-sm text-white/60">
                  Owner:{" "}
                  {game.owner.displayName ||
                    game.owner.name ||
                    game.owner.email ||
                    "Unknown"}
                </div>
                <div className="mt-1 text-sm text-white/50">
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
          </Link>
        ))}

        {data.games.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/60">
            Ігор не знайдено.
          </div>
        ) : null}
      </div>
    </div>
  );
}