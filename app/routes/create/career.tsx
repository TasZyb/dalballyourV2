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
import { useMemo, useState } from "react";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";

type TeamItem = {
  id: string;
  name: string;
  shortName: string | null;
  code: string | null;
  country: string | null;
};

type ActionData = {
  errors?: {
    name?: string;
    favoriteTeamId?: string;
    general?: string;
  };
  values?: {
    name?: string;
    description?: string;
    favoriteTeamId?: string;
    visibility?: string;
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

  return `C${Date.now().toString(36).toUpperCase()}`;
}

async function createUniqueSlug(base: string) {
  const normalized = slugify(base) || "career";

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

  const teams = await prisma.team.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      shortName: true,
      code: true,
      country: true,
    },
  });

  return data({ teams });
}

export async function action({ request }: ActionFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    throw redirect("/login");
  }

  const formData = await request.formData();

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const favoriteTeamId = String(formData.get("favoriteTeamId") || "").trim();
  const visibility = String(formData.get("visibility") || "PRIVATE").trim();
  const lockMinutesBeforeStart = Number(formData.get("lockMinutesBeforeStart") || 0);

  const values: ActionData["values"] = {
    name,
    description,
    favoriteTeamId,
    visibility,
    lockMinutesBeforeStart: String(lockMinutesBeforeStart),
  };

  const errors: NonNullable<ActionData["errors"]> = {};

  if (!name) {
    errors.name = "Вкажи назву кар’єри.";
  } else if (name.length < 3) {
    errors.name = "Назва кар’єри має містити хоча б 3 символи.";
  } else if (name.length > 80) {
    errors.name = "Назва кар’єри занадто довга.";
  }

  if (!favoriteTeamId) {
    errors.favoriteTeamId = "Обери клуб зі списку.";
  }

  if (!["PRIVATE", "UNLISTED", "PUBLIC"].includes(visibility)) {
    errors.general = "Некоректний тип видимості.";
  }

  if (Number.isNaN(lockMinutesBeforeStart) || lockMinutesBeforeStart < 0) {
    errors.general = "Час блокування має бути коректним числом.";
  }

  if (Object.keys(errors).length > 0) {
    return data<ActionData>({ errors, values }, { status: 400 });
  }

  const favoriteTeam = await prisma.team.findUnique({
    where: { id: favoriteTeamId },
    select: {
      id: true,
      name: true,
    },
  });

  if (!favoriteTeam) {
    return data<ActionData>(
      {
        errors: {
          favoriteTeamId: "Обраний клуб не знайдено.",
        },
        values,
      },
      { status: 400 }
    );
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

        // Коли оновиш schema:
        // mode: "CAREER",
        // favoriteTeamId: favoriteTeam.id,

        inviteCode,
        visibility: visibility as "PRIVATE" | "UNLISTED" | "PUBLIC",
        status: "ACTIVE",
        allowJoinByCode: false,
        allowMemberPredictionsEdit: true,
        lockMinutesBeforeStart,
        members: {
          create: {
            userId: currentUser.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        },
      },
      select: {
        id: true,
      },
    });

    return redirect(`/career/${game.id}`);
  } catch {
    return data<ActionData>(
      {
        errors: {
          general: "Не вдалося створити кар’єру. Спробуй ще раз.",
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

function TeamLogo({
  code,
  name,
  className = "h-12 w-12",
}: {
  code: string | null;
  name: string;
  className?: string;
}) {
  if (!code) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-xs font-black text-white/70 ${className}`}
      >
        {name.slice(0, 3).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={`/teams/${code}.svg`}
      alt={name}
      className={`rounded-2xl border border-white/10 bg-white p-1 object-contain ${className}`}
      onError={(e) => {
        const target = e.currentTarget;
        target.style.display = "none";
      }}
    />
  );
}

function TeamPicker({
  teams,
  selectedTeamId,
  onSelect,
  error,
}: {
  teams: TeamItem[];
  selectedTeamId: string;
  onSelect: (teamId: string) => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");

  const filteredTeams = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) return teams;

    return teams.filter((team) => {
      const haystack = [
        team.name,
        team.shortName ?? "",
        team.code ?? "",
        team.country ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalized);
    });
  }, [teams, query]);

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-white/80">
        Улюблений клуб
        <span className="ml-1 text-orange-300">*</span>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Пошук клубу: Arsenal, BAR, Spain..."
        className="mb-4 w-full rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-white/20"
      />

      <div className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {filteredTeams.map((team) => {
          const isSelected = team.id === selectedTeamId;

          return (
            <button
              key={team.id}
              type="button"
              onClick={() => onSelect(team.id)}
              className={[
                "flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition",
                isSelected
                  ? "border-orange-400/30 bg-orange-400/10"
                  : "border-white/10 bg-[#0b1018] hover:border-white/20 hover:bg-white/[0.04]",
              ].join(" ")}
            >
              <TeamLogo code={team.code} name={team.name} className="h-12 w-12" />

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-white">
                  {team.name}
                </div>

                <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/50">
                  {team.code ? <span>{team.code}</span> : null}
                  {team.country ? <span>{team.country}</span> : null}
                </div>
              </div>

              <div
                className={[
                  "h-3.5 w-3.5 rounded-full border",
                  isSelected
                    ? "border-orange-300 bg-orange-300"
                    : "border-white/20 bg-transparent",
                ].join(" ")}
              />
            </button>
          );
        })}
      </div>

      {filteredTeams.length === 0 ? (
        <div className="mt-3 rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm text-white/55">
          За цим запитом клубів не знайдено.
        </div>
      ) : null}

      <FieldError message={error} />
    </div>
  );
}

export default function CreateCareerPage() {
  const { teams } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";
  const values = actionData?.values;

  const [selectedTeamId, setSelectedTeamId] = useState(values?.favoriteTeamId || "");

  const selectedTeam =
    teams.find((team) => team.id === selectedTeamId) ?? null;

  return (
    <Form method="post" className="space-y-6">
      <input type="hidden" name="favoriteTeamId" value={selectedTeamId} />

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <SectionCard
            title="Основна інформація"
            subtitle="Створи персональну кар’єру і вибери клуб, навколо якого буде крутитись твоя гра."
          >
            <div className="grid gap-4">
              <Input
                name="name"
                label="Назва кар’єри"
                placeholder="Наприклад: Arsenal Career"
                required
                defaultValue={values?.name}
                error={actionData?.errors?.name}
              />

              <Textarea
                name="description"
                label="Опис"
                placeholder="Наприклад: Моя персональна кар’єра, де я аналізую кожен матч Арсеналу."
                defaultValue={values?.description}
              />

              <TeamPicker
                teams={teams}
                selectedTeamId={selectedTeamId}
                onSelect={setSelectedTeamId}
                error={actionData?.errors?.favoriteTeamId}
              />

              <Select
                name="visibility"
                label="Видимість"
                defaultValue={values?.visibility || "PRIVATE"}
              >
                <option value="PRIVATE">PRIVATE — тільки для тебе</option>
                <option value="UNLISTED">UNLISTED — можна ділитись лінком</option>
                <option value="PUBLIC">PUBLIC — публічна кар’єра</option>
              </Select>
            </div>
          </SectionCard>

          <SectionCard
            title="Правила кар’єри"
            subtitle="Базова поведінка сольної гри."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                name="lockMinutesBeforeStart"
                type="number"
                label="Блокування прогнозів за (хв)"
                defaultValue={values?.lockMinutesBeforeStart || "0"}
                placeholder="0"
              />

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] px-4 py-3 text-sm leading-6 text-white/60">
                Тут теж можна закривати прогноз заздалегідь, наприклад за
                <span className="mx-1 font-semibold text-white">15</span>
                хвилин до старту матчу.
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Що буде в цій кар’єрі"
            subtitle="На що орієнтується сольний режим."
          >
            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Матчі улюбленого клубу</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  Основний фокус — реальні матчі твого клубу і підготовка до них.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Детальний прогноз</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  Рахунок, склад, голеадори, аналіз і свій погляд на гру.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Твій особистий прогрес</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  Досягнення, історія прогнозів, статистика і власний шлях фаната-аналітика.
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            title="Прев’ю кар’єри"
            subtitle="Як це виглядатиме після створення."
          >
            <div className="rounded-[1.5rem] border border-orange-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-5">
              <div className="inline-flex rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-200">
                Career mode
              </div>

              <div className="mt-4 flex items-start gap-3">
                {selectedTeam ? (
                  <TeamLogo code={selectedTeam.code} name={selectedTeam.name} className="h-12 w-12" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-xs font-black text-white/70">
                    FC
                  </div>
                )}

                <div className="min-w-0">
                  <div className="truncate text-xl font-black text-white">
                    {values?.name || "Назва твоєї кар’єри"}
                  </div>
                  <div className="mt-1 text-sm text-white/55">
                    {selectedTeam?.name || "Обраний клуб з’явиться тут"}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2.5">
                <div className="rounded-[1rem] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">
                    Режим
                  </div>
                  <div className="mt-1 text-lg font-black text-white">Solo</div>
                </div>

                <div className="rounded-[1rem] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">
                    Клуб
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {selectedTeam?.code || "--"}
                  </div>
                </div>

                <div className="rounded-[1rem] border border-white/10 bg-white/[0.05] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-white/38">
                    Lock
                  </div>
                  <div className="mt-1 text-lg font-black text-white">
                    {values?.lockMinutesBeforeStart || "0"} хв
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Після створення"
            subtitle="Що станеться далі."
          >
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Ти одразу зайдеш у кар’єру</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  Після submit буде редірект у персональний career hub.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Матчі будуть навколо клубу</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  У фокусі будуть саме ігри твого улюбленого клубу.
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#0b1018] p-4">
                <div className="text-sm font-semibold text-white">Можна буде ділитись прогресом</div>
                <div className="mt-1 text-sm leading-6 text-white/55">
                  Якщо захочеш, зможеш показувати свої досягнення іншим.
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="Фіналізація"
            subtitle="Коли все готово — запускай."
          >
            <p className="text-sm leading-6 text-white/55">
              Перевір назву, клуб і запускай свою сольну кар’єру.
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
                className="inline-flex items-center justify-center rounded-2xl bg-[#F58212] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Створюємо..." : "Створити кар’єру"}
              </button>
            </div>
          </SectionCard>
        </div>
      </section>
    </Form>
  );
}