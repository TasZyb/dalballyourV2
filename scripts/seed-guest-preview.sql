BEGIN;

INSERT INTO "User" (
  "id", "name", "email", "image", "emailVerified", "role",
  "displayName", "isProfilePublic", "createdAt", "updatedAt"
) VALUES
  ('guest_owner_taras', 'Taras Demo', 'guest.owner@example.test', null, NOW(), 'USER', 'Tarasinho', true, NOW(), NOW()),
  ('guest_user_marta', 'Marta Press', 'guest.marta@example.test', null, NOW(), 'USER', 'Marta Press', true, NOW(), NOW()),
  ('guest_user_andriy', 'Andriy VAR', 'guest.andriy@example.test', null, NOW(), 'USER', 'Andriy VAR', true, NOW(), NOW()),
  ('guest_user_oleh', 'Oleh Ultra', 'guest.oleh@example.test', null, NOW(), 'USER', 'Oleh Ultra', true, NOW(), NOW()),
  ('guest_user_ira', 'Ira Captain', 'guest.ira@example.test', null, NOW(), 'USER', 'Ira Captain', true, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "email" = EXCLUDED."email",
  "displayName" = EXCLUDED."displayName",
  "updatedAt" = NOW();

INSERT INTO "Season" (
  "id", "name", "yearLabel", "isCurrent", "startsAt", "endsAt", "createdAt", "updatedAt"
) VALUES (
  'guest_season_2026', 'Guest Preview Season', '2026', false,
  '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE SET "updatedAt" = NOW();

INSERT INTO "Tournament" (
  "id", "name", "slug", "country", "isActive", "seasonId", "type", "createdAt", "updatedAt"
) VALUES (
  'guest_tournament_cup', 'Guest Preview Cup', 'guest-preview-cup', 'Europe', true,
  'guest_season_2026', 'FRIENDLY', NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "slug" = EXCLUDED."slug",
  "updatedAt" = NOW();

INSERT INTO "Round" (
  "id", "tournamentId", "name", "slug", "order", "defaultWeight", "startsAt", "endsAt", "createdAt", "updatedAt"
) VALUES
  ('guest_round_1', 'guest_tournament_cup', 'Matchday 1', 'guest-matchday-1', 1, 1, '2026-06-01T00:00:00.000Z', '2026-06-15T00:00:00.000Z', NOW(), NOW()),
  ('guest_round_2', 'guest_tournament_cup', 'Final Sprint', 'guest-final-sprint', 2, 2, '2026-06-16T00:00:00.000Z', '2026-06-30T00:00:00.000Z', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "defaultWeight" = EXCLUDED."defaultWeight",
  "updatedAt" = NOW();

INSERT INTO "Team" (
  "id", "name", "shortName", "code", "country", "primaryColor", "secondaryColor", "createdAt", "updatedAt"
) VALUES
  ('guest_team_kyiv', 'Kyiv United', 'KYU', 'KYU', 'Ukraine', '#2563eb', '#facc15', NOW(), NOW()),
  ('guest_team_lviv', 'Lviv City', 'LVC', 'LVC', 'Ukraine', '#16a34a', '#ffffff', NOW(), NOW()),
  ('guest_team_dnipro', 'Dnipro Stars', 'DNS', 'DNS', 'Ukraine', '#0ea5e9', '#111827', NOW(), NOW()),
  ('guest_team_odesa', 'Odesa Wave', 'ODW', 'ODW', 'Ukraine', '#06b6d4', '#f97316', NOW(), NOW()),
  ('guest_team_poltava', 'Poltava 1925', 'PLT', 'PLT', 'Ukraine', '#f59e0b', '#1f2937', NOW(), NOW()),
  ('guest_team_kharkiv', 'Kharkiv North', 'KHN', 'KHN', 'Ukraine', '#dc2626', '#ffffff', NOW(), NOW()),
  ('guest_team_carp', 'Carpathian FC', 'CAR', 'CAR', 'Ukraine', '#15803d', '#f8fafc', NOW(), NOW()),
  ('guest_team_capital', 'Capital FC', 'CAP', 'CAP', 'Ukraine', '#7c3aed', '#f8fafc', NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "shortName" = EXCLUDED."shortName",
  "code" = EXCLUDED."code",
  "updatedAt" = NOW();

INSERT INTO "Match" (
  "id", "externalId", "tournamentId", "roundId", "homeTeamId", "awayTeamId",
  "venue", "stageLabel", "matchdayLabel", "startTime", "status",
  "homeScore", "awayScore", "sourceUpdatedAt", "lockedAt", "createdAt", "updatedAt"
) VALUES
  ('guest_match_finished_1', 'guest-finished-1', 'guest_tournament_cup', 'guest_round_1', 'guest_team_carp', 'guest_team_capital', 'Preview Arena', 'Group Phase', 'MD 1', '2026-06-03T19:00:00.000Z', 'FINISHED', 2, 1, NOW(), '2026-06-03T18:45:00.000Z', NOW(), NOW()),
  ('guest_match_finished_2', 'guest-finished-2', 'guest_tournament_cup', 'guest_round_1', 'guest_team_dnipro', 'guest_team_odesa', 'River Stadium', 'Group Phase', 'MD 1', '2026-06-04T19:00:00.000Z', 'FINISHED', 1, 1, NOW(), '2026-06-04T18:45:00.000Z', NOW(), NOW()),
  ('guest_match_open_1', 'guest-open-1', 'guest_tournament_cup', 'guest_round_1', 'guest_team_kyiv', 'guest_team_lviv', 'Demo Stadium', 'Group Phase', 'MD 2', '2026-06-10T19:00:00.000Z', 'SCHEDULED', null, null, null, null, NOW(), NOW()),
  ('guest_match_open_2', 'guest-open-2', 'guest_tournament_cup', 'guest_round_1', 'guest_team_poltava', 'guest_team_kharkiv', 'Central Ground', 'Group Phase', 'MD 2', '2026-06-11T18:30:00.000Z', 'SCHEDULED', null, null, null, null, NOW(), NOW()),
  ('guest_match_open_3', 'guest-open-3', 'guest_tournament_cup', 'guest_round_2', 'guest_team_capital', 'guest_team_kyiv', 'Capital Park', 'Final Sprint', 'MD 3', '2026-06-17T20:00:00.000Z', 'SCHEDULED', null, null, null, null, NOW(), NOW()),
  ('guest_match_open_4', 'guest-open-4', 'guest_tournament_cup', 'guest_round_2', 'guest_team_lviv', 'guest_team_dnipro', 'City Bowl', 'Final Sprint', 'MD 3', '2026-06-18T20:00:00.000Z', 'SCHEDULED', null, null, null, null, NOW(), NOW())
ON CONFLICT ("id") DO UPDATE SET
  "startTime" = EXCLUDED."startTime",
  "status" = EXCLUDED."status",
  "homeScore" = EXCLUDED."homeScore",
  "awayScore" = EXCLUDED."awayScore",
  "updatedAt" = NOW();

INSERT INTO "Game" (
  "id", "name", "slug", "description", "ownerId", "mode", "linkedTournamentId",
  "inviteCode", "visibility", "status", "allowJoinByCode",
  "allowMemberPredictionsEdit", "timezone", "scoringExact", "scoringOutcome",
  "scoringWrong", "defaultRoundWeight", "lockMinutesBeforeStart",
  "startsAt", "endsAt", "createdAt", "updatedAt"
) VALUES (
  'guest_preview_game', 'Preview League', 'guest-preview-league',
  'Пробна гра з вигаданими учасниками і матчами. Guest може дивитись усе та пробувати прогноз без запису в БД.',
  'guest_owner_taras', 'GROUP', 'guest_tournament_cup',
  'GUEST2026', 'PUBLIC', 'ACTIVE', false,
  true, 'Europe/Kyiv', 3, 1, 0, 1, 0,
  '2026-06-01T00:00:00.000Z', '2026-06-30T00:00:00.000Z', NOW(), NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "name" = EXCLUDED."name",
  "slug" = EXCLUDED."slug",
  "description" = EXCLUDED."description",
  "visibility" = EXCLUDED."visibility",
  "status" = EXCLUDED."status",
  "updatedAt" = NOW();

INSERT INTO "GameMember" (
  "id", "userId", "gameId", "role", "status", "joinedAt", "coinsEarned"
) VALUES
  ('guest_member_owner', 'guest_owner_taras', 'guest_preview_game', 'OWNER', 'ACTIVE', NOW(), 0),
  ('guest_member_marta', 'guest_user_marta', 'guest_preview_game', 'MEMBER', 'ACTIVE', NOW(), 0),
  ('guest_member_andriy', 'guest_user_andriy', 'guest_preview_game', 'MEMBER', 'ACTIVE', NOW(), 0),
  ('guest_member_oleh', 'guest_user_oleh', 'guest_preview_game', 'MEMBER', 'ACTIVE', NOW(), 0),
  ('guest_member_ira', 'guest_user_ira', 'guest_preview_game', 'MEMBER', 'ACTIVE', NOW(), 0)
ON CONFLICT ("userId", "gameId") DO UPDATE SET
  "role" = EXCLUDED."role",
  "status" = EXCLUDED."status";

INSERT INTO "GameMatch" (
  "id", "gameId", "matchId", "customWeight", "bonusLabel",
  "includeInLeaderboard", "isLocked", "predictionOpensAt", "predictionClosesAt",
  "createdAt", "updatedAt"
) VALUES
  ('guest_gm_finished_1', 'guest_preview_game', 'guest_match_finished_1', 1, null, true, true, null, '2026-06-03T18:45:00.000Z', NOW(), NOW()),
  ('guest_gm_finished_2', 'guest_preview_game', 'guest_match_finished_2', 1, null, true, true, null, '2026-06-04T18:45:00.000Z', NOW(), NOW()),
  ('guest_gm_open_1', 'guest_preview_game', 'guest_match_open_1', 1, 'Дербі туру', true, false, null, '2026-06-10T19:00:00.000Z', NOW(), NOW()),
  ('guest_gm_open_2', 'guest_preview_game', 'guest_match_open_2', 1, null, true, false, null, '2026-06-11T18:30:00.000Z', NOW(), NOW()),
  ('guest_gm_open_3', 'guest_preview_game', 'guest_match_open_3', 2, 'x2 матч', true, false, null, '2026-06-17T20:00:00.000Z', NOW(), NOW()),
  ('guest_gm_open_4', 'guest_preview_game', 'guest_match_open_4', 2, null, true, false, null, '2026-06-18T20:00:00.000Z', NOW(), NOW())
ON CONFLICT ("gameId", "matchId") DO UPDATE SET
  "customWeight" = EXCLUDED."customWeight",
  "bonusLabel" = EXCLUDED."bonusLabel",
  "includeInLeaderboard" = EXCLUDED."includeInLeaderboard",
  "isLocked" = EXCLUDED."isLocked",
  "predictionClosesAt" = EXCLUDED."predictionClosesAt",
  "updatedAt" = NOW();

INSERT INTO "Prediction" (
  "id", "userId", "gameId", "matchId", "predictedHome", "predictedAway",
  "pointsAwarded", "weightUsed", "weightedPointsAwarded", "multiplierUsed",
  "wasExact", "wasOutcomeOnly", "wasWrong", "submittedAt", "createdAt", "updatedAt"
) VALUES
  ('guest_pred_taras_1', 'guest_owner_taras', 'guest_preview_game', 'guest_match_finished_1', 2, 1, 3, 1, 3, 1, true, false, false, '2026-06-03T12:00:00.000Z', NOW(), NOW()),
  ('guest_pred_taras_2', 'guest_owner_taras', 'guest_preview_game', 'guest_match_finished_2', 2, 1, 0, 1, 0, 1, false, false, true, '2026-06-04T12:00:00.000Z', NOW(), NOW()),
  ('guest_pred_marta_1', 'guest_user_marta', 'guest_preview_game', 'guest_match_finished_1', 1, 0, 1, 1, 1, 1, false, true, false, '2026-06-03T12:05:00.000Z', NOW(), NOW()),
  ('guest_pred_marta_2', 'guest_user_marta', 'guest_preview_game', 'guest_match_finished_2', 1, 1, 3, 1, 3, 1, true, false, false, '2026-06-04T12:05:00.000Z', NOW(), NOW()),
  ('guest_pred_andriy_1', 'guest_user_andriy', 'guest_preview_game', 'guest_match_finished_1', 2, 0, 1, 1, 1, 1, false, true, false, '2026-06-03T12:10:00.000Z', NOW(), NOW()),
  ('guest_pred_andriy_2', 'guest_user_andriy', 'guest_preview_game', 'guest_match_finished_2', 0, 0, 1, 1, 1, 1, false, true, false, '2026-06-04T12:10:00.000Z', NOW(), NOW()),
  ('guest_pred_oleh_1', 'guest_user_oleh', 'guest_preview_game', 'guest_match_finished_1', 0, 1, 0, 1, 0, 1, false, false, true, '2026-06-03T12:15:00.000Z', NOW(), NOW()),
  ('guest_pred_oleh_2', 'guest_user_oleh', 'guest_preview_game', 'guest_match_finished_2', 1, 2, 0, 1, 0, 1, false, false, true, '2026-06-04T12:15:00.000Z', NOW(), NOW()),
  ('guest_pred_ira_1', 'guest_user_ira', 'guest_preview_game', 'guest_match_finished_1', 3, 1, 1, 1, 1, 1, false, true, false, '2026-06-03T12:20:00.000Z', NOW(), NOW()),
  ('guest_pred_ira_2', 'guest_user_ira', 'guest_preview_game', 'guest_match_finished_2', 1, 1, 3, 1, 3, 1, true, false, false, '2026-06-04T12:20:00.000Z', NOW(), NOW())
ON CONFLICT ("userId", "gameId", "matchId") DO UPDATE SET
  "predictedHome" = EXCLUDED."predictedHome",
  "predictedAway" = EXCLUDED."predictedAway",
  "pointsAwarded" = EXCLUDED."pointsAwarded",
  "weightedPointsAwarded" = EXCLUDED."weightedPointsAwarded",
  "wasExact" = EXCLUDED."wasExact",
  "wasOutcomeOnly" = EXCLUDED."wasOutcomeOnly",
  "wasWrong" = EXCLUDED."wasWrong",
  "updatedAt" = NOW();

INSERT INTO "GamePlayerCard" (
  "id", "gameId", "userId", "rating", "previousRating", "ratingDelta",
  "weightedPoints", "rawPoints", "exactHits", "correctResults", "wrongHits",
  "predictions", "finishedPicks", "currentStreak", "bestStreak",
  "accuracyRate", "exactRate", "clubTeamId", "statsHash", "computedAt",
  "createdAt", "updatedAt"
) VALUES
  ('guest_card_taras', 'guest_preview_game', 'guest_owner_taras', 74, 70, 4, 3, 3, 1, 1, 1, 2, 2, 0, 1, 50, 50, 'guest_team_kyiv', 'seed', NOW(), NOW(), NOW()),
  ('guest_card_marta', 'guest_preview_game', 'guest_user_marta', 79, 72, 7, 4, 4, 1, 2, 0, 2, 2, 2, 2, 100, 50, 'guest_team_lviv', 'seed', NOW(), NOW(), NOW()),
  ('guest_card_andriy', 'guest_preview_game', 'guest_user_andriy', 68, 66, 2, 2, 2, 0, 2, 0, 2, 2, 2, 2, 100, 0, 'guest_team_dnipro', 'seed', NOW(), NOW(), NOW()),
  ('guest_card_oleh', 'guest_preview_game', 'guest_user_oleh', 51, 55, -4, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 'guest_team_odesa', 'seed', NOW(), NOW(), NOW()),
  ('guest_card_ira', 'guest_preview_game', 'guest_user_ira', 78, 71, 7, 4, 4, 1, 2, 0, 2, 2, 2, 2, 100, 50, 'guest_team_carp', 'seed', NOW(), NOW(), NOW())
ON CONFLICT ("gameId", "userId") DO UPDATE SET
  "rating" = EXCLUDED."rating",
  "previousRating" = EXCLUDED."previousRating",
  "ratingDelta" = EXCLUDED."ratingDelta",
  "weightedPoints" = EXCLUDED."weightedPoints",
  "rawPoints" = EXCLUDED."rawPoints",
  "exactHits" = EXCLUDED."exactHits",
  "correctResults" = EXCLUDED."correctResults",
  "wrongHits" = EXCLUDED."wrongHits",
  "predictions" = EXCLUDED."predictions",
  "finishedPicks" = EXCLUDED."finishedPicks",
  "currentStreak" = EXCLUDED."currentStreak",
  "bestStreak" = EXCLUDED."bestStreak",
  "accuracyRate" = EXCLUDED."accuracyRate",
  "exactRate" = EXCLUDED."exactRate",
  "clubTeamId" = EXCLUDED."clubTeamId",
  "statsHash" = EXCLUDED."statsHash",
  "computedAt" = NOW(),
  "updatedAt" = NOW();

COMMIT;
