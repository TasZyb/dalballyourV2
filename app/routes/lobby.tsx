import {
  Link,
  useLoaderData,
  data,
  type LoaderFunctionArgs,
} from "react-router";
import { prisma } from "~/lib/db.server";
import { getCurrentUser } from "~/lib/auth.server";
import { Form } from "react-router";

type LobbyGameCard = {
  id: string;
  name: string;
  slug: string | null;
  inviteCode: string;
  visibility: string;
  status: string;
  membersCount: number;
  matchesCount: number;
  ownerId: string;
  ownerName: string;
  linkedTournamentName: string | null;
  createdAt: Date;
};

export async function loader({ request }: LoaderFunctionArgs) {
  const currentUser = await getCurrentUser(request);

  if (!currentUser) {
    return data({
      currentUser: null,
      games: [],
      stats: null,
    });
  }

  const memberships = await prisma.gameMember.findMany({
    where: {
      userId: currentUser.id,
      status: "ACTIVE",
    },
    include: {
      game: {
        include: {
          owner: true,
          linkedTournament: true,
          _count: {
            select: {
              members: true,
              gameMatches: true,
            },
          },
        },
      },
    },
    orderBy: {
      joinedAt: "desc",
    },
  });

  const games: LobbyGameCard[] = memberships.map((membership) => ({
    id: membership.game.id,
    name: membership.game.name,
    slug: membership.game.slug,
    inviteCode: membership.game.inviteCode,
    visibility: membership.game.visibility,
    status: membership.game.status,
    membersCount: membership.game._count.members,
    matchesCount: membership.game._count.gameMatches,
    ownerId: membership.game.ownerId,
    ownerName:
      membership.game.owner.displayName ||
      membership.game.owner.name ||
      membership.game.owner.email ||
      "Гравець",
    linkedTournamentName: membership.game.linkedTournament?.name ?? null,
    createdAt: membership.game.createdAt,
  }));

  const ownerGamesCount = memberships.filter(
    (membership) =>
      membership.role === "OWNER" || membership.role === "ADMIN"
  ).length;

  const totalMatches = games.reduce((sum, game) => sum + game.matchesCount, 0);

  return data({
    currentUser,
    games,
    stats: {
      gamesCount: games.length,
      ownerGamesCount,
      totalMatches,
    },
  });
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  const map: Record<string, string> = {
    PRIVATE: "Приватна",
    PUBLIC: "Публічна",
    UNLISTED: "За посиланням",
  };

  return (
    <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
      {map[visibility] || visibility}
    </span>
  );
}

function GameStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "Активна",
    ARCHIVED: "Архів",
    DRAFT: "Чернетка",
  };

  return (
    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
      {map[status] || status}
    </span>
  );
}

export default function LobbyPage() {
  const { currentUser, games, stats } = useLoaderData<typeof loader>();

  return (
    <div className="relative min-h-screen overflow-x-hidden theme-page">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.22),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.18),transparent_22%),linear-gradient(to_bottom,#0a0a0a,#111827,#0a0a0a)]" />

      <header className="sticky top-0 z-30 border-b border-white/10 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 md:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.35em] text-white/45 sm:text-xs">
              Match Predictor League
            </div>
            <h1 className="mt-1 pr-2 text-xl font-black tracking-tight sm:text-2xl md:text-3xl">
              Lobby
            </h1>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {currentUser ? (
              <>
                <Link
                  to="/me"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto"
                >
                  Кабінет
                </Link>

                <Form method="post" action="/logout">
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto"
                  >
                    Вийти
                  </button>
                </Form>
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-black transition hover:opacity-90 sm:w-auto"
              >
                Увійти через Google
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8">
        {!currentUser ? (
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:gap-6">
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-6 md:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200 sm:text-xs">
                  Приватні ліги
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60 sm:text-xs">
                  Лобі для друзів
                </span>
              </div>

              <h2 className="max-w-3xl text-[2rem] font-black leading-[1.05] tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
                Створюй свою гру, клич друзів і змагайся в прогнозах
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70 sm:mt-5 sm:text-base sm:leading-7 md:text-lg">
                Це платформа для дружніх ліг прогнозів. Створюй власну гру,
                запрошуй компанію, додавай матчі, веди таблицю і дивись, хто
                реально шарить у футболі.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
                >
                  Увійти через Google
                </Link>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-blue-500/20 via-white/5 to-violet-500/20 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-6 md:p-8">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/50 sm:text-sm">
                Як це працює
              </div>

              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-bold text-white">1. Створи гру</div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    Ти створюєш окреме лобі для своєї компанії і стаєш його
                    адміністратором.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-bold text-white">
                    2. Запроси друзів
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    Люди приєднуються в твою гру через код або посилання.
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-bold text-white">
                    3. Прогнозуйте матчі
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    Кожен ставить свій рахунок, а таблиця рахує все автоматично.
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl sm:rounded-[2rem] sm:p-6 md:p-8">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/45">
                    Welcome back
                  </div>

                  <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                    {currentUser.displayName || currentUser.name || "Гравець"},
                    обери гру або створи нову
                  </h2>

                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
                    Це твій стартовий хаб. Тут ти заходиш у свої ліги,
                    керуєш новими іграми або приєднуєшся до чужих.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/create"
                    className="inline-flex items-center justify-center rounded-2xl bg-white px-5 py-3 text-sm font-bold text-black transition hover:opacity-90"
                  >
                    Створити гру
                  </Link>

                  <Link
                    to="/join"
                    className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15"
                  >
                    Приєднатися до гри
                  </Link>
                </div>
              </div>
            </section>

            {stats ? (
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <div className="text-sm text-white/45">Мої ігри</div>
                  <div className="mt-2 text-3xl font-black">
                    {stats.gamesCount}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <div className="text-sm text-white/45">Керую іграми</div>
                  <div className="mt-2 text-3xl font-black">
                    {stats.ownerGamesCount}
                  </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
                  <div className="text-sm text-white/45">Матчів у моїх іграх</div>
                  <div className="mt-2 text-3xl font-black">
                    {stats.totalMatches}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45 sm:text-sm">
                    Мої ігри
                  </div>
                  <h3 className="mt-1 text-xl font-black sm:text-2xl">
                    Вибери лігу
                  </h3>
                </div>

                <Link
                  to="/create"
                  className="text-sm font-semibold text-white/70 hover:text-white"
                >
                  + Створити ще одну гру
                </Link>
              </div>

              {games.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {games.map((game) => (
                    <Link
                      key={game.id}
                      to={`/games/${game.id}`}
                      className="group rounded-[1.5rem] border border-white/10 bg-black/20 p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <VisibilityBadge visibility={game.visibility} />
                        <GameStatusBadge status={game.status} />
                      </div>

                      <h4 className="mt-4 text-xl font-black transition group-hover:text-white/90">
                        {game.name}
                      </h4>

                      <div className="mt-3 space-y-2 text-sm text-white/55">
                        <div>Учасників: {game.membersCount}</div>
                        <div>Матчів: {game.matchesCount}</div>
                        <div>Owner: {game.ownerName}</div>
                        {game.linkedTournamentName ? (
                          <div>Турнір: {game.linkedTournamentName}</div>
                        ) : (
                          <div>Турнір: вільний формат</div>
                        )}
                      </div>

                      <div className="mt-5 text-sm font-semibold text-white/70 transition group-hover:text-white">
                        Відкрити гру →
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/20 p-6 text-white/55">
                  У тебе ще немає жодної гри. Почни зі створення своєї першої ліги.
                </div>
              )}
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:rounded-[2rem] sm:p-6">
              <div className="mb-3">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45 sm:text-sm">
                  Швидкі дії
                </div>
                <h3 className="mt-1 text-xl font-black sm:text-2xl">
                  Що можна зробити далі
                </h3>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Link
                  to="/create"
                  className="rounded-[1.4rem] border border-white/10 bg-black/20 p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="text-base font-bold">Створити нову гру</div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    Створи власну лігу, отримай код запрошення і керуй нею як
                    owner.
                  </div>
                </Link>

                <Link
                  to="/join"
                  className="rounded-[1.4rem] border border-white/10 bg-black/20 p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="text-base font-bold">Приєднатися по коду</div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    Введи invite code і зайди в гру своїх друзів.
                  </div>
                </Link>

                <Link
                  to="/me"
                  className="rounded-[1.4rem] border border-white/10 bg-black/20 p-5 transition hover:border-white/20 hover:bg-white/[0.06]"
                >
                  <div className="text-base font-bold">Мій профіль</div>
                  <div className="mt-2 text-sm leading-6 text-white/55">
                    Онови свій профіль, display name і персональні налаштування.
                  </div>
                </Link>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}