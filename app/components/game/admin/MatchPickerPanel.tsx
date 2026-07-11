import { Form } from "react-router";
import type { ReactNode } from "react";
import { TeamLine } from "~/components/game/TeamLogo";

type TeamOption = {
  name: string;
  logo?: string | null;
  shortName?: string | null;
  code?: string | null;
  tla?: string | null;
};

type MatchOption = {
  id: string;
  startTime: Date | string;
  venue?: string | null;
  tournament: {
    name: string;
  };
  round?: {
    name: string;
  } | null;
  homeTeam: TeamOption;
  awayTeam: TeamOption;
};

type TournamentOption = {
  id: string;
  name: string;
  seasonLabel: string | null;
  availableMatchesCount: number;
};

function formatAdminDate(value: Date | string) {
  return new Date(value).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function MatchPickerPanel({
  icon,
  availableMatches,
  availableTournamentOptions,
  isSubmitting,
}: {
  icon: ReactNode;
  availableMatches: MatchOption[];
  availableTournamentOptions: TournamentOption[];
  isSubmitting: boolean;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
          {icon}
        </div>

        <div className="min-w-0">
          <h2 className="text-xl font-black sm:text-2xl">
            Додати існуючий матч у гру
          </h2>
          <p className="mt-1 text-sm text-white/50">
            Матчі створюються один раз у базі, а тут ти просто підключаєш
            потрібні матчі до своєї гри.
          </p>
        </div>
      </div>

      <Form method="post" className="space-y-5">
        <input type="hidden" name="intent" value="addExistingMatchToGame" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-white/75">
              Вага для вибраних
            </label>
            <input
              name="customWeight"
              type="number"
              min="1"
              placeholder="авто"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none placeholder:text-white/25 focus:border-white/20"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-white/75">
              Дедлайн для вибраних
            </label>
            <input
              name="predictionClosesAt"
              type="datetime-local"
              className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/20"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {availableMatches.length > 0 ? (
          <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
            {availableMatches.map((match) => (
              <label
                key={match.id}
                className="group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[1.25rem] border border-white/10 bg-black/20 p-3 transition hover:border-white/20 hover:bg-white/[0.07] sm:p-4"
              >
                <input
                  type="checkbox"
                  name="matchId"
                  value={match.id}
                  className="mt-1 h-5 w-5 rounded border-white/20 bg-black/30 accent-emerald-400"
                  disabled={isSubmitting}
                />

                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/45">
                    <span>{match.tournament.name}</span>
                    {match.round ? <span>{match.round.name}</span> : null}
                    <span>{formatAdminDate(match.startTime)}</span>
                  </div>

                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                    <TeamLine team={match.homeTeam} showSubLabel={false} />
                    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-black text-white/50 sm:px-3">
                      VS
                    </span>
                    <TeamLine
                      team={match.awayTeam}
                      align="right"
                      showSubLabel={false}
                    />
                  </div>

                  {match.venue ? (
                    <div className="mt-3 truncate text-xs font-medium text-white/40">
                      {match.venue}
                    </div>
                  ) : null}
                </div>
              </label>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-center text-sm text-white/45">
            Немає доступних матчів для додавання.
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || availableMatches.length === 0}
          className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {isSubmitting ? "Додаю..." : "Додати вибрані матчі"}
        </button>
      </Form>

      <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
        <div className="mb-3">
          <h3 className="text-base font-black">Додати всі матчі турніру</h3>
          <p className="mt-1 text-sm text-white/50">
            Зручно для Чемпіонату Світу: вибираєш турнір, і всі його
            незавершені матчі, яких ще немає в цій грі, додаються разом.
          </p>
        </div>

        {availableTournamentOptions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {availableTournamentOptions.map((tournament) => (
              <Form
                key={tournament.id}
                method="post"
                className="rounded-2xl border border-white/10 bg-white/5 p-4 transition hover:border-white/20 hover:bg-white/10"
              >
                <input
                  type="hidden"
                  name="intent"
                  value="addTournamentMatchesToGame"
                />
                <input
                  type="hidden"
                  name="tournamentId"
                  value={tournament.id}
                />

                <div className="text-sm font-black text-white">
                  {tournament.name}
                </div>
                <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/40">
                  {tournament.seasonLabel
                    ? `${tournament.seasonLabel} · `
                    : ""}
                  {tournament.availableMatchesCount} матчів
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-4 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Додаю..." : "Додати всі"}
                </button>
              </Form>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-sm text-white/45">
            Немає турнірів з доступними матчами.
          </div>
        )}
      </div>

      {availableMatches.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-100/75">
          Усі незавершені матчі вже додані до цієї гри.
        </div>
      ) : null}
    </section>
  );
}
