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

    if (
      invite.maxUses !== null &&
      invite.usedCount >= invite.maxUses
    ) {
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

export default function JoinGamePage() {
  const { currentUser } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (

        <div className="relative min-h-screen overflow-x-hidden bg-neutral-950 text-white space-y-3">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />
          <header className="sticky top-0 z-30 border-b border-white/10 bg-neutral-950/70 backdrop-blur-2xl">
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 md:px-6 lg:px-8">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45 sm:text-xs">
                  Match Predictor League
                </div>
                <h1 className="mt-1 pr-2 text-xl font-black tracking-tight sm:text-2xl md:text-3xl">
                  Lobby
                </h1>
              </div>
    
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {currentUser ? (
                  <>
                    <Link
                      to="/me"
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto"
                    >
                      Кабінет
                    </Link>
    
                    <Link
                      to="/logout"
                      className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto"
                    >
                      Вийти
                    </Link>
                  </>
                ) : (
                  <Link
                    to="/login"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90 sm:w-auto"
                  >
                    Увійти через Google
                  </Link>
                )}
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 md:px-6 lg:px-8">
            <div className="space-y-8 text-white">
            <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-7 md:p-9">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/40">
                    Join Game
                    </div>

                    <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
                    Приєднайся до гри
                    </h1>

                    <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base sm:leading-7">
                    Введи invite code, який тобі скинув owner гри, і одразу
                    потрапиш у лігу.
                    </p>
                </div>

                <Link
                    to="/"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                    ← Назад у lobby
                </Link>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-xl sm:rounded-[2rem] sm:p-7">
                <div className="mb-6">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                    Invite
                    </div>
                    <h2 className="mt-2 text-2xl font-black text-white">
                    Введення коду
                    </h2>
                </div>

                <Form method="post" className="space-y-5">
                    <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                        Invite code
                    </label>
                    <input
                        name="code"
                        type="text"
                        placeholder="Наприклад: JOIN123 або ABCD-EFGH"
                        autoComplete="off"
                        className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-base font-semibold uppercase tracking-[0.12em] text-white outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-white/30 transition focus:border-white/20"
                        required
                    />
                    </div>

                    {actionData?.error ? (
                    <div className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {actionData.error}
                    </div>
                    ) : null}

                    <div className="flex flex-wrap gap-3">
                    <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:opacity-90"
                    >
                        Приєднатися
                    </button>

                    <Link
                        to="/games/create"
                        className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                    >
                        Створити свою гру
                    </Link>
                    </div>
                </Form>
                </section>

                <div className="space-y-6">
                <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-xl sm:rounded-[2rem]">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                    Як це працює
                    </div>
                    <h3 className="mt-2 text-xl font-black text-white">
                    Що потрібно
                    </h3>

                    <div className="mt-5 space-y-3">
                    <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4 text-sm leading-6 text-white/60">
                        Попроси owner гри надіслати тобі invite code.
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4 text-sm leading-6 text-white/60">
                        Встав код у поле і підтвердь приєднання.
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4 text-sm leading-6 text-white/60">
                        Після цього ти одразу потрапиш у гру і зможеш робити прогнози.
                    </div>
                    </div>
                </section>

                <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-xl sm:rounded-[2rem]">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                    Порада
                    </div>
                    <h3 className="mt-2 text-xl font-black text-white">
                    Для {currentUser.displayName || currentUser.name || "тебе"}
                    </h3>

                    <p className="mt-4 text-sm leading-6 text-white/60">
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