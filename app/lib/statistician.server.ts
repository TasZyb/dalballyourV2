import { redirect } from "react-router";
import { getCurrentUser } from "~/lib/auth.server";

export async function requireStatistician(request: Request) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  const role = String(user.role);

  if (role !== "STATISTICIAN" && role !== "ADMIN") {
    throw new Response("Not Found", { status: 404 });
  }

  return user;
}
