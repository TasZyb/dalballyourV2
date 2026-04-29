// app/routes/super-admin/danger-zone.tsx
export default function SuperAdminDangerZonePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-red-300">Danger Zone</h1>
        <p className="text-sm text-white/60">
          Тут потім будуть тільки справді небезпечні дії: hard delete,
          purge, force reset і т.д.
        </p>
      </div>

      <div className="rounded-[28px] border border-red-500/20 bg-red-500/10 p-6">
        <div className="text-lg font-black">Поки що порожньо</div>
        <p className="mt-2 text-sm text-red-100/80">
          Я спеціально не додаю сюди небезпечних action-ів на старті, щоб не
          знести БД випадково.
        </p>
      </div>
    </div>
  );
}