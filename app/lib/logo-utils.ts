type TeamLogoLike = {
  logo?: string | null;
  shortName?: string | null;
  code?: string | null;
  tla?: string | null;
};

type TournamentLogoLike = {
  logo?: string | null;
};

function isReadyAssetPath(value: string) {
  return (
    value.startsWith("/") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  );
}

function getAssetSrc(value: string | null | undefined, fallbackFolder: string) {
  const logo = value?.trim();

  if (!logo) return null;
  if (isReadyAssetPath(logo)) return logo;
  if (logo.includes("/")) return `/${logo}`;
  if (logo.includes(".")) return `${fallbackFolder}/${logo}`;

  return `${fallbackFolder}/${logo}.svg`;
}

export function getTeamLogoSrc(team?: TeamLogoLike | null) {
  if (!team) return null;

  return (
    getAssetSrc(team.logo, "/teams") ||
    getAssetSrc(team.shortName, "/teams") ||
    getAssetSrc(team.code, "/teams") ||
    getAssetSrc(team.tla, "/teams")
  );
}

export function getTournamentLogoSrc(tournament?: TournamentLogoLike | null) {
  if (!tournament) return null;

  return getAssetSrc(tournament.logo, "/teams");
}
