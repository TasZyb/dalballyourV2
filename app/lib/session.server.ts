import {
  createCookie,
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
    name: "__dallballyour_session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
  },
});

export const { getSession, commitSession, destroySession } = sessionStorage;

const devAutoLoginDisabledCookie = createCookie("__dallballyour_dev_auto_login_disabled", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 30,
  secure: process.env.NODE_ENV === "production",
});

export async function getUserSession(request: Request) {
  return getSession(request.headers.get("Cookie"));
}

export async function getUserId(request: Request) {
  const session = await getUserSession(request);
  const sessionUserId = session.get("userId");

  if (sessionUserId) {
    return sessionUserId;
  }

  if (process.env.NODE_ENV !== "production") {
    const isAutoLoginDisabled = await devAutoLoginDisabledCookie.parse(
      request.headers.get("Cookie")
    );

    if (isAutoLoginDisabled) {
      return null;
    }

    return process.env.DEV_AUTO_LOGIN_USER_ID || null;
  }

  return null;
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
  const headers = new Headers();

  headers.append("Set-Cookie", await commitSession(session));

  if (process.env.NODE_ENV !== "production") {
    headers.append(
      "Set-Cookie",
      await devAutoLoginDisabledCookie.serialize("", { maxAge: 0 })
    );
  }

  return redirect(redirectTo, {
    headers,
  });
}

export async function logout(request: Request) {
  const session = await getUserSession(request);
  const headers = new Headers();

  headers.append("Set-Cookie", await destroySession(session));

  if (process.env.NODE_ENV !== "production") {
    headers.append(
      "Set-Cookie",
      await devAutoLoginDisabledCookie.serialize("1")
    );
  }

  return redirect("/login", {
    headers,
  });
}
