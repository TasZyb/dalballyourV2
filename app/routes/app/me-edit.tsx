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

export default function MeEditPage() {
  const { user, teams } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            to="/me"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            ← Назад у кабінет
          </Link>

          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
          >
            На головну
          </Link>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
            Налаштування
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Редагувати профіль
          </h1>

          <p className="mt-3 text-sm leading-6 text-white/65 sm:text-base">
            Тут можна налаштувати вигляд акаунта, опис і персональні вподобання.
          </p>

          {actionData && "error" in actionData && (
            <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {actionData.error}
            </div>
          )}

          <Form method="post" className="mt-8 space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/75">
                Display name
              </label>
              <input
                name="displayName"
                defaultValue={user.displayName ?? ""}
                placeholder="Наприклад: TarasThePredictor"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-white/25"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/75">
                Біо
              </label>
              <textarea
                name="bio"
                defaultValue={user.bio ?? ""}
                rows={4}
                placeholder="Коротко про себе..."
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-white/25"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/75">
                Улюблена команда
              </label>
              <select
                name="favoriteTeamId"
                defaultValue={user.favoriteTeamId ?? ""}
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus:border-white/25"
              >
                <option value="" className="text-black">
                  Не вибрано
                </option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id} className="text-black">
                    {team.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/75">
                Улюблений колір профілю
              </label>
              <input
                name="favoriteColor"
                defaultValue={user.favoriteColor ?? ""}
                placeholder="Наприклад: emerald / blue / purple"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-white/25"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/75">
                Banner URL
              </label>
              <input
                name="profileBanner"
                defaultValue={user.profileBanner ?? ""}
                placeholder="Посилання на банер"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-white placeholder:text-white/35 outline-none focus:border-white/25"
              />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <input
                name="isProfilePublic"
                type="checkbox"
                defaultChecked={user.isProfilePublic}
                className="h-4 w-4"
              />
              <span className="text-sm text-white/80">
                Зробити профіль публічним
              </span>
            </label>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting ? "Збереження..." : "Зберегти зміни"}
            </button>
          </Form>
        </div>
      </main>
    </div>
  );
}