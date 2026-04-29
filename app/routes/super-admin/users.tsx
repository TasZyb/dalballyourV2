// app/routes/super-admin/users.tsx
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { requireUnlockedSuperAdmin } from "~/lib/super-admin.server";

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

export default function SuperAdminUsersPage() {
  const data = useLoaderData<typeof loader>();

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
          </div>
        ))}
      </div>
    </div>
  );
}