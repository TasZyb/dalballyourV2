import { createCookie } from "react-router";

export type AppTheme = "ucl" | "uel" | "uecl" | "dark" | "light";

export const themeCookie = createCookie("theme", {
  path: "/",
  sameSite: "lax",
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
});

export function isAppTheme(value: unknown): value is AppTheme {
  return (
    value === "ucl" ||
    value === "uel" ||
    value === "uecl" ||
    value === "dark" ||
    value === "light"
  );
}

export async function getThemeFromRequest(request: Request): Promise<AppTheme> {
  const cookieHeader = request.headers.get("Cookie");
  const theme = await themeCookie.parse(cookieHeader);

  return isAppTheme(theme) ? theme : "ucl";
}