// app/routes/super-admin/unlock.tsx
import { Form, redirect, useActionData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  getSuperAdminSession,
  requireSuperAdminUser,
  unlockSuperAdmin,
} from "~/lib/super-admin.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireSuperAdminUser(request);

  const session = await getSuperAdminSession(request);
  const unlocked = session.get("superAdminUnlocked");

  if (unlocked) {
    throw redirect("/x9p_admin_47taras");
  }

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  await requireSuperAdminUser(request);

  const formData = await request.formData();
  const password = String(formData.get("password") || "");

  const result = await unlockSuperAdmin(request, password);

  if (!result.ok) {
    return {
      error: "Невірний пароль доступу до супер-адмінки.",
    };
  }

  return redirect("/x9p_admin_47taras", {
    headers: result.headers,
  });
}

export default function SuperAdminUnlockPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#16324f_0%,#0b1220_35%,#050816_100%)] px-4 py-10 text-white">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
          <div className="mb-6">
            <div className="mb-2 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
              Super Admin Access
            </div>
            <h1 className="text-2xl font-black tracking-tight">
              Розблокування супер-адмінки
            </h1>
            <p className="mt-2 text-sm text-white/70">
              Доступ дозволений лише для вибраного акаунта. Введи додатковий пароль.
            </p>
          </div>

          <Form method="post" className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-white/80">
                Пароль
              </label>
              <input
                type="password"
                name="password"
                placeholder="Введи пароль"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition focus:border-cyan-400/50"
                autoFocus
              />
            </div>

            {actionData?.error ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {actionData.error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Перевіряю..." : "Увійти"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}