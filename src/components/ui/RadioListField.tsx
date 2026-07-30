import { useId } from "react";

/**
 * 의미가 서로 다른 단일선택 문항용 세로 라디오 리스트. 행 전체가 클릭 가능하고,
 * 선택지 문장 길이에 맞춰 자연스럽게 줄바꿈되도록 높이를 고정하지 않는다.
 *
 * name은 useId()로 인스턴스별로 유일하게 만든다 — 모달 셸(PhotographerModal)이 children을
 * 모바일/데스크톱 레이아웃 두 곳에 동시에 렌더링하는데(하나는 display:none으로만 숨김), 두
 * 사본이 같은 name 문자열을 그대로 쓰면 브라우저의 네이티브 "같은 name 중 하나만 체크" 동작이
 * DOM 트리 경계를 넘어 서로 간섭해 방금 클릭한 옵션이 다시 풀리는 버그가 있었다.
 */
export function RadioListField<T extends string | boolean>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const uid = useId();
  const groupName = `${name}-${uid}`;
  return (
    <div className="flex flex-col gap-2" role="radiogroup">
      {options.map((opt) => (
        <label
          key={String(opt.value)}
          className="flex items-start gap-3 rounded-lg border border-border px-3.5 py-3 cursor-pointer transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent/10"
        >
          <input
            type="radio"
            name={groupName}
            value={String(opt.value)}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
          />
          <span className="text-sm text-foreground [word-break:keep-all] [overflow-wrap:anywhere] leading-relaxed">
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}
