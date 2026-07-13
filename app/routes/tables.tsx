import { Link, data, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { prisma } from "~/lib/db.server";
import {
  getTeamDisplayName,
  getTeamFlagEmoji,
  getTeamLogoSrc,
  getTournamentLogoSrc,
} from "~/lib/logo-utils";

const KNOCKOUT_HINTS = [
  "final",
  "фінал",
  "semi",
  "1/2",
  "quarter",
  "1/4",
  "round of 32",
  "round of 16",
  "1/16",
  "1/8",
  "knockout",
  "playoff",
  "плейоф",
  "плей-оф",
];

const BRACKET_ROUNDS = [
  { id: "round32", title: "1/16", subtitle: "Round of 32", expectedMatches: 16 },
  { id: "round16", title: "1/8", subtitle: "Round of 16", expectedMatches: 8 },
  { id: "quarter", title: "1/4", subtitle: "Quarter-finals", expectedMatches: 4 },
  { id: "semi", title: "1/2", subtitle: "Semi-finals", expectedMatches: 2 },
  { id: "final", title: "Фінал", subtitle: "Final", expectedMatches: 1 },
] as const;

const WORLD_CUP_2026_ROUND_32_ORDER = [
  ["GER", "PAR"],
  ["FRA", "SWE"],
  ["RSA", "CAN"],
  ["NED", "MAR"],
  ["POR", "CRO"],
  ["ESP", "AUT"],
  ["USA", "BIH"],
  ["BEL", "SEN"],
  ["BRA", "JPN"],
  ["CIV", "NOR"],
  ["MEX", "ECU"],
  ["ENG", "COD"],
  ["ARG", "CPV"],
  ["AUS", "EGY"],
  ["SUI", "ALG"],
  ["COL", "GHA"],
];

type TeamLike = {
  id: string;
  name: string;
  shortName?: string | null;
  code?: string | null;
  tla?: string | null;
  logo?: string | null;
  country?: string | null;
};

type MatchItem = {
  id: string;
  status: string;
  startTime: string;
  homeScore: number | null;
  awayScore: number | null;
  penaltyHome: number | null;
  penaltyAway: number | null;
  stageLabel: string | null;
  matchdayLabel: string | null;
  tournament: {
    id: string;
    name: string;
    logo: string | null;
    country: string | null;
    type: string | null;
  };
  round: { id: string; name: string; order: number | null } | null;
  homeTeam: TeamLike;
  awayTeam: TeamLike;
};

type TournamentView = {
  id: string;
  name: string;
  logo: string | null;
  country: string | null;
  type: "LEAGUE" | "GROUPS" | "KNOCKOUT" | "GROUP_KNOCKOUT";
  matches: MatchItem[];
  groupMatchesCount: number;
  knockoutMatchesCount: number;
  tableMatchesCount: number;
};

type BracketSlot = {
  id: string;
  match: MatchItem | null;
  homeTeam: TeamLike | null;
  awayTeam: TeamLike | null;
};

type BracketColumn = {
  id: (typeof BRACKET_ROUNDS)[number]["id"];
  title: string;
  subtitle: string;
  slots: BracketSlot[];
};

function getRoundLabel(match: Pick<MatchItem, "round" | "stageLabel" | "matchdayLabel">) {
  return match.round?.name || match.stageLabel || match.matchdayLabel || "Раунд";
}

function isGroupMatch(match: Pick<MatchItem, "round" | "stageLabel">) {
  const label = `${match.round?.name ?? ""} ${match.stageLabel ?? ""}`.toLowerCase();
  return label.includes("group") || label.includes("груп");
}

function isKnockoutMatch(
  match: Pick<MatchItem, "round" | "stageLabel" | "matchdayLabel">
) {
  const label = `${match.round?.name ?? ""} ${match.stageLabel ?? ""} ${
    match.matchdayLabel ?? ""
  }`.toLowerCase();

  return KNOCKOUT_HINTS.some((hint) => label.includes(hint));
}

function getRoundRank(label: string, order: number | null | undefined) {
  const normalized = label.toLowerCase();

  if (normalized.includes("knockout phase") || normalized.includes("play-off")) return 5;
  if (normalized.includes("round of 32") || normalized.includes("1/16")) return 10;
  if (normalized.includes("round of 16") || normalized.includes("1/8")) return 20;
  if (normalized.includes("quarter") || normalized.includes("1/4")) return 30;
  if (normalized.includes("semi") || normalized.includes("1/2")) return 40;
  if (normalized.includes("third")) return 50;
  if (normalized.includes("фінал") || normalized.includes("final")) return 60;
  if (typeof order === "number") return order;

  return 25;
}

function getBracketRoundId(label: string): BracketColumn["id"] | "other" {
  const normalized = label.toLowerCase();

  if (normalized.includes("round of 32") || normalized.includes("1/16")) return "round32";
  if (normalized.includes("round of 16") || normalized.includes("1/8")) return "round16";
  if (normalized.includes("quarter") || normalized.includes("1/4")) return "quarter";
  if (normalized.includes("semi") || normalized.includes("1/2")) return "semi";
  if (normalized.includes("final") || normalized.includes("фінал")) return "final";

  return "other";
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(value));
}

function getOutcome(home: number, away: number) {
  if (home > away) return "home";
  if (home < away) return "away";
  return "draw";
}

function getWinner(match: MatchItem) {
  if (match.status !== "FINISHED" || match.homeScore === null || match.awayScore === null) {
    return null;
  }

  if (match.homeScore !== match.awayScore) {
    return match.homeScore > match.awayScore ? match.homeTeam : match.awayTeam;
  }

  if (match.penaltyHome !== null && match.penaltyAway !== null) {
    return match.penaltyHome > match.penaltyAway ? match.homeTeam : match.awayTeam;
  }

  return null;
}

function buildStandings(matches: MatchItem[]) {
  const table = new Map<
    string,
    {
      team: TeamLike;
      played: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      points: number;
    }
  >();

  const ensureTeam = (team: TeamLike) => {
    const existing = table.get(team.id);
    if (existing) return existing;

    const row = {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    };
    table.set(team.id, row);
    return row;
  };

  for (const match of matches) {
    ensureTeam(match.homeTeam);
    ensureTeam(match.awayTeam);

    if (match.status !== "FINISHED" || match.homeScore === null || match.awayScore === null) {
      continue;
    }

    const home = ensureTeam(match.homeTeam);
    const away = ensureTeam(match.awayTeam);
    const outcome = getOutcome(match.homeScore, match.awayScore);

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (outcome === "home") {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (outcome === "away") {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...table.values()].sort((a, b) => {
    const goalDiffA = a.goalsFor - a.goalsAgainst;
    const goalDiffB = b.goalsFor - b.goalsAgainst;

    return (
      b.points - a.points ||
      goalDiffB - goalDiffA ||
      b.goalsFor - a.goalsFor ||
      getTeamDisplayName(a.team).localeCompare(getTeamDisplayName(b.team), "uk")
    );
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const requestedTournamentId = url.searchParams.get("tournament");
  const requestedView = url.searchParams.get("view");
  const matches = await prisma.match.findMany({
    include: {
      tournament: true,
      round: true,
      homeTeam: true,
      awayTeam: true,
    },
    orderBy: [
      { tournament: { name: "asc" } },
      { round: { order: "asc" } },
      { startTime: "asc" },
    ],
  });

  const tournamentMap = new Map<string, MatchItem[]>();

  for (const match of matches) {
    if (!match.tournament.isActive) continue;

    const current = tournamentMap.get(match.tournamentId) ?? [];
    current.push({
      id: match.id,
      status: match.status,
      startTime: match.startTime.toISOString(),
      homeScore: match.homeScore,
      awayScore: match.awayScore,
      penaltyHome: match.penaltyHome,
      penaltyAway: match.penaltyAway,
      stageLabel: match.stageLabel,
      matchdayLabel: match.matchdayLabel,
      tournament: {
        id: match.tournament.id,
        name: match.tournament.name,
        logo: match.tournament.logo,
        country: match.tournament.country,
        type: match.tournament.type,
      },
      round: match.round
        ? {
            id: match.round.id,
            name: match.round.name,
            order: match.round.order,
          }
        : null,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
    });
    tournamentMap.set(match.tournamentId, current);
  }

  const tournaments = [...tournamentMap.entries()]
    .map(([id, items]): TournamentView => {
      const first = items[0];
      const groupMatches = items.filter(isGroupMatch);
      const knockoutMatches = items.filter(isKnockoutMatch);
      const tableMatches = items.filter((match) => !isGroupMatch(match) && !isKnockoutMatch(match));
      const type =
        groupMatches.length > 0 && knockoutMatches.length > 0
          ? "GROUP_KNOCKOUT"
          : knockoutMatches.length > 0
            ? "KNOCKOUT"
            : groupMatches.length > 0
              ? "GROUPS"
              : "LEAGUE";

      return {
        id,
        name: first.tournament.name,
        logo: first.tournament.logo,
        country: first.tournament.country,
        type,
        matches: items,
        groupMatchesCount: groupMatches.length,
        knockoutMatchesCount: knockoutMatches.length,
        tableMatchesCount: tableMatches.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "uk"));

  const selectedTournament =
    tournaments.find((tournament) => tournament.id === requestedTournamentId) ??
    tournaments[0] ??
    null;

  const selectedMatches = selectedTournament?.matches ?? [];
  const groupMatches = selectedMatches.filter(isGroupMatch);
  const knockoutMatches = selectedMatches.filter(isKnockoutMatch);
  const tableMatches = selectedMatches.filter((match) => !isGroupMatch(match) && !isKnockoutMatch(match));
  const defaultView =
    selectedTournament?.type === "GROUP_KNOCKOUT"
      ? "groups"
      : selectedTournament?.type === "GROUPS"
        ? "groups"
        : selectedTournament?.type === "KNOCKOUT"
          ? "knockout"
          : "table";
  const activeView =
    requestedView === "groups" || requestedView === "knockout" || requestedView === "table"
      ? requestedView
      : defaultView;
  const groupMap = new Map<string, MatchItem[]>();

  for (const match of groupMatches) {
    const label = getRoundLabel(match);
    const current = groupMap.get(label) ?? [];
    current.push(match);
    groupMap.set(label, current);
  }

  const groups = [...groupMap.entries()]
    .map(([label, items]) => ({
      label,
      rank: getRoundRank(label, items[0]?.round?.order),
      standings: buildStandings(items),
      matches: items.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      ),
    }))
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, "uk"));
  const roundMap = new Map<string, MatchItem[]>();

  for (const match of knockoutMatches) {
    const label = getRoundLabel(match);
    const current = roundMap.get(label) ?? [];
    current.push(match);
    roundMap.set(label, current);
  }

  const knockoutRounds = [...roundMap.entries()]
    .map(([label, items]) => ({
      label,
      rank: getRoundRank(label, items[0]?.round?.order),
      matches: items.sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      ),
    }))
    .sort((a, b) => a.rank - b.rank);

  return data({
    tournaments,
    selectedTournament,
    activeView,
    groups,
    knockoutRounds,
    tableStandings: buildStandings([...tableMatches, ...groupMatches]),
  });
}

export default function TablesPage() {
  const {
    tournaments,
    selectedTournament,
    activeView,
    groups,
    knockoutRounds,
    tableStandings,
  } = useLoaderData<typeof loader>();

  return (
    <main className="theme-page relative min-h-screen overflow-hidden px-3 pb-28 pt-4 sm:px-5 sm:py-6">
      <TablesBackground />

      <div className="relative mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-[1800px] flex-col gap-4 sm:min-h-[calc(100dvh-3rem)]">
        <section
          className={[
            "flex min-h-[calc(100dvh-9rem)] flex-1 flex-col rounded-[1.75rem] bg-[var(--panel)] shadow-2xl shadow-black/10",
            activeView === "knockout" ? "p-0" : "p-2 sm:p-4",
          ].join(" ")}
        >
          {tournaments.length ? (
            <TournamentTabs
              tournaments={tournaments}
              selectedTournamentId={selectedTournament?.id}
            />
          ) : null}

          {selectedTournament ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <ViewTabs tournament={selectedTournament} activeView={activeView} />
              <div className="theme-muted text-xs font-black uppercase tracking-[0.14em]">
                {getTournamentTypeLabel(selectedTournament.type)}
              </div>
            </div>
          ) : null}

          <div
            className={[
              "mt-4 min-h-0 flex-1 overflow-y-auto",
              activeView === "knockout" ? "" : "pr-1",
            ].join(" ")}
          >
            {!selectedTournament ? (
              <EmptyState />
            ) : activeView === "groups" ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {groups.map((group) => (
                  <GroupTable key={group.label} group={group} />
                ))}
              </div>
            ) : activeView === "knockout" ? (
              <ReadOnlyBracket tournament={selectedTournament} rounds={knockoutRounds} />
            ) : (
              <LeagueTable standings={tableStandings} />
            )}
          </div>
        </section>

        <TablesBottomNav active="tables" />
      </div>
    </main>
  );
}

function TournamentTabs({
  tournaments,
  selectedTournamentId,
}: {
  tournaments: TournamentView[];
  selectedTournamentId?: string;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {tournaments.map((tournament) => {
        const logo = getTournamentLogoSrc(tournament);
        const active = tournament.id === selectedTournamentId;

        return (
          <Link
            key={tournament.id}
            to={`/tables?tournament=${tournament.id}`}
            className={[
              "flex min-h-14 min-w-[13rem] shrink-0 items-center gap-3 rounded-[1.05rem] px-3 transition",
              active
                ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                : "text-[var(--text-soft)] hover:bg-[var(--panel-strong)] hover:text-[var(--text)]",
            ].join(" ")}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--panel-strong)]">
              {logo ? (
                <img src={logo} alt={tournament.name} className="h-7 w-7 object-contain" />
              ) : (
                <span className="text-xs font-black">{tournament.name.slice(0, 2)}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-black">{tournament.name}</span>
              <span className="theme-muted block text-[10px] font-black uppercase tracking-[0.12em]">
                {getTournamentTypeLabel(tournament.type)}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function ViewTabs({
  tournament,
  activeView,
}: {
  tournament: TournamentView;
  activeView: string;
}) {
  const tabs = [];

  if (tournament.groupMatchesCount > 0) tabs.push({ id: "groups", label: "Групи" });
  if (tournament.knockoutMatchesCount > 0) tabs.push({ id: "knockout", label: "Сітка" });
  if (tournament.type === "LEAGUE" || tournament.tableMatchesCount > 0) {
    tabs.push({ id: "table", label: "Таблиця" });
  }

  if (tabs.length <= 1) return null;

  return (
    <div className="inline-flex rounded-[1rem] bg-[var(--panel-strong)] p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          to={`/tables?tournament=${tournament.id}&view=${tab.id}`}
          className={[
            "rounded-[0.8rem] px-4 py-2 text-sm font-black transition",
            activeView === tab.id
              ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
              : "theme-muted hover:bg-[var(--card-highlight)] hover:text-[var(--text)]",
          ].join(" ")}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function GroupTable({ group }: { group: { label: string; matches: MatchItem[]; standings: ReturnType<typeof buildStandings> } }) {
  return (
    <section className="overflow-hidden rounded-[1.25rem] bg-[var(--card-highlight)]">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h3 className="text-lg font-black text-[var(--text)]">{group.label}</h3>
        <span className="rounded-full bg-[var(--panel-strong)] px-3 py-1 text-xs font-bold text-[var(--text-soft)]">
          {group.matches.length} матчів
        </span>
      </div>
      <StandingsTable standings={group.standings} />
    </section>
  );
}

function LeagueTable({ standings }: { standings: ReturnType<typeof buildStandings> }) {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="overflow-hidden rounded-[1.25rem] bg-[var(--card-highlight)]">
        <div className="px-4 py-3">
          <h3 className="text-lg font-black text-[var(--text)]">Турнірна таблиця</h3>
          <p className="theme-muted mt-1 text-sm font-semibold">
            Очки рахуються за завершеними матчами.
          </p>
        </div>
        <StandingsTable standings={standings} />
      </section>
    </div>
  );
}

function StandingsTable({ standings }: { standings: ReturnType<typeof buildStandings> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="theme-muted text-[10px] font-black uppercase tracking-[0.14em]">
          <tr>
            <th className="px-4 py-3">Команда</th>
            <th className="px-2 py-3 text-center">І</th>
            <th className="px-2 py-3 text-center">В</th>
            <th className="px-2 py-3 text-center">Н</th>
            <th className="px-2 py-3 text-center">П</th>
            <th className="px-2 py-3 text-center">М</th>
            <th className="px-4 py-3 text-right">О</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => (
            <tr
              key={row.team.id}
              className="bg-[linear-gradient(var(--border),var(--border))] bg-[length:100%_1px] bg-[position:0_0] bg-no-repeat"
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className={[
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black",
                      index < 2
                        ? "bg-[var(--accent)] text-[var(--accent-contrast)]"
                        : "bg-[var(--panel-strong)] text-[var(--text-soft)]",
                    ].join(" ")}
                  >
                    {index + 1}
                  </span>
                  <TeamMark team={row.team} />
                </div>
              </td>
              <td className="px-2 py-3 text-center text-[var(--text-soft)]">{row.played}</td>
              <td className="px-2 py-3 text-center text-[var(--text-soft)]">{row.wins}</td>
              <td className="px-2 py-3 text-center text-[var(--text-soft)]">{row.draws}</td>
              <td className="px-2 py-3 text-center text-[var(--text-soft)]">{row.losses}</td>
              <td className="px-2 py-3 text-center text-[var(--text-soft)]">
                {row.goalsFor}:{row.goalsAgainst}
              </td>
              <td className="px-4 py-3 text-right text-lg font-black text-[var(--text)]">
                {row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function getTeamCodeValue(team: TeamLike | null) {
  return String(team?.code || team?.tla || team?.shortName || "").toUpperCase();
}

function getPairKey(homeTeam: TeamLike | null, awayTeam: TeamLike | null) {
  return [getTeamCodeValue(homeTeam), getTeamCodeValue(awayTeam)]
    .filter(Boolean)
    .sort()
    .join(":");
}

function isSamePair(slot: BracketSlot, match: MatchItem) {
  const slotIds = [slot.homeTeam?.id, slot.awayTeam?.id].filter(Boolean).sort();
  const matchIds = [match.homeTeam.id, match.awayTeam.id].filter(Boolean).sort();

  return slotIds.length === 2 && slotIds.join(":") === matchIds.join(":");
}

function isWorldCup2026Tournament(tournament: TournamentView) {
  return tournament.name === "FIFA World Cup 2026";
}

function orderRound32SlotsForWorldCup2026(slots: BracketSlot[]) {
  const slotByPair = new Map(
    slots.map((slot) => [getPairKey(slot.homeTeam, slot.awayTeam), slot])
  );
  const orderedSlots = WORLD_CUP_2026_ROUND_32_ORDER.map(([home, away]) =>
    slotByPair.get([home, away].sort().join(":"))
  ).filter(Boolean) as BracketSlot[];
  const orderedIds = new Set(orderedSlots.map((slot) => slot.id));
  const leftovers = slots.filter((slot) => !orderedIds.has(slot.id));

  return [...orderedSlots, ...leftovers];
}

function mergeExpectedWithReal(expectedSlots: BracketSlot[], realMatches: MatchItem[]) {
  const usedRealIds = new Set<string>();
  const merged = expectedSlots.map((slot) => {
    const match = realMatches.find((item) => {
      if (usedRealIds.has(item.id)) return false;
      return isSamePair(slot, item);
    });

    if (!match) return slot;

    usedRealIds.add(match.id);

    return {
      ...slot,
      id: match.id,
      match,
      homeTeam: slot.homeTeam ?? match.homeTeam,
      awayTeam: slot.awayTeam ?? match.awayTeam,
    };
  });
  const unusedRealMatches = realMatches.filter((match) => !usedRealIds.has(match.id));

  return merged.map((slot) => {
    if (slot.match || unusedRealMatches.length === 0) return slot;

    const match = unusedRealMatches.shift();

    if (!match) return slot;

    return {
      ...slot,
      id: match.id,
      match,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
    };
  });
}

function buildReadOnlyBracket(tournament: TournamentView, rounds: { label: string; matches: MatchItem[] }[]) {
  const realByRoundId = new Map<BracketColumn["id"], MatchItem[]>();

  for (const round of rounds) {
    const roundId = getBracketRoundId(round.label);
    if (roundId === "other") continue;

    const current = realByRoundId.get(roundId) ?? [];
    current.push(...round.matches);
    realByRoundId.set(roundId, current);
  }

  const columns: BracketColumn[] = [];
  let previousSlots: BracketSlot[] = [];

  for (const roundConfig of BRACKET_ROUNDS) {
    const realMatches = (realByRoundId.get(roundConfig.id) ?? []).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    let slots: BracketSlot[];

    if (roundConfig.id === "round32") {
      slots = realMatches.map((match) => ({
        id: match.id,
        match,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
      }));

      if (isWorldCup2026Tournament(tournament)) {
        slots = orderRound32SlotsForWorldCup2026(slots);
      }
    } else {
      const winners = previousSlots.map((slot) =>
        slot.match ? getWinner(slot.match) : null
      );
      const expectedCount = Math.max(
        roundConfig.expectedMatches,
        Math.ceil(winners.length / 2)
      );
      const expectedSlots: BracketSlot[] = [];

      for (let index = 0; index < expectedCount; index++) {
        expectedSlots.push({
          id: `${roundConfig.id}-${index}`,
          match: null,
          homeTeam: winners[index * 2] ?? null,
          awayTeam: winners[index * 2 + 1] ?? null,
        });
      }

      slots = mergeExpectedWithReal(expectedSlots, realMatches);
    }

    columns.push({
      id: roundConfig.id,
      title: roundConfig.title,
      subtitle: roundConfig.subtitle,
      slots,
    });
    previousSlots = slots;
  }

  return columns.filter((column) => column.slots.length > 0);
}

function getColumnById(columns: BracketColumn[], id: BracketColumn["id"]) {
  return columns.find((column) => column.id === id) ?? null;
}

function splitRoundSlots(column: BracketColumn | null, side: "left" | "right") {
  const slots = column?.slots ?? [];
  const midpoint = Math.ceil(slots.length / 2);

  return side === "left" ? slots.slice(0, midpoint) : slots.slice(midpoint);
}

function ReadOnlyBracket({
  tournament,
  rounds,
}: {
  tournament: TournamentView;
  rounds: { label: string; matches: MatchItem[] }[];
}) {
  const bracketColumns = buildReadOnlyBracket(tournament, rounds);
  const round32 = getColumnById(bracketColumns, "round32");
  const round16 = getColumnById(bracketColumns, "round16");
  const quarter = getColumnById(bracketColumns, "quarter");
  const semi = getColumnById(bracketColumns, "semi");
  const finalColumn = getColumnById(bracketColumns, "final");

  return (
    <section className="w-full bg-[#03142a] p-1 text-white shadow-2xl shadow-black/20 sm:p-2">
      <div className="overflow-x-auto">
        <div className="grid min-w-[1420px] grid-cols-[1.08fr_0.95fr_0.82fr_0.62fr_0.78fr_0.62fr_0.82fr_0.95fr_1.08fr] gap-2 2xl:min-w-0">
          <BracketSideColumn column={round32} side="left" />
          <BracketSideColumn column={round16} side="left" />
          <BracketSideColumn column={quarter} side="left" />
          <BracketSideColumn column={semi} side="left" />

          <ReadOnlyFinalColumn column={finalColumn} />

          <BracketSideColumn column={semi} side="right" />
          <BracketSideColumn column={quarter} side="right" />
          <BracketSideColumn column={round16} side="right" />
          <BracketSideColumn column={round32} side="right" />
        </div>
      </div>
    </section>
  );
}

function BracketColumnHeader({
  subtitle,
}: {
  subtitle: string;
}) {
  return (
    <div className="mb-1.5 text-center">
      <div className="text-[9px] font-black uppercase tracking-[0.14em] text-white/55">
        {subtitle.replace(/-/g, " ")}
      </div>
    </div>
  );
}

function BracketSideColumn({
  column,
  side,
}: {
  column: BracketColumn | null;
  side: "left" | "right";
}) {
  const slots = splitRoundSlots(column, side);

  return (
    <section className="flex min-h-[600px] flex-col">
      {column ? (
        <BracketColumnHeader subtitle={column.subtitle} />
      ) : (
        <div className="mb-1.5 h-[14px]" />
      )}

      <div className="flex flex-1 flex-col justify-around gap-1.5">
        {slots.map((slot) => (
          <BracketResultCard key={`${column?.id}-${side}-${slot.id}`} slot={slot} />
        ))}
      </div>
    </section>
  );
}

function ReadOnlyFinalColumn({ column }: { column: BracketColumn | null }) {
  const finalSlot = column?.slots?.[0] ?? null;
  const winner = finalSlot?.match ? getWinner(finalSlot.match) : null;

  return (
    <section className="flex min-h-[600px] flex-col items-center justify-center">
      <div className="mb-2 text-center">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-white/55">
          Final
        </div>
        <div className="mt-0.5 text-xl">🏆</div>
      </div>

      {finalSlot ? (
        <div className="w-full">
          <BracketResultCard slot={finalSlot} />
        </div>
      ) : null}

      <div className="mt-3 min-h-[56px] w-full rounded-xl bg-cyan-300/10 px-3 py-2 text-center shadow-[inset_0_0_0_1px_rgba(103,232,249,0.16)]">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/60">
          Champion
        </div>
        <div className="mt-1 truncate text-sm font-black text-cyan-50">
          {winner ? getTeamDisplayName(winner) : "Очікується"}
        </div>
      </div>
    </section>
  );
}

function BracketResultCard({ slot }: { slot: BracketSlot }) {
  const match = slot.match;
  const winner = match ? getWinner(match) : null;
  const score =
    match?.status === "FINISHED" && match.homeScore !== null && match.awayScore !== null
      ? `${match.homeScore}:${match.awayScore}`
      : null;

  return (
    <div className="rounded-[1rem] bg-black/25 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-bold text-white/40">
          {match ? formatDate(match.startTime) : "Очікує пару"}
        </span>
        <span className="rounded-full bg-white/10 px-2 py-1 text-[9px] font-black text-white/45">
          {match?.status === "FINISHED" ? "FT" : match?.status ?? "TBD"}
        </span>
      </div>
      <BracketTeamRow team={slot.homeTeam} active={winner?.id === slot.homeTeam?.id} />
      <BracketTeamRow team={slot.awayTeam} active={winner?.id === slot.awayTeam?.id} />
      {score ? (
        <div className="mt-2 flex items-center justify-between rounded-lg bg-white/10 px-2 py-1 text-xs font-black">
          <span>{score}</span>
          {match && match.penaltyHome !== null && match.penaltyAway !== null ? (
            <span className="text-white/45">пен. {match.penaltyHome}:{match.penaltyAway}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BracketTeamRow({ team, active }: { team: TeamLike | null; active: boolean }) {
  return (
    <div
      className={[
        "mt-1 rounded-lg px-2 py-1.5",
        active ? "bg-emerald-500/15 text-emerald-50" : "bg-white/[0.04] text-white/75",
      ].join(" ")}
    >
      <TeamMark team={team} compact />
    </div>
  );
}

function TeamMark({ team, compact = false }: { team: TeamLike | null; compact?: boolean }) {
  if (!team) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={[
            "flex shrink-0 items-center justify-center rounded-full bg-[var(--panel-strong)] text-white/35",
            compact ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm",
          ].join(" ")}
        >
          ?
        </span>
        <span
          className={[
            "min-w-0 truncate font-black text-white/35",
            compact ? "text-xs" : "text-sm",
          ].join(" ")}
        >
          Очікується
        </span>
      </div>
    );
  }

  const logoSrc = getTeamLogoSrc(team);
  const flag = getTeamFlagEmoji(team);
  const name = getTeamDisplayName(team);
  const fallback = (team.code || team.tla || team.shortName || team.name).slice(0, 3).toUpperCase();

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={[
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--panel-strong)]",
          compact ? "h-7 w-7" : "h-9 w-9",
        ].join(" ")}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={name}
            className={compact ? "h-5 w-5 object-contain" : "h-7 w-7 object-contain"}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="text-base leading-none">{flag || fallback}</span>
        )}
      </span>
      <span className={["min-w-0 truncate font-black", compact ? "text-xs" : "text-sm"].join(" ")}>
        {name}
      </span>
    </div>
  );
}

function getTournamentTypeLabel(type: TournamentView["type"]) {
  if (type === "GROUP_KNOCKOUT") return "Групи + сітка";
  if (type === "GROUPS") return "Групи";
  if (type === "KNOCKOUT") return "Сітка";
  return "Таблиця";
}

function EmptyState() {
  return (
    <div className="rounded-[1.25rem] bg-[var(--card-highlight)] p-8 text-center">
      <h2 className="text-2xl font-black text-[var(--text)]">Турнірів поки немає</h2>
      <p className="theme-muted mx-auto mt-2 max-w-xl text-sm font-semibold">
        Коли статист або адмін додасть матчі, тут зʼявляться турнірні таблиці та сітки.
      </p>
    </div>
  );
}

function TablesBottomNav({ active }: { active: "game" | "matches" | "tables" | "account" }) {
  const items = [
    { id: "game", label: "Лобі", href: "/", icon: <IconHome /> },
    { id: "matches", label: "Матчі", href: "/matches", icon: <IconCalendar /> },
    { id: "tables", label: "Таблиця", href: "/tables", icon: <IconTable /> },
    { id: "account", label: "Акаунт", href: "/me", icon: <IconUser /> },
  ];

  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[1.35rem] bg-[var(--panel)]/95 p-1.5 shadow-2xl shadow-black/15 backdrop-blur-xl sm:sticky sm:inset-x-auto sm:bottom-0 sm:max-w-none sm:rounded-[1.5rem] sm:p-2">
      {items.map((item) => (
        <Link
          key={item.id}
          to={item.href}
          className={[
            "flex min-h-[3.25rem] flex-col items-center justify-center gap-1 rounded-[1rem] text-[11px] font-bold transition-colors sm:min-h-14 sm:text-sm",
            item.id === active
              ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
              : "theme-muted hover:bg-[var(--panel-strong)] hover:text-[var(--text)]",
          ].join(" ")}
        >
          <span className="h-6 w-6 sm:h-7 sm:w-7">{item.icon}</span>
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function TablesBackground() {
  return <div className="pointer-events-none absolute inset-0" />;
}

function SvgIcon({
  children,
  className = "h-5 w-5",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function IconHome() {
  return (
    <SvgIcon>
      <path d="M4 11L12 4L20 11V20H15V14H9V20H4V11Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </SvgIcon>
  );
}

function IconCalendar() {
  return (
    <SvgIcon>
      <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="2" />
      <path d="M8 3V7M16 3V7M4 10H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </SvgIcon>
  );
}

function IconTable() {
  return (
    <SvgIcon>
      <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M4 10H20M10 4V20M15 4V20" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}

function IconUser() {
  return (
    <SvgIcon>
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M4 21C5 17 8 15 12 15C16 15 19 17 20 21" stroke="currentColor" strokeWidth="2" />
    </SvgIcon>
  );
}
