import {
  Link,
  data,
  redirect,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { io } from "socket.io-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { getIO } from "~/lib/socket.server";

const MATCH_STATUS = {
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  FINISHED: "FINISHED",
  CANCELED: "CANCELED",
  POSTPONED: "POSTPONED",
} as const;

const MEMBERSHIP_STATUS = {
  ACTIVE: "ACTIVE",
} as const;

type MatchStatusValue = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

type MessageItem = {
  id: string;
  chatId: string;
  text: string;
  isDeleted: boolean;
  isEdited: boolean;
  createdAt: string;
  userId: string;
  optimistic?: boolean;
  clientMessageId?: string | null;
  user: {
    id: string;
    name: string | null;
    displayName: string | null;
    image: string | null;
  };
};

type WarRoomParticipant = {
  userId: string;
  name: string;
  image: string | null;
  isMe: boolean;
  hasPrediction: boolean;
  prediction: {
    predictedHome: number;
    predictedAway: number;
    pointsAwarded: number;
    weightedPointsAwarded: number;
    wasExact: boolean;
    wasOutcomeOnly: boolean;
    wasWrong: boolean;
    submittedAt: string;
  } | null;
};

type WarRoomData = {
  matchId: string;
  deadline: string | null;
  canReveal: boolean;
  isFinished: boolean;
  totalParticipants: number;
  predictionCount: number;
  missingCount: number;
  participants: WarRoomParticipant[];
  leaders: WarRoomParticipant[];
};

function getUserName(user: MessageItem["user"]) {
  return user.displayName || user.name || "Гравець";
}

function formatTime(date: string | Date) {
  return new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function getPredictionDeadline(startTime: Date, lockMinutesBeforeStart: number) {
  return new Date(startTime.getTime() - lockMinutesBeforeStart * 60 * 1000);
}

function getTeamName(team?: { shortName?: string | null; name: string } | null) {
  return team?.shortName || team?.name || "Team";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function sortMessages(messages: MessageItem[]) {
  return [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function mergeIncomingMessage(
  current: MessageItem[],
  incoming: MessageItem,
  activeChatId: string
) {
  if (incoming.chatId !== activeChatId) {
    return current;
  }

  const existingIndex = current.findIndex((item) => item.id === incoming.id);

  if (existingIndex >= 0) {
    const next = [...current];
    next[existingIndex] = incoming;
    return sortMessages(next);
  }

  const optimisticIndex =
    incoming.clientMessageId == null
      ? -1
      : current.findIndex(
          (item) =>
            item.chatId === activeChatId &&
            item.optimistic && item.clientMessageId === incoming.clientMessageId
        );

  if (optimisticIndex >= 0) {
    const next = [...current];
    next[optimisticIndex] = incoming;
    return sortMessages(next);
  }

  return sortMessages([...current, incoming]);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;
  const chatId = params.chatId;

  if (!currentUser) throw redirect("/login");
  if (!gameId || !chatId) throw new Response("Chat not found", { status: 404 });

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      ownerId: true,
      lockMinutesBeforeStart: true,
      members: {
        where: {
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              image: true,
            },
          },
        },
      },
    },
  });

  if (!game) throw new Response("Game not found", { status: 404 });

  const isOwner = game.ownerId === currentUser.id;
  const isMember = game.members.some(
    (member) => member.userId === currentUser.id
  );

  if (!isOwner && !isMember) {
    throw new Response("Forbidden", { status: 403 });
  }

  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      gameId,
      isActive: true,
    },
    include: {
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
          tournament: true,
          round: true,
          gameMatches: {
            where: { gameId },
            select: {
              isLocked: true,
              predictionClosesAt: true,
            },
            take: 1,
          },
          predictions: {
            where: { gameId },
            select: {
              userId: true,
              predictedHome: true,
              predictedAway: true,
              pointsAwarded: true,
              weightedPointsAwarded: true,
              wasExact: true,
              wasOutcomeOnly: true,
              wasWrong: true,
              submittedAt: true,
            },
          },
        },
      },
      messages: {
        take: 100,
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              image: true,
            },
          },
        },
      },
    },
  });

  if (!chat) throw new Response("Chat not found", { status: 404 });

  const isClosed = chat.match?.status === MATCH_STATUS.FINISHED;
  const gameMatch = chat.match?.gameMatches[0] ?? null;
  const predictionDeadline =
    chat.match && gameMatch
      ? gameMatch.predictionClosesAt ??
        getPredictionDeadline(chat.match.startTime, game.lockMinutesBeforeStart)
      : null;
  const canReveal =
    Boolean(chat.match) &&
    (chat.match?.status !== MATCH_STATUS.SCHEDULED ||
      Boolean(gameMatch?.isLocked) ||
      (predictionDeadline ? new Date() >= predictionDeadline : false));
  const predictionByUserId = new Map(
    (chat.match?.predictions ?? []).map((prediction) => [
      prediction.userId,
      prediction,
    ])
  );
  const participants: WarRoomParticipant[] = chat.match
    ? game.members
        .map((member) => {
          const prediction = predictionByUserId.get(member.userId) ?? null;
          const name = member.user.displayName || member.user.name || "Гравець";
          const isMeParticipant = member.userId === currentUser.id;
          const canShowPrediction = canReveal || isMeParticipant;

          return {
            userId: member.userId,
            name,
            image: member.user.image,
            isMe: isMeParticipant,
            hasPrediction: Boolean(prediction),
            prediction:
              prediction && canShowPrediction
                ? {
                    predictedHome: prediction.predictedHome,
                    predictedAway: prediction.predictedAway,
                    pointsAwarded: prediction.pointsAwarded,
                    weightedPointsAwarded: prediction.weightedPointsAwarded,
                    wasExact: prediction.wasExact,
                    wasOutcomeOnly: prediction.wasOutcomeOnly,
                    wasWrong: prediction.wasWrong,
                    submittedAt: prediction.submittedAt.toISOString(),
                  }
                : null,
          };
        })
        .sort((a, b) => {
          if (a.isMe) return -1;
          if (b.isMe) return 1;
          if (a.hasPrediction && !b.hasPrediction) return -1;
          if (!a.hasPrediction && b.hasPrediction) return 1;
          return a.name.localeCompare(b.name, "uk");
        })
    : [];
  const predictionCount = participants.filter(
    (item) => item.hasPrediction
  ).length;
  const leaders = participants
    .filter((item) => item.prediction)
    .sort(
      (a, b) =>
        (b.prediction?.weightedPointsAwarded ?? 0) -
        (a.prediction?.weightedPointsAwarded ?? 0)
    )
    .slice(0, 3);

  return data({
    currentUser: {
      id: currentUser.id,
      name: currentUser.displayName || currentUser.name || "Я",
      image: currentUser.image ?? null,
    },
    chat: {
      id: chat.id,
      gameId: chat.gameId,
      matchId: chat.matchId,
      type: chat.type,
      title:
        chat.type === "GENERAL"
          ? chat.title || "Загальний чат"
          : `${getTeamName(chat.match?.homeTeam)} — ${getTeamName(
              chat.match?.awayTeam
            )}`,
      description:
        chat.type === "GENERAL"
          ? chat.description || "Переписка для всієї гри"
          : `${chat.match?.tournament?.name ?? "Матч"}${
              chat.match?.round?.name ? ` • ${chat.match.round.name}` : ""
            }`,
      isClosed,
      match: chat.match
        ? {
            id: chat.match.id,
            status: chat.match.status as MatchStatusValue,
            homeScore: chat.match.homeScore,
            awayScore: chat.match.awayScore,
            homeTeam: {
              name: chat.match.homeTeam.name,
              shortName: chat.match.homeTeam.shortName,
              logo: chat.match.homeTeam.logo,
            },
            awayTeam: {
              name: chat.match.awayTeam.name,
              shortName: chat.match.awayTeam.shortName,
              logo: chat.match.awayTeam.logo,
            },
          }
        : null,
      warRoom: chat.match
        ? ({
            matchId: chat.match.id,
            deadline: predictionDeadline?.toISOString() ?? null,
            canReveal,
            isFinished: chat.match.status === MATCH_STATUS.FINISHED,
            totalParticipants: participants.length,
            predictionCount,
            missingCount: Math.max(participants.length - predictionCount, 0),
            participants,
            leaders,
          } satisfies WarRoomData)
        : null,
      messages: chat.messages.map((message) => ({
        id: message.id,
        chatId: message.chatId,
        text: message.text,
        isDeleted: message.isDeleted,
        isEdited: message.isEdited,
        createdAt: message.createdAt.toISOString(),
        userId: message.userId,
        user: message.user,
      })),
    },
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;
  const chatId = params.chatId;

  if (!currentUser) throw redirect("/login");

  if (!gameId || !chatId) {
    return data({ ok: false, error: "Chat not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const text = String(formData.get("text") || "").trim();
  const clientMessageId = String(formData.get("clientMessageId") || "")
    .trim()
    .slice(0, 80);

  if (!text) {
    return data({ ok: false, error: "Порожнє повідомлення" }, { status: 400 });
  }

  if (text.length > 1000) {
    return data(
      { ok: false, error: "Повідомлення занадто довге" },
      { status: 400 }
    );
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { ownerId: true },
  });

  if (!game) {
    return data({ ok: false, error: "Game not found" }, { status: 404 });
  }

  const membership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
    select: { id: true },
  });

  if (!membership && game.ownerId !== currentUser.id) {
    return data({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      gameId,
      isActive: true,
    },
    include: {
      match: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!chat) {
    return data({ ok: false, error: "Chat not found" }, { status: 404 });
  }

  if (chat.match?.status === MATCH_STATUS.FINISHED) {
    return data(
      { ok: false, error: "Матч завершений, чат закритий" },
      { status: 403 }
    );
  }

  const message = await prisma.chatMessage.create({
    data: {
      chatId,
      gameId,
      matchId: chat.matchId,
      userId: currentUser.id,
      text,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          displayName: true,
          image: true,
        },
      },
    },
  });

  await prisma.chat.update({
    where: { id: chatId },
    data: {
      lastMessageText: text,
      lastMessageAt: message.createdAt,
    },
  });

  const payload: MessageItem = {
    id: message.id,
    chatId: message.chatId,
    text: message.text,
    isDeleted: message.isDeleted,
    isEdited: message.isEdited,
    createdAt: message.createdAt.toISOString(),
    userId: message.userId,
    clientMessageId: clientMessageId || null,
    user: message.user,
  };

  getIO()?.to(`chat:${chatId}`).emit("chat:new-message", payload);

  return data({
    ok: true,
    message: payload,
  });
}

function Avatar({
  name,
  image,
  isMe,
}: {
  name: string;
  image?: string | null;
  isMe?: boolean;
}) {
  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black"
      style={{
        background: isMe ? "var(--accent-soft)" : "var(--panel)",
        color: isMe ? "var(--accent)" : "var(--text-soft)",
      }}
    >
      {getInitials(name)}
    </div>
  );
}

function MessageBubble({
  message,
  isMe,
}: {
  message: MessageItem;
  isMe: boolean;
}) {
  const name = getUserName(message.user);

  return (
    <div className={`flex gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
      {!isMe ? <Avatar name={name} image={message.user.image} /> : null}

      <div className="max-w-[82%] sm:max-w-[66%]">
        {!isMe ? (
          <div className="mb-1 px-1 text-[11px] font-bold" style={{ color: "var(--muted)" }}>
            {name}
          </div>
        ) : null}

        <div
          className="whitespace-pre-wrap break-words px-4 py-2.5 text-sm leading-relaxed shadow-sm"
          style={{
            background: isMe
              ? "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 72%, #000))"
              : "var(--panel)",
            color: isMe ? "var(--accent-contrast)" : "var(--text)",
            borderRadius: isMe ? "20px 20px 6px 20px" : "20px 20px 20px 6px",
            opacity: message.optimistic ? 0.65 : 1,
          }}
        >
          {message.isDeleted ? (
            <span style={{ color: "var(--muted)" }}>Повідомлення видалено</span>
          ) : (
            message.text
          )}
        </div>

        <div
          className={`mt-1 px-1 text-[10px] ${
            isMe ? "text-right" : "text-left"
          }`}
          style={{ color: "var(--muted)" }}
        >
          {message.optimistic ? "надсилається..." : formatTime(message.createdAt)}
        </div>
      </div>

      {isMe ? <Avatar name={name} image={message.user.image} isMe /> : null}
    </div>
  );
}

function getPredictionTone(participant: WarRoomParticipant) {
  if (!participant.prediction) return "var(--text-soft)";
  if (participant.prediction.wasExact) return "var(--success)";
  if (participant.prediction.wasOutcomeOnly) return "var(--accent)";
  if (participant.prediction.wasWrong) return "#ef4444";
  return "var(--text)";
}

function getPredictionLabel(
  participant: WarRoomParticipant,
  canReveal: boolean
) {
  if (!participant.hasPrediction) return "ще думає";
  if (!participant.prediction && !canReveal) return "прогноз є";
  if (!participant.prediction) return "приховано";

  return `${participant.prediction.predictedHome}:${participant.prediction.predictedAway}`;
}

function WarRoomPanel({
  gameId,
  warRoom,
}: {
  gameId: string;
  warRoom: WarRoomData;
}) {
  const progress =
    warRoom.totalParticipants > 0
      ? Math.round((warRoom.predictionCount / warRoom.totalParticipants) * 100)
      : 0;
  const myPrediction = warRoom.participants.find((item) => item.isMe);
  const revealTitle = warRoom.isFinished
    ? "Матч завершено"
    : warRoom.canReveal
    ? "Прогнози відкриті"
    : "Прогнози під замком";
  const revealDescription = warRoom.isFinished
    ? "Підсумки цього матчу вже можна розбирати по кісточках."
    : warRoom.canReveal
    ? "Дедлайн минув, тепер видно ставки друзів."
    : warRoom.deadline
    ? `Чужі рахунки відкриються після ${formatDateTime(warRoom.deadline)}.`
    : "Чужі рахунки відкриються після закриття прогнозів.";

  return (
    <section
      className="mb-4 overflow-hidden rounded-[24px] border"
      style={{
        borderColor: "var(--border)",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), transparent 42%), var(--panel)",
      }}
    >
      <div
        className="border-b px-4 py-3 sm:px-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div
              className="text-[10px] font-black uppercase tracking-[0.18em]"
              style={{ color: "var(--muted)" }}
            >
              Match War Room
            </div>
            <h2
              className="mt-1 text-base font-black sm:text-lg"
              style={{ color: "var(--text)" }}
            >
              {revealTitle}
            </h2>
            <p
              className="mt-1 text-xs sm:text-sm"
              style={{ color: "var(--text-soft)" }}
            >
              {revealDescription}
            </p>
          </div>

          <Link
            to={`/games/${gameId}/predict?matchId=${warRoom.matchId}`}
            prefetch="intent"
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-full px-4 text-xs font-black uppercase tracking-[0.12em] transition hover:scale-[1.01] active:scale-[0.98]"
            style={{
              background: "var(--accent)",
              color: "var(--accent-contrast)",
            }}
          >
            Прогноз
          </Link>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold">
            <span style={{ color: "var(--text-soft)" }}>
              {warRoom.predictionCount}/{warRoom.totalParticipants} зробили
              прогноз
            </span>
            <span className="tabular-nums" style={{ color: "var(--text)" }}>
              {progress}%
            </span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full"
            style={{ background: "var(--panel-strong)" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, var(--accent), var(--success))",
              }}
            />
          </div>
        </div>
      </div>

      {warRoom.isFinished && warRoom.leaders.length > 0 ? (
        <div
          className="border-b px-4 py-3 sm:px-5"
          style={{ borderColor: "var(--border)" }}
        >
          <div
            className="mb-2 text-[10px] font-black uppercase tracking-[0.16em]"
            style={{ color: "var(--muted)" }}
          >
            Топ цього матчу
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {warRoom.leaders.map((participant, index) => (
              <div
                key={participant.userId}
                className="flex items-center gap-2 rounded-2xl px-3 py-2"
                style={{ background: "var(--panel-strong)" }}
              >
                <div
                  className="text-sm font-black tabular-nums"
                  style={{ color: "var(--accent)" }}
                >
                  #{index + 1}
                </div>
                <Avatar
                  name={participant.name}
                  image={participant.image}
                  isMe={participant.isMe}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate text-xs font-black"
                    style={{ color: "var(--text)" }}
                  >
                    {participant.name}
                  </div>
                  <div
                    className="text-[11px] font-bold"
                    style={{ color: "var(--text-soft)" }}
                  >
                    {participant.prediction?.weightedPointsAwarded ?? 0} pts
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
        {warRoom.participants.map((participant) => (
          <div
            key={participant.userId}
            className="flex min-w-0 items-center gap-3 rounded-2xl px-3 py-2.5"
            style={{
              background: participant.isMe
                ? "var(--accent-soft)"
                : "var(--panel-strong)",
            }}
          >
            <Avatar
              name={participant.name}
              image={participant.image}
              isMe={participant.isMe}
            />

            <div className="min-w-0 flex-1">
              <div
                className="truncate text-sm font-black"
                style={{ color: "var(--text)" }}
              >
                {participant.isMe ? "Ти" : participant.name}
              </div>
              <div
                className="text-[11px] font-bold"
                style={{ color: "var(--text-soft)" }}
              >
                {participant.hasPrediction ? "готовий" : "без прогнозу"}
              </div>
            </div>

            <div
              className="shrink-0 rounded-full px-3 py-1 text-xs font-black tabular-nums"
              style={{
                background: participant.hasPrediction
                  ? "color-mix(in srgb, var(--success) 13%, transparent)"
                  : "color-mix(in srgb, #f59e0b 13%, transparent)",
                color: getPredictionTone(participant),
              }}
            >
              {getPredictionLabel(participant, warRoom.canReveal)}
            </div>
          </div>
        ))}
      </div>

      {!myPrediction?.hasPrediction && !warRoom.canReveal ? (
        <div
          className="border-t px-4 py-3 text-xs font-bold sm:px-5"
          style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}
        >
          Твій прогноз ще можна додати, поки кімната не відкрила всі ставки.
        </div>
      ) : null}
    </section>
  );
}

export default function ChatDetailsPage() {
  const { currentUser, chat } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  const [messages, setMessages] = useState<MessageItem[]>(chat.messages);
  const [text, setText] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const clientMessageIdRef = useRef<HTMLInputElement | null>(null);
  const loadedChatIdRef = useRef(chat.id);
  const lastClientMessageIdRef = useRef<string | null>(null);
  const lastSubmittedTextRef = useRef<string | null>(null);
  const processedActionMessageIdsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    setMessages((current) => {
      const sortedChatMessages = sortMessages(chat.messages);

      if (loadedChatIdRef.current !== chat.id) {
        loadedChatIdRef.current = chat.id;
        return sortedChatMessages;
      }

      const incomingIds = new Set(sortedChatMessages.map((item) => item.id));
      const currentChatMessages = current.filter(
        (item) => item.chatId === chat.id
      );
      const socketOnlyMessages = currentChatMessages.filter(
        (item) => !item.optimistic && !incomingIds.has(item.id)
      );
      const optimisticMessages = currentChatMessages.filter(
        (item) => item.optimistic && !incomingIds.has(item.id)
      );

      return sortMessages([
        ...socketOnlyMessages,
        ...sortedChatMessages,
        ...optimisticMessages,
      ]);
    });
  }, [chat.id, chat.messages]);

  useEffect(() => {
    setText("");
    lastClientMessageIdRef.current = null;
    lastSubmittedTextRef.current = null;
    processedActionMessageIdsRef.current.clear();
  }, [chat.id]);

  useEffect(() => {
    if (chat.isClosed) return;

    const socket = io(
      import.meta.env.DEV
        ? "http://localhost:10000"
        : window.location.origin
    );

    socketRef.current = socket;

    socket.emit("chat:join", {
      chatId: chat.id,
    });

    socket.on("chat:new-message", (message: MessageItem) => {
      setMessages((current) => mergeIncomingMessage(current, message, chat.id));
    });

    return () => {
      socket.emit("chat:leave", {
        chatId: chat.id,
      });

      socket.disconnect();
      socketRef.current = null;
    };
  }, [chat.id, chat.isClosed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages.length, chat.id]);

  useEffect(() => {
    if (fetcher.data && "message" in fetcher.data) {
      const message = fetcher.data.message;

      setMessages((current) => mergeIncomingMessage(current, message, chat.id));
      lastClientMessageIdRef.current = null;
      lastSubmittedTextRef.current = null;

      if (!processedActionMessageIdsRef.current.has(message.id)) {
        processedActionMessageIdsRef.current.add(message.id);
        socketRef.current?.emit("chat:message-created", {
          chatId: chat.id,
          message,
        });
      }
    } else if (fetcher.data && "error" in fetcher.data) {
      const failedClientMessageId = lastClientMessageIdRef.current;

      if (failedClientMessageId) {
        setMessages((current) =>
          current.filter(
            (item) =>
              !item.optimistic ||
              item.clientMessageId !== failedClientMessageId
          )
        );
      }

      if (lastSubmittedTextRef.current) {
        setText(
          (currentText) => currentText || lastSubmittedTextRef.current || ""
        );
        lastSubmittedTextRef.current = null;
      }
    }
  }, [chat.id, fetcher.data]);

  const statusText = useMemo(() => {
    if (!chat.match) return "Загальний чат";
    if (chat.match.status === MATCH_STATUS.LIVE) return "Матч наживо";
    if (chat.match.status === MATCH_STATUS.FINISHED) return "Матч завершено";
    if (chat.match.status === MATCH_STATUS.SCHEDULED) return "Перед матчем";
    return "Матч";
  }, [chat.match]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const value = text.trim();

    if (!value || isSubmitting || chat.isClosed) {
      event.preventDefault();
      return;
    }

    const optimisticMessage: MessageItem = {
      id: `optimistic-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
      chatId: chat.id,
      text: value,
      isDeleted: false,
      isEdited: false,
      createdAt: new Date().toISOString(),
      userId: currentUser.id,
      optimistic: true,
      clientMessageId: `client-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
      user: {
        id: currentUser.id,
        name: currentUser.name,
        displayName: currentUser.name,
        image: currentUser.image,
      },
    };

    if (clientMessageIdRef.current) {
      clientMessageIdRef.current.value = optimisticMessage.clientMessageId || "";
    }

    lastClientMessageIdRef.current = optimisticMessage.clientMessageId || null;
    lastSubmittedTextRef.current = value;

    setMessages((current) => [...current, optimisticMessage]);
    setText("");
  }

  return (
    <div
      className="flex h-[calc(100vh-220px)] min-h-[520px] flex-col overflow-hidden lg:h-[calc(100vh-190px)]"
      style={{
        background:
          "radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 32%), var(--panel-strong)",
      }}
    >
      <header className="shrink-0 px-3 pb-2 pt-1 sm:px-5 sm:pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[10px] font-black uppercase tracking-[0.18em]"
              style={{ color: "var(--muted)" }}
            >
              {statusText}
            </div>

            <h1
              className="mt-0.5 truncate text-lg font-black sm:text-xl"
              style={{ color: "var(--text)" }}
            >
              {chat.title}
            </h1>

            <p
              className="truncate text-xs sm:text-sm"
              style={{ color: "var(--text-soft)" }}
            >
              {chat.description}
            </p>
          </div>

          {chat.match ? (
            <div className="shrink-0 text-right">
              <div
                className="text-[9px] font-black uppercase tracking-[0.12em]"
                style={{ color: "var(--muted)" }}
              >
                Score
              </div>
              <div
                className="text-lg font-black tabular-nums"
                style={{ color: "var(--text)" }}
              >
                {chat.match.homeScore ?? "—"}:{chat.match.awayScore ?? "—"}
              </div>
            </div>
          ) : null}
        </div>

        {chat.isClosed ? (
          <div
            className="mt-2 rounded-2xl px-3 py-2 text-xs font-bold"
            style={{
              background: "color-mix(in srgb, #f59e0b 12%, transparent)",
              color: "#f59e0b",
            }}
          >
            Матч завершений — чат доступний тільки для перегляду.
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-5">
        {chat.warRoom ? (
          <WarRoomPanel gameId={chat.gameId} warRoom={chat.warRoom} />
        ) : null}

        {messages.length === 0 ? (
          <div className="flex min-h-[260px] items-center justify-center text-center">
            <div className="max-w-sm">
              <div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl text-2xl"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                💬
              </div>

              <h2
                className="mt-4 text-xl font-black"
                style={{ color: "var(--text)" }}
              >
                Тут ще тихо
              </h2>

              <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
                {chat.isClosed
                  ? "Повідомлень у цьому чаті не було."
                  : "Напиши перше повідомлення в цьому чаті."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pb-3">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isMe={message.userId === currentUser.id}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <footer className="shrink-0 px-3 pb-3 pt-2 sm:px-5 sm:pb-5">
        {chat.isClosed ? (
          <div
            className="rounded-2xl px-4 py-3 text-center text-sm font-bold"
            style={{
              background: "var(--panel)",
              color: "var(--text-soft)",
            }}
          >
            Чат закритий для нових повідомлень.
          </div>
        ) : (
          <fetcher.Form
            method="post"
            className="flex items-end gap-2"
            onSubmit={handleSubmit}
          >
            <input ref={clientMessageIdRef} type="hidden" name="clientMessageId" />

            <textarea
              name="text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={1}
              placeholder="Написати повідомлення..."
              disabled={isSubmitting}
              className="max-h-32 min-h-[48px] flex-1 resize-none rounded-[24px] px-4 py-3 text-[16px] outline-none transition sm:text-sm"
              style={{
                background: "var(--panel)",
                color: "var(--text)",
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();

                  if (text.trim() && !isSubmitting) {
                    event.currentTarget.form?.requestSubmit();
                  }
                }
              }}
            />

            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full text-sm font-black transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: "var(--accent)",
                color: "var(--accent-contrast)",
              }}
              aria-label="Надіслати"
            >
              ➤
            </button>
          </fetcher.Form>
        )}

        {fetcher.data && "error" in fetcher.data ? (
          <div className="mt-2 text-xs font-bold" style={{ color: "#ef4444" }}>
            {fetcher.data.error}
          </div>
        ) : null}
      </footer>
    </div>
  );
}
