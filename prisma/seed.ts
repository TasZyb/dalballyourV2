import {
  PrismaClient,
  GameMemberRole,
  GameStatus,
  GameVisibility,
  MatchStatus,
  MembershipStatus,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

function getBasePoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number
) {
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return 3;
  }

  const predictedDiff = predictedHome - predictedAway;
  const actualDiff = actualHome - actualAway;

  const predictedOutcome =
    predictedDiff > 0 ? "HOME" : predictedDiff < 0 ? "AWAY" : "DRAW";

  const actualOutcome =
    actualDiff > 0 ? "HOME" : actualDiff < 0 ? "AWAY" : "DRAW";

  return predictedOutcome === actualOutcome ? 1 : 0;
}

async function main() {
  console.log("🌱 Seeding database...");

  await prisma.prediction.deleteMany();
  await prisma.gameMatch.deleteMany();
  await prisma.gameInvite.deleteMany();
  await prisma.gameMember.deleteMany();
  await prisma.game.deleteMany();
  await prisma.match.deleteMany();
  await prisma.round.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.season.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();

  const season = await prisma.season.create({
    data: {
      name: "UEFA Season 2025/26",
      yearLabel: "2025/26",
      isCurrent: true,
      startsAt: new Date("2025-08-01T00:00:00.000Z"),
      endsAt: new Date("2026-06-30T23:59:59.000Z"),
    },
  });

  const tournament = await prisma.tournament.create({
    data: {
      name: "Champions League",
      slug: "champions-league",
      country: "Europe",
      isActive: true,
      seasonId: season.id,
    },
  });

  /*
   * ONLY ROUNDS YOU NEED
   */
  const playoffRound = await prisma.round.create({
    data: {
      tournamentId: tournament.id,
      name: "Knockout Phase Play-offs",
      slug: "knockout-phase-playoffs",
      order: 1,
      defaultWeight: 2,
      startsAt: new Date("2026-02-17T00:00:00.000Z"),
      endsAt: new Date("2026-02-25T23:59:59.000Z"),
    },
  });

  const roundOf16 = await prisma.round.create({
    data: {
      tournamentId: tournament.id,
      name: "Round of 16",
      slug: "round-of-16",
      order: 2,
      defaultWeight: 3,
      startsAt: new Date("2026-03-10T00:00:00.000Z"),
      endsAt: new Date("2026-03-18T23:59:59.000Z"),
    },
  });

  /*
   * ALL 36 TEAMS FROM THE 2025/26 LEAGUE PHASE
   */
  const teamsData = [
    { name: "Ajax", shortName: "AJA", code: "AJA", country: "Netherlands" },
    { name: "Arsenal", shortName: "ARS", code: "ARS", country: "England" },
    { name: "Atalanta", shortName: "ATA", code: "ATA", country: "Italy" },
    { name: "Athletic Club", shortName: "ATH", code: "ATH", country: "Spain" },
    { name: "Atletico Madrid", shortName: "ATM", code: "ATM", country: "Spain" },
    { name: "Borussia Dortmund", shortName: "DOR", code: "DOR", country: "Germany" },
    { name: "Barcelona", shortName: "BAR", code: "BAR", country: "Spain" },
    { name: "Bayern Munich", shortName: "BAY", code: "BAY", country: "Germany" },
    { name: "Benfica", shortName: "BEN", code: "BEN", country: "Portugal" },
    { name: "Bodø/Glimt", shortName: "BOD", code: "BOD", country: "Norway" },
    { name: "Chelsea", shortName: "CHE", code: "CHE", country: "England" },
    { name: "Club Brugge", shortName: "BRU", code: "BRU", country: "Belgium" },
    { name: "Copenhagen", shortName: "COP", code: "COP", country: "Denmark" },
    { name: "Frankfurt", shortName: "FRA", code: "FRA", country: "Germany" },
    { name: "Galatasaray", shortName: "GAL", code: "GAL", country: "Turkey" },
    { name: "Inter", shortName: "INT", code: "INT", country: "Italy" },
    { name: "Juventus", shortName: "JUV", code: "JUV", country: "Italy" },
    { name: "Kairat Almaty", shortName: "KAI", code: "KAI", country: "Kazakhstan" },
    { name: "Leverkusen", shortName: "LEV", code: "LEV", country: "Germany" },
    { name: "Liverpool", shortName: "LIV", code: "LIV", country: "England" },
    { name: "Manchester City", shortName: "MCI", code: "MCI", country: "England" },
    { name: "Marseille", shortName: "MAR", code: "MAR", country: "France" },
    { name: "Monaco", shortName: "MON", code: "MON", country: "France" },
    { name: "Napoli", shortName: "NAP", code: "NAP", country: "Italy" },
    { name: "Newcastle", shortName: "NEW", code: "NEW", country: "England" },
    { name: "Olympiacos", shortName: "OLY", code: "OLY", country: "Greece" },
    { name: "Pafos", shortName: "PAF", code: "PAF", country: "Cyprus" },
    { name: "Paris Saint-Germain", shortName: "PSG", code: "PSG", country: "France" },
    { name: "PSV", shortName: "PSV", code: "PSV", country: "Netherlands" },
    { name: "Qarabag", shortName: "QAR", code: "QAR", country: "Azerbaijan" },
    { name: "Real Madrid", shortName: "RMA", code: "RMA", country: "Spain" },
    { name: "Slavia Praha", shortName: "SLA", code: "SLA", country: "Czech Republic" },
    { name: "Sporting CP", shortName: "SCP", code: "SCP", country: "Portugal" },
    { name: "Tottenham", shortName: "TOT", code: "TOT", country: "England" },
    { name: "Union SG", shortName: "USG", code: "USG", country: "Belgium" },
    { name: "Villarreal", shortName: "VIL", code: "VIL", country: "Spain" },
  ];

  const teams = await Promise.all(
    teamsData.map((team) => prisma.team.create({ data: team }))
  );

  const teamByCode = Object.fromEntries(teams.map((team) => [team.code, team]));

  const roundBySlug = {
    "knockout-phase-playoffs": playoffRound,
    "round-of-16": roundOf16,
  };

  /*
   * ONLY PLAY-OFFS + ROUND OF 16
   */
  const matchSeeds = [
    // Knockout phase play-offs - first legs
    {
      externalId: "ucl-po-leg1-gal-juv",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "GAL",
      awayCode: "JUV",
      venue: "Istanbul",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 1st Leg",
      startTime: "2026-02-17T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 5,
      awayScore: 2,
      sourceUpdatedAt: "2026-02-17T22:00:00.000Z",
      lockedAt: "2026-02-17T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg1-mon-psg",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "MON",
      awayCode: "PSG",
      venue: "Monaco",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 1st Leg",
      startTime: "2026-02-17T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 2,
      awayScore: 3,
      sourceUpdatedAt: "2026-02-17T22:00:00.000Z",
      lockedAt: "2026-02-17T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg1-dor-ata",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "DOR",
      awayCode: "ATA",
      venue: "Dortmund",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 1st Leg",
      startTime: "2026-02-17T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 2,
      awayScore: 0,
      sourceUpdatedAt: "2026-02-17T22:00:00.000Z",
      lockedAt: "2026-02-17T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg1-ben-rma",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "BEN",
      awayCode: "RMA",
      venue: "Lisbon",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 1st Leg",
      startTime: "2026-02-17T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 0,
      awayScore: 1,
      sourceUpdatedAt: "2026-02-17T22:00:00.000Z",
      lockedAt: "2026-02-17T19:45:00.000Z",
    },

    {
      externalId: "ucl-po-leg1-qar-new",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "QAR",
      awayCode: "NEW",
      venue: "Baku",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 1st Leg",
      startTime: "2026-02-18T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 1,
      awayScore: 6,
      sourceUpdatedAt: "2026-02-18T22:00:00.000Z",
      lockedAt: "2026-02-18T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg1-bru-atm",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "BRU",
      awayCode: "ATM",
      venue: "Bruges",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 1st Leg",
      startTime: "2026-02-18T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 3,
      awayScore: 3,
      sourceUpdatedAt: "2026-02-18T22:00:00.000Z",
      lockedAt: "2026-02-18T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg1-bod-int",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "BOD",
      awayCode: "INT",
      venue: "Bodø",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 1st Leg",
      startTime: "2026-02-18T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 3,
      awayScore: 1,
      sourceUpdatedAt: "2026-02-18T22:00:00.000Z",
      lockedAt: "2026-02-18T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg1-oly-lev",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "OLY",
      awayCode: "LEV",
      venue: "Piraeus",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 1st Leg",
      startTime: "2026-02-18T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 0,
      awayScore: 2,
      sourceUpdatedAt: "2026-02-18T22:00:00.000Z",
      lockedAt: "2026-02-18T19:45:00.000Z",
    },

    // Knockout phase play-offs - second legs
    {
      externalId: "ucl-po-leg2-atm-bru",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "ATM",
      awayCode: "BRU",
      venue: "Madrid",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 2nd Leg",
      startTime: "2026-02-24T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 4,
      awayScore: 1,
      sourceUpdatedAt: "2026-02-24T22:00:00.000Z",
      lockedAt: "2026-02-24T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg2-lev-oly",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "LEV",
      awayCode: "OLY",
      venue: "Leverkusen",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 2nd Leg",
      startTime: "2026-02-24T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 0,
      awayScore: 0,
      sourceUpdatedAt: "2026-02-24T22:00:00.000Z",
      lockedAt: "2026-02-24T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg2-int-bod",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "INT",
      awayCode: "BOD",
      venue: "Milan",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 2nd Leg",
      startTime: "2026-02-24T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 1,
      awayScore: 2,
      sourceUpdatedAt: "2026-02-24T22:00:00.000Z",
      lockedAt: "2026-02-24T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg2-new-qar",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "NEW",
      awayCode: "QAR",
      venue: "Newcastle",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 2nd Leg",
      startTime: "2026-02-24T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 3,
      awayScore: 2,
      sourceUpdatedAt: "2026-02-24T22:00:00.000Z",
      lockedAt: "2026-02-24T19:45:00.000Z",
    },

    {
      externalId: "ucl-po-leg2-ata-dor",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "ATA",
      awayCode: "DOR",
      venue: "Bergamo",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 2nd Leg",
      startTime: "2026-02-25T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 4,
      awayScore: 1,
      sourceUpdatedAt: "2026-02-25T22:00:00.000Z",
      lockedAt: "2026-02-25T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg2-juv-gal",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "JUV",
      awayCode: "GAL",
      venue: "Turin",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 2nd Leg",
      startTime: "2026-02-25T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 3,
      awayScore: 2,
      sourceUpdatedAt: "2026-02-25T22:30:00.000Z",
      lockedAt: "2026-02-25T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg2-psg-mon",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "PSG",
      awayCode: "MON",
      venue: "Paris",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 2nd Leg",
      startTime: "2026-02-25T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 2,
      awayScore: 2,
      sourceUpdatedAt: "2026-02-25T22:00:00.000Z",
      lockedAt: "2026-02-25T19:45:00.000Z",
    },
    {
      externalId: "ucl-po-leg2-rma-ben",
      roundSlug: "knockout-phase-playoffs",
      homeCode: "RMA",
      awayCode: "BEN",
      venue: "Madrid",
      stageLabel: "Knockout Phase Play-offs",
      matchdayLabel: "PO 2nd Leg",
      startTime: "2026-02-25T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 2,
      awayScore: 1,
      sourceUpdatedAt: "2026-02-25T22:00:00.000Z",
      lockedAt: "2026-02-25T19:45:00.000Z",
    },

    // Round of 16 - first legs
    {
      externalId: "ucl-r16-leg1-gal-liv",
      roundSlug: "round-of-16",
      homeCode: "GAL",
      awayCode: "LIV",
      venue: "Istanbul",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 1st Leg",
      startTime: "2026-03-10T17:45:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 1,
      awayScore: 0,
      sourceUpdatedAt: "2026-03-10T19:45:00.000Z",
      lockedAt: "2026-03-10T17:30:00.000Z",
    },
    {
      externalId: "ucl-r16-leg1-ata-bay",
      roundSlug: "round-of-16",
      homeCode: "ATA",
      awayCode: "BAY",
      venue: "Bergamo",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 1st Leg",
      startTime: "2026-03-10T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 1,
      awayScore: 6,
      sourceUpdatedAt: "2026-03-10T22:00:00.000Z",
      lockedAt: "2026-03-10T19:45:00.000Z",
    },
    {
      externalId: "ucl-r16-leg1-atm-tot",
      roundSlug: "round-of-16",
      homeCode: "ATM",
      awayCode: "TOT",
      venue: "Madrid",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 1st Leg",
      startTime: "2026-03-10T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 5,
      awayScore: 2,
      sourceUpdatedAt: "2026-03-10T22:00:00.000Z",
      lockedAt: "2026-03-10T19:45:00.000Z",
    },
    {
      externalId: "ucl-r16-leg1-new-bar",
      roundSlug: "round-of-16",
      homeCode: "NEW",
      awayCode: "BAR",
      venue: "Newcastle",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 1st Leg",
      startTime: "2026-03-10T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 1,
      awayScore: 1,
      sourceUpdatedAt: "2026-03-10T22:00:00.000Z",
      lockedAt: "2026-03-10T19:45:00.000Z",
    },

    {
      externalId: "ucl-r16-leg1-lev-ars",
      roundSlug: "round-of-16",
      homeCode: "LEV",
      awayCode: "ARS",
      venue: "Leverkusen",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 1st Leg",
      startTime: "2026-03-11T17:45:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 1,
      awayScore: 1,
      sourceUpdatedAt: "2026-03-11T19:45:00.000Z",
      lockedAt: "2026-03-11T17:30:00.000Z",
    },
    {
      externalId: "ucl-r16-leg1-bod-scp",
      roundSlug: "round-of-16",
      homeCode: "BOD",
      awayCode: "SCP",
      venue: "Bodø",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 1st Leg",
      startTime: "2026-03-11T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 3,
      awayScore: 0,
      sourceUpdatedAt: "2026-03-11T22:00:00.000Z",
      lockedAt: "2026-03-11T19:45:00.000Z",
    },
    {
      externalId: "ucl-r16-leg1-psg-che",
      roundSlug: "round-of-16",
      homeCode: "PSG",
      awayCode: "CHE",
      venue: "Paris",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 1st Leg",
      startTime: "2026-03-11T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 5,
      awayScore: 2,
      sourceUpdatedAt: "2026-03-11T22:00:00.000Z",
      lockedAt: "2026-03-11T19:45:00.000Z",
    },
    {
      externalId: "ucl-r16-leg1-rma-mci",
      roundSlug: "round-of-16",
      homeCode: "RMA",
      awayCode: "MCI",
      venue: "Madrid",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 1st Leg",
      startTime: "2026-03-11T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 3,
      awayScore: 0,
      sourceUpdatedAt: "2026-03-11T22:00:00.000Z",
      lockedAt: "2026-03-11T19:45:00.000Z",
    },

    // Round of 16 - second legs
    {
      externalId: "ucl-r16-leg2-scp-bod",
      roundSlug: "round-of-16",
      homeCode: "SCP",
      awayCode: "BOD",
      venue: "Lisbon",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 2nd Leg",
      startTime: "2026-03-17T17:45:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 5,
      awayScore: 0,
      sourceUpdatedAt: "2026-03-17T20:00:00.000Z",
      lockedAt: "2026-03-17T17:30:00.000Z",
    },
    {
      externalId: "ucl-r16-leg2-ars-lev",
      roundSlug: "round-of-16",
      homeCode: "ARS",
      awayCode: "LEV",
      venue: "London",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 2nd Leg",
      startTime: "2026-03-17T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 2,
      awayScore: 0,
      sourceUpdatedAt: "2026-03-17T22:00:00.000Z",
      lockedAt: "2026-03-17T19:45:00.000Z",
    },
    {
      externalId: "ucl-r16-leg2-che-psg",
      roundSlug: "round-of-16",
      homeCode: "CHE",
      awayCode: "PSG",
      venue: "London",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 2nd Leg",
      startTime: "2026-03-17T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 0,
      awayScore: 3,
      sourceUpdatedAt: "2026-03-17T22:00:00.000Z",
      lockedAt: "2026-03-17T19:45:00.000Z",
    },
    {
      externalId: "ucl-r16-leg2-mci-rma",
      roundSlug: "round-of-16",
      homeCode: "MCI",
      awayCode: "RMA",
      venue: "Manchester",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 2nd Leg",
      startTime: "2026-03-17T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 1,
      awayScore: 2,
      sourceUpdatedAt: "2026-03-17T22:00:00.000Z",
      lockedAt: "2026-03-17T19:45:00.000Z",
    },

    {
      externalId: "ucl-r16-leg2-bar-new",
      roundSlug: "round-of-16",
      homeCode: "BAR",
      awayCode: "NEW",
      venue: "Barcelona",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 2nd Leg",
      startTime: "2026-03-18T17:45:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 7,
      awayScore: 2,
      sourceUpdatedAt: "2026-03-18T20:00:00.000Z",
      lockedAt: "2026-03-18T17:30:00.000Z",
    },
    {
      externalId: "ucl-r16-leg2-bay-ata",
      roundSlug: "round-of-16",
      homeCode: "BAY",
      awayCode: "ATA",
      venue: "Munich",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 2nd Leg",
      startTime: "2026-03-18T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 4,
      awayScore: 1,
      sourceUpdatedAt: "2026-03-18T22:00:00.000Z",
      lockedAt: "2026-03-18T19:45:00.000Z",
    },
    {
      externalId: "ucl-r16-leg2-liv-gal",
      roundSlug: "round-of-16",
      homeCode: "LIV",
      awayCode: "GAL",
      venue: "Liverpool",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 2nd Leg",
      startTime: "2026-03-18T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 4,
      awayScore: 0,
      sourceUpdatedAt: "2026-03-18T22:00:00.000Z",
      lockedAt: "2026-03-18T19:45:00.000Z",
    },
    {
      externalId: "ucl-r16-leg2-tot-atm",
      roundSlug: "round-of-16",
      homeCode: "TOT",
      awayCode: "ATM",
      venue: "London",
      stageLabel: "Round of 16",
      matchdayLabel: "R16 2nd Leg",
      startTime: "2026-03-18T20:00:00.000Z",
      status: MatchStatus.FINISHED,
      homeScore: 3,
      awayScore: 2,
      sourceUpdatedAt: "2026-03-18T22:00:00.000Z",
      lockedAt: "2026-03-18T19:45:00.000Z",
    },
  ];

  const matches = await Promise.all(
    matchSeeds.map((match) =>
      prisma.match.create({
        data: {
          externalId: match.externalId,
          tournamentId: tournament.id,
          roundId: roundBySlug[match.roundSlug as keyof typeof roundBySlug].id,
          homeTeamId: teamByCode[match.homeCode].id,
          awayTeamId: teamByCode[match.awayCode].id,
          venue: match.venue,
          stageLabel: match.stageLabel,
          matchdayLabel: match.matchdayLabel,
          startTime: new Date(match.startTime),
          status: match.status,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          sourceUpdatedAt: new Date(match.sourceUpdatedAt),
          lockedAt: new Date(match.lockedAt),
        },
      })
    )
  );

  /*
   * ONLY ONE USER
   */
  const user = await prisma.user.create({
    data: {
      email: "taras@example.com",
      name: "Taras",
      displayName: "Taras",
      role: UserRole.USER,
    },
  });

  const game = await prisma.game.create({
    data: {
      name: "Champions League Friends League",
      slug: "champions-league-friends-league",
      inviteCode: "UCL2026",
      ownerId: user.id,
      status: GameStatus.ACTIVE,
      visibility: GameVisibility.PRIVATE,
    },
  });

  await prisma.gameMember.create({
    data: {
      gameId: game.id,
      userId: user.id,
      role: GameMemberRole.OWNER,
      status: MembershipStatus.ACTIVE,
    },
  });

  const gameMatches = await Promise.all(
    matches.map((match) =>
      prisma.gameMatch.create({
        data: {
          gameId: game.id,
          matchId: match.id,
          customWeight: match.roundId === playoffRound.id ? 2 : 3,
          includeInLeaderboard: true,
          isLocked: match.status === MatchStatus.FINISHED,
          predictionOpensAt: new Date(
            new Date(match.startTime).getTime() - 1000 * 60 * 60 * 24
          ),
          predictionClosesAt: new Date(
            new Date(match.startTime).getTime() - 1000 * 60 * 15
          ),
        },
      })
    )
  );

  /*
   * ONE USER PREDICTIONS
   */
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const gameMatch = gameMatches.find((gm) => gm.matchId === match.id);
    if (!gameMatch) continue;

    // Можеш замінити на будь-яку логіку генерації
    const predictedHome = 1;
    const predictedAway = 1;

    let pointsAwarded = 0;
    let wasExact = false;
    let wasOutcomeOnly = false;
    let wasWrong = false;
    const weightUsed = gameMatch.customWeight ?? 1;
    let weightedPointsAwarded = 0;
    let scoreCalculatedAt: Date | null = null;
    let lockedAt: Date | null = null;

    if (
      match.status === MatchStatus.FINISHED &&
      match.homeScore !== null &&
      match.awayScore !== null
    ) {
      pointsAwarded = getBasePoints(
        predictedHome,
        predictedAway,
        match.homeScore,
        match.awayScore
      );

      wasExact = pointsAwarded === 3;
      wasOutcomeOnly = pointsAwarded === 1;
      wasWrong = pointsAwarded === 0;
      weightedPointsAwarded = pointsAwarded * weightUsed;
      scoreCalculatedAt = new Date();
      lockedAt =
        match.lockedAt ??
        new Date(new Date(match.startTime).getTime() - 1000 * 60 * 15);
    }

    await prisma.prediction.create({
      data: {
        userId: user.id,
        gameId: game.id,
        matchId: match.id,
        predictedHome,
        predictedAway,
        pointsAwarded,
        weightUsed,
        weightedPointsAwarded,
        multiplierUsed: 1,
        wasExact,
        wasOutcomeOnly,
        wasWrong,
        submittedAt: new Date(
          new Date(match.startTime).getTime() - 1000 * 60 * 60
        ),
        lockedAt,
        scoreCalculatedAt,
      },
    });
  }

  console.log("✅ Seed finished successfully");
  console.log(`Season: ${season.name}`);
  console.log(`Tournament: ${tournament.name}`);
  console.log(`Game: ${game.name}`);
  console.log(`Invite code: ${game.inviteCode}`);
  console.log(`Teams seeded: ${teams.length}`);
  console.log(`Matches seeded: ${matches.length}`);
}

main()
  .catch((error) => {
    console.error("❌ Seed failed");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });