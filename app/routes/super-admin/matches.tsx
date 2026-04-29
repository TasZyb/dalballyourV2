// app/routes/super-admin/matches.tsx
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const matches = await prisma.match.findMany({
    orderBy: { startTime: "desc" },
    take: 100,
    include: {
      homeTeam: true,
      awayTeam: true,
      round: true,
      tournament: true,
    },
  });

  return { matches };
}

export default function SuperAdminMatchesPage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Matches</h1>
        <p className="text-sm text-white/60">
          Тут далі зробимо edit score / status / round / game linking.
        </p>
      </div>

      <div className="grid gap-3">
        {data.matches.map((match) => (
          <div
            key={match.id}
            className="rounded-3xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-lg font-black">
                  {match.homeTeam.name} vs {match.awayTeam.name}
                </div>
                <div className="text-sm text-white/60">
                  {match.tournament.name} · {match.round?.name || "No round"}
                </div>
                <div className="text-sm text-white/50">
                  {new Date(match.startTime).toLocaleString()}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  {match.status}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Score: {match.homeScore ?? "-"}:{match.awayScore ?? "-"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}