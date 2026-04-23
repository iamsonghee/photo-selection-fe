export default function PhotographerLoading() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#050505]">
      <div
        className="text-[11px] text-zinc-600 tracking-[0.15em] uppercase animate-pulse"
        style={{ fontFamily: "var(--font-mono, monospace)" }}
      >
        Loading...
      </div>
    </div>
  );
}
