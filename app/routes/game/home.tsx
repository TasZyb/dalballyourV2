import { useLoaderData, data, type LoaderFunctionArgs } from "react-router"
import { prisma } from "~/lib/db.server"
import { Form } from "react-router";
import Leaderboard from "~/components/Leaderboard"
import UpcomingMatches from "~/components/UpcomingMatches"

type LeaderboardRow = {
  id: string;
  name: string;
  rawPoints: number;
  weightedPoints: number;
  exactHits: number;
  correctResults: number;
  predictionsCount: number;
};

export async function loader({ params }: LoaderFunctionArgs) {
  const gameId = params.gameId;

  if (!gameId) {
    throw new Response("Game not found", { status: 404 });
  }

  const leaderboard = await prisma.$queryRaw<LeaderboardRow[]>`
    SELECT
      u.id as id,
      COALESCE(u."displayName", u."name", u."email", 'Гравець') as name,
      COALESCE(SUM(p."pointsAwarded"), 0) as "rawPoints",
      COALESCE(SUM(p."weightedPointsAwarded"), 0) as "weightedPoints",
      COALESCE(SUM(CASE WHEN p."wasExact" = true THEN 1 ELSE 0 END), 0) as "exactHits",
      COALESCE(SUM(CASE WHEN p."wasExact" = true OR p."wasOutcomeOnly" = true THEN 1 ELSE 0 END), 0) as "correctResults",
      COALESCE(COUNT(p.id), 0) as "predictionsCount"
    FROM "GameMember" gm
    JOIN "User" u
      ON u.id = gm."userId"
    LEFT JOIN "Prediction" p
      ON p."userId" = gm."userId"
     AND p."gameId" = gm."gameId"
    WHERE gm."gameId" = ${gameId}
      AND gm."status" = 'ACTIVE'
    GROUP BY u.id, u."displayName", u."name", u."email"
    ORDER BY
      "weightedPoints" DESC,
      "exactHits" DESC,
      "correctResults" DESC,
      name ASC
  `;

  const rankedLeaderboard = leaderboard.map((player, index) => ({
    ...player,
    rank: index + 1,
  }));

  return data({
    leaderboard: rankedLeaderboard,
  });
}
export default function GameHomePage() {

  const { leaderboard, upcomingMatches } = useLoaderData<typeof loader>()

  return (

    <div className="space-y-10">

      <Leaderboard players={leaderboard} />

      <UpcomingMatches matches={upcomingMatches} />

    </div>

  )

}