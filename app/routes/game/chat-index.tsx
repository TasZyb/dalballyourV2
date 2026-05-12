import { Link, useRouteLoaderData } from "react-router";
import type { loader as chatLoader } from "./chat";

export default function ChatIndexPage() {
  const parentData = useRouteLoaderData<typeof chatLoader>("routes/game/chat");

  if (!parentData) {
    return (
      <div className="flex min-h-[560px] items-center justify-center p-6 text-center">
        <div className="text-sm" style={{ color: "var(--text-soft)" }}>
          Не вдалося завантажити чати.
        </div>
      </div>
    );
  }

  const { game, chats } = parentData;
  const firstChat = chats[0];

  return (
    <div className="flex min-h-[560px] items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-3xl"
          style={{
            background: "var(--accent-soft)",
            color: "var(--accent)",
            border:
              "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
          }}
        >
          💬
        </div>

        <h1
          className="mt-4 text-2xl font-black"
          style={{ color: "var(--text)" }}
        >
          Обери чат
        </h1>

        <p className="mt-2 text-sm" style={{ color: "var(--text-soft)" }}>
          Зліва є загальний чат гри, live-матчі, матчі для прогнозу та завершені
          матчі.
        </p>

        {firstChat ? (
          <Link
            to={`/games/${game.id}/chat/${firstChat.id}`}
            className="mt-5 inline-flex rounded-2xl px-4 py-3 text-sm font-black transition hover:translate-y-[-1px]"
            style={{
              background: "var(--accent)",
              color: "var(--accent-contrast)",
            }}
          >
            Відкрити перший чат
          </Link>
        ) : null}
      </div>
    </div>
  );
}