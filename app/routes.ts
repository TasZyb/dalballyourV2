import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/lobby.tsx"),

  route("login", "routes/login.tsx"),
  route("logout", "routes/logout.tsx"),

  route("create", "routes/create/layout.tsx", [
    index("routes/create/index.tsx"),
    route("league", "routes/create/league.tsx"),
    route("career", "routes/create/career.tsx"),
  ]),

  route("join", "routes/join.tsx"),

  route("me", "routes/app/me.tsx"),
  route("me/edit", "routes/app/me-edit.tsx"),
  route("me/history", "routes/app/me-history.tsx"),
  route("me/stats", "routes/app/me-stats.tsx"),

  /**
   * GROUP / FRIEND LEAGUES
   */
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


  route("career/:gameId", "routes/career/career-layout.tsx", [
    index("routes/career/home.tsx"),

    route("matches", "routes/career/matches.tsx"),
    route("matches/:matchId", "routes/career/match-details.tsx"),

    route("predict/:matchId", "routes/career/predict.tsx"),
    route("predict/:matchId/lineup", "routes/career/predict-lineup.tsx"),
    route("predict/:matchId/scorers", "routes/career/predict-scorers.tsx"),
    route("predict/:matchId/analysis", "routes/career/predict-analysis.tsx"),

    route("club", "routes/career/club.tsx"),
    route("club/squad", "routes/career/club-squad.tsx"),
    route("club/players/:playerId", "routes/career/player-details.tsx"),

    route("calendar", "routes/career/calendar.tsx"),
    route("history", "routes/career/history.tsx"),
    route("stats", "routes/career/stats.tsx"),
    route("achievements", "routes/career/achievements.tsx"),

    route("settings", "routes/career/settings.tsx"),
  ]),
  route("x9p_admin_47taras/unlock", "routes/super-admin/unlock.tsx"),
  route("x9p_admin_47taras", "routes/super-admin/layout.tsx", [
    
    index("routes/super-admin/index.tsx"),
    route("games", "routes/super-admin/games.tsx"),
    route("games/:gameId", "routes/super-admin/game-details.tsx"),
    route("predictions", "routes/super-admin/predictions.tsx"),
    route("players", "routes/super-admin/players.tsx"),
    route("users", "routes/super-admin/users.tsx"),
    route("tournaments", "routes/super-admin/tournaments.tsx"),
    route("rounds", "routes/super-admin/rounds.tsx"),
    route("matches", "routes/super-admin/matches.tsx"),
    route("danger-zone", "routes/super-admin/danger-zone.tsx"),
  ]),

  route("admin_taras", "routes/admin-predictions.tsx"),
] satisfies RouteConfig;