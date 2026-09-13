"use client";

/**
 * 사진 목록에서 "지금 몇 번째인가"를 알려주는 얇은 바.
 *
 * 필름스트립이 하던 두 역할(위치 파악 + 점프) 중 위치 파악을 트랙 + thumb 세그먼트로,
 * 점프를 탭/드래그 seek로 대신한다(docs/customer-design.md §11).
 * 셀렉 뷰어와 보정본 검토가 같은 계산식·같은 모양을 쓰도록 공통 컴포넌트로 둔다.
 */
export function PhotoPositionBar({
  ordinal,
  total,
  prefix = "",
  onSeek,
  tone = "accent",
  className = "",
}: {
  /** 1-based 현재 위치 */
  ordinal: number;
  total: number;
  /** 카운트 앞에 붙일 말(예: "대표컷 ") */
  prefix?: string;
  /** 0~1 비율로 이동 요청 */
  onSeek: (ratio: number) => void;
  /** accent = 주황(PC), plain = 흰색(사진 위 오버레이) */
  tone?: "accent" | "plain";
  /** 위치를 정하는 건 호출부의 몫이다 */
  className?: string;
}) {
  /* 스크롤바와 같은 수학: 폭은 전체 대비 내 비중(최소 6%로 바닥을 둬서 사진이 많아도 보이게),
   * 위치는 첫 장에서 왼쪽 끝, 마지막 장에서 오른쪽 끝에 닿도록 thumb 폭만큼 이동 범위를 줄인다. */
  const thumbWidthPct = total > 0 ? Math.max(100 / total, 6) : 100;
  const thumbLeftPct =
    total > 1 ? ((ordinal - 1) / (total - 1)) * (100 - thumbWidthPct) : 0;

  const seekFromClientX = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    onSeek((clientX - rect.left) / rect.width);
  };

  return (
    <div
      className={`cpb-root${tone === "plain" ? " cpb-plain" : ""} ${className}`}
      onTouchStart={(event) => {
        event.stopPropagation();
        if (event.touches.length !== 1) return;
        seekFromClientX(event.touches[0].clientX, event.currentTarget.firstElementChild as HTMLElement);
      }}
      onTouchMove={(event) => {
        event.stopPropagation();
        if (event.touches.length !== 1) return;
        seekFromClientX(event.touches[0].clientX, event.currentTarget.firstElementChild as HTMLElement);
      }}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      <div
        className="cpb-track"
        role="group"
        aria-label={`사진 위치 ${ordinal} / ${total}, 눌러서 다른 사진으로 이동`}
        onClick={(event) => seekFromClientX(event.clientX, event.currentTarget)}
      >
        <div
          className="cpb-thumb"
          style={{ left: `${thumbLeftPct}%`, width: `${thumbWidthPct}%` }}
          aria-hidden
        />
      </div>
      <span className="cpb-count" aria-hidden>
        {prefix}
        {ordinal}/{total}
      </span>

      <style>{`
        .cpb-root {
          display: flex; align-items: center; gap: 10px;
          touch-action: none;
        }
        .cpb-track {
          position: relative; flex: 1; height: 100%;
          display: flex; align-items: center; cursor: pointer;
        }
        .cpb-track::before {
          content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 3px;
          transform: translateY(-50%); border-radius: 999px; background: rgba(255,255,255,.16);
        }
        .cpb-thumb {
          position: absolute; top: 50%; height: 3px; min-width: 16px;
          transform: translateY(-50%); border-radius: 999px; background: var(--accent);
          transition: left 140ms ease, width 140ms ease;
        }
        .cpb-plain .cpb-thumb { background: #fff; }
        .cpb-count {
          flex: 0 0 auto; font: 600 11px/1 Pretendard, 'Noto Sans KR', sans-serif;
          color: rgba(255,255,255,.55); font-variant-numeric: tabular-nums; white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
