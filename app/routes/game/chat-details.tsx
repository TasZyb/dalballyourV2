import {
  data,
  redirect,
  useFetcher,
  useLoaderData,
  useRevalidator,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { io } from "socket.io-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

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
  text: string;
  isDeleted: boolean;
  isEdited: boolean;
  createdAt: string;
  userId: string;
  optimistic?: boolean;
  user: {
    id: string;
    name: string | null;
    displayName: string | null;
    image: string | null;
  };
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

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;
  const chatId = params.chatId;

  if (!currentUser) throw redirect("/login");
  if (!gameId || !chatId) throw new Response("Chat not found", { status: 404 });

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      members: {
        where: {
          userId: currentUser.id,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        select: { id: true },
      },
    },
  });

  if (!game) throw new Response("Game not found", { status: 404 });

  const isOwner = game.ownerId === currentUser.id;
  const isMember = game.members.length > 0;

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
      messages: chat.messages.map((message) => ({
        id: message.id,
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

  return data({
    ok: true,
    message: {
      id: message.id,
      text: message.text,
      isDeleted: message.isDeleted,
      isEdited: message.isEdited,
      createdAt: message.createdAt.toISOString(),
      userId: message.userId,
      user: message.user,
    },
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

export default function ChatDetailsPage() {
  const { currentUser, chat } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const [messages, setMessages] = useState<MessageItem[]>(chat.messages);
  const [text, setText] = useState("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    setMessages((current) => {
      const withoutOptimistic = current.filter((item) => !item.optimistic);
      const incomingIds = new Set(chat.messages.map((item) => item.id));

      const merged = [
        ...withoutOptimistic.filter((item) => !incomingIds.has(item.id)),
        ...chat.messages,
      ];

      return merged.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    });
  }, [chat.id, chat.messages]);

  useEffect(() => {
    if (chat.isClosed) return;

    const socket = io();

    socket.emit("chat:join", {
      chatId: chat.id,
    });

    socket.on("chat:new-message", (message: MessageItem) => {
      setMessages((current) => {
        if (current.some((item) => item.id === message.id)) {
          return current;
        }

        return [...current.filter((item) => !item.optimistic), message];
      });
    });

    return () => {
      socket.emit("chat:leave", {
        chatId: chat.id,
      });

      socket.disconnect();
    };
  }, [chat.id, chat.isClosed]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages.length, chat.id]);

  useEffect(() => {
    if (fetcher.data?.ok) {
      setText("");
      formRef.current?.reset();
      revalidator.revalidate();
    }
  }, [fetcher.data, revalidator]);

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
      id: `optimistic-${Date.now()}`,
      text: value,
      isDeleted: false,
      isEdited: false,
      createdAt: new Date().toISOString(),
      userId: currentUser.id,
      optimistic: true,
      user: {
        id: currentUser.id,
        name: currentUser.name,
        displayName: currentUser.name,
        image: currentUser.image,
      },
    };

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
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
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
            ref={formRef}
            method="post"
            className="flex items-end gap-2"
            onSubmit={handleSubmit}
          >
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

        {fetcher.data && !fetcher.data.ok ? (
          <div className="mt-2 text-xs font-bold" style={{ color: "#ef4444" }}>
            {fetcher.data.error}
          </div>
        ) : null}
      </footer>
    </div>
  );
}