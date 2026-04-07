import { Link, Outlet, useLocation } from "react-router";

function IconArrowLeft({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSpark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M14 18.5c.7-1.9 2.4-3.25 4.75-3.25 1.06 0 2.02.25 2.84.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M2.75 19.25C3.95 16.6 6.78 14.75 10.5 14.75s6.55 1.85 7.75 4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconShield({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.6-2.8 7.9-7 10-4.2-2.1-7-5.4-7-10V6l7-3Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CreateBackground() {
  return (
    <div className="pointer-events-none fixed inset-0">
      <div className="absolute left-[-10%] top-[-10%] h-[28rem] w-[28rem] rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute right-[-10%] top-[8%] h-[24rem] w-[24rem] rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="absolute bottom-[-10%] left-[20%] h-[26rem] w-[26rem] rounded-full bg-orange-500/10 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.015),transparent_18%,transparent_82%,rgba(255,255,255,0.015))]" />
    </div>
  );
}

function CreateTopNav() {
  return (
    <div className="flex items-center justify-between gap-3">
      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-white/85 transition hover:bg-white/[0.08] hover:text-white"
      >
        <IconArrowLeft className="h-4 w-4" />
        До лобі
      </Link>

      <div className="hidden rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/60 sm:block">
        Create flow
      </div>
    </div>
  );
}

function CreateHero() {
  const location = useLocation();

  const isLeague = location.pathname === "/create/league";
  const isCareer = location.pathname === "/create/career";

  const title = isLeague
    ? "Створення дружньої ліги"
    : isCareer
    ? "Створення сольної кар’єри"
    : "Створи нову гру";

  const description = isLeague
    ? "Налаштуй гру для друзів: назва, турнір, приватність, правила та формат змагання."
    : isCareer
    ? "Обери улюблений клуб і створи персональну кар’єру, де ти будеш аналізувати кожен матч."
    : "Обери режим: дружня ліга для компанії або сольна кар’єра за свій улюблений клуб.";

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1018] p-5 shadow-2xl shadow-black/30 sm:p-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.16),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]" />

      <div className="relative z-10">
        <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
          New game
        </div>

        <h1 className="mt-4 max-w-4xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl">
          {title}
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/68 sm:text-base sm:leading-7">
          {description}
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white">
              <IconUsers />
            </div>
            <div className="text-base font-black text-white">League</div>
            <p className="mt-1 text-sm leading-6 text-white/55">
              Для гри з друзями, таблиці, live-матчів і спільних прогнозів.
            </p>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white">
              <IconSpark />
            </div>
            <div className="text-base font-black text-white">Career</div>
            <p className="mt-1 text-sm leading-6 text-white/55">
              Для персональної кар’єри за клуб, складів, голеадорів і досягнень.
            </p>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white">
              <IconShield />
            </div>
            <div className="text-base font-black text-white">Control</div>
            <p className="mt-1 text-sm leading-6 text-white/55">
              Окремі сценарії створення, щоб групова гра і кар’єра не мішались.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CreateTabs() {
  const location = useLocation();

  const tabs = [
    { label: "Вибір режиму", to: "/create", exact: true },
    { label: "Дружня ліга", to: "/create/league" },
    { label: "Сольна кар’єра", to: "/create/career" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const active = tab.exact
          ? location.pathname === tab.to
          : location.pathname.startsWith(tab.to);

        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={[
              "inline-flex items-center justify-center rounded-2xl border px-4 py-2.5 text-sm font-semibold transition",
              active
                ? "border-white/20 bg-white text-black"
                : "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white",
            ].join(" ")}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

export default function CreateLayout() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#060b12] text-white">
      <CreateBackground />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        <CreateTopNav />
        <CreateHero />
        <CreateTabs />

        <section className="rounded-[2rem] border border-white/10 bg-[#0b1018]/90 p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6">
          <Outlet />
        </section>
      </div>
    </main>
  );
}