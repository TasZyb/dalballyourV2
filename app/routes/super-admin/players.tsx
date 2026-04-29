// app/routes/super-admin/players.tsx
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const players = await prisma.player.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
    include: {
      team: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return { players };
}

export default function SuperAdminPlayersPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Players</h1>
        <p className="text-sm text-white/60">
          Тут далі зробимо edit / deactivate / delete.
        </p>
      </div>

      <div className="grid gap-3">
        {data.players.map((player) => (
          <div
            key={player.id}
            className="rounded-3xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-lg font-black">{player.name}</div>
                <div className="text-sm text-white/60">
                  {player.team.name} · {player.position}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  #{player.shirtNumber ?? "—"}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  {player.nationality ?? "—"}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  {player.isActive ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}