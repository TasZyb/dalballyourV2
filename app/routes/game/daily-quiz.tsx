import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useMemo, useState } from "react";
import {
  CoinReason,
  CoinTransactionType,
  DailyQuizQuestionType,
  MatchStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";

type QuizOption = string;

type ActionData = {
  error?: string;
};

const DAILY_QUIZ_QUESTION_COUNT = 5;
const ALLOW_QUIZ_RETAKES = true;

function getQuizDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function formatQuizDate(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

function shuffleWithSeed<T>(items: T[], seed: string) {
  return [...items]
    .map((item, index) => {
      const code = `${seed}:${index}:${JSON.stringify(item)}`
        .split("")
        .reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return { item, code };
    })
    .sort((a, b) => a.code - b.code)
    .map(({ item }) => item);
}

function uniqueOptions(correct: string, candidates: string[], seed: string) {
  const options = [correct];

  for (const candidate of shuffleWithSeed(candidates, seed)) {
    if (options.length >= 4) break;
    if (!options.includes(candidate)) options.push(candidate);
  }

  return shuffleWithSeed(options, `${seed}:final`);
}

async function ensureDailyQuiz(
  gameId: string,
  quizDate: Date,
  forceRefreshForUserId?: string
) {
  let canRebuildQuestions = true;

  if (forceRefreshForUserId) {
    const currentAttempt = await prisma.dailyQuizAttempt.findUnique({
      where: {
        userId_gameId_quizDate: {
          userId: forceRefreshForUserId,
          gameId,
          quizDate,
        },
      },
      select: { id: true },
    });

    const otherCompletedAttempts = await prisma.dailyQuizAttempt.count({
      where: {
        gameId,
        quizDate,
        userId: { not: forceRefreshForUserId },
        completedAt: { not: null },
      },
    });

    canRebuildQuestions = otherCompletedAttempts === 0;

    if (currentAttempt) {
      await prisma.dailyQuizAnswer.deleteMany({
        where: { attemptId: currentAttempt.id },
      });
    }

    if (canRebuildQuestions) {
      await prisma.dailyQuizQuestion.deleteMany({
        where: { gameId, quizDate },
      });
    }
  }

  const existing = await prisma.dailyQuizQuestion.findMany({
    where: { gameId, quizDate },
    orderBy: { createdAt: "asc" },
  });

  if (existing.length >= DAILY_QUIZ_QUESTION_COUNT) {
    return existing.slice(0, DAILY_QUIZ_QUESTION_COUNT);
  }

  if (existing.length > 0) {
    const completedAttempts = await prisma.dailyQuizAttempt.count({
      where: {
        gameId,
        quizDate,
        completedAt: { not: null },
      },
    });

    if (completedAttempts > 0) return existing;
  }

  const matches = await prisma.match.findMany({
    where: {
      status: MatchStatus.FINISHED,
      homeScore: { not: null },
      awayScore: { not: null },
      gameMatches: {
        some: { gameId },
      },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      tournament: true,
      round: true,
    },
    orderBy: {
      startTime: "desc",
    },
    take: 30,
  });

  if (matches.length < 2) return [];

  const allTeamNames = Array.from(
    new Set(matches.flatMap((match) => [match.homeTeam.name, match.awayTeam.name]))
  );
  const allScores = Array.from(
    new Set(
      matches.map(
        (match) =>
          `${match.homeTeam.shortName || match.homeTeam.name} ${match.homeScore}:${match.awayScore} ${match.awayTeam.shortName || match.awayTeam.name}`
      )
    )
  );
  const allTournamentNames = Array.from(
    new Set(matches.map((match) => match.tournament?.name).filter(Boolean) as string[])
  );

  const questions = matches.flatMap((match) => {
    const homeName = match.homeTeam.name;
    const awayName = match.awayTeam.name;
    const homeShort = match.homeTeam.shortName || homeName;
    const awayShort = match.awayTeam.shortName || awayName;
    const score = `${homeShort} ${match.homeScore}:${match.awayScore} ${awayShort}`;
    const winner =
      (match.homeScore ?? 0) > (match.awayScore ?? 0)
        ? homeName
        : (match.homeScore ?? 0) < (match.awayScore ?? 0)
        ? awayName
        : "Нічия";

    const candidates: Prisma.DailyQuizQuestionCreateManyInput[] = [
      {
        gameId,
        quizDate,
        type: DailyQuizQuestionType.MATCH_SCORE,
        prompt: `Який рахунок був у матчі ${homeName} — ${awayName}?`,
        options: uniqueOptions(score, allScores, `${match.id}:score`),
        correctAnswer: score,
        explanation: `${match.tournament?.name || "Матч"} · ${match.homeScore}:${match.awayScore}`,
        sourceMatchId: match.id,
        sourceTeamId: match.homeTeamId,
        rewardCoins: 20,
      },
      {
        gameId,
        quizDate,
        type: DailyQuizQuestionType.MATCH_RESULT,
        prompt: `Хто переміг у матчі ${homeName} — ${awayName}?`,
        options: uniqueOptions(
          winner,
          [homeName, awayName, "Нічия", ...allTeamNames],
          `${match.id}:winner`
        ),
        correctAnswer: winner,
        explanation: `Фінальний рахунок: ${match.homeScore}:${match.awayScore}.`,
        sourceMatchId: match.id,
        rewardCoins: 20,
      },
      {
        gameId,
        quizDate,
        type: DailyQuizQuestionType.TEAM_OPPONENT,
        prompt: `Хто був суперником ${homeName} у матчі з останньої добірки?`,
        options: uniqueOptions(awayName, allTeamNames, `${match.id}:home-opponent`),
        correctAnswer: awayName,
        explanation: `${homeName} грали проти ${awayName}.`,
        sourceMatchId: match.id,
        sourceTeamId: match.homeTeamId,
        rewardCoins: 20,
      },
      {
        gameId,
        quizDate,
        type: DailyQuizQuestionType.TEAM_OPPONENT,
        prompt: `Хто був суперником ${awayName} у матчі з останньої добірки?`,
        options: uniqueOptions(homeName, allTeamNames, `${match.id}:away-opponent`),
        correctAnswer: homeName,
        explanation: `${awayName} грали проти ${homeName}.`,
        sourceMatchId: match.id,
        sourceTeamId: match.awayTeamId,
        rewardCoins: 20,
      },
    ];

    if (match.tournament && allTournamentNames.length >= 2) {
      candidates.push({
        gameId,
        quizDate,
        type: DailyQuizQuestionType.TEAM_TOURNAMENT,
        prompt: `В якому турнірі був матч ${homeName} — ${awayName}?`,
        options: uniqueOptions(
          match.tournament.name,
          allTournamentNames,
          `${match.id}:tournament`
        ),
        correctAnswer: match.tournament.name,
        explanation: `Це був матч турніру ${match.tournament.name}.`,
        sourceMatchId: match.id,
        rewardCoins: 20,
      });
    }

    return candidates;
  });

  const existingPrompts = new Set(existing.map((question) => question.prompt));
  const selectedQuestions = shuffleWithSeed(
    questions.filter((question) => !existingPrompts.has(question.prompt)),
    `${gameId}:${quizDate.toISOString()}:questions`
  ).slice(0, DAILY_QUIZ_QUESTION_COUNT - existing.length);

  if (selectedQuestions.length > 0) {
    await prisma.dailyQuizQuestion.createMany({
      data: selectedQuestions,
    });
  }

  return prisma.dailyQuizQuestion.findMany({
    where: { gameId, quizDate },
    orderBy: { createdAt: "asc" },
  });
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!currentUser) throw redirect("/login");
  if (!gameId) throw new Response("Game not found", { status: 404 });

  const membership = await prisma.gameMember.findFirst({
    where: { gameId, userId: currentUser.id, status: "ACTIVE" },
  });

  if (!membership) throw redirect("/");

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { id: true, name: true },
  });

  if (!game) throw new Response("Game not found", { status: 404 });

  const quizDate = getQuizDate();
  const refreshQuiz = new URL(request.url).searchParams.get("refreshQuiz") === "1";
  const questions = await ensureDailyQuiz(
    gameId,
    quizDate,
    refreshQuiz ? currentUser.id : undefined
  );

  const attempt = refreshQuiz
    ? null
    : await prisma.dailyQuizAttempt.findUnique({
        where: {
          userId_gameId_quizDate: {
            userId: currentUser.id,
            gameId,
            quizDate,
          },
        },
        include: {
          answers: true,
          boosts: true,
        },
      });

  const wallet = await prisma.userWallet.findUnique({
    where: { userId: currentUser.id },
  });

  const availableBoosts = await prisma.predictionBoost.count({
    where: {
      userId: currentUser.id,
      gameId,
      status: "AVAILABLE",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  return data({
    game,
    quizDate,
    questions,
    attempt,
    wallet,
    availableBoosts,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!currentUser) throw redirect("/login");
  if (!gameId) throw new Response("Game not found", { status: 404 });

  const membership = await prisma.gameMember.findFirst({
    where: { gameId, userId: currentUser.id, status: "ACTIVE" },
  });

  if (!membership) {
    return data({ error: "Ти не є учасником цієї гри." }, { status: 403 });
  }

  const quizDate = getQuizDate();
  const questions = await ensureDailyQuiz(gameId, quizDate);

  if (questions.length === 0) {
    return data({ error: "Для квізу ще немає достатньо завершених матчів." }, { status: 400 });
  }

  const existingAttempt = await prisma.dailyQuizAttempt.findUnique({
    where: {
      userId_gameId_quizDate: {
        userId: currentUser.id,
        gameId,
        quizDate,
      },
    },
  });

  if (existingAttempt?.completedAt && !ALLOW_QUIZ_RETAKES) {
    return data({ error: "Квіз уже закритий." }, { status: 400 });
  }

  const formData = await request.formData();
  const answers = questions.map((question) => {
    const selectedAnswer = String(formData.get(`question:${question.id}`) || "");

    return {
      question,
      selectedAnswer,
      isCorrect: selectedAnswer === question.correctAnswer,
    };
  });

  if (answers.some((answer) => !answer.selectedAnswer)) {
    return data({ error: "Дай відповідь на всі питання." }, { status: 400 });
  }

  const score = answers.filter((answer) => answer.isCorrect).length;
  const shouldAwardRewards = !existingAttempt?.completedAt;
  const coinsAwarded = shouldAwardRewards
    ? score * 20 + (score === questions.length ? 20 : 0)
    : existingAttempt?.coinsAwarded ?? 0;
  const boostAwardedValue = shouldAwardRewards
    ? score === questions.length
      ? 2
      : 0
    : existingAttempt?.boostAwardedValue ?? 0;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const attempt = await tx.dailyQuizAttempt.upsert({
      where: {
        userId_gameId_quizDate: {
          userId: currentUser.id,
          gameId,
          quizDate,
        },
      },
      create: {
        userId: currentUser.id,
        gameId,
        quizDate,
        score,
        totalQuestions: questions.length,
        coinsAwarded,
        boostAwardedValue,
        completedAt: new Date(),
      },
      update: {
        score,
        totalQuestions: questions.length,
        coinsAwarded,
        boostAwardedValue,
        completedAt: new Date(),
      },
    });

    await tx.dailyQuizAnswer.deleteMany({
      where: { attemptId: attempt.id },
    });

    await tx.dailyQuizAnswer.createMany({
      data: answers.map((answer) => ({
        attemptId: attempt.id,
        questionId: answer.question.id,
        selectedAnswer: answer.selectedAnswer,
        isCorrect: answer.isCorrect,
      })),
    });

    if (shouldAwardRewards && coinsAwarded > 0) {
      const wallet = await tx.userWallet.upsert({
        where: { userId: currentUser.id },
        create: {
          userId: currentUser.id,
          balance: coinsAwarded,
          lifetimeEarned: coinsAwarded,
        },
        update: {
          balance: { increment: coinsAwarded },
          lifetimeEarned: { increment: coinsAwarded },
        },
      });

      await tx.coinTransaction.create({
        data: {
          userId: currentUser.id,
          gameId,
          amount: coinsAwarded,
          balanceAfter: wallet.balance,
          type: CoinTransactionType.EARN,
          reason: CoinReason.DAILY_QUIZ,
          note: `Daily quiz ${score}/${questions.length}`,
        },
      });
    }

    if (shouldAwardRewards && boostAwardedValue > 0) {
      await tx.predictionBoost.create({
        data: {
          userId: currentUser.id,
          gameId,
          sourceAttemptId: attempt.id,
          value: boostAwardedValue,
          expiresAt,
        },
      });
    }
  });

  throw redirect(`/games/${gameId}/tasks`);
}

function parseOptions(options: unknown): QuizOption[] {
  if (!Array.isArray(options)) return [];
  return options.map((option) => String(option));
}

function QuizIcon({
  type,
  className = "h-5 w-5",
}: {
  type:
    | "ball"
    | "coin"
    | "boost"
    | "target"
    | "whistle"
    | "check"
    | "arrow"
    | "trophy"
    | "cards"
    | "star";
  className?: string;
}) {
  if (type === "coin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M8.5 12h7M12 8.5v7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "boost") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M13 2 5 14h6l-1 8 9-13h-6l1-7Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "target") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "whistle") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M5 14a5 5 0 1 0 9.6-2h3.9a2.5 2.5 0 0 0 0-5H14l-2.5-2.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7 14a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM16 7v5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (type === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "arrow") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "trophy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M8 6H5a3 3 0 0 0 3 5M16 6h3a3 3 0 0 1-3 5M12 12v4M9 20h6M10 16h4v4h-4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "cards") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="M7 5.5 15.5 3l3.2 11.3-8.5 2.4L7 5.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M5.5 8.2h9V21h-9zM8.5 12h3M8.5 16h2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (type === "star") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
        <path d="m12 3 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m8.5 6.8 3.5 2.6 3.5-2.6M8.5 17.2l1.4-4.2L6.4 10M15.5 17.2 14.1 13l3.5-3M9.9 13h4.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function DailyQuizPage() {
  const { game, questions, attempt } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const completed = Boolean(attempt?.completedAt);
  const [started, setStarted] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [retaking, setRetaking] = useState(false);
  const currentQuestion = questions[currentIndex] ?? null;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : "";
  const answeredCount = useMemo(
    () => questions.filter((question) => answers[question.id]).length,
    [answers, questions]
  );
  const progress = questions.length
    ? Math.round(((currentIndex + (currentAnswer ? 1 : 0)) / questions.length) * 100)
    : 0;
  const answerByQuestionId = new Map(
    (attempt?.answers ?? []).map((answer) => [answer.questionId, answer])
  );

  return (
    <>
      {isSubmitting ? <FootballLoader /> : null}

      <div className="mx-auto max-w-4xl space-y-4">
        {questions.length === 0 ? (
          <section className="rounded-[28px] border border-[var(--border)] bg-[var(--panel)] p-5">
            <div className="text-lg font-black text-[var(--text)]">
              Поки немає бази для квізу
            </div>
            <div className="mt-2 text-sm text-[var(--text-soft)]">
              Потрібно хоча б кілька завершених матчів у цій грі.
            </div>
          </section>
        ) : completed && !retaking ? (
          <section className="quiz-result-stage rounded-[34px] p-5 sm:p-6">
            <div className="quiz-score-orbit" />
            <div className="relative z-10">
              <div className="inline-flex rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/50">
                Фініш
              </div>
              <h2 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
                {attempt?.score}/{attempt?.totalQuestions}
              </h2>
              <div className="mt-2 text-sm font-semibold text-white/55">
                +{attempt?.coinsAwarded ?? 0} монет
                {(attempt?.boostAwardedValue ?? 0) > 0
                  ? ` · x${attempt?.boostAwardedValue} бустер`
                  : ""}
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {questions.map((question) => {
                const answer = answerByQuestionId.get(question.id);

                return (
                  <div
                    key={question.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"
                  >
                    <div className="text-sm font-black text-white">
                      {question.prompt}
                    </div>
                    <div className="mt-2 text-sm text-white/50">
                      Твоя відповідь:{" "}
                      <span className={answer?.isCorrect ? "text-emerald-300" : "text-red-300"}>
                        {answer?.selectedAnswer}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-white/50">
                      Правильно: {question.correctAnswer}
                    </div>
                    {question.explanation ? (
                      <div className="mt-2 text-xs text-white/35">
                        {question.explanation}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="relative z-10 mt-5 grid gap-3 sm:grid-cols-[auto_auto]">
              <button
                type="button"
                onClick={() => {
                  setAnswers({});
                  setCurrentIndex(0);
                  setStarted(true);
                  setRetaking(true);
                }}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-black text-black"
              >
                Пройти ще раз
              </button>
              <Link
                to={`/games/${game.id}/tasks`}
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.08] px-5 text-sm font-black text-white"
              >
                Назад до завдань
              </Link>
            </div>
          </section>
        ) : !started ? (
          <section className="quiz-start-stage overflow-hidden rounded-[34px] p-5 sm:p-6">
            <div className="quiz-stadium-lights" />
            <div className="quiz-pitch">
              <div className="quiz-pitch-line quiz-pitch-line-top" />
              <div className="quiz-pitch-line quiz-pitch-line-bottom" />
              <div className="quiz-pitch-circle" />
              <div className="quiz-pitch-dot quiz-pitch-dot-left" />
              <div className="quiz-pitch-dot quiz-pitch-dot-right" />
            </div>

            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label="Пояснення квізу"
              className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-lg font-black text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              ?
            </button>

            <div className="relative z-10 grid gap-5 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
              <div>
                <div className="quiz-start-icon">
                  <QuizIcon type="whistle" className="h-9 w-9" />
                </div>
                <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100/70">
                  <QuizIcon type="star" className="h-4 w-4" />
                  <span>Match quiz</span>
                </div>
                <h2 className="mt-5 text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                  Готовий до футбольного виклику?
                </h2>
                <p className="mt-3 max-w-lg text-sm font-semibold leading-6 text-white/56">
                  Виходь на поле і доведи, що памʼятаєш матчі краще за всіх.
                </p>

                <button
                  type="button"
                  onClick={() => setStarted(true)}
                  className="mt-6 inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-white px-6 text-sm font-black text-black shadow-[0_18px_36px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5"
                >
                  Почати
                  <QuizIcon type="arrow" className="h-5 w-5" />
                </button>
              </div>

              <div className="quiz-start-emblem" aria-hidden="true">
                <div className="quiz-card-stack">
                  <div className="quiz-mini-card quiz-mini-card-back">
                    <QuizIcon type="cards" className="h-7 w-7" />
                    <span>Q</span>
                  </div>
                  <div className="quiz-mini-card quiz-mini-card-front">
                    <QuizIcon type="trophy" className="h-8 w-8" />
                    <span>5</span>
                  </div>
                </div>
                <div className="quiz-scene-ball">
                  <QuizIcon type="ball" className="h-12 w-12" />
                </div>
                <div className="quiz-scene-badge quiz-scene-badge-left">
                  <QuizIcon type="target" className="h-5 w-5" />
                </div>
                <div className="quiz-scene-badge quiz-scene-badge-right">
                  <QuizIcon type="boost" className="h-5 w-5" />
                </div>
              </div>
            </div>
          </section>
        ) : (
          <Form method="post" className="space-y-4">
            {actionData?.error ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {actionData.error}
              </div>
            ) : null}

            {questions.map((question) => (
              <input
                key={question.id}
                type="hidden"
                name={`question:${question.id}`}
                value={answers[question.id] ?? ""}
              />
            ))}

            {currentQuestion ? (
              <section className="quiz-play-stage overflow-hidden rounded-[34px] p-4 sm:p-6">
                <div className="quiz-play-graphic" />
                <div className="relative z-10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-white/55">
                      <QuizIcon type="ball" className="h-4 w-4" />
                      <span>Питання {currentIndex + 1}/{questions.length}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[11px] font-black text-white/55">
                      <QuizIcon type="check" className="h-4 w-4" />
                      <span>{answeredCount}/{questions.length}</span>
                    </div>
                  </div>

                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-300 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="mt-6 min-h-[150px] rounded-[28px] border border-white/10 bg-black/20 p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200/70">
                      <QuizIcon type="target" className="h-4 w-4" />
                      <span>Точність</span>
                    </div>
                    <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl">
                      {currentQuestion.prompt}
                    </h2>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {parseOptions(currentQuestion.options).map((option, optionIndex) => {
                      const selected = currentAnswer === option;

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() =>
                            setAnswers((current) => ({
                              ...current,
                              [currentQuestion.id]: option,
                            }))
                          }
                          className={`quiz-choice-card min-h-[76px] rounded-[24px] border px-4 py-4 text-left transition ${
                            selected
                              ? "border-emerald-300/50 bg-emerald-400/15 text-white"
                              : "border-white/10 bg-white/[0.055] text-white/72 hover:bg-white/[0.085] hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-sm font-black ${
                                selected
                                  ? "border-emerald-300/40 bg-emerald-300 text-black"
                                  : "border-white/10 bg-black/20 text-white/55"
                              }`}
                            >
                              {selected ? (
                                <QuizIcon type="check" className="h-5 w-5" />
                              ) : (
                                String.fromCharCode(65 + optionIndex)
                              )}
                            </div>
                            <div className="text-sm font-black leading-5">
                              {option}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                disabled={currentIndex === 0 || isSubmitting}
                className="inline-flex h-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-5 text-sm font-black text-[var(--text-soft)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                Попереднє
              </button>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  disabled={!currentAnswer || isSubmitting}
                  onClick={() =>
                    setCurrentIndex((index) =>
                      Math.min(questions.length - 1, index + 1)
                    )
                  }
                  className="inline-flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-black shadow-[0_14px_30px_rgba(0,0,0,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Далі
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || answeredCount < questions.length}
                  className="inline-flex h-14 items-center justify-center rounded-2xl bg-white px-6 text-sm font-black text-black shadow-[0_14px_30px_rgba(0,0,0,0.22)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? "Перевіряю..." : "Забрати нагороду"}
                </button>
              )}
            </div>
          </Form>
        )}
      </div>

      {helpOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#07111f] p-5 text-white shadow-[0_24px_70px_rgba(0,0,0,0.42)]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-300 text-black">
                  <QuizIcon type="whistle" className="h-6 w-6" />
                </div>
                <div className="text-lg font-black">Як грати</div>
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(false)}
                aria-label="Закрити"
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-black text-white/70 hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm font-semibold leading-6 text-white/60">
              <p>Квіз має {questions.length} питань. Обирай відповідь і рухайся далі.</p>
              <p>За кожну правильну відповідь нараховуються монети. Ідеальний результат дає додатковий x2 бустер.</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
