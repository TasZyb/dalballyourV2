import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const gameId = "cmmx9kfe3000jhxlpbkhn6uud";

function getTeamName(team: { shortName: string | null; name: string }) {
  return team.shortName || team.name;
}

async function main() {
  let generalChat = await prisma.chat.findFirst({
    where: {
      gameId,
      type: "GENERAL",
      matchId: null,
    },
  });

  if (!generalChat) {
    await prisma.chat.create({
      data: {
        gameId,
        type: "GENERAL",
        title: "Загальний чат",
        description: "Спільна переписка для всієї гри",
        isPinned: true,
      },
    });
  }

  const gameMatches = await prisma.gameMatch.findMany({
    where: { gameId },
    include: {
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
          tournament: true,
        },
      },
    },
  });

  for (const gameMatch of gameMatches) {
    const existing = await prisma.chat.findFirst({
      where: {
        gameId,
        type: "MATCH",
        matchId: gameMatch.matchId,
      },
    });

    if (existing) continue;

    await prisma.chat.create({
      data: {
        gameId,
        matchId: gameMatch.matchId,
        type: "MATCH",
        title: `${getTeamName(gameMatch.match.homeTeam)} vs ${getTeamName(
          gameMatch.match.awayTeam
        )}`,
        description: gameMatch.match.tournament?.name ?? null,
      },
    });
  }

  console.log("Chats created");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());