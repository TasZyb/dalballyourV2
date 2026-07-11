import { MatchStatus, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_URL =
  "https://www.fourfourtwo.com/competition/all-of-the-world-cup-scores-so-far-at-the-2026-tournament";
const WIKIPEDIA_SOURCE_URL = "https://en.wikipedia.org/wiki/2026_FIFA_World_Cup";
const TOURNAMENT_SLUG = "fifa-world-cup-2026";

const teamCodes: Record<string, string> = {
  Algeria: "ALG",
  Argentina: "ARG",
  Australia: "AUS",
  Austria: "AUT",
  Belgium: "BEL",
  "Bosnia and Herzegovina": "BIH",
  Brazil: "BRA",
  Canada: "CAN",
  "Cape Verde": "CPV",
  Colombia: "COL",
  Croatia: "CRO",
  "Curaçao": "CUW",
  "Czech Republic": "CZE",
  "DR Congo": "COD",
  Ecuador: "ECU",
  Egypt: "EGY",
  England: "ENG",
  France: "FRA",
  Germany: "GER",
  Ghana: "GHA",
  Haiti: "HAI",
  Iran: "IRN",
  Iraq: "IRQ",
  "Ivory Coast": "CIV",
  Japan: "JPN",
  Jordan: "JOR",
  Mexico: "MEX",
  Morocco: "MAR",
  Netherlands: "NED",
  "New Zealand": "NZL",
  Norway: "NOR",
  Panama: "PAN",
  Paraguay: "PAR",
  Portugal: "POR",
  Qatar: "QAT",
  "Saudi Arabia": "KSA",
  Scotland: "SCO",
  Senegal: "SEN",
  "South Africa": "RSA",
  "South Korea": "KOR",
  Spain: "ESP",
  Sweden: "SWE",
  Switzerland: "SUI",
  Tunisia: "TUN",
  Turkey: "TUR",
  "United States": "USA",
  Uruguay: "URU",
  Uzbekistan: "UZB",
};

type ParsedMatch = {
  roundName: string;
  roundOrder: number;
  stageLabel: "Group Stage" | "Knockout Stage";
  home: string;
  away: string;
  venue: string | null;
  startTime: Date;
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  penaltyHome?: number | null;
  penaltyAway?: number | null;
  matchdayLabel: string;
  externalId: string;
};

function cleanHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<sup[\s\S]*?<\/sup>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .replace(/\s+,/g, ",")
    .trim();
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseStartTime(date: string, timeText: string, timezone: string) {
  const timeMatch = timeText.match(/(\d{1,2}):(\d{2})\s*([ap])\.m\./i);
  const zoneMatch = timezone.replace("−", "-").match(/([+-])(\d{2}):?(\d{2})?/);

  if (!timeMatch || !zoneMatch) {
    throw new Error(`Cannot parse match time: ${date} ${timeText} ${timezone}`);
  }

  let hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const meridiem = timeMatch[3].toLowerCase();

  if (meridiem === "p" && hours !== 12) hours += 12;
  if (meridiem === "a" && hours === 12) hours = 0;

  const sign = zoneMatch[1] === "+" ? 1 : -1;
  const offsetHours = Number(zoneMatch[2]);
  const offsetMinutes = Number(zoneMatch[3] ?? 0);
  const offsetMs = sign * (offsetHours * 60 + offsetMinutes) * 60_000;
  const localAsUtc = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hours,
    minutes
  );

  return new Date(localAsUtc - offsetMs);
}

function extractTeam(block: string) {
  return cleanHtml(block);
}

function parseMatches(html: string): ParsedMatch[] {
  const groupStart = html.indexOf('<h2 id="Group_stage"');
  const knockoutStart = html.indexOf('<h2 id="Knockout_stage"');

  if (groupStart === -1 || knockoutStart === -1) {
    throw new Error("Could not find World Cup group stage section.");
  }

  const groupHtml = html.slice(groupStart, knockoutStart);
  const sections = groupHtml.split(
    /<div class="mw-heading mw-heading3"><h3 id="Group_([A-L])">[\s\S]*?<\/h3><\/div>/g
  );
  const matches: ParsedMatch[] = [];

  for (let index = 1; index < sections.length; index += 2) {
    const group = sections[index];
    const sectionHtml = sections[index + 1];
    const boxStarts = [
      ...sectionHtml.matchAll(
        /<div itemscope="" itemtype="http&#58;\/\/schema.org\/SportsEvent" class="footballbox"/g
      ),
    ].map((match) => match.index ?? 0);

    for (let boxIndex = 0; boxIndex < boxStarts.length; boxIndex++) {
      const box = sectionHtml.slice(
        boxStarts[boxIndex],
        boxStarts[boxIndex + 1] ?? sectionHtml.length
      );
      const date = box.match(
        /<span class="bday dtstart published updated itvstart">([^<]+)<\/span>/
      )?.[1];
      const timeHtml = box.match(/<div class="ftime">([\s\S]*?)<\/div>/)?.[1] ?? "";
      const timeText = cleanHtml(timeHtml);
      const timezone = timeHtml.match(/title="UTC([^"]+)"/)?.[1] ?? "";
      const homeHtml =
        box.match(
          /<th class="fhome"[\s\S]*?<span itemprop="name">([\s\S]*?)<\/span><\/th>/
        )?.[1] ?? "";
      const awayHtml =
        box.match(
          /<th class="faway"[\s\S]*?<span itemprop="name">([\s\S]*?)<\/span><\/th>/
        )?.[1] ?? "";
      const scoreText = cleanHtml(
        box.match(/<th class="fscore">([\s\S]*?)<\/th>/)?.[1] ?? ""
      );
      const venue = cleanHtml(
        box.match(/<span itemprop="name address">([\s\S]*?)<\/span>/)?.[1] ?? ""
      );

      if (!date) throw new Error(`Missing date for Group ${group} match.`);

      const home = extractTeam(homeHtml);
      const away = extractTeam(awayHtml);
      const result = scoreText.match(/^(\d+)[–-](\d+)$/);
      const matchNumber = scoreText.match(/Match\s+(\d+)/)?.[1];

      matches.push({
        roundName: `Group ${group}`,
        roundOrder: group.charCodeAt(0) - "A".charCodeAt(0) + 1,
        stageLabel: "Group Stage",
        home,
        away,
        venue: venue || null,
        startTime: parseStartTime(date, timeText, timezone),
        status: result ? MatchStatus.FINISHED : MatchStatus.SCHEDULED,
        homeScore: result ? Number(result[1]) : null,
        awayScore: result ? Number(result[2]) : null,
        matchdayLabel: matchNumber ? `Match ${matchNumber}` : `Group ${group}`,
        externalId: `fifa-wc-2026-group-${group.toLowerCase()}-${date}-${slugify(
          home
        )}-${slugify(away)}`,
      });
    }
  }

  return matches;
}

function parseMonthDay(value: string) {
  const parsed = new Date(`${value} 2026 12:00:00 UTC`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Cannot parse match date: ${value}`);
  }

  return parsed;
}

function parseScoreText(scoreText: string, home: string, away: string) {
  const main = scoreText.match(/(\d+)\s*[–-]\s*(\d+)/);

  if (!main) {
    throw new Error(`Cannot parse score: ${home} vs ${away} ${scoreText}`);
  }

  const penalty = scoreText.match(/\(([^()]+?)\s+(\d+)\s*[–-]\s*(\d+)\s+on pens/i);
  let penaltyHome: number | null = null;
  let penaltyAway: number | null = null;

  if (penalty) {
    const winner = penalty[1].trim();
    const winnerPens = Number(penalty[2]);
    const loserPens = Number(penalty[3]);

    if (winner === home) {
      penaltyHome = winnerPens;
      penaltyAway = loserPens;
    } else if (winner === away) {
      penaltyHome = loserPens;
      penaltyAway = winnerPens;
    }
  }

  return {
    homeScore: Number(main[1]),
    awayScore: Number(main[2]),
    penaltyHome,
    penaltyAway,
  };
}

function normalizeTeamName(value: string) {
  const normalized = value.trim();

  if (normalized === "USA") return "United States";
  if (normalized === "Turkiye" || normalized === "Türkiye") return "Turkey";
  if (normalized === "Czechia") return "Czech Republic";
  if (normalized === "Congo DR") return "DR Congo";

  return normalized;
}

function formatDateId(date: Date) {
  return date.toISOString().slice(0, 10);
}

function extractRows(tableHtml: string) {
  return [...tableHtml.matchAll(/<tr class="table__body__row">([\s\S]*?)<\/tr>/g)]
    .map((rowMatch) => {
      const cells = [
        ...rowMatch[1].matchAll(/<td class="table_body__data"[\s\S]*?>([\s\S]*?)<\/td>/g),
      ].map((cellMatch) => cleanHtml(cellMatch[1]));

      return cells;
    })
    .filter((cells) => cells.length >= 4);
}

function parseFourFourTwoMatches(html: string): ParsedMatch[] {
  const sectionStart = html.indexOf("section-world-cup-scores-so-far");

  if (sectionStart === -1) return [];

  const tableMatches = [
    ...html
      .slice(sectionStart)
      .matchAll(/<table[\s\S]*?class="table__wrapper[\s\S]*?<\/table>/g),
  ];
  const groupTable = tableMatches[0]?.[0] ?? "";
  const knockoutTable = tableMatches[1]?.[0] ?? "";
  const matches: ParsedMatch[] = [];

  for (const cells of extractRows(groupTable)) {
    const [dateLabel, group, fixture, scoreText] = cells;
    const [home, away] = fixture
      .split(/\s+vs\s+/i)
      .map((value) => normalizeTeamName(value));

    if (!home || !away) continue;

    const score = parseScoreText(scoreText, home, away);

    const startTime = parseMonthDay(dateLabel);

    matches.push({
      roundName: `Group ${group}`,
      roundOrder: group.charCodeAt(0) - "A".charCodeAt(0) + 1,
      stageLabel: "Group Stage",
      home,
      away,
      venue: null,
      startTime,
      status: MatchStatus.FINISHED,
      ...score,
      matchdayLabel: `Group ${group}`,
      externalId: `fifa-wc-2026-group-${group.toLowerCase()}-${formatDateId(
        startTime
      )}-${slugify(home)}-${slugify(away)}`,
    });
  }

  for (const cells of extractRows(knockoutTable)) {
    const [dateLabel, roundName, fixture, scoreText] = cells;
    const [home, away] = fixture
      .split(/\s+vs\s+/i)
      .map((value) => normalizeTeamName(value));

    if (!home || !away) continue;

    const score = parseScoreText(scoreText, home, away);

    matches.push({
      roundName,
      roundOrder: getKnockoutRoundOrder(roundName),
      stageLabel: "Knockout Stage",
      home,
      away,
      venue: null,
      startTime: parseMonthDay(dateLabel),
      status: MatchStatus.FINISHED,
      ...score,
      matchdayLabel: roundName,
      externalId: `fifa-wc-2026-${slugify(roundName)}-${slugify(
        dateLabel
      )}-${slugify(home)}-${slugify(away)}`,
    });
  }

  return matches;
}

function getKnockoutRoundOrder(roundName: string) {
  const normalized = roundName.toLowerCase();

  if (normalized.includes("round of 32")) return 20;
  if (normalized.includes("round of 16")) return 30;
  if (normalized.includes("quarter")) return 40;
  if (normalized.includes("semi")) return 50;
  if (normalized.includes("third")) return 60;
  if (normalized.includes("final")) return 70;

  return 35;
}

function cleanHeading(value: string) {
  return cleanHtml(value)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/_/g, " ")
    .trim();
}

function getNearestHeading(sectionHtml: string, position: number) {
  const prefix = sectionHtml.slice(0, position);
  const headingMatches = [
    ...prefix.matchAll(/<h[34][^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/h[34]>/g),
  ];
  const heading = headingMatches.at(-1);

  if (!heading) return "Knockout Stage";

  return cleanHeading(heading[2] || heading[1]);
}

function parseKnockoutMatches(html: string): ParsedMatch[] {
  const knockoutStart = html.indexOf('<h2 id="Knockout_stage"');

  if (knockoutStart === -1) {
    return [];
  }

  const endMarkers = [
    html.indexOf('<h2 id="Statistics"', knockoutStart),
    html.indexOf('<h2 id="Marketing"', knockoutStart),
    html.indexOf('<h2 id="Broadcasting"', knockoutStart),
  ].filter((index) => index > knockoutStart);
  const knockoutHtml = html.slice(
    knockoutStart,
    endMarkers.length > 0 ? Math.min(...endMarkers) : html.length
  );
  const boxStarts = [
    ...knockoutHtml.matchAll(
      /<div itemscope="" itemtype="http&#58;\/\/schema.org\/SportsEvent" class="footballbox"/g
    ),
  ].map((match) => match.index ?? 0);
  const matches: ParsedMatch[] = [];

  for (let boxIndex = 0; boxIndex < boxStarts.length; boxIndex++) {
    const box = knockoutHtml.slice(
      boxStarts[boxIndex],
      boxStarts[boxIndex + 1] ?? knockoutHtml.length
    );
    const roundName = getNearestHeading(knockoutHtml, boxStarts[boxIndex]);
    const date = box.match(
      /<span class="bday dtstart published updated itvstart">([^<]+)<\/span>/
    )?.[1];
    const timeHtml = box.match(/<div class="ftime">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const timeText = cleanHtml(timeHtml);
    const timezone = timeHtml.match(/title="UTC([^"]+)"/)?.[1] ?? "";
    const homeHtml =
      box.match(
        /<th class="fhome"[\s\S]*?<span itemprop="name">([\s\S]*?)<\/span><\/th>/
      )?.[1] ?? "";
    const awayHtml =
      box.match(
        /<th class="faway"[\s\S]*?<span itemprop="name">([\s\S]*?)<\/span><\/th>/
      )?.[1] ?? "";
    const scoreText = cleanHtml(
      box.match(/<th class="fscore">([\s\S]*?)<\/th>/)?.[1] ?? ""
    );
    const venue = cleanHtml(
      box.match(/<span itemprop="name address">([\s\S]*?)<\/span>/)?.[1] ?? ""
    );

    if (!date) continue;

    const home = extractTeam(homeHtml);
    const away = extractTeam(awayHtml);

    if (!home || !away || /^(winners|losers|runner-up|third)/i.test(home + away)) {
      continue;
    }

    const result = scoreText.match(/^(\d+)[–-](\d+)/);
    const matchNumber = scoreText.match(/Match\s+(\d+)/)?.[1];

    matches.push({
      roundName,
      roundOrder: getKnockoutRoundOrder(roundName),
      stageLabel: "Knockout Stage",
      home,
      away,
      venue: venue || null,
      startTime: parseStartTime(date, timeText, timezone),
      status: result ? MatchStatus.FINISHED : MatchStatus.SCHEDULED,
      homeScore: result ? Number(result[1]) : null,
      awayScore: result ? Number(result[2]) : null,
      matchdayLabel: matchNumber ? `Match ${matchNumber}` : roundName,
      externalId: `fifa-wc-2026-${slugify(roundName)}-${date}-${slugify(
        home
      )}-${slugify(away)}`,
    });
  }

  return matches;
}

async function main() {
  console.log("Fetching current FIFA World Cup 2026 data...");

  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
  }

  const html = await response.text();
  let matches = parseFourFourTwoMatches(html);

  if (matches.length === 0) {
    console.log("FourFourTwo parser found no matches, trying Wikipedia fallback...");
    const fallbackResponse = await fetch(WIKIPEDIA_SOURCE_URL);
    if (!fallbackResponse.ok) {
      throw new Error(
        `Failed to fetch ${WIKIPEDIA_SOURCE_URL}: ${fallbackResponse.status}`
      );
    }
    const fallbackHtml = await fallbackResponse.text();
    matches = [...parseMatches(fallbackHtml), ...parseKnockoutMatches(fallbackHtml)];
  }
  const teamNames = [...new Set(matches.flatMap((match) => [match.home, match.away]))].sort();

  if (teamNames.length < 48 || matches.length < 72) {
    throw new Error(
      `Unexpected World Cup data shape: ${teamNames.length} teams, ${matches.length} matches.`
    );
  }

  const season = await prisma.season.upsert({
    where: { name: "FIFA World Cup 2026" },
    update: {
      yearLabel: "2026",
      startsAt: new Date("2026-06-11T00:00:00.000Z"),
      endsAt: new Date("2026-07-19T23:59:59.000Z"),
    },
    create: {
      name: "FIFA World Cup 2026",
      yearLabel: "2026",
      isCurrent: true,
      startsAt: new Date("2026-06-11T00:00:00.000Z"),
      endsAt: new Date("2026-07-19T23:59:59.000Z"),
      externalId: "fifa-world-cup-2026-season",
    },
  });

  const tournament = await prisma.tournament.upsert({
    where: { slug: TOURNAMENT_SLUG },
    update: {
      name: "FIFA World Cup 2026",
      country: "Canada, Mexico, United States",
      logo: "WC.svg",
      isActive: true,
      seasonId: season.id,
      externalId: "fifa-world-cup-2026",
      type: "international",
    },
    create: {
      name: "FIFA World Cup 2026",
      slug: TOURNAMENT_SLUG,
      country: "Canada, Mexico, United States",
      logo: "WC.svg",
      isActive: true,
      seasonId: season.id,
      externalId: "fifa-world-cup-2026",
      type: "international",
    },
  });

  const rounds = new Map<string, { id: string; defaultWeight: number }>();
  const roundSeeds = [
    ...new Map(
      matches.map((match) => [
        match.roundName,
        {
          name: match.roundName,
          order: match.roundOrder,
          stageLabel: match.stageLabel,
        },
      ])
    ).values(),
  ].sort((a, b) => a.order - b.order);

  for (const roundSeed of roundSeeds) {
    const round = await prisma.round.upsert({
      where: {
        tournamentId_name: {
          tournamentId: tournament.id,
          name: roundSeed.name,
        },
      },
      update: {
        slug: `world-cup-2026-${slugify(roundSeed.name)}`,
        order: roundSeed.order,
        defaultWeight: roundSeed.stageLabel === "Knockout Stage" ? 2 : 1,
      },
      create: {
        tournamentId: tournament.id,
        name: roundSeed.name,
        slug: `world-cup-2026-${slugify(roundSeed.name)}`,
        order: roundSeed.order,
        defaultWeight: roundSeed.stageLabel === "Knockout Stage" ? 2 : 1,
      },
    });
    rounds.set(roundSeed.name, round);
  }

  const teams = new Map<string, { id: string }>();
  for (const name of teamNames) {
    const code =
      teamCodes[name] ??
      slugify(name)
        .split("-")
        .map((part) => part[0])
        .join("")
        .slice(0, 3)
        .toUpperCase();

    const team = await prisma.team.upsert({
      where: { name },
      update: {
        shortName: code,
        code,
        country: name,
        externalId: `fifa-national-team-${code.toLowerCase()}`,
      },
      create: {
        name,
        shortName: code,
        code,
        country: name,
        externalId: `fifa-national-team-${code.toLowerCase()}`,
      },
    });
    teams.set(name, team);
  }

  for (const match of matches) {
    const round = rounds.get(match.roundName);
    const homeTeam = teams.get(match.home);
    const awayTeam = teams.get(match.away);

    if (!round || !homeTeam || !awayTeam) {
      throw new Error(`Missing relation for ${match.home} vs ${match.away}`);
    }

    const directExistingMatch = await prisma.match.findFirst({
      where: {
        tournamentId: tournament.id,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        OR: [{ roundId: round.id }, { stageLabel: match.stageLabel }],
      },
      select: { id: true },
    });
    const reversedExistingMatch = directExistingMatch
      ? null
      : await prisma.match.findFirst({
          where: {
            tournamentId: tournament.id,
            homeTeamId: awayTeam.id,
            awayTeamId: homeTeam.id,
            OR: [{ roundId: round.id }, { stageLabel: match.stageLabel }],
          },
          select: { id: true },
        });

    const baseData = {
      tournamentId: tournament.id,
      roundId: round.id,
      venue: match.venue,
      stageLabel: match.stageLabel,
      matchdayLabel: match.matchdayLabel,
      startTime: match.startTime,
      status: match.status,
      sourceUpdatedAt: new Date(),
      lockedAt: new Date(match.startTime.getTime() - 15 * 60_000),
    };

    if (directExistingMatch) {
      await prisma.match.update({
        where: { id: directExistingMatch.id },
        data: {
          ...baseData,
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          penaltyHome: match.penaltyHome ?? null,
          penaltyAway: match.penaltyAway ?? null,
        },
      });
      continue;
    }

    if (reversedExistingMatch) {
      await prisma.match.update({
        where: { id: reversedExistingMatch.id },
        data: {
          ...baseData,
          homeScore: match.awayScore,
          awayScore: match.homeScore,
          penaltyHome: match.penaltyAway ?? null,
          penaltyAway: match.penaltyHome ?? null,
        },
      });
      continue;
    }

    await prisma.match.upsert({
      where: { externalId: match.externalId },
      update: {
        ...baseData,
        tournamentId: tournament.id,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        penaltyHome: match.penaltyHome ?? null,
        penaltyAway: match.penaltyAway ?? null,
      },
      create: {
        ...baseData,
        externalId: match.externalId,
        homeTeamId: homeTeam.id,
        awayTeamId: awayTeam.id,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
        penaltyHome: match.penaltyHome ?? null,
        penaltyAway: match.penaltyAway ?? null,
      },
    });
  }

  console.log(`World Cup teams upserted: ${teamNames.length}`);
  console.log(`World Cup matches upserted: ${matches.length}`);
  console.log(
    `Finished matches: ${
      matches.filter((match) => match.status === MatchStatus.FINISHED).length
    }`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
