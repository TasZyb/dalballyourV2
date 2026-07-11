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
import {
  guestPreviewUser,
  isGuestPreviewGame,
} from "~/lib/guest-preview.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await getCurrentUser(request);
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

  const isGuestPreview = isGuestPreviewGame(game);

  if (!user && !isGuestPreview) throw redirect("/login");

  if (!user && isGuestPreview) {
    return data({
      user: guestPreviewUser,
      game,
      role: null,
      canManageGame: false,
      isGuestPreview: true,
    });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: user!.id,
      status: MembershipStatus.ACTIVE,
    },
    select: {
      role: true,
      status: true,
    },
  });

  const isGameOwner = game.ownerId === user!.id;

  const canManageGame =
    isGameOwner ||
    membership?.role === GameMemberRole.OWNER ||
    membership?.role === GameMemberRole.ADMIN;

  if (!membership && !isGameOwner && !isGuestPreview) {
    throw redirect("/");
  }

  return data({
    user: user!,
    game,
    role: isGameOwner ? GameMemberRole.OWNER : membership?.role ?? null,
    canManageGame,
    isGuestPreview,
  });
}

type IconType =
  | "home"
  | "matches"
  | "leaderboard"
  | "predict"
  | "bracket"
  | "tasks"
  | "profile"
  | "members"
  | "chat"
  | "more"
  | "admin";

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

  if (type === "bracket") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 5h5v5H5z" />
        <path d="M5 14h5v5H5z" />
        <path d="M14 9.5h5v5h-5z" />
        <path d="M10 7.5h2c1.3 0 2 .7 2 2v2" />
        <path d="M10 16.5h2c1.3 0 2-.7 2-2v-2" />
      </svg>
    );
  }

  if (type === "tasks") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 4h10" />
        <path d="M9 2h6v4H9z" />
        <rect x="5" y="5" width="14" height="17" rx="3" />
        <path d="M8 11l1.5 1.5L13 9" />
        <path d="M8 16h8" />
      </svg>
    );
  }

  if (type === "profile") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3.5 18 7v5.5c0 4-2.4 6.8-6 8-3.6-1.2-6-4-6-8V7l6-3.5Z" />
        <circle cx="12" cy="10" r="2.2" />
        <path d="M8.5 16c.8-1.7 2-2.5 3.5-2.5s2.7.8 3.5 2.5" />
      </svg>
    );
  }

  if (type === "members") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path d="M16 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path d="M3.5 20c.7-3.8 2.3-5.7 4.5-5.7s3.8 1.9 4.5 5.7" />
        <path d="M13.5 19c.5-2.6 1.7-3.9 3.4-3.9 1.6 0 2.8 1.3 3.6 3.9" />
      </svg>
    );
  }

  if (type === "chat") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H11l-4.5 4v-4A3.5 3.5 0 0 1 3 11.5v-5Z" />
        <path d="M8 8h8" />
        <path d="M8 11h5" />
      </svg>
    );
  }

  if (type === "more") {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 12h.01" />
        <path d="M12 12h.01" />
        <path d="M19 12h.01" />
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

function MobileNavLink({
  to,
  label,
  icon,
  active = false,
  primary = false,
}: {
  to: string;
  label: string;
  icon: IconType;
  active?: boolean;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      prefetch="intent"
      className={[
        "flex h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-center transition",
        primary
          ? "mb-2 bg-[var(--accent)] text-[var(--accent-button-text)] shadow-[0_12px_28px_color-mix(in_srgb,var(--accent)_28%,transparent)]"
          : active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--text-soft)]",
      ].join(" ")}
    >
      <NavIcon type={icon} className={primary ? "h-6 w-6" : "h-5 w-5"} />
      <span className="max-w-full truncate text-[9px] font-black uppercase leading-none tracking-[0.08em]">
        {label}
      </span>
    </Link>
  );
}

export default function GameLayout() {
  const { user, game, canManageGame, isGuestPreview } =
    useLoaderData<typeof loader>();
  const location = useLocation();

  const gameRootPath = `/games/${game.id}`;

  const isActive = (path: string) => {
    if (path === gameRootPath) {
      return location.pathname === path;
    }

    return location.pathname.startsWith(path);
  };
  const moreActive =
    isActive(`${gameRootPath}/leaderboard`) ||
    isActive(`${gameRootPath}/bracket`) ||
    isActive(`${gameRootPath}/admin`);

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

        <div className="mx-auto hidden max-w-7xl px-3 pb-3 pt-1 sm:px-6 sm:pb-4 sm:pt-1 md:block">
          <nav className="flex min-h-[62px] gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              to={`${gameRootPath}/bracket`}
              label="Bracket"
              icon="bracket"
              active={isActive(`${gameRootPath}/bracket`)}
            />

            <ShellLink
              to={`${gameRootPath}/predict`}
              label="Predict"
              icon="predict"
              active={isActive(`${gameRootPath}/predict`)}
            />

            {canManageGame && !isGuestPreview ? (
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

      <main className="mx-auto max-w-7xl px-4 pb-28 pt-5 sm:px-6 sm:py-8 md:pb-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg)]/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-2xl md:hidden">
        <div className="mx-auto flex max-w-md items-end gap-1.5">
          <MobileNavLink
            to={gameRootPath}
            label="Home"
            icon="home"
            active={isActive(gameRootPath)}
          />
          <MobileNavLink
            to={`${gameRootPath}/leaderboard`}
            label="Table"
            icon="leaderboard"
            active={isActive(`${gameRootPath}/leaderboard`)}
          />
          <MobileNavLink
            to={`${gameRootPath}/predict`}
            label="Predict"
            icon="predict"
            active={isActive(`${gameRootPath}/predict`)}
            primary
          />
          <MobileNavLink
            to={`${gameRootPath}/matches`}
            label="Matches"
            icon="matches"
            active={isActive(`${gameRootPath}/matches`)}
          />

          <details className="group relative flex-1">
            <summary
              className={[
                "flex h-[56px] list-none flex-col items-center justify-center gap-1 rounded-2xl text-center transition marker:hidden [&::-webkit-details-marker]:hidden",
                moreActive
                  ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "text-[var(--text-soft)]",
              ].join(" ")}
            >
              <NavIcon type="more" className="h-5 w-5" />
              <span className="max-w-full truncate text-[9px] font-black uppercase leading-none tracking-[0.08em]">
                More
              </span>
            </summary>

            <div className="absolute bottom-[66px] right-0 w-44 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel-solid)] p-1 shadow-2xl">
              <Link
                to={`${gameRootPath}/bracket`}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black text-[var(--text)]"
              >
                <NavIcon type="bracket" className="h-4 w-4" />
                Bracket
              </Link>
              {canManageGame && !isGuestPreview ? (
                <Link
                  to={`${gameRootPath}/admin`}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black text-[var(--success)]"
                >
                  <NavIcon type="admin" className="h-4 w-4" />
                  Admin
                </Link>
              ) : null}
            </div>
          </details>
        </div>
      </nav>
    </div>
  );
}
