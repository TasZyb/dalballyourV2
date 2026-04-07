import { Link } from "react-router";

function IconArrowRight({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconUsers({ className = "h-6 w-6" }: { className?: string }) {
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

function IconSpark({ className = "h-6 w-6" }: { className?: string }) {
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

function IconCheck({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ModePoint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm leading-6 text-white/70">
      <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/85">
        <IconCheck className="h-3.5 w-3.5" />
      </span>
      <span>{children}</span>
    </div>
  );
}

function ModeCard({
  badge,
  title,
  description,
  features,
  href,
  actionLabel,
  icon,
  accent = "neutral",
}: {
  badge: string;
  title: string;
  description: string;
  features: string[];
  href: string;
  actionLabel: string;
  icon: React.ReactNode;
  accent?: "blue" | "orange" | "neutral";
}) {
  const accentClass =
    accent === "blue"
      ? "border-blue-400/20 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]"
      : accent === "orange"
      ? "border-orange-400/20 bg-[radial-gradient(circle_at_top_left,rgba(245,130,18,0.14),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]"
      : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))]";

  const buttonClass =
    accent === "orange"
      ? "bg-[#F58212] text-white hover:brightness-110"
      : "bg-white text-black hover:opacity-90";

  return (
    <Link
      to={href}
      className={`group relative overflow-hidden rounded-[1.75rem] border p-5 shadow-xl shadow-black/20 transition duration-300 hover:-translate-y-1.5 hover:border-white/20 sm:p-6 ${accentClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
          {badge}
        </div>

        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
          {icon}
        </div>
      </div>

      <h2 className="mt-5 text-2xl font-black tracking-tight text-white sm:text-3xl">
        {title}
      </h2>

      <p className="mt-3 max-w-xl text-sm leading-6 text-white/65 sm:text-base sm:leading-7">
        {description}
      </p>

      <div className="mt-5 space-y-3">
        {features.map((feature) => (
          <ModePoint key={feature}>{feature}</ModePoint>
        ))}
      </div>

      <div
        className={`mt-6 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition ${buttonClass}`}
      >
        {actionLabel}
        <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export default function CreateIndexPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-2">
        <ModeCard
          badge="Friends mode"
          title="Створити дружню лігу"
          description="Запусти окрему гру для компанії, запроси друзів і змагайся за таблицю прогнозів на реальних матчах."
          features={[
            "Приватна або публічна ліга",
            "Запрошення по коду",
            "Таблиця, live-матчі та спільні прогнози",
          ]}
          href="/create/league"
          actionLabel="Перейти до ліги"
          icon={<IconUsers />}
          accent="blue"
        />

        <ModeCard
          badge="Solo mode"
          title="Почати сольну кар’єру"
          description="Обери улюблений клуб і створи власний режим сезону, де ти аналізуєш кожен матч, склад і голеадорів."
          features={[
            "Один гравець — одна персональна кар’єра",
            "Фокус на улюбленому клубі",
            "Склади, голи, аналіз і досягнення",
          ]}
          href="/create/career"
          actionLabel="Перейти до кар’єри"
          icon={<IconSpark />}
          accent="orange"
        />
      </section>

      <section className="rounded-[1.75rem] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Порада
        </div>

        <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
          З чого краще почати?
        </h3>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-base font-black text-white">Обирай лігу, якщо:</div>
            <div className="mt-3 space-y-3">
              <ModePoint>хочеш грати з друзями;</ModePoint>
              <ModePoint>тобі потрібна таблиця й рейтинг між учасниками;</ModePoint>
              <ModePoint>важливі код входу та соціальна частина гри.</ModePoint>
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-4">
            <div className="text-base font-black text-white">Обирай кар’єру, якщо:</div>
            <div className="mt-3 space-y-3">
              <ModePoint>хочеш грати сам і вести власний прогрес;</ModePoint>
              <ModePoint>тобі цікаво детально аналізувати матчі свого клубу;</ModePoint>
              <ModePoint>потрібен режим з фокусом на склади та голеадорів.</ModePoint>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}