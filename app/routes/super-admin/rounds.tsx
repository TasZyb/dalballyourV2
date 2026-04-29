// app/routes/super-admin/rounds.tsx
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const rounds = await prisma.round.findMany({
    orderBy: [{ tournamentId: "asc" }, { order: "asc" }],
    include: {
      tournament: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          matches: true,
        },
      },
    },
  });

  return { rounds };
}

export default function SuperAdminRoundsPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Rounds</h1>
        <p className="text-sm text-white/60">
          Тут далі зробимо create / edit / ordering / weights.
        </p>
      </div>

      <div className="grid gap-3">
        {data.rounds.map((round) => (
          <div
            key={round.id}
            className="rounded-3xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-lg font-black">{round.name}</div>
                <div className="text-sm text-white/60">
                  Tournament: {round.tournament.name}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Order: {round.order ?? "—"}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Weight: {round.defaultWeight}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Matches: {round._count.matches}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}