import {
  createCookieSessionStorage,
  redirect,
} from "react-router";

type SessionData = {
  userId: string;
};

type SessionFlashData = {
  error: string;
};

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is not set");
}

export const sessionStorage = createCookieSessionStorage<
  SessionData,
  SessionFlashData
>({
  cookie: {
    name: "__session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;

export async function getUserSession(request: Request) {
  return getSession(request.headers.get("Cookie"));
}

export async function getUserId(request: Request) {
  const session = await getUserSession(request);
  return session.get("userId") || null;
}

export async function requireUserId(
  request: Request,
  redirectTo = "/login"
) {
  const userId = await getUserId(request);

  if (!userId) {
    throw redirect(redirectTo);
  }

  return userId;
}

export async function createUserSession({
  request,
  userId,
  redirectTo,
}: {
  request: Request;
  userId: string;
  redirectTo: string;
}) {
  const session = await getUserSession(request);
  session.set("userId", userId);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export async function logout(request: Request) {
  const session = await getUserSession(request);

  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}