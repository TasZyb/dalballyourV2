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
    <section className="theme-panel rounded-[1.75rem] p-5 sm:rounded-[2rem] sm:p-7">
      <div className="mb-6">
        <div
          className="text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: "var(--muted)" }}
        >
          {eyebrow}
        </div>
        <h2
          className="mt-2 text-2xl font-black"
          style={{ color: "var(--text)" }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
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

function NeutralButton({
  children,
  type = "button",
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
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

function PrimaryButton({
  children,
  type = "button",
}: {
  children: React.ReactNode;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="mb-2 block text-sm font-medium"
      style={{ color: "var(--text-soft)" }}
    >
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl px-4 py-4 text-base outline-none transition"
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
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full resize-none rounded-2xl px-4 py-4 text-sm outline-none transition"
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
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-2xl px-4 py-4 outline-none transition"
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

export default function CreateGamePage() {
  const { tournaments, defaults, currentUser } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [showAdvanced, setShowAdvanced] = useState(false);

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
                  <NeutralButton type="submit">Вийти</NeutralButton>
                </Form>
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-bold transition sm:w-auto"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  border:
                    "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.filter = "brightness(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.filter = "none";
                }}
              >
                Увійти через Google
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-5 md:px-6 lg:px-8">
        <section className="theme-panel rounded-[1.75rem] p-6 sm:rounded-[2rem] sm:p-7 md:p-9">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.32em]"
                style={{ color: "var(--muted)" }}
              >
                Create Game
              </div>

              <h1
                className="mt-3 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl"
                style={{ color: "var(--text)" }}
              >
                Створи нову гру
              </h1>

              <p
                className="mt-4 max-w-2xl text-sm leading-6 sm:text-base sm:leading-7"
                style={{ color: "var(--text-soft)" }}
              >
                Створи свою лігу за кілька кроків. Основне — зверху. Додаткові
                правила можна відкрити окремо.
              </p>
            </div>

            <GhostButton to="/">← Назад у lobby</GhostButton>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Form method="post" className="space-y-6">
            <SectionCard eyebrow="Швидкий старт" title="Основне">
              <div className="space-y-5">
                <div>
                  <FieldLabel>Назва гри</FieldLabel>
                  <Input
                    name="name"
                    type="text"
                    placeholder="Наприклад: Friends League"
                    required
                  />
                </div>

                <div>
                  <FieldLabel>Короткий опис</FieldLabel>
                  <Textarea
                    name="description"
                    rows={3}
                    placeholder="Коротко про гру, формат або для кого вона"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel>Видимість</FieldLabel>
                    <Select
                      name="visibility"
                      defaultValue={defaults.visibility}
                    >
                      <option value="PRIVATE" style={{ color: "#111" }}>
                        Приватна
                      </option>
                      <option value="UNLISTED" style={{ color: "#111" }}>
                        За посиланням
                      </option>
                      <option value="PUBLIC" style={{ color: "#111" }}>
                        Публічна
                      </option>
                    </Select>
                  </div>

                  <div>
                    <FieldLabel>Турнір</FieldLabel>
                    <Select name="linkedTournamentId">
                      <option value="" style={{ color: "#111" }}>
                        Без привʼязки
                      </option>
                      {tournaments.map((tournament) => (
                        <option
                          key={tournament.id}
                          value={tournament.id}
                          style={{ color: "#111" }}
                        >
                          {tournament.name}
                          {tournament.season?.yearLabel
                            ? ` (${tournament.season.yearLabel})`
                            : ""}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard eyebrow="Додатково" title="Налаштування правил">
              <button
                type="button"
                onClick={() => setShowAdvanced((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left transition"
                style={{
                  background: "var(--panel-solid)",
                  border: "1px solid var(--border)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-strong)";
                  e.currentTarget.style.background = "var(--panel-strong)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.background = "var(--panel-solid)";
                }}
              >
                <div>
                  <div
                    className="text-xs font-semibold uppercase tracking-[0.18em]"
                    style={{ color: "var(--muted)" }}
                  >
                    Розширені параметри
                  </div>
                  <div
                    className="mt-1 text-lg font-black"
                    style={{ color: "var(--text)" }}
                  >
                    Система балів і поведінка гри
                  </div>
                </div>

                <div
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-soft)" }}
                >
                  {showAdvanced ? "Сховати" : "Показати"}
                </div>
              </button>

              {showAdvanced ? (
                <div className="mt-5 space-y-6">
                  <div>
                    <div
                      className="mb-3 text-sm font-medium"
                      style={{ color: "var(--text-soft)" }}
                    >
                      Система балів
                    </div>

                    <div className="grid gap-4 md:grid-cols-4">
                      <div>
                        <FieldLabel>Exact</FieldLabel>
                        <Input
                          name="scoringExact"
                          type="number"
                          min="0"
                          defaultValue={defaults.scoringExact}
                        />
                      </div>

                      <div>
                        <FieldLabel>Outcome</FieldLabel>
                        <Input
                          name="scoringOutcome"
                          type="number"
                          min="0"
                          defaultValue={defaults.scoringOutcome}
                        />
                      </div>

                      <div>
                        <FieldLabel>Wrong</FieldLabel>
                        <Input
                          name="scoringWrong"
                          type="number"
                          min="0"
                          defaultValue={defaults.scoringWrong}
                        />
                      </div>

                      <div>
                        <FieldLabel>Lock, хв</FieldLabel>
                        <Input
                          name="lockMinutesBeforeStart"
                          type="number"
                          min="0"
                          defaultValue={defaults.lockMinutesBeforeStart}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <div
                      className="mb-3 text-sm font-medium"
                      style={{ color: "var(--text-soft)" }}
                    >
                      Системні параметри
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <FieldLabel>Таймзона</FieldLabel>
                        <Input
                          name="timezone"
                          type="text"
                          defaultValue={defaults.timezone}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <label
                      className="flex items-center gap-3 rounded-2xl px-4 py-4 text-sm"
                      style={{
                        background: "var(--panel-solid)",
                        border: "1px solid var(--border)",
                        color: "var(--text-soft)",
                      }}
                    >
                      <input
                        type="checkbox"
                        name="allowJoinByCode"
                        defaultChecked={defaults.allowJoinByCode}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      Дозволити приєднання по invite code
                    </label>

                    <label
                      className="flex items-center gap-3 rounded-2xl px-4 py-4 text-sm"
                      style={{
                        background: "var(--panel-solid)",
                        border: "1px solid var(--border)",
                        color: "var(--text-soft)",
                      }}
                    >
                      <input
                        type="checkbox"
                        name="allowMemberPredictionsEdit"
                        defaultChecked={defaults.allowMemberPredictionsEdit}
                        style={{ accentColor: "var(--accent)" }}
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

            <section className="theme-panel rounded-[1.75rem] p-5 sm:rounded-[2rem] sm:p-7">
              {actionData?.error ? (
                <div
                  className="mb-5 rounded-2xl px-4 py-3 text-sm"
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
                <PrimaryButton type="submit">Створити гру</PrimaryButton>
                <GhostButton to="/">Скасувати</GhostButton>
              </div>
            </section>
          </Form>

          <div className="space-y-6">
            <section className="theme-panel rounded-[1.75rem] p-5 sm:rounded-[2rem]">
              <div
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                Після створення
              </div>
              <h3
                className="mt-2 text-xl font-black"
                style={{ color: "var(--text)" }}
              >
                Що буде далі
              </h3>

              <div className="mt-5 space-y-3">
                <MutedBox>
                  Ти автоматично станеш{" "}
                  <span style={{ color: "var(--text)", fontWeight: 600 }}>
                    owner
                  </span>.
                </MutedBox>

                <MutedBox>
                  Для гри згенерується{" "}
                  <span style={{ color: "var(--text)", fontWeight: 600 }}>
                    invite code
                  </span>.
                </MutedBox>

                <MutedBox>
                  Після створення ти одразу потрапиш у нову гру.
                </MutedBox>
              </div>
            </section>

            <section className="theme-panel rounded-[1.75rem] p-5 sm:rounded-[2rem]">
              <div
                className="text-xs font-semibold uppercase tracking-[0.18em]"
                style={{ color: "var(--muted)" }}
              >
                Рекомендація
              </div>
              <h3
                className="mt-2 text-xl font-black"
                style={{ color: "var(--text)" }}
              >
                Для старту цього достатньо
              </h3>

              <p
                className="mt-4 text-sm leading-6"
                style={{ color: "var(--text-soft)" }}
              >
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