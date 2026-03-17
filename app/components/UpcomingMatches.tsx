import { Link } from "react-router";

type MatchCardItem = {
  id: string;
  startTime: string | Date;
  tournament: {
    name: string;
  };
  homeTeam: {
    name: string;
  };
  awayTeam: {
    name: string;
  };
};

export default function UpcomingMatches({
  matches = [],
}: {
  matches?: MatchCardItem[];
}) {
  if (!matches.length) {
    return (
      <section>
        <h2 className="mb-4 text-xl font-black">Upcoming Matches</h2>

        <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
          Найближчих матчів зараз немає.
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-4 text-xl font-black">Upcoming Matches</h2>

      <div className="flex gap-4 overflow-x-auto">
        {matches.map((match) => (
          <div
            key={match.id}
            className="min-w-[260px] rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="text-xs uppercase text-white/50">
              {match.tournament.name}
            </div>

            <div className="mt-2 text-lg font-bold">
              {match.homeTeam.name} vs {match.awayTeam.name}
            </div>

            <div className="mt-3 text-sm text-white/60">
              {new Date(match.startTime).toLocaleString("uk-UA")}
            </div>

            <Link
              to="../predict"
              className="mt-4 inline-flex w-full justify-center rounded-xl bg-white px-4 py-2 text-sm font-bold text-black"
            >
              Predict
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}