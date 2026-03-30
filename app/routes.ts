import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/lobby.tsx"),

  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),

  route("create", "routes/create.tsx"),

  route("me", "routes/app/me.tsx"),
  route("me/edit", "routes/app/me-edit.tsx"),
  route("me/history", "routes/app/me-history.tsx"),
  route("me/stats", "routes/app/me-stats.tsx"),

  route("games/:gameId", "routes/game-layout.tsx", [
    index("routes/game/home.tsx"),
    route("predict", "routes/game/predict.tsx"),
    route("predict-advanced/:matchId", "routes/game/predict-advanced.tsx"),
    route("leaderboard", "routes/game/leaderboard.tsx"),
    route("matches", "routes/game/matches.tsx"),
    route("matches/:matchId", "routes/game/match-details.tsx"),
    route("teams/:teamId", "routes/game/team-details.tsx"),
    route("players/:playerId", "routes/game/player-details.tsx"),
    route("members", "routes/game/members.tsx"),
    route("settings", "routes/game/settings.tsx"),
    route("admin", "routes/game/admin.tsx"),
  ]),
  
  route("join", "routes/join.tsx"),
  route("admin_taras", "routes/admin-predictions.tsx"),
] satisfies RouteConfig;