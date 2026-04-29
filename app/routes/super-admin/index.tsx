// app/routes/super-admin/index.tsx
import { useLoaderData, Link } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const [
    gamesCount,
    predictionsCount,
    playersCount,
    usersCount,
    tournamentsCount,
    matchesCount,
  ] = await Promise.all([
    prisma.game.count(),
    prisma.prediction.count(),
    prisma.player.count(),
    prisma.user.count(),
    prisma.tournament.count(),
    prisma.match.count(),
  ]);

  const recentGames = await prisma.game.findMany({
    orderBy: { updatedAt: "desc" },
    take: 8,
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          displayName: true,
          email: true,
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

  return {
    stats: {
      gamesCount,
      predictionsCount,
      playersCount,
      usersCount,
      tournamentsCount,
      matchesCount,
    },
    recentGames,
  };
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      to={href}
      className="rounded-3xl border border-white/10 bg-white/5 p-5 transition hover:-translate-y-0.5 hover:bg-white/10"
    >
      <div className="text-sm font-semibold text-white/65">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
    </Link>
  );
}

export default function SuperAdminHomePage() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-cyan-400/15 bg-gradient-to-br from-cyan-400/10 to-white/5 p-6">
        <div className="max-w-3xl">
          <div className="mb-2 text-xs font-bold uppercase tracking-[0.25em] text-cyan-200/80">
            Welcome back
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            Центральна сторінка супер-адміна
          </h1>
          <p className="mt-3 text-sm text-white/70">
            Тут буде твій закритий control center для ручного керування іграми,
            прогнозами, користувачами, матчами та довідниками.
          </p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Games" value={data.stats.gamesCount} href="/x9p_admin_47taras/games" />
        <StatCard label="Predictions" value={data.stats.predictionsCount} href="/x9p_admin_47taras/predictions" />
        <StatCard label="Players" value={data.stats.playersCount} href="/x9p_admin_47taras/players" />
        <StatCard label="Users" value={data.stats.usersCount} href="/x9p_admin_47taras/users" />
        <StatCard label="Tournaments" value={data.stats.tournamentsCount} href="/x9p_admin_47taras/tournaments" />
        <StatCard label="Matches" value={data.stats.matchesCount} href="/x9p_admin_47taras/matches" />
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/5 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Останні оновлені ігри</h2>
            <p className="text-sm text-white/60">
              Швидкий перехід до найактуальніших game entries.
            </p>
          </div>

          <Link
            to="/x9p_admin_47taras/games"
            className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/80"
          >
            Всі ігри
          </Link>
        </div>

        <div className="grid gap-3">
          {data.recentGames.map((game) => (
            <Link
              key={game.id}
              to={`/x9p_admin_47taras/games/${game.id}`}
              className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:bg-white/10"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-lg font-black">{game.name}</div>
                  <div className="text-sm text-white/60">
                    Owner:{" "}
                    {game.owner.displayName ||
                      game.owner.name ||
                      game.owner.email ||
                      "Unknown"}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs font-bold">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    Members: {game._count.members}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    Predictions: {game._count.predictions}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    Matches: {game._count.gameMatches}
                  </span>
                </div>
              </div>
            </Link>
          ))}

          {data.recentGames.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-white/60">
              Ігор поки немає.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}