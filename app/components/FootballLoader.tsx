export function FootballLoader() {
  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="status"
      aria-label="Завантаження"
    >
      <div className="relative flex items-center justify-center">
        <div className="h-14 w-14 animate-spin-slow text-5xl leading-none">⚽</div>
        <div className="absolute h-20 w-20 animate-ping rounded-full border border-white/20" />
      </div>
    </div>
  );
}
