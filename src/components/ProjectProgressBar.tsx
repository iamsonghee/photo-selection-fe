"use client";

const getProgress = (
  status: string,
  photoCount?: number,
  requiredCount?: number
): number => {
  if (status === "preparing") {
    if ((photoCount ?? 0) >= 1 && requiredCount != null && requiredCount > 0) {
      return Math.min(1 / 3, ((photoCount ?? 0) / requiredCount) * (1 / 3));
    }
    return 0;
  }
  if (status === "selecting") return 1;
  if (status === "confirmed") return 1.5;
  if (status === "editing") return 2;
  if (status === "reviewing_v1") return 2;
  if (status === "editing_v2") return 2;
  if (status === "reviewing_v2") return 2;
  if (status === "delivered") return 3;
  return 0;
};

const STEPS = ["업로드", "셀렉", "보정·검토", "완료"];
const MAX = 3;

type Props = {
  status: string;
  photoCount?: number;
  requiredCount?: number;
  className?: string;
};

export function ProjectProgressBar({
  status,
  photoCount,
  requiredCount,
  className = "",
}: Props) {
  const progress = getProgress(status, photoCount, requiredCount);
  const isComplete = status === "delivered";
  const currentDotIndex =
    status === "preparing"
      ? 0
      : progress < MAX
        ? Math.floor(progress)
        : -1;

  return (
    <div className={className}>
      {/* 단계명 + 점 */}
      <div className="flex">
        {STEPS.map((label, i) => {
          const completed = isComplete || progress > i;
          const current = currentDotIndex === i;
          const muted = !completed && !current;
          return (
            <div
              key={i}
              className="flex flex-1 flex-col items-center"
              style={{ minWidth: 0 }}
            >
              <span
                className={`text-[13px] font-semibold ${
                  muted ? "text-zinc-600" : "text-zinc-100"
                }`}
              >
                {label}
              </span>
              <span
                className={`mt-1.5 shrink-0 rounded-full ${
                  current
                    ? "h-2.5 w-2.5 bg-white shadow-[0_0_0_2px_rgba(255,255,255,0.3)]"
                    : muted
                      ? "h-2 w-2 bg-zinc-600"
                      : "h-2 w-2 bg-zinc-200"
                }`}
              />
            </div>
          );
        })}
      </div>
      {/* 이어지는 바 (간격 없이 한 줄, 두께 살짝 증가) */}
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-700">
        <div
          className="h-full rounded-full bg-white transition-all"
          style={{
            width: isComplete ? "100%" : `${(progress / MAX) * 100}%`,
          }}
        />
      </div>
    </div>
  );
}
