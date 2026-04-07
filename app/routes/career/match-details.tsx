import {
  Link,
  useLoaderData,
  data,
  redirect,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getStatusMeta(status: string) {
  switch (status) {
    case "LIVE":
      return {
        label: "LIVE",
        className: "border-red-400/20 bg-red-400/10 text-red-200",
      };
    case "FINISHED":
      return {
        label: "Завершено",
        className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
      };
    case "POSTPONED":
      return {
        label: "Перенесено",
        className: "border-yellow-400/20 bg-yellow-400/10 text-yellow-200",
      };
    case "CANCELED":
      return {
        label: "Скасовано",
        className: "border-white/10 bg-white/[0.05] text-white/65",
      };
    default:
      return {
        label: "Скоро",
        className: "border-blue-400/20 bg-blue-400/10 text-blue-200",
      };
  }
}

function getPredictionMeta(prediction: {
  wasExact: boolean;
  wasOutcomeOnly: boolean;
  wasWrong: boolean;
} | null) {
  if (!prediction) {
    return {
      label: "Без прогнозу",
      className: "border-white/10 bg-white/[0.05] text-white/60",
    };
  }

  if (prediction.wasExact) {
    return {
      label: "Точний",
      className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
    };
  }

  if (prediction.wasOutcomeOnly) {
    return {
      label: "Результат",
      className: "border-blue-400/20 bg-blue-400/10 text-blue-200",
    };
  }

  if (prediction.wasWrong) {
    return {
      label: "Мимо",
      className: "border-red-400/20 bg-red-400/10 text-red-200",
    };
  }

  return {
    label: "Прогноз",
    className: "border-white/10 bg-white/[0.05] text-white/60",
  };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const gameId = params.gameId;
  const matchId = params.matchId;

  if (!gameId || !matchId) {
    throw new Response("Match not found", { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: "ACTIVE",
    },
    include: {
      game: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!membership) {
    throw redirect("/");
  }

  const gameMatch = await prisma.gameMatch.findFirst({
    where: {
      gameId,
      matchId,
    },
    include: {
      match: {
        include: {
          homeTeam: {
            select: {
              id: true,
              name: true,
              shortName: true,
              code: true,
              logo: true,
              country: true,
              stadium: true,
            },
          },
          awayTeam: {
            select: {
              id: true,
              name: true,
              shortName: true,
              code: true,
              logo: true,
              country: true,
              stadium: true,
            },
          },
          tournament: {
            select: {
              id: true,
              name: true,
              logo: true,
              country: true,
            },
          },
          round: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!gameMatch) {
    throw new Response("Match not found in this career", { status: 404 });
  }

  const prediction = await prisma.prediction.findFirst({
    where: {
      gameId,
      matchId,
      userId: currentUser.id,
    },
    include: {
      scorerPicks: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              shortName: true,
              photo: true,
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
      lineupPicks: {
        include: {
          player: {
            select: {
              id: true,
              name: true,
              shortName: true,
              position: true,
              photo: true,
            },
          },
        },
        orderBy: {
          order: "asc",
        },
      },
      predictedMvpPlayer: {
        select: {
          id: true,
          name: true,
          shortName: true,
          photo: true,
        },
      },
    },
  });

  const now = new Date();
  const match = gameMatch.match;

  const canPredict =
    !gameMatch.isLocked &&
    match.status !== "FINISHED" &&
    match.status !== "CANCELED" &&
    match.status !== "POSTPONED" &&
    new Date(match.startTime) > now;

  return data({
    career: {
      id: membership.game.id,
      name: membership.game.name,
      slug: membership.game.slug,
    },

    match: {
      id: match.id,
      status: match.status,
      startTime: match.startTime,
      venue: match.venue,
      referee: match.referee,
      attendance: match.attendance,
      stageLabel: match.stageLabel,
      matchdayLabel: match.matchdayLabel,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      extraHomeScore: match.extraHomeScore,
      extraAwayScore: match.extraAwayScore,
      penaltyHome: match.penaltyHome,
      penaltyAway: match.penaltyAway,
      homeFormation: match.homeFormation,
      awayFormation: match.awayFormation,

      tournament: match.tournament
        ? {
            id: match.tournament.id,
            name: match.tournament.name,
            logo: match.tournament.logo,
            country: match.tournament.country,
          }
        : null,

      round: match.round
        ? {
            id: match.round.id,
            name: match.round.name,
          }
        : null,

      homeTeam: {
        id: match.homeTeam.id,
        name: match.homeTeam.shortName || match.homeTeam.name,
        fullName: match.homeTeam.name,
        code: match.homeTeam.code,
        logo: match.homeTeam.logo,
        country: match.homeTeam.country,
      },

      awayTeam: {
        id: match.awayTeam.id,
        name: match.awayTeam.shortName || match.awayTeam.name,
        fullName: match.awayTeam.name,
        code: match.awayTeam.code,
        logo: match.awayTeam.logo,
        country: match.awayTeam.country,
      },
    },

    prediction: prediction
      ? {
          id: prediction.id,
          predictedHome: prediction.predictedHome,
          predictedAway: prediction.predictedAway,
          predictedHomeFormation: prediction.predictedHomeFormation,
          predictedAwayFormation: prediction.predictedAwayFormation,
          notes: prediction.notes,
          confidenceLevel: prediction.confidenceLevel,
          predictedFirstTeamToScore: prediction.predictedFirstTeamToScore,
          predictedBothTeamsToScore: prediction.predictedBothTeamsToScore,
          predictedTotalGoals: prediction.predictedTotalGoals,
          pointsAwarded: prediction.pointsAwarded,
          weightedPointsAwarded: prediction.weightedPointsAwarded,
          wasExact: prediction.wasExact,
          wasOutcomeOnly: prediction.wasOutcomeOnly,
          wasWrong: prediction.wasWrong,
          submittedAt: prediction.submittedAt,
          predictedMvpPlayer: prediction.predictedMvpPlayer
            ? {
                id: prediction.predictedMvpPlayer.id,
                name:
                  prediction.predictedMvpPlayer.shortName ||
                  prediction.predictedMvpPlayer.name,
              }
            : null,
          scorerPicks: prediction.scorerPicks.map((pick) => ({
            id: pick.id,
            teamSide: pick.teamSide,
            goalsCount: pick.goalsCount,
            minuteHint: pick.minuteHint,
            isFirstGoalScorer: pick.isFirstGoalScorer,
            player: {
              id: pick.player.id,
              name: pick.player.shortName || pick.player.name,
            },
          })),
          lineupPicks: prediction.lineupPicks.map((pick) => ({
            id: pick.id,
            teamSide: pick.teamSide,
            isStarter: pick.isStarter,
            isCaptain: pick.isCaptain,
            predictedRole: pick.predictedRole,
            predictedPositionLabel: pick.predictedPositionLabel,
            order: pick.order,
            player: {
              id: pick.player.id,
              name: pick.player.shortName || pick.player.name,
              position: pick.player.position,
            },
          })),
        }
      : null,

    canPredict,
  });
}

function TeamLogo({
  code,
  name,
  className = "h-14 w-14",
}: {
  code?: string | null;
  name: string;
  className?: string;
}) {
  if (!code) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-xs font-black text-white/70 ${className}`}
      >
        {name.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`/teams/${code}.svg`}
      alt={name}
      className={`rounded-2xl border border-white/10 bg-white p-1 object-contain ${className}`}
      onError={(e) => {
        const target = e.currentTarget;
        target.style.display = "none";
      }}
    />
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-black text-white sm:text-xl">{title}</h2>
        {subtitle ? (
          <p className="mt-1 text-sm leading-6 text-white/55">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function TinyInfo({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-[#0b1018] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-white">
        {value || "—"}
      </div>
    </div>
  );
}

export default function CareerMatchDetailsPage() {
  const { career, match, prediction, canPredict } = useLoaderData<typeof loader>();

  const statusMeta = getStatusMeta(match.status);
  const predictionMeta = getPredictionMeta(prediction);

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap gap-2">
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${statusMeta.className}`}
              >
                {statusMeta.label}
              </div>

              <div
                className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${predictionMeta.className}`}
              >
                {predictionMeta.label}
              </div>
            </div>

            <h1 className="mt-4 text-2xl font-black text-white sm:text-3xl">
              {match.homeTeam.name} — {match.awayTeam.name}
            </h1>

            <div className="mt-2 text-sm text-white/55">
              {match.tournament?.name || "Турнір"}
              {match.round?.name ? ` · ${match.round.name}` : ""}
              {match.stageLabel ? ` · ${match.stageLabel}` : ""}
            </div>
          </div>

          <div className="text-sm text-white/55">
            {formatDateTime(match.startTime)}
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
          <div className="flex items-center gap-3">
            <TeamLogo code={match.homeTeam.code} name={match.homeTeam.name} />
            <div className="min-w-0">
              <div className="truncate text-xl font-black text-white">
                {match.homeTeam.name}
              </div>
              <div className="mt-1 text-sm text-white/45">
                {match.homeTeam.country || "HOME"}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            {match.status === "FINISHED" &&
            match.homeScore !== null &&
            match.awayScore !== null ? (
              <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-6 py-4 text-2xl font-black text-white">
                {match.homeScore}:{match.awayScore}
              </div>
            ) : prediction ? (
              <div className="rounded-2xl border border-orange-400/20 bg-orange-400/10 px-6 py-4 text-2xl font-black text-white">
                {prediction.predictedHome}:{prediction.predictedAway}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-6 py-4 text-xl font-black text-white/70">
                VS
              </div>
            )}

            {prediction ? (
              <div className="text-sm text-white/55">
                Балів: {prediction.weightedPointsAwarded}
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-start gap-3 lg:justify-end">
            <div className="min-w-0 text-right">
              <div className="truncate text-xl font-black text-white">
                {match.awayTeam.name}
              </div>
              <div className="mt-1 text-sm text-white/45">
                {match.awayTeam.country || "AWAY"}
              </div>
            </div>
            <TeamLogo code={match.awayTeam.code} name={match.awayTeam.name} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to={`/career/${career.id}/matches`}
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
          >
            Назад до матчів
          </Link>

          {canPredict ? (
            <Link
              to={`/career/${career.id}/predict/${match.id}`}
              className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-black transition hover:opacity-90"
            >
              {prediction ? "Оновити прогноз" : "Дати прогноз"}
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <SectionCard title="Інформація про матч" subtitle="Базові деталі та контекст">
          <div className="grid gap-3 sm:grid-cols-2">
            <TinyInfo label="Турнір" value={match.tournament?.name} />
            <TinyInfo label="Раунд" value={match.round?.name} />
            <TinyInfo label="Дата" value={formatDateTime(match.startTime)} />
            <TinyInfo label="Стадія" value={match.stageLabel} />
            <TinyInfo label="Matchday" value={match.matchdayLabel} />
            <TinyInfo label="Venue" value={match.venue} />
            <TinyInfo label="Referee" value={match.referee} />
            <TinyInfo label="Attendance" value={match.attendance} />
          </div>

          {(match.extraHomeScore !== null ||
            match.extraAwayScore !== null ||
            match.penaltyHome !== null ||
            match.penaltyAway !== null) && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TinyInfo
                label="Extra time"
                value={
                  match.extraHomeScore !== null && match.extraAwayScore !== null
                    ? `${match.extraHomeScore}:${match.extraAwayScore}`
                    : "—"
                }
              />
              <TinyInfo
                label="Penalties"
                value={
                  match.penaltyHome !== null && match.penaltyAway !== null
                    ? `${match.penaltyHome}:${match.penaltyAway}`
                    : "—"
                }
              />
            </div>
          )}
        </SectionCard>

        <SectionCard title="Швидкі дії" subtitle="Основні кроки по цьому матчу">
          <div className="grid gap-3">
            <Link
              to={`/career/${career.id}/predict/${match.id}`}
              className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4 transition hover:border-white/20 hover:bg-white/[0.03]"
            >
              <div className="text-base font-black text-white">Базовий прогноз</div>
              <div className="mt-2 text-sm leading-6 text-white/55">
                Рахунок, обидві заб’ють, перша команда, total goals та інше.
              </div>
            </Link>

            <Link
              to={`/career/${career.id}/predict/${match.id}/lineup`}
              className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4 transition hover:border-white/20 hover:bg-white/[0.03]"
            >
              <div className="text-base font-black text-white">Прогноз складу</div>
              <div className="mt-2 text-sm leading-6 text-white/55">
                Стартові гравці, ролі, captain і побудова складу.
              </div>
            </Link>

            <Link
              to={`/career/${career.id}/predict/${match.id}/scorers`}
              className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4 transition hover:border-white/20 hover:bg-white/[0.03]"
            >
              <div className="text-base font-black text-white">Голеадори</div>
              <div className="mt-2 text-sm leading-6 text-white/55">
                Хто заб’є, скільки голів і хто відкриє рахунок.
              </div>
            </Link>

            <Link
              to={`/career/${career.id}/predict/${match.id}/analysis`}
              className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4 transition hover:border-white/20 hover:bg-white/[0.03]"
            >
              <div className="text-base font-black text-white">Матч-аналіз</div>
              <div className="mt-2 text-sm leading-6 text-white/55">
                Думки, notes, confidence level і персональний розбір перед грою.
              </div>
            </Link>
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard
          title="Твій прогноз"
          subtitle="Поточний стан прогнозу на цей матч"
        >
          {prediction ? (
            <div className="space-y-4">
              <div className="rounded-[1.25rem] border border-orange-400/20 bg-orange-400/10 p-4">
                <div className="text-sm font-black text-white">Прогноз рахунку</div>
                <div className="mt-2 text-2xl font-black text-white">
                  {prediction.predictedHome}:{prediction.predictedAway}
                </div>
                <div className="mt-2 text-sm text-white/65">
                  Відправлено: {formatDateTime(prediction.submittedAt)}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <TinyInfo label="Home formation" value={prediction.predictedHomeFormation} />
                <TinyInfo label="Away formation" value={prediction.predictedAwayFormation} />
                <TinyInfo
                  label="Both teams to score"
                  value={
                    prediction.predictedBothTeamsToScore === null
                      ? "—"
                      : prediction.predictedBothTeamsToScore
                      ? "Так"
                      : "Ні"
                  }
                />
                <TinyInfo
                  label="Total goals"
                  value={prediction.predictedTotalGoals}
                />
                <TinyInfo
                  label="Confidence"
                  value={prediction.confidenceLevel}
                />
                <TinyInfo
                  label="First to score"
                  value={prediction.predictedFirstTeamToScore}
                />
              </div>

              {prediction.predictedMvpPlayer ? (
                <div className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4">
                  <div className="text-sm font-black text-white">MVP pick</div>
                  <div className="mt-2 text-sm text-white/70">
                    {prediction.predictedMvpPlayer.name}
                  </div>
                </div>
              ) : null}

              {prediction.notes ? (
                <div className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4">
                  <div className="text-sm font-black text-white">Notes</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">
                    {prediction.notes}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4 text-sm leading-6 text-white/55">
              На цей матч ти ще не створив прогноз.
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Деталізація прогнозу"
          subtitle="Склади та голеадори"
        >
          <div className="space-y-4">
            <div className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4">
              <div className="text-sm font-black text-white">Lineup picks</div>
              {prediction?.lineupPicks?.length ? (
                <div className="mt-3 space-y-2">
                  {prediction.lineupPicks.slice(0, 8).map((pick) => (
                    <div
                      key={pick.id}
                      className="flex items-center justify-between gap-3 text-sm text-white/70"
                    >
                      <div>
                        {pick.player.name}
                        {pick.predictedPositionLabel ? ` · ${pick.predictedPositionLabel}` : ""}
                      </div>
                      <div className="text-white/45">
                        {pick.teamSide} {pick.isCaptain ? "· C" : ""}
                      </div>
                    </div>
                  ))}

                  {prediction.lineupPicks.length > 8 ? (
                    <div className="text-sm text-white/45">
                      + ще {prediction.lineupPicks.length - 8}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-2 text-sm text-white/55">
                  Поки що немає вибраного складу.
                </div>
              )}
            </div>

            <div className="rounded-[1.25rem] border border-white/10 bg-[#0b1018] p-4">
              <div className="text-sm font-black text-white">Scorer picks</div>
              {prediction?.scorerPicks?.length ? (
                <div className="mt-3 space-y-2">
                  {prediction.scorerPicks.map((pick) => (
                    <div
                      key={pick.id}
                      className="flex items-center justify-between gap-3 text-sm text-white/70"
                    >
                      <div>{pick.player.name}</div>
                      <div className="text-white/45">
                        {pick.goalsCount} гол.
                        {pick.isFirstGoalScorer ? " · first" : ""}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-sm text-white/55">
                  Поки що немає вибраних голеадорів.
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </section>
    </div>
  );
}