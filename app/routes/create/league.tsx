import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  data,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type ActionData = {
  errors?: {
    name?: string;
    general?: string;
  };
  values?: {
    name?: string;
    description?: string;
    linkedTournamentId?: string;
    visibility?: string;
    allowJoinByCode?: string;
    allowMemberPredictionsEdit?: string;
    scoringExact?: string;
    scoringOutcome?: string;
    scoringWrong?: string;
    lockMinutesBeforeStart?: string;
  };
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function createUniqueInviteCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateInviteCode();
    const existing = await prisma.game.findUnique({
      where: { inviteCode: code },
      select: { id: true },
    });

    if (!existing) return code;
  }

  return `G${Date.now().toString(36).toUpperCase()}`;
}

async function createUniqueSlug(base: string) {
  const normalized = slugify(base) || "league";

  const existing = await prisma.game.findUnique({
    where: { slug: normalized },
    select: { id: true },
  });

  if (!existing) return normalized;

  for (let i = 2; i < 20; i++) {
    const candidate = `${normalized}-${i}`;
    const taken = await prisma.game.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!taken) return candidate;
  }

  return `${normalized}-${Date.now().toString(36)}`;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const tournaments = await prisma.tournament.findMany({
    where: {
      isActive: true,
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      country: true,
      season: {
        select: {
          name: true,
          yearLabel: true,
        },
      },
    },
  });

  return data({ tournaments });
}

export async function action({ request }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const linkedTournamentId = String(formData.get("linkedTournamentId") || "").trim();
  const visibility = String(formData.get("visibility") || "PRIVATE").trim();

  const allowJoinByCode = formData.get("allowJoinByCode") === "on";
  const allowMemberPredictionsEdit =
    formData.get("allowMemberPredictionsEdit") === "on";

  const scoringExact = Number(formData.get("scoringExact") || 3);
  const scoringOutcome = Number(formData.get("scoringOutcome") || 1);
  const scoringWrong = Number(formData.get("scoringWrong") || 0);
  const lockMinutesBeforeStart = Number(formData.get("lockMinutesBeforeStart") || 0);

  const values: ActionData["values"] = {
    name,
    description,
    linkedTournamentId,
    visibility,
    allowJoinByCode: allowJoinByCode ? "on" : "",
    allowMemberPredictionsEdit: allowMemberPredictionsEdit ? "on" : "",
    scoringExact: String(scoringExact),
    scoringOutcome: String(scoringOutcome),
    scoringWrong: String(scoringWrong),
    lockMinutesBeforeStart: String(lockMinutesBeforeStart),
  };

  const errors: NonNullable<ActionData["errors"]> = {};

  if (!name) {
    errors.name = "Вкажи назву ліги.";
  } else if (name.length < 3) {
    errors.name = "Назва ліги має містити хоча б 3 символи.";
  } else if (name.length > 80) {
    errors.name = "Назва ліги занадто довга.";
  }

  if (!["PRIVATE", "PUBLIC", "UNLISTED"].includes(visibility)) {
    errors.general = "Некоректний тип видимості.";
  }

  if (
    Number.isNaN(scoringExact) ||
    Number.isNaN(scoringOutcome) ||
    Number.isNaN(scoringWrong)
  ) {
    errors.general = "Бали мають бути числами.";
  }

  if (scoringExact < 0 || scoringOutcome < 0 || scoringWrong < 0) {
    errors.general = "Бали не можуть бути від’ємними.";
  }

  if (Number.isNaN(lockMinutesBeforeStart) || lockMinutesBeforeStart < 0) {
    errors.general = "Час блокування має бути коректним числом.";
  }

  if (Object.keys(errors).length > 0) {
    return data<ActionData>({ errors, values }, { status: 400 });
  }

  let tournamentIdToSave: string | null = null;

  if (linkedTournamentId) {
    const tournament = await prisma.tournament.findUnique({
      where: { id: linkedTournamentId },
      select: { id: true },
    });

    if (!tournament) {
      return data<ActionData>(
        {
          errors: {
            general: "Обраний турнір не знайдено.",
          },
          values,
        },
        { status: 400 }
      );
    }

    tournamentIdToSave = tournament.id;
  }

  try {
    const inviteCode = await createUniqueInviteCode();
    const slug = await createUniqueSlug(name);

    const game = await prisma.game.create({
      data: {
        name,
        slug,
        description: description || null,
        ownerId: currentUser.id,
        linkedTournamentId: tournamentIdToSave,
        inviteCode,
        visibility: visibility as "PRIVATE" | "PUBLIC" | "UNLISTED",
        status: "ACTIVE",
        allowJoinByCode,
        allowMemberPredictionsEdit,
        scoringExact,
        scoringOutcome,
        scoringWrong,
        lockMinutesBeforeStart,
        members: {
          create: {
            userId: currentUser.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
      },
      select: { id: true },
    });

    return redirect(`/games/${game.id}`);
  } catch {
    return data<ActionData>(
      {
        errors: {
          general: "Не вдалося створити лігу. Спробуй ще раз.",
        },
        values,
      },
      { status: 500 }
    );
  }
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-2 text-sm text-red-300">{message}</p>;
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="mb-4">
        <h3 className="text-lg font-black text-white sm:text-xl">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-sm leading-6 text-white/55">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Input({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
  required,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-white/80">
        {label}
        {required ? <span className="ml-1 text-orange-300">*</span> : null}
      </div>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/20"
      />
      <FieldError message={error} />
    </label>
  );
}

function Textarea({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-white/80">{label}</div>
      <textarea
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        rows={4}
        className="w-full resize-none rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/20"
      />
    </label>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
  description,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
      />
      <div>
        <div className="text-sm font-semibold text-white">{label}</div>
        {description ? (
          <div className="mt-1 text-sm leading-6 text-white/55">{description}</div>
        ) : null}
      </div>
    </label>
  );
}

function Select({
  name,
  label,
  defaultValue,
  children,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-semibold text-white/80">{label}</div>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white outline-none transition focus:border-white/20"
      >
        {children}
      </select>
    </label>
  );
}

export default function CreateLeaguePage() {
  const { tournaments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";
  const values = actionData?.values;

  return (
    <Form method="post" className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <SectionCard
            title="Основна інформація"
            subtitle="Задай базу для дружньої ліги: назва, опис і турнір."
          >
            <div className="grid gap-4">
              <Input
                name="name"
                label="Назва ліги"
                placeholder="Наприклад: Champions Night"
                required
                defaultValue={values?.name}
                error={actionData?.errors?.name}
              />

              <Textarea
                name="description"
                label="Опис"
                placeholder="Коротко опиши, для кого ця ліга і який у неї вайб."
                defaultValue={values?.description}
              />

              <Select
                name="linkedTournamentId"
                label="Прив’язаний турнір"
                defaultValue={values?.linkedTournamentId || ""}
              >
                <option value="">Без прив’язки</option>
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                    {tournament.season?.yearLabel
                      ? ` — ${tournament.season.yearLabel}`
                      : tournament.season?.name
                      ? ` — ${tournament.season.name}`
                      : ""}
                  </option>
                ))}
              </Select>

              <Select
                name="visibility"
                label="Видимість"
                defaultValue={values?.visibility || "PRIVATE"}
              >
                <option value="PRIVATE">PRIVATE — тільки по запрошенню</option>
                <option value="UNLISTED">UNLISTED — доступна по коду/лінку</option>
                <option value="PUBLIC">PUBLIC — відкрита</option>
              </Select>
            </div>
          </SectionCard>

          <SectionCard
            title="Правила ліги"
            subtitle="Налаштуй базову систему балів."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                name="scoringExact"
                type="number"
                label="Точний рахунок"
                defaultValue={values?.scoringExact || "3"}
              />
              <Input
                name="scoringOutcome"
                type="number"
                label="Правильний результат"
                defaultValue={values?.scoringOutcome || "1"}
              />
              <Input
                name="scoringWrong"
                type="number"
                label="Неправильно"
                defaultValue={values?.scoringWrong || "0"}
              />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                name="lockMinutesBeforeStart"
                type="number"
                label="Блокування прогнозів за (хв)"
                defaultValue={values?.lockMinutesBeforeStart || "0"}
                placeholder="0"
              />

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm leading-6 text-white/60">
                Якщо поставити <span className="font-semibold text-white">15</span>,
                прогнози закриватимуться за 15 хвилин до старту матчу.
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Доступ і поведінка"
            subtitle="Керуйте входом у гру та редагуванням прогнозів."
          >
            <div className="grid gap-3">
              <Checkbox
                name="allowJoinByCode"
                label="Дозволити вхід по коду"
                description="Учасники зможуть приєднуватися через invite code."
                defaultChecked={values?.allowJoinByCode !== ""}
              />

              <Checkbox
                name="allowMemberPredictionsEdit"
                label="Дозволити редагувати прогнози"
                description="Поки матч не закритий, гравці можуть оновлювати прогноз."
                defaultChecked={values?.allowMemberPredictionsEdit !== ""}
              />
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Що ти створюєш"
            subtitle="Підсумок сценарію дружньої гри."
          >
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Модель</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  Це ліга для кількох людей: таблиця, матчі, прогнози і конкуренція.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Після створення</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  Ти автоматично станеш owner і одразу перейдеш у створену лігу.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Далі</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  Потім можна буде додавати матчі, учасників, банер, налаштування та інше.
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Фіналізація"
            subtitle="Коли все готово — створюй."
          >
            <p className="text-sm leading-6 text-white/55">
              Перевір основні параметри і запускай свою лігу.
            </p>

            {actionData?.errors?.general ? (
              <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {actionData.errors.general}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Створюємо..." : "Створити дружню лігу"}
              </button>
            </div>
          </SectionCard>
        </div>
      </section>
    </Form>
  );
}