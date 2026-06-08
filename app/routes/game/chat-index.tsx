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
  const featuredWarRoom =
    chats.find(
      (chat) =>
        chat.match &&
        (chat.match.status === "LIVE" || chat.match.status === "SCHEDULED")
    ) ?? chats.find((chat) => chat.match);
  const warRoomProgress =
    featuredWarRoom?.warRoomSummary &&
    featuredWarRoom.warRoomSummary.totalParticipants > 0
      ? Math.round(
          (featuredWarRoom.warRoomSummary.predictionCount /
            featuredWarRoom.warRoomSummary.totalParticipants) *
            100
        )
      : 0;

  return (
    <div className="flex min-h-[560px] items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl text-center">
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

        {featuredWarRoom ? (
          <Link
            to={`/games/${game.id}/chat/${featuredWarRoom.id}`}
            className="mt-6 block rounded-[24px] border p-4 text-left transition hover:translate-y-[-1px]"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, transparent), transparent 48%), var(--panel)",
              borderColor: "var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="text-[10px] font-black uppercase tracking-[0.18em]"
                  style={{ color: "var(--accent)" }}
                >
                  Match War Room
                </div>
                <div
                  className="mt-1 truncate text-lg font-black"
                  style={{ color: "var(--text)" }}
                >
                  {featuredWarRoom.title ||
                    `${featuredWarRoom.match?.homeTeam.shortName || featuredWarRoom.match?.homeTeam.name} — ${
                      featuredWarRoom.match?.awayTeam.shortName ||
                      featuredWarRoom.match?.awayTeam.name
                    }`}
                </div>
                <div
                  className="mt-1 text-sm"
                  style={{ color: "var(--text-soft)" }}
                >
                  {featuredWarRoom.warRoomSummary?.canReveal
                    ? "Прогнози вже відкриті для розбору."
                    : "Ставки друзів приховані до дедлайну."}
                </div>
              </div>

              <div
                className="shrink-0 rounded-full px-3 py-1 text-xs font-black tabular-nums"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                }}
              >
                {featuredWarRoom.warRoomSummary?.predictionCount ?? 0}/
                {featuredWarRoom.warRoomSummary?.totalParticipants ?? 0}
              </div>
            </div>

            <div className="mt-4">
              <div
                className="h-2 overflow-hidden rounded-full"
                style={{ background: "var(--panel-strong)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${warRoomProgress}%`,
                    background:
                      "linear-gradient(90deg, var(--accent), var(--success))",
                  }}
                />
              </div>
            </div>
          </Link>
        ) : null}

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
