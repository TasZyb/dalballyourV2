import { prisma } from "~/lib/db.server";

export const GUEST_PREVIEW_GAME_SLUG = "guest-preview-league";

export const guestPreviewUser = {
  id: "guest-preview-user",
  name: "Guest Player",
  email: null,
  image: null,
  emailVerified: null,
  role: "USER",
  bio: null,
  favoriteTeamId: null,
  favoriteColor: null,
  profileBanner: null,
  displayName: "Guest Player",
  isProfilePublic: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  lastSeenAt: null,
  favoriteTeam: null,
};

export function isGuestPreviewGame(game: { slug?: string | null }) {
  return game.slug === GUEST_PREVIEW_GAME_SLUG;
}

export async function getGuestPreviewGame() {
  return prisma.game.findUnique({
    where: { slug: GUEST_PREVIEW_GAME_SLUG },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      avatarUrl: true,
      bannerUrl: true,
    },
  });
}
