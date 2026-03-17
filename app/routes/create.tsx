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
import {
  GameMemberRole,
  GameStatus,
  GameVisibility,
  MembershipStatus,
} from "@prisma/client";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { useState } from "react";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9а-яіїєґ]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function generateInviteCode(length = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function getUniqueInviteCode() {
  for (let i = 0; i < 20; i++) {
    const code = generateInviteCode(8);
    const existing = await prisma.game.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error("Не вдалося згенерувати унікальний invite code");
}

async function getUniqueGameInviteCode() {
  for (let i = 0; i < 20; i++) {
    const code = `${generateInviteCode(4)}-${generateInviteCode(4)}`;
    const existing = await prisma.gameInvite.findUnique({
      where: { code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  throw new Error("Не вдалося згенерувати унікальний game invite");
}

async function getUniqueSlug(base: string) {
  const cleanBase = slugify(base) || "game";

  const existingBase = await prisma.game.findUnique({
    where: { slug: cleanBase },
    select: { id: true },
  });

  if (!existingBase) return cleanBase;

  for (let i = 2; i < 1000; i++) {
    const candidate = `${cleanBase}-${i}`;
    const existing = await prisma.game.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) return candidate;
  }

  throw new Error("Не вдалося згенерувати унікальний slug");
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const tournaments = await prisma.tournament.findMany({
    include: {
      season: true,
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return data({
    currentUser,
    tournaments,
    defaults: {
      visibility: "PRIVATE",
      timezone: "Europe/Uzhgorod",
      scoringExact: 3,
      scoringOutcome: 1,
      scoringWrong: 0,
      lockMinutesBeforeStart: 15,
      allowJoinByCode: true,
      allowMemberPredictionsEdit: true,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const visibility = String(formData.get("visibility") || "PRIVATE");
  const linkedTournamentId = String(
    formData.get("linkedTournamentId") || ""
  ).trim();
  const timezone = String(
    formData.get("timezone") || "Europe/Uzhgorod"
  ).trim();

  const allowJoinByCode =
    String(formData.get("allowJoinByCode") || "") === "on";
  const allowMemberPredictionsEdit =
    String(formData.get("allowMemberPredictionsEdit") || "") === "on";

  const scoringExact = Number(formData.get("scoringExact") || 3);
  const scoringOutcome = Number(formData.get("scoringOutcome") || 1);
  const scoringWrong = Number(formData.get("scoringWrong") || 0);
  const lockMinutesBeforeStart = Number(
    formData.get("lockMinutesBeforeStart") || 15
  );

  if (!name) {
    return data({ error: "Вкажи назву гри." }, { status: 400 });
  }

  if (!["PRIVATE", "PUBLIC", "UNLISTED"].includes(visibility)) {
    return data({ error: "Невірний тип видимості." }, { status: 400 });
  }

  if (
    [scoringExact, scoringOutcome, scoringWrong, lockMinutesBeforeStart].some(
      (v) => Number.isNaN(v)
    )
  ) {
    return data(
      { error: "Числові поля заповнені некоректно." },
      { status: 400 }
    );
  }

  if (scoringExact < 0 || scoringOutcome < 0 || scoringWrong < 0) {
    return data(
      { error: "Бали не можуть бути від’ємними." },
      { status: 400 }
    );
  }

  if (lockMinutesBeforeStart < 0) {
    return data(
      { error: "Lock minutes не може бути меншим за 0." },
      { status: 400 }
    );
  }

  if (linkedTournamentId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: linkedTournamentId },
      select: { id: true },
    });

    if (!tournament) {
      return data(
        { error: "Обраний турнір не існує." },
        { status: 400 }
      );
    }
  }

  const slug = await getUniqueSlug(name);
  const inviteCode = await getUniqueInviteCode();
  const gameInviteCode = await getUniqueGameInviteCode();

  const game = await prisma.game.create({
    data: {
      name,
      slug,
      description: description || null,
      ownerId: currentUser.id,
      linkedTournamentId: linkedTournamentId || null,
      inviteCode,
      visibility: visibility as GameVisibility,
      status: GameStatus.ACTIVE,
      allowJoinByCode,
      allowMemberPredictionsEdit,
      timezone: timezone || "Europe/Uzhgorod",
      scoringExact,
      scoringOutcome,
      scoringWrong,
      defaultRoundWeight: 1,
      lockMinutesBeforeStart,
      startsAt: new Date(),

      members: {
        create: {
          userId: currentUser.id,
          role: GameMemberRole.OWNER,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      },

      invites: {
        create: {
          code: gameInviteCode,
          createdById: currentUser.id,
          roleOnJoin: GameMemberRole.MEMBER,
          maxUses: null,
          usedCount: 0,
        },
      },
    },
    select: {
      id: true,
    },
  });

  throw redirect(`/games/${game.id}`);
}

function SectionCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-xl sm:rounded-[2rem] sm:p-7">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
          {eyebrow}
        </div>
        <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function CreateGamePage() {
  const { tournaments, defaults, currentUser } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [showAdvanced, setShowAdvanced] = useState(false);

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
        <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-7 md:p-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/40">
                Create Game
              </div>

              <h1 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
                Створи нову гру
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60 sm:text-base sm:leading-7">
                Створи свою лігу за кілька кроків. Основне — зверху. Додаткові
                правила можна відкрити окремо.
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
          <Form method="post" className="space-y-6">
            <SectionCard eyebrow="Швидкий старт" title="Основне">
              <div className="space-y-5">
                <div>
                  <label className="mb-2 block text-sm font-medium text-white/75">
                    Назва гри
                  </label>
                  <input
                    name="name"
                    type="text"
                    placeholder="Наприклад: Friends League"
                    className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-base text-white outline-none placeholder:text-white/30 transition focus:border-white/20"
                    required
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-white/75">
                    Короткий опис
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Коротко про гру, формат або для кого вона"
                    className="w-full resize-none rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-white/20"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Видимість
                    </label>
                    <select
                      name="visibility"
                      defaultValue={defaults.visibility}
                      className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-white outline-none transition focus:border-white/20"
                    >
                      <option value="PRIVATE">Приватна</option>
                      <option value="UNLISTED">За посиланням</option>
                      <option value="PUBLIC">Публічна</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/75">
                      Турнір
                    </label>
                    <select
                      name="linkedTournamentId"
                      className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-white outline-none transition focus:border-white/20"
                    >
                      <option value="">Без привʼязки</option>
                      {tournaments.map((tournament) => (
                        <option key={tournament.id} value={tournament.id}>
                          {tournament.name}
                          {tournament.season?.yearLabel
                            ? ` (${tournament.season.yearLabel})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard eyebrow="Додатково" title="Налаштування правил">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-left transition hover:border-white/20 hover:bg-neutral-800"
              >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                    Розширені параметри
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    Система балів і поведінка гри
                  </div>
                </div>

                <div className="text-sm font-semibold text-white/60">
                  {showAdvanced ? "Сховати" : "Показати"}
                </div>
              </button>

              {showAdvanced ? (
                <div className="mt-5 space-y-6">
                  <div>
                    <div className="mb-3 text-sm font-medium text-white/75">
                      Система балів
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <label className="mb-2 block text-sm text-white/55">
                          Exact
                        </label>
                        <input
                          name="scoringExact"
                          type="number"
                          min="0"
                          defaultValue={defaults.scoringExact}
                          className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-white outline-none transition focus:border-white/20"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-white/55">
                          Outcome
                        </label>
                        <input
                          name="scoringOutcome"
                          type="number"
                          min="0"
                          defaultValue={defaults.scoringOutcome}
                          className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-white outline-none transition focus:border-white/20"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-white/55">
                          Wrong
                        </label>
                        <input
                          name="scoringWrong"
                          type="number"
                          min="0"
                          defaultValue={defaults.scoringWrong}
                          className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-white outline-none transition focus:border-white/20"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm text-white/55">
                          Lock, хв
                        </label>
                        <input
                          name="lockMinutesBeforeStart"
                          type="number"
                          min="0"
                          defaultValue={defaults.lockMinutesBeforeStart}
                          className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-white outline-none transition focus:border-white/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 text-sm font-medium text-white/75">
                      Системні параметри
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm text-white/55">
                          Таймзона
                        </label>
                        <input
                          name="timezone"
                          type="text"
                          defaultValue={defaults.timezone}
                          className="w-full rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-white outline-none transition focus:border-white/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-sm text-white/75">
                      <input
                        type="checkbox"
                        name="allowJoinByCode"
                        defaultChecked={defaults.allowJoinByCode}
                      />
                      Дозволити приєднання по invite code
                    </label>

                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-neutral-900 px-4 py-4 text-sm text-white/75">
                      <input
                        type="checkbox"
                        name="allowMemberPredictionsEdit"
                        defaultChecked={defaults.allowMemberPredictionsEdit}
                      />
                      Дозволити редагування прогнозу до дедлайну
                    </label>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="hidden"
                    name="scoringExact"
                    value={defaults.scoringExact}
                  />
                  <input
                    type="hidden"
                    name="scoringOutcome"
                    value={defaults.scoringOutcome}
                  />
                  <input
                    type="hidden"
                    name="scoringWrong"
                    value={defaults.scoringWrong}
                  />
                  <input
                    type="hidden"
                    name="lockMinutesBeforeStart"
                    value={defaults.lockMinutesBeforeStart}
                  />
                  <input
                    type="hidden"
                    name="timezone"
                    value={defaults.timezone}
                  />
                  <input
                    type="hidden"
                    name="allowJoinByCode"
                    value={defaults.allowJoinByCode ? "on" : ""}
                  />
                  <input
                    type="hidden"
                    name="allowMemberPredictionsEdit"
                    value={defaults.allowMemberPredictionsEdit ? "on" : ""}
                  />
                </>
              )}
            </SectionCard>

            <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-xl sm:rounded-[2rem] sm:p-7">
              {actionData?.error ? (
                <div className="mb-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {actionData.error}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black transition hover:opacity-90"
                >
                  Створити гру
                </button>

                <Link
                  to="/"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                >
                  Скасувати
                </Link>
              </div>
            </section>
          </Form>

          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-xl sm:rounded-[2rem]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                Після створення
              </div>
              <h3 className="mt-2 text-xl font-black text-white">
                Що буде далі
              </h3>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4 text-sm leading-6 text-white/60">
                  Ти автоматично станеш{" "}
                  <span className="font-semibold text-white">owner</span>.
                </div>

                <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4 text-sm leading-6 text-white/60">
                  Для гри згенерується{" "}
                  <span className="font-semibold text-white">invite code</span>.
                </div>

                <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4 text-sm leading-6 text-white/60">
                  Після створення ти одразу потрапиш у нову гру.
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-neutral-900/60 p-5 backdrop-blur-xl sm:rounded-[2rem]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">
                Рекомендація
              </div>
              <h3 className="mt-2 text-xl font-black text-white">
                Для старту цього достатньо
              </h3>

              <p className="mt-4 text-sm leading-6 text-white/60">
                Спочатку створи гру з базовими параметрами. Далі вже в адмінці
                зможеш додавати матчі, міняти вагу, дедлайни та інші правила.
              </p>
            </section>
          </div>
        </div>
      </div>

    </div>
  );
}