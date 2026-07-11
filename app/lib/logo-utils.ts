type TeamLogoLike = {
  name?: string | null;
  logo?: string | null;
  shortName?: string | null;
  code?: string | null;
  tla?: string | null;
  country?: string | null;
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

  const explicitLogo = getAssetSrc(team.logo, "/teams");

  if (explicitLogo) return explicitLogo;
  if (isLikelyNationalTeam(team)) return null;

  return (
    getAssetSrc(team.shortName, "/teams") ||
    getAssetSrc(team.code, "/teams") ||
    getAssetSrc(team.tla, "/teams")
  );
}

export function getTournamentLogoSrc(tournament?: TournamentLogoLike | null) {
  if (!tournament) return null;

  return getAssetSrc(tournament.logo, "/teams");
}

const flagByCode: Record<string, string> = {
  ALG: "🇩🇿",
  ARG: "🇦🇷",
  AUS: "🇦🇺",
  AUT: "🇦🇹",
  BEL: "🇧🇪",
  BIH: "🇧🇦",
  BRA: "🇧🇷",
  CAN: "🇨🇦",
  CIV: "🇨🇮",
  COD: "🇨🇩",
  COL: "🇨🇴",
  CPV: "🇨🇻",
  CRO: "🇭🇷",
  CUW: "🇨🇼",
  CZE: "🇨🇿",
  ECU: "🇪🇨",
  EGY: "🇪🇬",
  ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  ESP: "🇪🇸",
  FRA: "🇫🇷",
  GER: "🇩🇪",
  GHA: "🇬🇭",
  HAI: "🇭🇹",
  IRN: "🇮🇷",
  IRQ: "🇮🇶",
  JOR: "🇯🇴",
  JPN: "🇯🇵",
  KOR: "🇰🇷",
  KSA: "🇸🇦",
  MAR: "🇲🇦",
  MEX: "🇲🇽",
  NED: "🇳🇱",
  NOR: "🇳🇴",
  NZL: "🇳🇿",
  PAN: "🇵🇦",
  PAR: "🇵🇾",
  POR: "🇵🇹",
  QAT: "🇶🇦",
  RSA: "🇿🇦",
  SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  SEN: "🇸🇳",
  SUI: "🇨🇭",
  SWE: "🇸🇪",
  TUN: "🇹🇳",
  TUR: "🇹🇷",
  URU: "🇺🇾",
  USA: "🇺🇸",
  UZB: "🇺🇿",
};

const countryNameByCode: Record<string, string> = {
  ALG: "Algeria",
  ARG: "Argentina",
  AUS: "Australia",
  AUT: "Austria",
  BEL: "Belgium",
  BIH: "Bosnia and Herzegovina",
  BRA: "Brazil",
  CAN: "Canada",
  CIV: "Ivory Coast",
  COD: "DR Congo",
  COL: "Colombia",
  CPV: "Cape Verde",
  CRO: "Croatia",
  CUW: "Curaçao",
  CZE: "Czech Republic",
  ECU: "Ecuador",
  EGY: "Egypt",
  ENG: "England",
  ESP: "Spain",
  FRA: "France",
  GER: "Germany",
  GHA: "Ghana",
  HAI: "Haiti",
  IRN: "Iran",
  IRQ: "Iraq",
  JOR: "Jordan",
  JPN: "Japan",
  KOR: "South Korea",
  KSA: "Saudi Arabia",
  MAR: "Morocco",
  MEX: "Mexico",
  NED: "Netherlands",
  NOR: "Norway",
  NZL: "New Zealand",
  PAN: "Panama",
  PAR: "Paraguay",
  POR: "Portugal",
  QAT: "Qatar",
  RSA: "South Africa",
  SCO: "Scotland",
  SEN: "Senegal",
  SUI: "Switzerland",
  SWE: "Sweden",
  TUN: "Tunisia",
  TUR: "Turkey",
  URU: "Uruguay",
  USA: "United States",
  UZB: "Uzbekistan",
};

function getTeamCode(team?: TeamLogoLike | null) {
  return (team?.code || team?.tla || team?.shortName || "").toUpperCase();
}

function isLikelyNationalTeam(team: TeamLogoLike) {
  const code = getTeamCode(team);

  return Boolean(
    countryNameByCode[code] ||
      (team.country && team.name && team.country === team.name)
  );
}

export function getTeamFlagEmoji(team?: TeamLogoLike | null) {
  const code = getTeamCode(team);

  return flagByCode[code] ?? null;
}

export function getTeamDisplayName(team?: TeamLogoLike | null) {
  if (!team) return "Команда";

  const code = getTeamCode(team);

  return countryNameByCode[code] || team.name || team.shortName || code || "Команда";
}
