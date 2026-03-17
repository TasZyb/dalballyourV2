import { redirect } from "react-router";
import { prisma } from "~/lib/db.server";
import { getUserId } from "~/lib/session.server";

export async function getCurrentUser(request: Request) {
  const userId = await getUserId(request);

  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      favoriteTeam: true,
    },
  });
}

export async function requireUser(request: Request) {
  const user = await getCurrentUser(request);

  if (!user) {
    throw redirect("/login");
  }

  return user;
}