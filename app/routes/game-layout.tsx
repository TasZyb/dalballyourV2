import {
  Outlet,
  Link,
  useLoaderData,
  data,
  redirect,
  type LoaderFunctionArgs,
} from "react-router";
import { Form } from "react-router";

import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: user.id,
    },
    include: {
      game: true,
    },
  });

  if (!membership) {
    throw redirect("/");
  }

  return data({
    user,
    game: membership.game,
    role: membership.role,
  });
}

export default function GameLayout() {
  const { user, game, role } = useLoaderData<typeof loader>();

  const canManageGame = role === "OWNER" || role === "ADMIN";

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-neutral-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm text-white/50 hover:text-white">
            ← Lobby
          </Link>

          <div className="text-center">
            <div className="text-xs uppercase tracking-[0.3em] text-white/40">
              Game
            </div>

            <div className="text-xl font-black">{game.name}</div>
          </div>

          <Link to="/me" className="text-sm text-white/60 hover:text-white">
            {user.displayName || user.name || "Profile"}
          </Link>
        </div>

        <div className="border-t border-white/10">
          <nav className="mx-auto flex max-w-7xl flex-wrap gap-6 px-6 py-3 text-sm">
            <Link
              to={`/games/${game.id}`}
              className="text-white/70 hover:text-white"
            >
              Dashboard
            </Link>

            <Link
              to={`/games/${game.id}/matches`}
              className="text-white/70 hover:text-white"
            >
              Matches
            </Link>

            <Link
              to={`/games/${game.id}/leaderboard`}
              className="text-white/70 hover:text-white"
            >
              Leaderboard
            </Link>

            <Link
              to={`/games/${game.id}/predict`}
              className="text-white/70 hover:text-white"
            >
              Predict
            </Link>

            {canManageGame ? (
              <Link
                to={`/games/${game.id}/admin`}
                className="font-semibold text-emerald-300 hover:text-emerald-200"
              >
                Admin
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}