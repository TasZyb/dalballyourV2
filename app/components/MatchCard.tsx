import { Link } from "react-router";

type MatchCardProps = {
  match: {
    id: string;
    status: string;
    startTime: string | Date;
    homeScore: number | null;
    awayScore: number | null;
    tournament: {
      name: string;
    };
    round: {
      name: string;
    } | null;
    homeTeam: {
      name: string;
      shortName?: string | null;
    };
    awayTeam: {
      name: string;
      shortName?: string | null;
    };
  };
  currentUser: unknown;
};

function getStatusLabel(status: string) {
  switch (status) {
    case "SCHEDULED":
      return "Скоро";
    case "LIVE":
      return "LIVE";
    case "FINISHED":
      return "Завершено";
    case "CANCELED":
      return "Скасовано";
    default:
      return status;
  }
}

function getResultLabel(home: number | null, away: number | null) {
  if (home === null || away === null) return "Очікується";
  if (home > away) return "Перемога господарів";
  if (home < away) return "Перемога гостей";
  return "Нічия";
}

function getStatusStyles(status: string) {
  switch (status) {
    case "LIVE":
      return {
        badge:
          "border-red-400/25 bg-red-500/15 text-red-200",
        card:
          "border-red-400/15 bg-red-500/[0.07]",
      };
    case "FINISHED":
      return {
        badge:
          "border-emerald-400/25 bg-emerald-500/15 text-emerald-200",
        card:
          "border-white/10 bg-black/20",
      };
    case "CANCELED":
      return {
        badge:
          "border-yellow-400/25 bg-yellow-500/15 text-yellow-200",
        card:
          "border-yellow-400/15 bg-yellow-500/[0.06]",
      };
    default:
      return {
        badge:
          "border-white/10 bg-white/10 text-white/80",
        card:
          "border-white/10 bg-black/20",
      };
  }
}

export default function MatchCard({
  match,
  currentUser,
}: MatchCardProps) {
  const styles = getStatusStyles(match.status);

  return (
    <div
      className={`group rounded-[1.6rem] border p-4 transition hover:border-white/20 hover:bg-white/[0.06] sm:p-5 ${styles.card}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40 sm:text-xs">
            <span>{match.tournament.name}</span>
            {match.round ? (
              <>
                <span className="text-white/20">•</span>
                <span>{match.round.name}</span>
              </>
            ) : null}
          </div>

          <Link
            to={`../matches/${match.id}`}
            className="mt-3 block"
          >
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="min-w-0 text-right">
                <div className="truncate text-base font-black sm:text-xl">
                  {match.homeTeam.shortName || match.homeTeam.name}
                </div>
                <div className="truncate text-xs text-white/45 sm:text-sm">
                  {match.homeTeam.name}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center">
                {match.status === "FINISHED" ? (
                  <div className="text-lg font-black sm:text-2xl">
                    {match.homeScore}:{match.awayScore}
                  </div>
                ) : match.status === "LIVE" ? (
                  <div className="text-sm font-black text-red-200 sm:text-base">
                    LIVE
                  </div>
                ) : match.status === "CANCELED" ? (
                  <div className="text-sm font-black text-yellow-200 sm:text-base">
                    —
                  </div>
                ) : (
                  <div className="text-sm font-black text-white/60 sm:text-base">
                    VS
                  </div>
                )}
              </div>

              <div className="min-w-0 text-left">
                <div className="truncate text-base font-black sm:text-xl">
                  {match.awayTeam.shortName || match.awayTeam.name}
                </div>
                <div className="truncate text-xs text-white/45 sm:text-sm">
                  {match.awayTeam.name}
                </div>
              </div>
            </div>
          </Link>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/60">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              {new Date(match.startTime).toLocaleString("uk-UA")}
            </div>

            {match.status === "FINISHED" ? (
              <div className="text-white/50">
                {getResultLabel(match.homeScore, match.awayScore)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-row items-center justify-between gap-3 lg:w-[220px] lg:flex-col lg:items-end">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${styles.badge}`}
          >
            {getStatusLabel(match.status)}
          </span>

          <div className="flex gap-2">
            <Link
              to={`../matches/${match.id}`}
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Деталі
            </Link>

            {match.status === "SCHEDULED" &&
              (currentUser ? (
                <Link
                  to={`../predict`}
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-bold text-black transition hover:opacity-90"
                >
                  Прогноз
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-bold text-black transition hover:opacity-90"
                >
                  Увійти
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}