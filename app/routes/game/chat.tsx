import {
  Link,
  Outlet,
  data,
  useLoaderData,
  useLocation,
  useNavigation,
  type LoaderFunctionArgs,
} from "react-router";
import { useEffect, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { FootballLoader } from "~/components/FootballLoader";

const CHAT_TYPE = {
  GENERAL: "GENERAL",
  MATCH: "MATCH",
} as const;

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

type ChatTypeValue = (typeof CHAT_TYPE)[keyof typeof CHAT_TYPE];
type MatchStatusValue = (typeof MATCH_STATUS)[keyof typeof MATCH_STATUS];

type ChatWithData = {
  id: string;
  gameId: string;
  matchId: string | null;
  type: ChatTypeValue;
  title: string | null;
  description: string | null;
  isActive: boolean;
  isPinned: boolean;
  lastMessageText: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  match: {
    id: string;
    startTime: Date;
    status: MatchStatusValue;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: {
      name: string;
      shortName: string | null;
      logo: string | null;
    };
    awayTeam: {
      name: string;
      shortName: string | null;
      logo: string | null;
    };
    tournament: {
      name: string;
      logo: string | null;
    };
    round: {
      name: string;
    } | null;
  } | null;
  messages: {
    id: string;
    text: string;
    isDeleted: boolean;
    createdAt: Date;
    user: {
      id: string;
      name: string | null;
      displayName: string | null;
    };
  }[];
  _count: {
    messages: number;
  };
};

function getTeamName(team?: { shortName?: string | null; name: string } | null) {
  return team?.shortName || team?.name || "Team";
}

function getChatTitle(chat: ChatWithData) {
  if (chat.type === CHAT_TYPE.GENERAL) return chat.title || "Загальний чат";

  return (
    chat.title ||
    `${getTeamName(chat.match?.homeTeam)} — ${getTeamName(chat.match?.awayTeam)}`
  );
}

function getChatSubtitle(chat: ChatWithData) {
  if (chat.type === CHAT_TYPE.GENERAL) {
    return chat.description || "Вся гра";
  }

  return `${chat.match?.tournament?.name || "Матч"}${
    chat.match?.round?.name ? ` • ${chat.match.round.name}` : ""
  }`;
}

function getStatusText(status?: MatchStatusValue) {
  if (status === MATCH_STATUS.LIVE) return "LIVE";
  if (status === MATCH_STATUS.FINISHED) return "FIN";
  if (status === MATCH_STATUS.SCHEDULED) return "PRE";
  if (status === MATCH_STATUS.POSTPONED) return "POST";
  if (status === MATCH_STATUS.CANCELED) return "OFF";
  return "CHAT";
}

function getStatusStyle(status?: MatchStatusValue) {
  if (status === MATCH_STATUS.LIVE) {
    return {
      background: "color-mix(in srgb, #ef4444 15%, transparent)",
      color: "#ef4444",
      border: "1px solid color-mix(in srgb, #ef4444 28%, transparent)",
    };
  }

  if (status === MATCH_STATUS.FINISHED) {
    return {
      background: "var(--panel)",
      color: "var(--text-soft)",
      border: "1px solid var(--border)",
    };
  }

  if (status === MATCH_STATUS.POSTPONED || status === MATCH_STATUS.CANCELED) {
    return {
      background: "color-mix(in srgb, #f59e0b 14%, transparent)",
      color: "#f59e0b",
      border: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
    };
  }

  return {
    background: "var(--accent-soft)",
    color: "var(--accent)",
    border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
  };
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatMatchDate(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);
  const gameId = params.gameId;

  if (!currentUser) throw new Response("Unauthorized", { status: 401 });
  if (!gameId) throw new Response("Game not found", { status: 404 });

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      ownerId: true,
      members: {
        where: {
          userId: currentUser.id,
          status: MEMBERSHIP_STATUS.ACTIVE,
        },
        select: { id: true },
      },
      gameMatches: {
        select: {
          matchId: true,
          match: {
            select: {
              id: true,
              startTime: true,
              status: true,
              homeScore: true,
              awayScore: true,
              homeTeam: {
                select: {
                  name: true,
                  shortName: true,
                  logo: true,
                },
              },
              awayTeam: {
                select: {
                  name: true,
                  shortName: true,
                  logo: true,
                },
              },
              tournament: {
                select: {
                  name: true,
                  logo: true,
                },
              },
              round: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          match: {
            startTime: "asc",
          },
        },
      },
    },
  });

  if (!game) throw new Response("Game not found", { status: 404 });

  const isOwner = game.ownerId === currentUser.id;
  const isMember = game.members.length > 0;

  if (!isOwner && !isMember) {
    throw new Response("Forbidden", { status: 403 });
  }

  let generalChat = await prisma.chat.findFirst({
    where: {
      gameId,
      type: CHAT_TYPE.GENERAL,
      matchId: null,
    },
    select: { id: true },
  });

  if (!generalChat) {
    generalChat = await prisma.chat.create({
      data: {
        gameId,
        type: CHAT_TYPE.GENERAL,
        title: "Загальний чат",
        description: "Спільна переписка для всієї гри",
        isPinned: true,
      },
      select: { id: true },
    });
  }

  const matchIds = game.gameMatches.map((gameMatch) => gameMatch.matchId);

  const existingMatchChats = await prisma.chat.findMany({
    where: {
      gameId,
      type: CHAT_TYPE.MATCH,
      matchId: {
        in: matchIds,
      },
    },
    select: {
      matchId: true,
    },
  });

  const existingMatchChatIds = new Set(
    existingMatchChats
      .map((chat) => chat.matchId)
      .filter((id): id is string => Boolean(id))
  );

  const chatsToCreate = game.gameMatches
    .filter((gameMatch) => !existingMatchChatIds.has(gameMatch.matchId))
    .map((gameMatch) => ({
      gameId,
      matchId: gameMatch.matchId,
      type: CHAT_TYPE.MATCH,
      title: `${getTeamName(gameMatch.match.homeTeam)} vs ${getTeamName(
        gameMatch.match.awayTeam
      )}`,
      description: gameMatch.match.tournament?.name ?? null,
      isActive: true,
      isPinned: false,
    }));

  if (chatsToCreate.length > 0) {
    await prisma.chat.createMany({
      data: chatsToCreate,
      skipDuplicates: true,
    });
  }

  const chats = await prisma.chat.findMany({
    where: {
      gameId,
      isActive: true,
    },
    include: {
      match: {
        select: {
          id: true,
          startTime: true,
          status: true,
          homeScore: true,
          awayScore: true,
          homeTeam: {
            select: {
              name: true,
              shortName: true,
              logo: true,
            },
          },
          awayTeam: {
            select: {
              name: true,
              shortName: true,
              logo: true,
            },
          },
          tournament: {
            select: {
              name: true,
              logo: true,
            },
          },
          round: {
            select: {
              name: true,
            },
          },
        },
      },
      messages: {
        take: 1,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          text: true,
          isDeleted: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
            },
          },
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
    },
    orderBy: [
      {
        isPinned: "desc",
      },
      {
        lastMessageAt: "desc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  return data({
    game: {
      id: game.id,
      name: game.name,
    },
    currentUser: {
      id: currentUser.id,
    },
    generalChatId: generalChat.id,
    chats,
  });
}

function TeamLogo({
  logo,
  name,
}: {
  logo?: string | null;
  name: string;
}) {
  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className="h-7 w-7 rounded-full object-contain"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
        }}
      />
    );
  }

  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black"
      style={{
        background: "var(--accent-soft)",
        color: "var(--accent)",
        border: "1px solid color-mix(in srgb, var(--accent) 25%, transparent)",
      }}
    >
      {getInitials(name)}
    </div>
  );
}

function ChatNavItem({
  chat,
  gameId,
  active,
  onClick,
}: {
  chat: ChatWithData;
  gameId: string;
  active: boolean;
  onClick?: () => void;
}) {
  const lastMessage = chat.messages?.[0] ?? null;

  return (
    <Link
      to={`/games/${gameId}/chat/${chat.id}`}
      prefetch="intent"
      onClick={onClick}
      className="group block rounded-2xl px-3 py-3 transition active:scale-[0.99] lg:hover:translate-y-[-1px]"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        border: active
          ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)"
          : "1px solid transparent",
      }}
    >
      <div className="flex items-start gap-3">
        {chat.type === CHAT_TYPE.GENERAL ? (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-base"
            style={{
              background: active ? "var(--accent)" : "var(--panel)",
              color: active ? "var(--accent-contrast)" : "var(--text)",
              border: "1px solid var(--border)",
            }}
          >
            💬
          </div>
        ) : (
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
            <TeamLogo
              logo={chat.match?.homeTeam.logo}
              name={chat.match?.homeTeam.name || "Home"}
            />
            <div className="absolute bottom-0 right-0">
              <TeamLogo
                logo={chat.match?.awayTeam.logo}
                name={chat.match?.awayTeam.name || "Away"}
              />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div
              className="min-w-0 truncate text-sm font-black"
              style={{
                color: active ? "var(--accent)" : "var(--text)",
              }}
            >
              {getChatTitle(chat)}
            </div>

            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em]"
              style={
                chat.type === CHAT_TYPE.GENERAL
                  ? {
                      background: "var(--success-soft)",
                      color: "var(--success)",
                      border:
                        "1px solid color-mix(in srgb, var(--success) 25%, transparent)",
                    }
                  : getStatusStyle(chat.match?.status)
              }
            >
              {chat.type === CHAT_TYPE.GENERAL
                ? "ALL"
                : getStatusText(chat.match?.status)}
            </span>
          </div>

          <div
            className="mt-0.5 truncate text-[11px]"
            style={{ color: "var(--text-soft)" }}
          >
            {getChatSubtitle(chat)}
          </div>

          {chat.match ? (
            <div
              className="mt-1 flex items-center justify-between gap-2 text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              <span className="truncate">
                {formatMatchDate(chat.match.startTime)}
              </span>
              <span className="shrink-0 font-black tabular-nums">
                {chat.match.homeScore ?? "—"}:{chat.match.awayScore ?? "—"}
              </span>
            </div>
          ) : null}

          <div
            className="mt-2 truncate text-xs"
            style={{ color: active ? "var(--text-soft)" : "var(--muted)" }}
          >
            {lastMessage
              ? lastMessage.isDeleted
                ? "Повідомлення видалено"
                : lastMessage.text
              : "Немає повідомлень"}
          </div>
        </div>
      </div>
    </Link>
  );
}

function ChatGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 px-2 pt-3">
        <div
          className="text-[10px] font-black uppercase tracking-[0.16em]"
          style={{ color: "var(--muted)" }}
        >
          {title}
        </div>

        <div
          className="rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums"
          style={{
            background: "var(--panel)",
            color: "var(--text-soft)",
            border: "1px solid var(--border)",
          }}
        >
          {count}
        </div>
      </div>

      {children}
    </div>
  );
}

function ChatList({
  chats,
  gameId,
  activeChatId,
  onSelect,
}: {
  chats: ChatWithData[];
  gameId: string;
  activeChatId: string | null;
  onSelect?: () => void;
}) {
  const generalChats = chats.filter((chat) => chat.type === CHAT_TYPE.GENERAL);

  const liveChats = chats.filter(
    (chat) =>
      chat.type === CHAT_TYPE.MATCH && chat.match?.status === MATCH_STATUS.LIVE
  );

  const scheduledChats = chats.filter(
    (chat) =>
      chat.type === CHAT_TYPE.MATCH &&
      chat.match?.status === MATCH_STATUS.SCHEDULED
  );

  const finishedChats = chats.filter(
    (chat) =>
      chat.type === CHAT_TYPE.MATCH &&
      chat.match?.status === MATCH_STATUS.FINISHED
  );

  const otherChats = chats.filter(
    (chat) =>
      chat.type === CHAT_TYPE.MATCH &&
      chat.match?.status !== MATCH_STATUS.LIVE &&
      chat.match?.status !== MATCH_STATUS.SCHEDULED &&
      chat.match?.status !== MATCH_STATUS.FINISHED
  );

  return (
    <nav className="space-y-1 overflow-y-auto p-2">
      <ChatGroup title="Загальний" count={generalChats.length}>
        {generalChats.map((chat) => (
          <ChatNavItem
            key={chat.id}
            chat={chat}
            gameId={gameId}
            active={activeChatId === chat.id}
            onClick={onSelect}
          />
        ))}
      </ChatGroup>

      <ChatGroup title="Гарячі live" count={liveChats.length}>
        {liveChats.map((chat) => (
          <ChatNavItem
            key={chat.id}
            chat={chat}
            gameId={gameId}
            active={activeChatId === chat.id}
            onClick={onSelect}
          />
        ))}
      </ChatGroup>

      <ChatGroup title="Для прогнозу" count={scheduledChats.length}>
        {scheduledChats.map((chat) => (
          <ChatNavItem
            key={chat.id}
            chat={chat}
            gameId={gameId}
            active={activeChatId === chat.id}
            onClick={onSelect}
          />
        ))}
      </ChatGroup>

      <ChatGroup title="Завершені" count={finishedChats.length}>
        {finishedChats.map((chat) => (
          <ChatNavItem
            key={chat.id}
            chat={chat}
            gameId={gameId}
            active={activeChatId === chat.id}
            onClick={onSelect}
          />
        ))}
      </ChatGroup>

      <ChatGroup title="Інші" count={otherChats.length}>
        {otherChats.map((chat) => (
          <ChatNavItem
            key={chat.id}
            chat={chat}
            gameId={gameId}
            active={activeChatId === chat.id}
            onClick={onSelect}
          />
        ))}
      </ChatGroup>
    </nav>
  );
}

function BurgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

export default function GameChatLayout() {
  const navigation = useNavigation();
  const location = useLocation();
  const { game, chats } = useLoaderData<typeof loader>();

  const [mobileOpen, setMobileOpen] = useState(false);

  const isBusy =
    navigation.state === "loading" || navigation.state === "submitting";

  const activeChatId = (() => {
    const match = location.pathname.match(/\/chat\/([^/]+)$/);
    return match?.[1] ?? null;
  })();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      {isBusy ? <FootballLoader /> : null}

      <div
        className={`relative transition ${
          isBusy ? "pointer-events-none select-none opacity-80" : "opacity-100"
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition active:scale-[0.98]"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 28%, transparent)",
            }}
          >
            <BurgerIcon />
            Обрати чат
          </button>

          <div
            className="min-w-0 truncate text-sm font-bold"
            style={{ color: "var(--text-soft)" }}
          >
            {chats.length} чатів
          </div>
        </div>

        <div className="grid min-h-[calc(100vh-190px)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside
            className="hidden overflow-hidden rounded-[28px] lg:block"
            style={{
              background: "var(--panel-strong)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="border-b px-4 py-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                Game Chat
              </div>

              <div
                className="mt-1 truncate text-xl font-black"
                style={{ color: "var(--text)" }}
              >
                {game.name}
              </div>

              <div className="mt-1 text-sm" style={{ color: "var(--text-soft)" }}>
                {chats.length} чатів у грі
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              <ChatList
                chats={chats}
                gameId={game.id}
                activeChatId={activeChatId}
              />
            </div>
          </aside>

          <section
            className="min-h-[calc(100vh-260px)] overflow-hidden rounded-[28px] lg:min-h-[560px]"
            style={{
              background: "var(--panel-strong)",
              border: "1px solid var(--border)",
            }}
          >
            <Outlet />
          </section>
        </div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-[80] lg:hidden">
            <button
              type="button"
              aria-label="Закрити список чатів"
              onClick={() => setMobileOpen(false)}
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            />

            <div
              className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-[32px]"
              style={{
                background: "var(--panel-strong)",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                className="flex items-center justify-between gap-3 border-b px-4 py-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0">
                  <div
                    className="text-[10px] font-black uppercase tracking-[0.18em]"
                    style={{ color: "var(--muted)" }}
                  >
                    Обрати чат
                  </div>

                  <div
                    className="mt-1 truncate text-xl font-black"
                    style={{ color: "var(--text)" }}
                  >
                    {game.name}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl font-black transition active:scale-95"
                  style={{
                    background: "var(--panel)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                  }}
                >
                  ×
                </button>
              </div>

              <div className="max-h-[calc(88vh-82px)] overflow-y-auto pb-5">
                <ChatList
                  chats={chats}
                  gameId={game.id}
                  activeChatId={activeChatId}
                  onSelect={() => setMobileOpen(false)}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}