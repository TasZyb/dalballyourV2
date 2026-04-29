// app/lib/super-admin.server.ts
import {
  createCookieSessionStorage,
  redirect,
} from "react-router";
import { getCurrentUser } from "~/lib/auth.server";

const SUPER_ADMIN_EMAIL = "taszyb9@gmail.com";
const SUPER_ADMIN_PASSWORD = "1234";

const storage = createCookieSessionStorage({
  cookie: {
    name: "__super_admin_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "dev-super-admin-secret"],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, // 12 годин
  },
});

export async function getSuperAdminSession(request: Request) {
  return storage.getSession(request.headers.get("Cookie"));
}

export async function commitSuperAdminSession(session: Awaited<ReturnType<typeof getSuperAdminSession>>) {
  return storage.commitSession(session);
}

export async function destroySuperAdminSession(session: Awaited<ReturnType<typeof getSuperAdminSession>>) {
  return storage.destroySession(session);
}

export async function requireSuperAdminUser(request: Request) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  if (user.email !== SUPER_ADMIN_EMAIL) {
    throw new Response("Not Found", { status: 404 });
  }

  return user;
}

export async function requireUnlockedSuperAdmin(request: Request) {
  const user = await requireSuperAdminUser(request);
  const session = await getSuperAdminSession(request);
  const unlocked = session.get("superAdminUnlocked");

  if (!unlocked) {
    throw redirect("/x9p_admin_47taras/unlock");
  }

  return user;
}

export async function unlockSuperAdmin(request: Request, password: string) {
  const user = await requireSuperAdminUser(request);

  if (password !== SUPER_ADMIN_PASSWORD) {
    return { ok: false as const, user };
  }

  const session = await getSuperAdminSession(request);
  session.set("superAdminUnlocked", true);

  return {
    ok: true as const,
    user,
    headers: {
      "Set-Cookie": await commitSuperAdminSession(session),
    },
  };
}

export async function lockSuperAdmin(request: Request) {
  const session = await getSuperAdminSession(request);

  return {
    headers: {
      "Set-Cookie": await destroySuperAdminSession(session),
    },
  };
}