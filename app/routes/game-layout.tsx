import {
  Outlet,
  Link,
  useLoaderData,
  data,
  redirect,
  type LoaderFunctionArgs,
  useLocation,
} from "react-router";

import { GameMemberRole, MembershipStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);

  if (!user) throw redirect("/login");

  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
  });

  if (!game) {
    throw new Response("Game not found", { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: user.id,
      status: MembershipStatus.ACTIVE,
    },
    select: {
      role: true,
      status: true,
    },
  });

  const isGameOwner = game.ownerId === user.id;

  const canManageGame =
    isGameOwner ||
    membership?.role === GameMemberRole.OWNER ||
    membership?.role === GameMemberRole.ADMIN;

  if (!membership && !isGameOwner) {
    throw redirect("/");
  }

  return data({
    user,
    game,
    role: isGameOwner ? GameMemberRole.OWNER : membership?.role ?? null,
    canManageGame,
  });
}

type IconType = "home" | "matches" | "leaderboard" | "predict" | "admin";

function NavIcon({
  type,
  className = "",
}: {
  type: IconType;
  className?: string;
}) {
  if (type === "home") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10.5V20h14v-9.5" />
        <path d="M9 20v-6h6v6" />
      </svg>
    );
  }

  if (type === "matches") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="4" y="5" width="16" height="14" rx="3" />
        <path d="M8 9h8" />
        <path d="M8 13h5" />
        <path d="M16 13h.01" />
      </svg>
    );
  }

  if (type === "leaderboard") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 21V10" />
        <path d="M16 21V6" />
        <path d="M12 21V3" />
        <path d="M5 21h14" />
      </svg>
    );
  }

  if (type === "predict") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l3 2" />
        <path d="M4 4l3 3" />
        <path d="M20 4l-3 3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l7 4v5c0 5-3 8-7 9-4-1-7-4-7-9V7l7-4Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function ShellLink({
  to,
  label,
  icon,
  active = false,
  accent = false,
}: {
  to: string;
  label: string;
  icon: IconType;
  active?: boolean;
  accent?: boolean;
}) {
  return (
    <Link
      to={to}
      prefetch="intent"
      className={[
        "group flex min-h-[58px] min-w-[66px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center transition",
        "sm:min-h-[62px] sm:min-w-[108px] sm:flex-none sm:px-4 sm:py-2.5",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent)]/25"
          : accent
          ? "bg-[var(--success-soft)] text-[var(--success)] ring-1 ring-[var(--success)]/25"
          : "text-[var(--text-soft)] hover:bg-[var(--card-highlight)] hover:text-[var(--text)]",
      ].join(" ")}
    >
      <NavIcon
        type={icon}
        className={[
          "h-5 w-5 shrink-0 transition",
          active ? "scale-110" : "group-hover:scale-105",
        ].join(" ")}
      />

      <span className="max-w-full truncate text-[10px] font-black uppercase leading-none tracking-[0.08em] sm:text-xs">
        {label}
      </span>
    </Link>
  );
}

export default function GameLayout() {
  const { user, game, canManageGame } = useLoaderData<typeof loader>();
  const location = useLocation();

  const gameRootPath = `/games/${game.id}`;

  const isActive = (path: string) => {
    if (path === gameRootPath) {
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

      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/85 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 pb-2 pt-3 sm:px-6 sm:pb-3 sm:pt-4">
          <Link
            to="/"
            className="shrink-0 rounded-xl px-2 py-2 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--card-highlight)] hover:text-[var(--text)]"
          >
            ← Lobby
          </Link>

          <div className="min-w-0 text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[var(--muted)]">
              Game
            </div>
            <div className="truncate text-base font-black text-[var(--text)] sm:text-xl">
              {game.name}
            </div>
          </div>

          <Link
            to="/me"
            className="max-w-[90px] shrink-0 truncate rounded-xl px-2 py-2 text-right text-sm font-semibold text-[var(--text-soft)] transition hover:bg-[var(--card-highlight)] hover:text-[var(--text)] sm:max-w-[160px]"
          >
            {user.displayName || user.name || "Profile"}
          </Link>
        </div>

        <div className="mx-auto max-w-7xl px-3 pb-3 pt-1 sm:px-6 sm:pb-4 sm:pt-1">
          <nav className="flex min-h-[62px] gap-2 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ShellLink
              to={gameRootPath}
              label="Home"
              icon="home"
              active={isActive(gameRootPath)}
            />

            <ShellLink
              to={`${gameRootPath}/matches`}
              label="Matches"
              icon="matches"
              active={isActive(`${gameRootPath}/matches`)}
            />

            <ShellLink
              to={`${gameRootPath}/leaderboard`}
              label="Table"
              icon="leaderboard"
              active={isActive(`${gameRootPath}/leaderboard`)}
            />

            <ShellLink
              to={`${gameRootPath}/predict`}
              label="Predict"
              icon="predict"
              active={isActive(`${gameRootPath}/predict`)}
            />

            {canManageGame ? (
              <ShellLink
                to={`${gameRootPath}/admin`}
                label="Admin"
                icon="admin"
                active={isActive(`${gameRootPath}/admin`)}
                accent={!isActive(`${gameRootPath}/admin`)}
              />
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}