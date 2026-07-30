import { useId } from "react";
import type { FivePointScale } from "@/lib/beta-survey";

const POINTS: FivePointScale[] = [1, 2, 3, 4, 5];

/**
 * 5점 척도 전용 입력. 네이티브 radio(같은 name으로 그룹핑)를 시각적으로만 숨겨
 * Tab/방향키/Space 등 키보드 동작은 브라우저 기본 동작 그대로 가져간다.
 *
 * name은 useId()로 인스턴스별로 유일하게 만든다 — 모달 셸(PhotographerModal)이 children을
 * 모바일/데스크톱 레이아웃 두 곳에 동시에 렌더링하는데(하나는 display:none으로만 숨김), 두
 * 사본이 같은 name 문자열을 그대로 쓰면 브라우저의 네이티브 "같은 name 중 하나만 체크" 동작이
 * DOM 트리 경계를 넘어 서로 간섭할 수 있다(RadioListField에서 실제로 재현된 버그와 동일 원인).
 */
export function PointScaleField({
  name,
  value,
  onChange,
  labels,
}: {
  name: string;
  value: FivePointScale | null;
  onChange: (v: FivePointScale) => void;
  labels: Record<FivePointScale, string>;
}) {
  const uid = useId();
  const groupName = `${name}-${uid}`;
  return (
    <div>
      <div className="flex gap-1.5 sm:gap-2" role="radiogroup">
        {POINTS.map((n) => (
          <label
            key={n}
            className="flex-1 flex flex-col items-center gap-1 cursor-pointer select-none"
          >
            <input
              type="radio"
              name={groupName}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="peer sr-only"
            />
            <span
              className="flex aspect-square w-full max-w-11 items-center justify-center rounded-full border text-sm font-semibold text-muted-foreground border-border transition-colors peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50"
            >
              {n}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-subtle-foreground [word-break:keep-all]">
        <span>{labels[1]}</span>
        <span>{labels[5]}</span>
      </div>
      {value !== null && (
        <p className="mt-2 text-xs font-medium text-foreground [word-break:keep-all]">
          {value} · {labels[value]}
        </p>
      )}
    </div>
  );
}
