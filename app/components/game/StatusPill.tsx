const statusLabelByStatus: Record<string, string> = {
  SCHEDULED: "Скоро",
  TIMED: "Скоро",
  LIVE: "LIVE",
  IN_PLAY: "LIVE",
  PAUSED: "Пауза",
  HALFTIME: "Перерва",
  BREAK: "Перерва",
  FINISHED: "Завершено",
  CANCELED: "Скасовано",
  CANCELLED: "Скасовано",
  POSTPONED: "Перенесено",
};

export function getGameStatusLabel(status: string) {
  return statusLabelByStatus[status] || status;
}

export function StatusPill({
  status,
  tone,
  className = "",
}: {
  status: string;
  tone?: "live" | "upcoming" | "finished" | "warning" | "muted";
  className?: string;
}) {
  const inferredTone =
    tone ??
    (status === "LIVE" || status === "IN_PLAY"
      ? "live"
      : status === "FINISHED"
      ? "finished"
      : status === "POSTPONED"
      ? "warning"
      : status === "CANCELED" || status === "CANCELLED"
      ? "muted"
      : "upcoming");

  const toneClass =
    inferredTone === "live"
      ? "border-red-400/20 bg-red-500/15 text-red-300"
      : inferredTone === "finished"
      ? "border-emerald-400/20 bg-emerald-500/15 text-emerald-300"
      : inferredTone === "warning"
      ? "border-amber-400/20 bg-amber-500/15 text-amber-300"
      : inferredTone === "upcoming"
      ? "border-[color-mix(in_srgb,var(--accent)_28%,transparent)] bg-[var(--accent-soft)] text-[var(--accent)]"
      : "border-[var(--border)] bg-[var(--panel)] text-[var(--text-soft)]";

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
        toneClass,
        className,
      ].join(" ")}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {getGameStatusLabel(status)}
    </span>
  );
}
