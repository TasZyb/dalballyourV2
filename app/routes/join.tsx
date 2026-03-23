import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { GameMemberRole, MembershipStatus } from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  return data({ currentUser });
}

export async function action({ request }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const formData = await request.formData();
  const rawCode = String(formData.get("code") || "");
  const code = normalizeCode(rawCode);

  if (!code) {
    return data({ error: "Введи invite code." }, { status: 400 });
  }

  let gameId: string | null = null;
  let roleOnJoin: GameMemberRole = GameMemberRole.MEMBER;
  let matchedInviteId: string | null = null;

  const gameByDirectCode = await prisma.game.findUnique({
    where: { inviteCode: code },
    select: {
      id: true,
      allowJoinByCode: true,
      status: true,
    },
  });

  if (gameByDirectCode) {
    if (!gameByDirectCode.allowJoinByCode) {
      return data(
        { error: "У цю гру не можна приєднатися по invite code." },
        { status: 400 }
      );
    }

    if (gameByDirectCode.status !== "ACTIVE") {
      return data(
        { error: "Ця гра зараз недоступна для приєднання." },
        { status: 400 }
      );
    }

    gameId = gameByDirectCode.id;
  } else {
    const invite = await prisma.gameInvite.findUnique({
      where: { code },
      include: {
        game: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!invite) {
      return data(
        { error: "Гру за таким кодом не знайдено." },
        { status: 404 }
      );
    }

    if (!invite.game || invite.game.status !== "ACTIVE") {
      return data(
        { error: "Ця гра зараз недоступна для приєднання." },
        { status: 400 }
      );
    }

    if (invite.revokedAt) {
      return data(
        { error: "Цей invite code уже неактивний." },
        { status: 400 }
      );
    }

    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return data(
        { error: "Термін дії цього invite code уже минув." },
        { status: 400 }
      );
    }

    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
      return data(
        { error: "Ліміт використань цього invite code вичерпано." },
        { status: 400 }
      );
    }

    gameId = invite.game.id;
    roleOnJoin = invite.roleOnJoin;
    matchedInviteId = invite.id;
  }

  if (!gameId) {
    return data(
      { error: "Не вдалося визначити гру для приєднання." },
      { status: 400 }
    );
  }

  const existingMembership = await prisma.gameMember.findFirst({
    where: {
      gameId,
      userId: currentUser.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (existingMembership) {
    if (existingMembership.status === MembershipStatus.ACTIVE) {
      throw redirect(`/games/${gameId}`);
    }

    await prisma.gameMember.update({
      where: { id: existingMembership.id },
      data: {
        status: MembershipStatus.ACTIVE,
        leftAt: null,
        kickedAt: null,
        joinedAt: new Date(),
      },
    });
  } else {
    await prisma.gameMember.create({
      data: {
        gameId,
        userId: currentUser.id,
        role: roleOnJoin,
        status: MembershipStatus.ACTIVE,
        joinedAt: new Date(),
      },
    });
  }

  if (matchedInviteId) {
    await prisma.gameInvite.update({
      where: { id: matchedInviteId },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });
  }

  throw redirect(`/games/${gameId}`);
}

function GhostButton({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        color: "var(--text)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--panel-strong)";
        e.currentTarget.style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--panel)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      {children}
    </Link>
  );
}

function NeutralButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        color: "var(--text)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--panel-strong)";
        e.currentTarget.style.borderColor = "var(--border-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "var(--panel)";
        e.currentTarget.style.borderColor = "var(--border)";
      }}
    >
      {children}
    </button>
  );
}

function PrimaryLink({
  to,
  children,
}: {
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-bold transition"
      style={{
        background: "var(--accent)",
        color: "#fff",
        border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = "brightness(1.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "none";
      }}
    >
      {children}
    </Link>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-2xl px-6 py-3 text-sm font-bold transition"
      style={{
        background: "var(--accent)",
        color: "#fff",
        border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = "brightness(1.05)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = "none";
      }}
    >
      {children}
    </button>
  );
}

function MutedBox({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-4 text-sm leading-6"
      style={{
        background: "var(--card-highlight)",
        border: "1px solid var(--border)",
        color: "var(--text-soft)",
      }}
    >
      {children}
    </div>
  );
}

export default function JoinGamePage() {
  const { currentUser } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="theme-page relative min-h-screen overflow-x-hidden space-y-3">
      <div
        className="absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(circle at top, var(--hero-glow), transparent 32%),
            radial-gradient(circle at 80% 20%, var(--hero-glow-2), transparent 22%),
            linear-gradient(to bottom, var(--bg-gradient-start), var(--bg-gradient-mid), var(--bg-gradient-end))
          `,
        }}
      />

      <header
        className="sticky top-0 z-30 backdrop-blur-2xl"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--bg) 78%, transparent)",
        }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 md:px-6 lg:px-8">
          <div className="min-w-0">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.35em] sm:text-xs"
              style={{ color: "var(--muted)" }}
            >
              Match Predictor League
            </div>
            <h1
              className="mt-1 pr-2 text-xl font-black tracking-tight sm:text-2xl md:text-3xl"
              style={{ color: "var(--text)" }}
            >
              Lobby
            </h1>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {currentUser ? (
              <>
                <GhostButton to="/me">Кабінет</GhostButton>

                <Form method="post" action="/logout">
                  <NeutralButton>Вийти</NeutralButton>
                </Form>
              </>
            ) : (
              <PrimaryLink to="/login">Увійти через Google</PrimaryLink>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 md:px-6 lg:px-8">
        <div style={{ color: "var(--text)" }} className="space-y-8">
          <section className="theme-panel rounded-[1.75rem] p-6 shadow-2xl shadow-black/30 sm:rounded-[2rem] sm:p-7 md:p-9">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div
                  className="text-[11px] font-semibold uppercase tracking-[0.32em]"
                  style={{ color: "var(--muted)" }}
                >
                  Join Game
                </div>

                <h1
                  className="mt-3 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl"
                  style={{ color: "var(--text)" }}
                >
                  Приєднайся до гри
                </h1>

                <p
                  className="mt-4 max-w-2xl text-sm leading-6 sm:text-base sm:leading-7"
                  style={{ color: "var(--text-soft)" }}
                >
                  Введи invite code, який тобі скинув owner гри, і одразу
                  потрапиш у лігу.
                </p>
              </div>

              <GhostButton to="/">← Назад у lobby</GhostButton>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="theme-panel rounded-[1.75rem] p-5 sm:rounded-[2rem] sm:p-7">
              <div className="mb-6">
                <div
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--muted)" }}
                >
                  Invite
                </div>
                <h2
                  className="mt-2 text-2xl font-black"
                  style={{ color: "var(--text)" }}
                >
                  Введення коду
                </h2>
              </div>

              <Form method="post" className="space-y-5">
                <div>
                  <label
                    className="mb-2 block text-sm font-medium"
                    style={{ color: "var(--text-soft)" }}
                  >
                    Invite code
                  </label>
                  <input
                    name="code"
                    type="text"
                    placeholder="Наприклад: JOIN123 або ABCD-EFGH"
                    autoComplete="off"
                    required
                    className="w-full rounded-2xl px-4 py-4 text-base font-semibold uppercase tracking-[0.12em] outline-none placeholder:normal-case placeholder:tracking-normal transition"
                    style={{
                      background: "var(--panel-solid)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--border-strong)";
                      e.currentTarget.style.boxShadow =
                        "0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>

                {actionData?.error ? (
                  <div
                    className="rounded-2xl px-4 py-3 text-sm"
                    style={{
                      background: "color-mix(in srgb, #ef4444 12%, transparent)",
                      color: "#ef4444",
                      border:
                        "1px solid color-mix(in srgb, #ef4444 24%, transparent)",
                    }}
                  >
                    {actionData.error}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <PrimaryButton>Приєднатися</PrimaryButton>
                  <GhostButton to="/games/create">Створити свою гру</GhostButton>
                </div>
              </Form>
            </section>

            <div className="space-y-6">
              <section className="theme-panel rounded-[1.75rem] p-5 sm:rounded-[2rem]">
                <div
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--muted)" }}
                >
                  Як це працює
                </div>
                <h3
                  className="mt-2 text-xl font-black"
                  style={{ color: "var(--text)" }}
                >
                  Що потрібно
                </h3>

                <div className="mt-5 space-y-3">
                  <MutedBox>
                    Попроси owner гри надіслати тобі invite code.
                  </MutedBox>

                  <MutedBox>
                    Встав код у поле і підтвердь приєднання.
                  </MutedBox>

                  <MutedBox>
                    Після цього ти одразу потрапиш у гру і зможеш робити прогнози.
                  </MutedBox>
                </div>
              </section>

              <section className="theme-panel rounded-[1.75rem] p-5 sm:rounded-[2rem]">
                <div
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--muted)" }}
                >
                  Порада
                </div>
                <h3
                  className="mt-2 text-xl font-black"
                  style={{ color: "var(--text)" }}
                >
                  Для {currentUser.displayName || currentUser.name || "тебе"}
                </h3>

                <p
                  className="mt-4 text-sm leading-6"
                  style={{ color: "var(--text-soft)" }}
                >
                  Якщо хочеш повністю контролювати правила, матчі та запрошення —
                  краще створи власну гру в lobby.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}