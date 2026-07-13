import { Form, data, redirect, useLoaderData, useNavigation } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

const userRoles = ["USER", "ADMIN", "STATISTICIAN"] as const;

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      memberships: {
        include: {
          game: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  return { users };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireUnlockedSuperAdmin(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent !== "updateRole") {
    return data({ error: "Невідома дія." }, { status: 400 });
  }

  const userId = String(formData.get("userId") || "");
  const role = String(formData.get("role") || "");

  if (!userId || !userRoles.includes(role as (typeof userRoles)[number])) {
    return data({ error: "Некоректний користувач або роль." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: role as any },
  });

  return redirect("/x9p_admin_47taras/users");
}

export default function SuperAdminUsersPage() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Users</h1>
        <p className="text-sm text-white/60">
          Тут далі зробимо kick / ban / membership control.
        </p>
      </div>

      <div className="grid gap-3">
        {data.users.map((user) => (
          <div
            key={user.id}
            className="rounded-3xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-lg font-black">
                  {user.displayName || user.name || user.email || "Unknown"}
                </div>
                <div className="text-sm text-white/60">{user.email || "—"}</div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  {user.role}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Memberships: {user.memberships.length}
                </span>
              </div>
            </div>

            <Form method="post" className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input type="hidden" name="intent" value="updateRole" />
              <input type="hidden" name="userId" value={user.id} />
              <select
                name="role"
                defaultValue={user.role}
                className="min-h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm font-bold text-white outline-none focus:border-cyan-300"
              >
                {userRoles.map((role) => (
                  <option key={role} value={role} className="bg-slate-950">
                    {role}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-11 rounded-2xl bg-cyan-300 px-4 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:opacity-60"
              >
                Зберегти роль
              </button>
            </Form>
          </div>
        ))}
      </div>
    </div>
  );
}
