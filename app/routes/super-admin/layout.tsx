import {
  Form,
  NavLink,
  Outlet,
  useLoaderData,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import {
  lockSuperAdmin,
  requireSuperAdminUser,
  requireUnlockedSuperAdmin,
} from "~/lib/super-admin.server";

const navItems = [
  { to: "/x9p_admin_47taras", label: "Огляд" },
  { to: "/x9p_admin_47taras/games", label: "Games" },
  { to: "/x9p_admin_47taras/predictions", label: "Predictions" },
  { to: "/x9p_admin_47taras/players", label: "Players" },
  { to: "/x9p_admin_47taras/users", label: "Users" },
  { to: "/x9p_admin_47taras/tournaments", label: "Tournaments" },
  { to: "/x9p_admin_47taras/rounds", label: "Rounds" },
  { to: "/x9p_admin_47taras/matches", label: "Matches" },
  { to: "/x9p_admin_47taras/danger-zone", label: "Danger Zone" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);

  if (url.pathname === "/x9p_admin_47taras/unlock") {
    const user = await requireSuperAdminUser(request);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.displayName,
      },
      isUnlockRoute: true,
    };
  }

  const user = await requireUnlockedSuperAdmin(request);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      displayName: user.displayName,
    },
    isUnlockRoute: false,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "lock") {
    const result = await lockSuperAdmin(request);

    return redirect("/x9p_admin_47taras/unlock", {
      headers: result.headers,
    });
  }

  return null;
}

export default function SuperAdminLayout() {
  const data = useLoaderData<typeof loader>();

  if (data.isUnlockRoute) {
    return <Outlet />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#14314b_0%,#0a1324_38%,#050816_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <aside className="hidden w-[290px] shrink-0 border-r border-white/10 bg-black/20 p-5 lg:block">
          <div className="rounded-3xl border border-cyan-400/15 bg-cyan-400/10 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-200/80">
              Super Admin
            </div>
            <div className="mt-2 text-lg font-black">x9p_admin_47taras</div>
            <div className="mt-2 text-sm text-white/70">
              {data.user.displayName || data.user.name || data.user.email}
            </div>
            <div className="text-xs text-white/45">{data.user.email}</div>
          </div>

          <nav className="mt-5 space-y-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/x9p_admin_47taras"}
                className={({ isActive }) =>
                  [
                    "block rounded-2xl px-4 py-3 text-sm font-semibold transition",
                    isActive
                      ? "bg-cyan-400 text-slate-950"
                      : "border border-white/5 bg-white/5 text-white/80 hover:bg-white/10",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Form method="post" className="mt-6">
            <input type="hidden" name="intent" value="lock" />
            <button
              type="submit"
              className="w-full rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 transition hover:bg-red-500/20"
            >
              Lock admin
            </button>
          </Form>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-white/10 bg-black/20 px-4 py-4 backdrop-blur lg:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-200/80">
                  Internal panel
                </div>
                <div className="text-xl font-black tracking-tight">
                  Super Admin Control Center
                </div>
              </div>

              <div className="flex flex-wrap gap-2 lg:hidden">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/x9p_admin_47taras"}
                    className={({ isActive }) =>
                      [
                        "rounded-full px-3 py-2 text-xs font-bold transition",
                        isActive
                          ? "bg-cyan-400 text-slate-950"
                          : "border border-white/10 bg-white/5 text-white/75",
                      ].join(" ")
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}