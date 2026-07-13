import {
  Form,
  data,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { ReactNode } from "react";
import { prisma } from "~/lib/db.server";
import { requireStatistician } from "~/lib/statistician.server";
import { getTeamDisplayName, getTeamFlagEmoji } from "~/lib/logo-utils";

const matchStatuses = ["SCHEDULED", "LIVE", "FINISHED", "POSTPONED", "CANCELED"] as const;

function readOptionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

function readOptionalInt(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  if (value === "") return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function readRequiredDate(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) return null;

  return date;
}

function toDateTimeLocalValue(date: Date | string) {
  const value = new Date(date);
  const pad = (part: number) => String(part).padStart(2, "0");

  return [
    value.getFullYear(),
    "-",
    pad(value.getMonth() + 1),
    "-",
    pad(value.getDate()),
    "T",
    pad(value.getHours()),
    ":",
    pad(value.getMinutes()),
  ].join("");
}

function formatMatchDate(date: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv",
  }).format(new Date(date));
}

function isValidStatus(status: string): status is (typeof matchStatuses)[number] {
  return matchStatuses.includes(status as (typeof matchStatuses)[number]);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireStatistician(request);
  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);

  from.setDate(from.getDate() - 3);
  to.setDate(to.getDate() + 21);

  const [tournaments, teams, rounds, matches] = await Promise.all([
    prisma.tournament.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.team.findMany({
      orderBy: [{ country: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        shortName: true,
        code: true,
        country: true,
        logo: true,
      },
    }),
    prisma.round.findMany({
      orderBy: [{ tournamentId: "asc" }, { order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        tournamentId: true,
        tournament: { select: { name: true } },
      },
    }),
    prisma.match.findMany({
      where: {
        startTime: {
          gte: from,
          lte: to,
        },
      },
      orderBy: [{ status: "asc" }, { startTime: "asc" }],
      take: 120,
      include: {
        tournament: { select: { id: true, name: true } },
        round: { select: { id: true, name: true } },
        homeTeam: true,
        awayTeam: true,
      },
    }),
  ]);

  return {
    user: {
      displayName: user.displayName,
      name: user.name,
      email: user.email,
    },
    tournaments,
    teams,
    rounds,
    matches,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  await requireStatistician(request);

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");

  if (intent === "createMatch") {
    const tournamentId = String(formData.get("tournamentId") || "");
    const roundId = readOptionalString(formData, "roundId");
    const homeTeamId = String(formData.get("homeTeamId") || "");
    const awayTeamId = String(formData.get("awayTeamId") || "");
    const startTime = readRequiredDate(formData, "startTime");
    const status = String(formData.get("status") || "SCHEDULED");

    if (!tournamentId || !homeTeamId || !awayTeamId || !startTime) {
      return data({ error: "Заповни турнір, команди і дату матчу." }, { status: 400 });
    }

    if (homeTeamId === awayTeamId) {
      return data({ error: "Команди в матчі мають бути різними." }, { status: 400 });
    }

    if (!isValidStatus(status)) {
      return data({ error: "Некоректний статус матчу." }, { status: 400 });
    }

    try {
      await prisma.match.create({
        data: {
          tournamentId,
          roundId,
          homeTeamId,
          awayTeamId,
          startTime,
          status: status as any,
          venue: readOptionalString(formData, "venue"),
          stageLabel: readOptionalString(formData, "stageLabel"),
          matchdayLabel: readOptionalString(formData, "matchdayLabel"),
          sourceUpdatedAt: new Date(),
        },
      });
    } catch {
      return data(
        { error: "Не вдалось створити матч. Перевір, чи такого матчу вже немає." },
        { status: 400 }
      );
    }

    return redirect("/s7_stats_room_26");
  }

  if (intent === "updateMatch") {
    const matchId = String(formData.get("matchId") || "");
    const status = String(formData.get("status") || "");

    if (!matchId || !isValidStatus(status)) {
      return data({ error: "Некоректний матч або статус." }, { status: 400 });
    }

    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: status as any,
        homeScore: readOptionalInt(formData, "homeScore"),
        awayScore: readOptionalInt(formData, "awayScore"),
        extraHomeScore: readOptionalInt(formData, "extraHomeScore"),
        extraAwayScore: readOptionalInt(formData, "extraAwayScore"),
        penaltyHome: readOptionalInt(formData, "penaltyHome"),
        penaltyAway: readOptionalInt(formData, "penaltyAway"),
        lockedAt: status === "FINISHED" ? new Date() : null,
        sourceUpdatedAt: new Date(),
      },
    });

    return redirect("/s7_stats_room_26");
  }

  return data({ error: "Невідома дія." }, { status: 400 });
}

export default function StatisticianWorkbenchPage() {
  const { user, tournaments, teams, rounds, matches } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const liveMatches = matches.filter((match) => match.status === "LIVE").length;
  const upcomingMatches = matches.filter((match) => match.status === "SCHEDULED").length;
  const finishedMatches = matches.filter((match) => match.status === "FINISHED").length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#123a32_0%,#07151f_44%,#030712_100%)] px-3 py-4 text-white sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <header className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 shadow-2xl shadow-black/25 backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">
                Statistician desk
              </div>
              <h1 className="mt-1 text-2xl font-black sm:text-4xl">Матч-центр</h1>
              <div className="mt-1 text-sm font-semibold text-white/60">
                {user.displayName || user.name || user.email}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <StatCard label="Live" value={liveMatches} tone="text-red-200" />
              <StatCard label="Очікують" value={upcomingMatches} tone="text-emerald-200" />
              <StatCard label="FT" value={finishedMatches} tone="text-white" />
            </div>
          </div>
        </header>

        {"error" in (actionData || {}) ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/15 px-4 py-3 text-sm font-bold text-red-100">
            {actionData?.error}
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <CreateMatchPanel
            tournaments={tournaments}
            rounds={rounds}
            teams={teams}
            isSubmitting={isSubmitting}
          />

          <div className="min-h-[70vh] rounded-[1.5rem] border border-white/10 bg-white/8 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Матчі для оновлення</h2>
                <p className="text-sm font-semibold text-white/55">
                  Найближчі 21 день і останні 3 дні.
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">
                {matches.length}
              </span>
            </div>

            <div className="max-h-[calc(100dvh-13rem)] overflow-y-auto pr-1">
              <div className="grid gap-2">
                {matches.map((match) => (
                  <MatchEditorCard key={match.id} match={match} isSubmitting={isSubmitting} />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function CreateMatchPanel({
  tournaments,
  rounds,
  teams,
  isSubmitting,
}: {
  tournaments: Awaited<ReturnType<typeof loader>>["tournaments"];
  rounds: Awaited<ReturnType<typeof loader>>["rounds"];
  teams: Awaited<ReturnType<typeof loader>>["teams"];
  isSubmitting: boolean;
}) {
  return (
    <Form
      method="post"
      className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl"
    >
      <input type="hidden" name="intent" value="createMatch" />
      <h2 className="text-xl font-black">Створити матч</h2>
      <p className="mt-1 text-sm font-semibold text-white/55">
        Мінімум: турнір, команди і дата. Деталі можна дозаповнити пізніше.
      </p>

      <div className="mt-4 grid gap-3">
        <Field label="Турнір">
          <select name="tournamentId" required className={inputClassName}>
            <option value="" className="bg-slate-950">
              Обери турнір
            </option>
            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id} className="bg-slate-950">
                {tournament.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Раунд">
          <select name="roundId" className={inputClassName}>
            <option value="" className="bg-slate-950">
              Без раунду
            </option>
            {rounds.map((round) => (
              <option key={round.id} value={round.id} className="bg-slate-950">
                {round.tournament.name} · {round.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <TeamSelect label="Господарі" name="homeTeamId" teams={teams} />
          <TeamSelect label="Гості" name="awayTeamId" teams={teams} />
        </div>

        <Field label="Дата і час">
          <input
            type="datetime-local"
            name="startTime"
            required
            className={inputClassName}
            defaultValue={toDateTimeLocalValue(new Date())}
          />
        </Field>

        <Field label="Статус">
          <StatusSelect defaultValue="SCHEDULED" />
        </Field>

        <Field label="Стадія">
          <input name="stageLabel" placeholder="Semi Final" className={inputClassName} />
        </Field>

        <Field label="Тур / матчдей">
          <input name="matchdayLabel" placeholder="Matchday 3" className={inputClassName} />
        </Field>

        <Field label="Стадіон">
          <input name="venue" placeholder="Назва стадіону" className={inputClassName} />
        </Field>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="mt-4 min-h-12 w-full rounded-2xl bg-emerald-300 px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:opacity-60"
      >
        Створити матч
      </button>
    </Form>
  );
}

function MatchEditorCard({
  match,
  isSubmitting,
}: {
  match: Awaited<ReturnType<typeof loader>>["matches"][number];
  isSubmitting: boolean;
}) {
  const homeName = getTeamDisplayName(match.homeTeam);
  const awayName = getTeamDisplayName(match.awayTeam);

  return (
    <Form
      method="post"
      className="rounded-[1.25rem] border border-white/10 bg-black/20 p-3 transition hover:bg-white/8"
    >
      <input type="hidden" name="intent" value="updateMatch" />
      <input type="hidden" name="matchId" value={match.id} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_30rem] lg:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-lg font-black">
            <TeamMini team={match.homeTeam} />
            <span className="truncate">{homeName}</span>
            <span className="text-xs uppercase text-white/35">vs</span>
            <TeamMini team={match.awayTeam} />
            <span className="truncate">{awayName}</span>
          </div>
          <div className="mt-1 text-sm font-semibold text-white/55">
            {match.tournament.name} · {match.round?.name || "Без раунду"} ·{" "}
            {formatMatchDate(match.startTime)}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_4.5rem_4.5rem_auto] gap-2">
          <StatusSelect defaultValue={match.status} />
          <input
            type="number"
            min="0"
            name="homeScore"
            defaultValue={match.homeScore ?? ""}
            placeholder="H"
            className={inputClassName}
          />
          <input
            type="number"
            min="0"
            name="awayScore"
            defaultValue={match.awayScore ?? ""}
            placeholder="A"
            className={inputClassName}
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-emerald-100 disabled:opacity-60"
          >
            OK
          </button>
        </div>
      </div>

      <details className="mt-3 text-sm text-white/65">
        <summary className="cursor-pointer font-bold text-white/70">Додатковий час / пенальті</summary>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            type="number"
            min="0"
            name="extraHomeScore"
            defaultValue={match.extraHomeScore ?? ""}
            placeholder="ET H"
            className={inputClassName}
          />
          <input
            type="number"
            min="0"
            name="extraAwayScore"
            defaultValue={match.extraAwayScore ?? ""}
            placeholder="ET A"
            className={inputClassName}
          />
          <input
            type="number"
            min="0"
            name="penaltyHome"
            defaultValue={match.penaltyHome ?? ""}
            placeholder="P H"
            className={inputClassName}
          />
          <input
            type="number"
            min="0"
            name="penaltyAway"
            defaultValue={match.penaltyAway ?? ""}
            placeholder="P A"
            className={inputClassName}
          />
        </div>
      </details>
    </Form>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="min-w-24 rounded-2xl bg-black/25 px-4 py-3">
      <div className={["text-2xl font-black leading-none", tone].join(" ")}>{value}</div>
      <div className="mt-1 text-xs font-bold uppercase text-white/45">{label}</div>
    </div>
  );
}

function TeamSelect({
  label,
  name,
  teams,
}: {
  label: string;
  name: string;
  teams: Awaited<ReturnType<typeof loader>>["teams"];
}) {
  return (
    <Field label={label}>
      <select name={name} required className={inputClassName}>
        <option value="" className="bg-slate-950">
          Обери команду
        </option>
        {teams.map((team) => (
          <option key={team.id} value={team.id} className="bg-slate-950">
            {getTeamFlagEmoji(team)} {getTeamDisplayName(team)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function StatusSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select name="status" defaultValue={defaultValue} className={inputClassName}>
      {matchStatuses.map((status) => (
        <option key={status} value={status} className="bg-slate-950">
          {status}
        </option>
      ))}
    </select>
  );
}

function TeamMini({
  team,
}: {
  team: { name: string; shortName?: string | null; code?: string | null; country?: string | null };
}) {
  const flag = getTeamFlagEmoji(team);

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
      {flag || (team.code || team.shortName || team.name).slice(0, 2).toUpperCase()}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-black uppercase tracking-[0.14em] text-white/45">{label}</span>
      {children}
    </label>
  );
}

const inputClassName =
  "min-h-11 w-full rounded-2xl border border-white/10 bg-black/30 px-3 text-sm font-bold text-white outline-none transition placeholder:text-white/30 focus:border-emerald-300";
