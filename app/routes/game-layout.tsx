import {
  Outlet,
  Link,
  useLoaderData,
  data,
  redirect,
  type LoaderFunctionArgs,
  useLocation,
} from "react-router";

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

function ShellLink({
  to,
  children,
  active = false,
  accent = false,
}: {
  to: string;
  children: React.ReactNode;
  active?: boolean;
  accent?: boolean;
}) {
  const baseStyle: React.CSSProperties = active
    ? {
        background: "var(--accent-soft)",
        color: "var(--accent)",
        border: "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
      }
    : accent
    ? {
        background: "color-mix(in srgb, var(--success-soft) 100%, transparent)",
        color: "var(--success)",
        border: "1px solid color-mix(in srgb, var(--success) 28%, transparent)",
      }
    : {
        color: "var(--text-soft)",
        border: "1px solid transparent",
      };

  return (
    <Link
      to={to}
      className="rounded-xl px-3 py-2 text-sm font-medium transition"
      style={baseStyle}
      onMouseEnter={(e) => {
        if (!active && !accent) {
          e.currentTarget.style.background = "var(--card-highlight)";
          e.currentTarget.style.color = "var(--text)";
          e.currentTarget.style.borderColor = "var(--border)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !accent) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-soft)";
          e.currentTarget.style.borderColor = "transparent";
        }
      }}
    >
      {children}
    </Link>
  );
}

export default function GameLayout() {
  const { user, game, role } = useLoaderData<typeof loader>();
  const location = useLocation();

  const canManageGame = role === "OWNER" || role === "ADMIN";

  const isActive = (path: string) => {
    if (path === `/games/${game.id}`) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="theme-page relative min-h-screen overflow-x-hidden">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(circle at top, var(--hero-glow), transparent 32%),
            radial-gradient(circle at 80% 20%, var(--hero-glow-2), transparent 22%),
            linear-gradient(to bottom, var(--bg-gradient-start), var(--bg-gradient-mid), var(--bg-gradient-end))
          `,
        }}
      />

      <header
        className="sticky top-0 z-30 backdrop-blur-2xl"

      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            to="/"
            className="text-sm transition"
            style={{ color: "var(--text-soft)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-soft)";
            }}
          >
            ← Lobby
          </Link>

          <div className="min-w-0 text-center">
            <div
              className="text-xs uppercase tracking-[0.3em]"
              style={{ color: "var(--muted)" }}
            >
              Game
            </div>

            <div
              className="truncate text-xl font-black"
              style={{ color: "var(--text)" }}
            >
              {game.name}
            </div>
          </div>

          <Link
            to="/me"
            className="truncate text-sm transition"
            style={{ color: "var(--text-soft)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-soft)";
            }}
          >
            {user.displayName || user.name || "Profile"}
          </Link>
        </div>

        <div style={{ borderTop: "1px solid var(--border)" }}>
          <nav className="mx-auto flex max-w-7xl flex-wrap gap-2 px-4 py-3 sm:px-6">
            <ShellLink
              to={`/games/${game.id}`}
              active={isActive(`/games/${game.id}`)}
            >
              Dashboard
            </ShellLink>

            <ShellLink
              to={`/games/${game.id}/matches`}
              active={isActive(`/games/${game.id}/matches`)}
            >
              Matches
            </ShellLink>

            <ShellLink
              to={`/games/${game.id}/leaderboard`}
              active={isActive(`/games/${game.id}/leaderboard`)}
            >
              Leaderboard
            </ShellLink>

            <ShellLink
              to={`/games/${game.id}/predict`}
              active={isActive(`/games/${game.id}/predict`)}
            >
              Predict
            </ShellLink>

            {canManageGame ? (
              <ShellLink
                to={`/games/${game.id}/admin`}
                active={isActive(`/games/${game.id}/admin`)}
                accent={!isActive(`/games/${game.id}/admin`)}
              >
                Admin
              </ShellLink>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}