"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import type { Project } from "@/types";
import { FocusProjectCard } from "./FocusProjectCard";

export function FocusProjectSection({ projects }: { projects: Project[] }) {
  const [index, setIndex] = useState(0);
  const total = projects.length;
  const safeIndex = Math.min(index, Math.max(0, total - 1));
  const current = projects[safeIndex];

  return (
    // 이전엔 카드 폭을 max-w-[1200px]로 고정해 내부 Metric Pair 비율(Figma 약 30%) 붕괴를 막았는데,
    // 그 결과 사이드바를 접어 Main 컬럼이 1200px보다 넓어지는 경우 이 섹션만 그 폭에 못 미쳐 "내 작업"
    // 등 형제 섹션과 오른쪽 끝이 어긋나 보였다(사용자 리포트). 근본 원인은 Metric Pair가 고정 px(356px)
    // 폭이라 카드가 넓어질수록 비중이 줄어드는 것이었으므로, 카드 폭 자체의 상한은 없애고 Metric Pair를
    // %기반 폭(FocusProjectCard의 MetricPair 참고)으로 바꿔 카드가 얼마나 넓어지든 비율이 그대로
    // 유지되도록 했다 — 이제 이 섹션은 Main 컬럼 폭을 그대로 따라가면 된다.
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[15px] font-bold text-foreground">우선 확인할 프로젝트</span>
        <div className="flex-1" />
        {total > 1 && (
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <button
              type="button"
              aria-label="이전 프로젝트"
              onClick={() => setIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0}
              className="flex items-center justify-center w-7 h-7 rounded-full border border-border-subtle text-subtle-foreground transition-colors hover:border-border hover:bg-surface disabled:opacity-25"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono">
              <b className="text-foreground">{safeIndex + 1}</b> / {total}
            </span>
            <button
              type="button"
              aria-label="다음 프로젝트"
              onClick={() => setIndex(Math.min(total - 1, safeIndex + 1))}
              disabled={safeIndex === total - 1}
              className="flex items-center justify-center w-7 h-7 rounded-full border border-border-subtle text-subtle-foreground transition-colors hover:border-border hover:bg-surface disabled:opacity-25"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-subtle bg-surface p-6 text-center">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-raised text-muted-foreground mb-0.5">
            <Check size={16} />
          </div>
          <h4 className="text-[13.5px] font-bold text-foreground m-0">지금 바로 확인할 프로젝트가 없어요</h4>
          <p className="text-[11.5px] text-muted-foreground m-0">마감 초과·고객 요청 등이 생기면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="relative">
          {total > 1 && (
            <div className="absolute inset-x-[-10px] top-1.5 h-6 rounded-2xl border border-border-subtle bg-surface-raised opacity-60 -z-0" />
          )}
          <div className="relative z-10">
            <FocusProjectCard project={current} />
          </div>
        </div>
      )}
    </section>
  );
}
