// app/routes/super-admin/tournaments.tsx
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const tournaments = await prisma.tournament.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      season: true,
      _count: {
        select: {
          rounds: true,
          matches: true,
          games: true,
        },
      },
    },
  });

  return { tournaments };
}

export default function SuperAdminTournamentsPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Tournaments</h1>
        <p className="text-sm text-white/60">
          Тут далі зробимо create / edit / activate.
        </p>
      </div>

      <div className="grid gap-3">
        {data.tournaments.map((tournament) => (
          <div
            key={tournament.id}
            className="rounded-3xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-lg font-black">{tournament.name}</div>
                <div className="text-sm text-white/60">
                  Season: {tournament.season?.name || "—"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  {tournament.isActive ? "ACTIVE" : "INACTIVE"}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Rounds: {tournament._count.rounds}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Matches: {tournament._count.matches}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}