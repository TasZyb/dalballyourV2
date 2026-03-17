import MatchCard from "./MatchCard";

type MatchesSectionProps = {
  eyebrow: string;
  title: string;
  emptyText: string;
  matches: any[];
  currentUser: unknown;
};

export default function MatchesSection({
  eyebrow,
  title,
  emptyText,
  matches,
  currentUser,
}: MatchesSectionProps) {
  return (
    <section className="mt-4 rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:mt-8 sm:rounded-[2rem] sm:p-6">
      <div className="mb-4">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45 sm:text-sm sm:tracking-[0.2em]">
          {eyebrow}
        </div>
        <h3 className="mt-1 text-xl font-black sm:mt-2 sm:text-2xl">
          {title}
        </h3>
      </div>

      <div className="space-y-4">
        {matches.length > 0 ? (
          matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              currentUser={currentUser}
            />
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60 sm:rounded-3xl sm:p-6 sm:text-base">
            {emptyText}
          </div>
        )}
      </div>
    </section>
  );
}