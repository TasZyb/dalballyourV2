import {
  getTeamDisplayName,
  getTeamFlagEmoji,
  getTeamLogoSrc,
} from "~/lib/logo-utils";

export type TeamLogoLike = {
  name: string;
  logo?: string | null;
  shortName?: string | null;
  code?: string | null;
  tla?: string | null;
  country?: string | null;
};

type TeamLogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeClassBySize: Record<TeamLogoSize, string> = {
  xs: "h-7 w-7",
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-14 w-14",
  xl: "h-20 w-20 sm:h-28 sm:w-28",
};

const imageClassBySize: Record<TeamLogoSize, string> = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-9 w-9",
  xl: "h-12 w-12 sm:h-20 sm:w-20",
};

export function TeamLogo({
  team,
  size = "sm",
  className = "",
  imageClassName = "",
}: {
  team: TeamLogoLike;
  size?: TeamLogoSize;
  className?: string;
  imageClassName?: string;
}) {
  const logoSrc = getTeamLogoSrc(team);
  const fallback = (team.tla || team.code || team.shortName || team.name)
    .slice(0, 3)
    .toUpperCase();
  const flag = getTeamFlagEmoji(team);

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--panel)]",
        sizeClassBySize[size],
        className,
      ].join(" ")}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={team.name}
          className={[
            "object-contain",
            imageClassBySize[size],
            imageClassName,
          ].join(" ")}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-[9px] font-black uppercase tracking-wide text-[var(--text-soft)]">
          {flag || fallback}
        </span>
      )}
    </div>
  );
}

export function TeamLine({
  team,
  align = "left",
  strong = false,
  showSubLabel = true,
  logoSize = "sm",
}: {
  team: TeamLogoLike;
  align?: "left" | "right";
  strong?: boolean;
  showSubLabel?: boolean;
  logoSize?: TeamLogoSize;
}) {
  const name = getTeamDisplayName(team);
  const subLabel = getTeamFlagEmoji(team)
    ? ""
    : team.code || team.tla || team.shortName || team.name;

  return (
    <div
      className={[
        "flex min-w-0 items-center gap-2",
        align === "right" ? "justify-end text-right" : "",
      ].join(" ")}
    >
      {align === "left" ? <TeamLogo team={team} size={logoSize} /> : null}

      <div className="min-w-0">
        <div
          className={[
            "truncate text-[13px] text-[var(--text)]",
            strong ? "font-black sm:text-base" : "font-bold sm:text-sm",
          ].join(" ")}
        >
          {name}
        </div>
        {showSubLabel && subLabel ? (
          <div className="truncate text-[10px] text-[var(--muted)]">
            {subLabel}
          </div>
        ) : null}
      </div>

      {align === "right" ? <TeamLogo team={team} size={logoSize} /> : null}
    </div>
  );
}
