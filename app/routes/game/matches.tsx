import {
  Link,
  useLoaderData,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import MatchesSection from "~/components/MatchesSection";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const gameMatches = await prisma.gameMatch.findMany({
    where: {
      gameId,
    },
    include: {
      match: {
        include: {
          tournament: true,
          round: true,
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
    orderBy: {
      match: {
        startTime: "desc",
      },
    },
    take: 100,
  });

  const matches = gameMatches.map((item) => item.match);

  const upcomingMatches = matches
    .filter((match) => match.status === "SCHEDULED")
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

  const liveMatches = matches
    .filter((match) => match.status === "LIVE")
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

  const finishedMatches = matches
    .filter((match) => match.status === "FINISHED")
    .sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

  const canceledMatches = matches
    .filter((match) => match.status === "CANCELED")
    .sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );

  return data({
    currentUser,
    upcomingMatches,
    liveMatches,
    finishedMatches,
    canceledMatches,
  });
}

export default function MatchesPage() {
  const {
    currentUser,
    upcomingMatches,
    liveMatches,
    finishedMatches,
    canceledMatches,
  } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-8">
      <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
              Matches
            </div>

            <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
              Усі матчі гри
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
              Тут зібрані майбутні, поточні та завершені матчі саме для цієї
              ліги. Можна швидко переглянути розклад, результати й перейти до
              деталей або прогнозу.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {currentUser ? (
              <Link
                to={`/games/predict`}
                className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90"
              >
                До прогнозів
              </Link>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90"
              >
                Увійти
              </Link>
            )}
          </div>
        </div>
      </section>

      <MatchesSection
        eyebrow="Найближчі матчі"
        title="Скоро почнуться"
        emptyText="Майбутніх матчів зараз немає."
        matches={upcomingMatches}
        currentUser={currentUser}
      />

      <MatchesSection
        eyebrow="LIVE матчі"
        title="Зараз у грі"
        emptyText="LIVE матчів зараз немає."
        matches={liveMatches}
        currentUser={currentUser}
      />

      <MatchesSection
        eyebrow="Завершені матчі"
        title="Останні результати"
        emptyText="Завершених матчів поки що немає."
        matches={finishedMatches}
        currentUser={currentUser}
      />

      {canceledMatches.length > 0 && (
        <MatchesSection
          eyebrow="Скасовані"
          title="Матчі, які не відбулися"
          emptyText="Скасованих матчів немає."
          matches={canceledMatches}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}