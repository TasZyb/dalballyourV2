import { getTournamentLogoSrc } from "~/lib/logo-utils";

export type TournamentBadgeLike = {
  name: string;
  logo?: string | null;
};

export function TournamentBadge({
  tournament,
  label,
  className = "",
}: {
  tournament?: TournamentBadgeLike | null;
  label?: string | null;
  className?: string;
}) {
  if (!tournament && !label) return null;

  const logoSrc = getTournamentLogoSrc(tournament);

  return (
    <div className={["flex min-w-0 flex-wrap items-center gap-1.5", className].join(" ")}>
      {tournament ? (
        <div className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/90">
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={tournament.name}
                className="h-3 w-3 object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="text-[8px] font-bold text-black/70">
                {tournament.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <span className="max-w-[140px] truncate text-[11px] text-[var(--text-soft)] sm:max-w-none">
            {tournament.name}
          </span>
        </div>
      ) : null}

      {label ? (
        <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
          {label}
        </div>
      ) : null}
    </div>
  );
}
