import { getTeamLogoSrc } from "~/lib/logo-utils";
import { useState } from "react";

type CardTeam = {
  id: string;
  name: string;
  shortName: string | null;
  logo: string | null;
  code: string | null;
} | null;

export type PlayerCardView = {
  id: string;
  name: string;
  image?: string | null;
  weightedPoints?: number;
  correctResults?: number;
  currentStreak?: number;
  finishedPicks?: number;
  exactHits: number;
  accuracyRate: number;
  bestStreak: number;
  card: {
    rating: number;
    ratingDelta: number;
    photoUrl: string | null;
    clubTeam: CardTeam;
  };
};

const CARD_FONT =
  '"Barlow Condensed", "Roboto Condensed", "Arial Narrow", "Avenir Next Condensed", Impact, system-ui, sans-serif';

function getCardTier(rating: number) {
  if (rating >= 92) {
    return {
      bg:
        "linear-gradient(155deg, #ffe760 0%, #f8c800 38%, #d99500 78%, #8f5b00 100%)",
      shine:
        "linear-gradient(118deg, rgba(255,255,255,0.62), transparent 28%, rgba(255,255,255,0.18) 54%, transparent 74%)",
      text: "#071225",
      muted: "rgba(7, 18, 37, 0.64)",
      edge: "#ffd21a",
      inner: "rgba(255, 247, 184, 0.44)",
      glow: "0 18px 34px rgba(217, 149, 0, 0.28)",
    };
  }

  if (rating >= 82) {
    return {
      bg:
        "linear-gradient(155deg, #ffe18c 0%, #d8a52c 42%, #9b6813 82%, #4b2d04 100%)",
      shine:
        "linear-gradient(120deg, rgba(255,255,255,0.46), transparent 34%, rgba(255,255,255,0.16) 58%, transparent 76%)",
      text: "#140d02",
      muted: "rgba(20, 13, 2, 0.66)",
      edge: "#e8b646",
      inner: "rgba(255, 232, 168, 0.34)",
      glow: "0 12px 22px rgba(139, 93, 18, 0.18)",
    };
  }

  if (rating >= 74) {
    return {
      bg:
        "linear-gradient(140deg, #ffffff 0%, #d8dde5 32%, #9ba4b1 64%, #4a5563 100%)",
      shine:
        "linear-gradient(120deg, rgba(255,255,255,0.75), transparent 32%, rgba(255,255,255,0.28) 58%, transparent 76%)",
      text: "#101720",
      muted: "rgba(16, 23, 32, 0.66)",
      edge: "#e5e7eb",
      inner: "rgba(255, 255, 255, 0.38)",
      glow: "0 12px 22px rgba(155, 164, 177, 0.18)",
    };
  }

  if (rating >= 62) {
    return {
      bg:
        "linear-gradient(140deg, #e3e7ed 0%, #a5adb8 40%, #6e7784 72%, #303843 100%)",
      shine:
        "linear-gradient(120deg, rgba(255,255,255,0.46), transparent 34%, rgba(255,255,255,0.16) 60%, transparent 78%)",
      text: "#101720",
      muted: "rgba(16, 23, 32, 0.64)",
      edge: "#b8c0cc",
      inner: "rgba(255, 255, 255, 0.26)",
      glow: "0 12px 22px rgba(110, 119, 132, 0.16)",
    };
  }

  return {
    bg:
      "linear-gradient(140deg, #d09a63 0%, #965d2e 42%, #633415 72%, #241006 100%)",
    shine:
      "linear-gradient(120deg, rgba(255,221,177,0.32), transparent 34%, rgba(255,221,177,0.12) 62%, transparent 80%)",
    text: "#fff4e8",
    muted: "rgba(255, 244, 232, 0.7)",
    edge: "#c88442",
    inner: "rgba(255, 208, 157, 0.22)",
    glow: "0 12px 22px rgba(99, 52, 21, 0.16)",
  };
}

function getPersonaLabel(rating: number) {
  if (rating >= 96) return "Бог гри";
  if (rating >= 92) return "Легенда";
  if (rating >= 86) return "Машина";
  if (rating >= 80) return "Про";
  if (rating >= 72) return "Стабільний";
  if (rating >= 64) return "Темна конячка";
  if (rating >= 56) return "Нубік";
  if (rating >= 48) return "На характері";
  return "Попуск";
}

function isDefaultAvatarUrl(url?: string | null) {
  if (!url) return true;

  return (
    url.includes("googleusercontent.com/a/") ||
    url.includes("googleusercontent.com/a-/") ||
    url.includes("googleusercontent.com/a/default-user") ||
    url.includes("googleusercontent.com/a-/AOh14") ||
    url.includes("ssl.gstatic.com/accounts/ui/avatar") ||
    url.includes("default-user")
  );
}

function DefaultPlayerSilhouette({
  name,
  color,
}: {
  name: string;
  color: string;
}) {
  return (
    <div
      className="flex h-full w-full items-center justify-center rounded-2xl bg-white/20"
      title={name}
    >
      <svg
        viewBox="0 0 96 96"
        className="h-full w-full p-2"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M48 52c13.3 0 24 9.9 24 22.2V80H24v-5.8C24 61.9 34.7 52 48 52Z"
          fill={color}
          opacity="0.78"
        />
        <path
          d="M48 47c9.4 0 17-7.6 17-17S57.4 13 48 13 31 20.6 31 30s7.6 17 17 17Z"
          fill={color}
          opacity="0.92"
        />
        <path
          d="M30 77h36"
          stroke="rgba(255,255,255,0.42)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function TeamBadge({
  team,
  fallback,
  featured = false,
}: {
  team: CardTeam;
  fallback: string;
  featured?: boolean;
}) {
  const logoSrc = getTeamLogoSrc(team);

  return (
    <div
      className={`flex items-center justify-center rounded-full bg-white/86 ring-1 ring-black/10 ${
        featured ? "h-6 w-6" : "h-[18px] w-[18px]"
      }`}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={team?.name ?? fallback}
          className={featured ? "h-4.5 w-4.5 object-contain" : "h-3 w-3 object-contain"}
          loading="lazy"
        />
      ) : (
        <span className="text-[6px] font-black uppercase text-slate-800">
          {fallback.slice(0, 3)}
        </span>
      )}
    </div>
  );
}

export function RatingDelta({ value }: { value: number }) {
  const label = value > 0 ? `+${value}` : `${value}`;

  return (
    <span
      className="inline-flex max-w-[28px] shrink-0 justify-center rounded-full px-1.5 py-0.5 text-[7px] font-black leading-none tabular-nums"
      style={{
        fontFamily: CARD_FONT,
        background:
          value > 0
            ? "rgba(16, 185, 129, 0.18)"
            : value < 0
            ? "rgba(239, 68, 68, 0.16)"
            : "rgba(15, 23, 42, 0.1)",
        color: value > 0 ? "#047857" : value < 0 ? "#b91c1c" : "#334155",
      }}
    >
      {label}
    </span>
  );
}

export function PlayerFifaCard({
  player,
  compact = false,
  featured = false,
}: {
  player: PlayerCardView;
  compact?: boolean;
  featured?: boolean;
}) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const tier = getCardTier(player.card.rating);
  const hasCustomCardPhoto = Boolean(player.card.photoUrl);
  const cardPhoto = player.card.photoUrl || player.image;
  const shouldUseFallback =
    photoFailed ||
    (hasCustomCardPhoto ? !cardPhoto : isDefaultAvatarUrl(player.image));
  const clubLabel =
    player.card.clubTeam?.shortName || player.card.clubTeam?.name || "CLUB";
  const sizeClass = featured
    ? "h-[226px] w-[166px] rounded-[26px] px-3.5 pb-3 pt-3"
    : compact
    ? "h-[132px] w-[98px] rounded-[18px] px-2 pb-2 pt-2"
    : "h-[174px] w-[128px] rounded-[22px] px-3 pb-2.5 pt-2.5";
  const ratingClass = featured ? "text-[34px]" : compact ? "text-[22px]" : "text-[28px]";
  const roleClass = featured ? "text-[11px]" : compact ? "text-[7px]" : "text-[9px]";
  const photoClass = featured
    ? "right-2 top-4 h-[108px] w-[104px]"
    : compact
    ? "right-1.5 top-4 h-[58px] w-[56px]"
    : "right-2 top-5 h-[78px] w-[76px]";
  const nameClass = featured ? "text-[20px]" : compact ? "text-[10px]" : "text-[15px]";
  const statValueClass = featured ? "text-[18px]" : compact ? "text-[9px]" : "text-[13px]";
  const statLabelClass = featured ? "text-[9px]" : compact ? "text-[5px]" : "text-[7px]";
  const nameTop = featured ? "top-[124px]" : compact ? "top-[74px]" : "top-[99px]";
  const statsClass = compact
    ? "bottom-2 opacity-0 translate-y-2 transition duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus:opacity-100 group-focus:translate-y-0"
    : "bottom-3";
  const stats = [
    { label: "PTS", value: player.weightedPoints ?? player.exactHits * 3 },
    { label: "EX", value: player.exactHits },
    { label: "ACC", value: `${Math.round(player.accuracyRate)}%` },
    { label: "STR", value: player.currentStreak ?? player.bestStreak },
    { label: "BST", value: player.bestStreak },
    { label: "GM", value: player.finishedPicks ?? player.correctResults ?? 0 },
  ];

  return (
    <article
      tabIndex={compact ? 0 : undefined}
      className={`group relative shrink-0 overflow-hidden border-[3px] outline-none transition duration-200 focus:scale-[1.03] focus:ring-2 focus:ring-white/45 ${
        compact ? "cursor-default hover:scale-[1.03]" : ""
      } ${sizeClass}`}
      style={{
        background: tier.bg,
        color: tier.text,
        boxShadow: tier.glow,
        borderColor: tier.edge,
        fontFamily: CARD_FONT,
      }}
    >
      <div className="absolute inset-0" style={{ background: tier.shine }} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_12%,rgba(255,255,255,0.42),transparent_28%),radial-gradient(circle_at_88%_74%,rgba(0,0,0,0.22),transparent_35%)]" />
      <div
        className={`absolute inset-[4px] border-2 ${
          featured ? "rounded-[21px]" : compact ? "rounded-[13px]" : "rounded-[17px]"
        }`}
        style={{ borderColor: tier.inner }}
      />
      <div className="absolute inset-x-3 top-2 h-[2px] rounded-full bg-white/36" />
      <div className="absolute -right-5 top-8 h-28 w-28 rounded-full bg-white/16 blur-2xl" />

      <div className="relative z-20 flex flex-col items-start">
        <div className={`${ratingClass} font-black leading-none tabular-nums`}>
          {player.card.rating}
        </div>
        <div className={`${roleClass} mt-1 font-black uppercase leading-none`}>
          {getPersonaLabel(player.card.rating)}
        </div>
        <div className="mt-1.5 flex flex-col gap-1">
          <TeamBadge
            team={player.card.clubTeam}
            fallback={clubLabel}
            featured={featured}
          />
          <RatingDelta value={player.card.ratingDelta} />
        </div>
      </div>

      <div className={`absolute z-10 overflow-hidden ${photoClass}`}>
        {!shouldUseFallback && cardPhoto ? (
          <img
            src={cardPhoto}
            alt={player.name}
            className="h-full w-full object-cover object-top [filter:saturate(1.08)_contrast(1.06)]"
            loading="lazy"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <DefaultPlayerSilhouette name={player.name} color={tier.text} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/18 to-transparent" />
      </div>

      <div className={`absolute inset-x-3 z-20 text-center ${nameTop}`}>
        <div className="mx-auto h-px w-full bg-black/18" />
        <div className={`mt-1 truncate font-black uppercase leading-none ${nameClass}`}>
          {player.name}
        </div>
      </div>

      <div
        className={`absolute inset-x-3 z-20 grid grid-cols-3 gap-x-1 gap-y-1 text-center ${
          statsClass
        }`}
        style={{ color: tier.text }}
      >
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0">
            <div className={`${statValueClass} font-black leading-none tabular-nums`}>
              {stat.value}
            </div>
            <div
              className={`${statLabelClass} mt-0.5 font-black uppercase leading-none`}
              style={{ color: tier.muted }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
