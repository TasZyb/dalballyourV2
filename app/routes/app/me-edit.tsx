import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUser } from "~/lib/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  const [fullUser, teams] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
        displayName: true,
        favoriteColor: true,
        profileBanner: true,
        isProfilePublic: true,
        favoriteTeamId: true,
      },
    }),
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  if (!fullUser) {
    throw new Response("User not found", { status: 404 });
  }

  return data({ user: fullUser, teams });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();

  const displayName = String(formData.get("displayName") || "").trim();
  const bio = String(formData.get("bio") || "").trim();
  const favoriteColor = String(formData.get("favoriteColor") || "").trim();
  const profileBanner = String(formData.get("profileBanner") || "").trim();
  const favoriteTeamId = String(formData.get("favoriteTeamId") || "").trim();
  const isProfilePublic = formData.get("isProfilePublic") === "on";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      displayName: displayName || null,
      bio: bio || null,
      favoriteColor: favoriteColor || null,
      profileBanner: profileBanner || null,
      favoriteTeamId: favoriteTeamId || null,
      isProfilePublic,
    },
  });

  return redirect("/me");
}

function PageButton({
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

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-2xl px-4 py-3 outline-none transition"
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

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="w-full rounded-2xl px-4 py-3 outline-none transition"
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

function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-2xl px-4 py-3 outline-none transition"
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

export default function MeEditPage() {
  const { user, teams } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="theme-page min-h-screen">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap gap-3">
          <PageButton to="/me">← Назад у кабінет</PageButton>
          <PageButton to="/">На головну</PageButton>
        </div>

        <div className="theme-panel rounded-[2rem] p-6 sm:p-8">
          <div
            className="text-xs font-semibold uppercase tracking-[0.3em]"
            style={{ color: "var(--muted)" }}
          >
            Налаштування
          </div>

          <h1
            className="mt-2 text-3xl font-black tracking-tight sm:text-4xl"
            style={{ color: "var(--text)" }}
          >
            Редагувати профіль
          </h1>

          <p
            className="mt-3 text-sm leading-6 sm:text-base"
            style={{ color: "var(--text-soft)" }}
          >
            Тут можна налаштувати вигляд акаунта, опис і персональні вподобання.
          </p>

          {actionData && "error" in actionData && (
            <div
              className="mt-5 rounded-2xl px-4 py-3 text-sm"
              style={{
                background: "color-mix(in srgb, #ef4444 14%, transparent)",
                color: "#ef4444",
                border: "1px solid color-mix(in srgb, #ef4444 24%, transparent)",
              }}
            >
              {actionData.error}
            </div>
          )}

          <Form method="post" className="mt-8 space-y-5">
            <div>
              <FieldLabel>Display name</FieldLabel>
              <TextInput
                name="displayName"
                defaultValue={user.displayName ?? ""}
                placeholder="Наприклад: TarasThePredictor"
              />
            </div>

            <div>
              <FieldLabel>Біо</FieldLabel>
              <TextArea
                name="bio"
                defaultValue={user.bio ?? ""}
                rows={4}
                placeholder="Коротко про себе..."
              />
            </div>

            <div>
              <FieldLabel>Улюблена команда</FieldLabel>
              <SelectInput
                name="favoriteTeamId"
                defaultValue={user.favoriteTeamId ?? ""}
              >
                <option value="" style={{ color: "#111" }}>
                  Не вибрано
                </option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id} style={{ color: "#111" }}>
                    {team.name}
                  </option>
                ))}
              </SelectInput>
            </div>

            <div>
              <FieldLabel>Улюблений колір профілю</FieldLabel>
              <TextInput
                name="favoriteColor"
                defaultValue={user.favoriteColor ?? ""}
                placeholder="Наприклад: emerald / blue / purple"
              />
            </div>

            <div>
              <FieldLabel>Banner URL</FieldLabel>
              <TextInput
                name="profileBanner"
                defaultValue={user.profileBanner ?? ""}
                placeholder="Посилання на банер"
              />
            </div>

            <label
              className="flex items-center gap-3 rounded-2xl px-4 py-3"
              style={{
                background: "var(--panel-solid)",
                border: "1px solid var(--border)",
              }}
            >
              <input
                name="isProfilePublic"
                type="checkbox"
                defaultChecked={user.isProfilePublic}
                className="h-4 w-4"
                style={{ accentColor: "var(--accent)" }}
              />
              <span className="text-sm" style={{ color: "var(--text-soft)" }}>
                Зробити профіль публічним
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl px-5 py-3 text-sm font-bold transition disabled:opacity-50"
              style={{
                background: "var(--accent)",
                color: "white",
                border: "1px solid color-mix(in srgb, var(--accent) 38%, transparent)",
              }}
              onMouseEnter={(e) => {
                if (!isSubmitting) {
                  e.currentTarget.style.filter = "brightness(1.05)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.filter = "none";
              }}
            >
              {isSubmitting ? "Збереження..." : "Зберегти зміни"}
            </button>
          </Form>
        </div>
      </main>
    </div>
  );
}