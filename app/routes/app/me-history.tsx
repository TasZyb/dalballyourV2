import { Link, data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUser } from "~/lib/auth.server";

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

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  const predictions = await prisma.prediction.findMany({
    where: {
      userId: user.id,
    },
    orderBy: {
      updatedAt: "desc",
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
  });

  return data({ predictions });
}

export default function MeHistoryPage() {
  const { predictions } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            to="/me"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            ← Назад у кабінет
          </Link>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-xl sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Історія
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Усі мої прогнози
          </h1>

          <div className="mt-6 space-y-4">
            {predictions.length > 0 ? (
              predictions.map((prediction) => (
                <div
                  key={prediction.id}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                        {prediction.match.tournament.name}
                        {prediction.match.round
                          ? ` · ${prediction.match.round.name}`
                          : ""}
                      </div>

                      <div className="mt-2 text-lg font-black">
                        {prediction.match.homeTeam.name}{" "}
                        <span className="text-white/35">vs</span>{" "}
                        {prediction.match.awayTeam.name}
                      </div>

                      <div className="mt-2 text-sm text-white/60">
                        {new Date(prediction.match.startTime).toLocaleString("uk-UA")}
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold">
                        {getStatusLabel(prediction.match.status)}
                      </span>

                      {prediction.match.homeScore !== null &&
                        prediction.match.awayScore !== null && (
                          <span className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-black text-emerald-200">
                            Результат: {prediction.match.homeScore}:
                            {prediction.match.awayScore}
                          </span>
                        )}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-xs text-white/50">Твій прогноз</div>
                      <div className="mt-2 text-xl font-black">
                        {prediction.predictedHome}:{prediction.predictedAway}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-xs text-white/50">Очки</div>
                      <div className="mt-2 text-xl font-black">
                        {prediction.pointsAwarded}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-white/60">
                У тебе ще немає прогнозів.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}