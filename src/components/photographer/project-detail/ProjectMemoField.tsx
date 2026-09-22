"use client";

import { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { updateProject } from "@/lib/db";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 800;

/** 작가만 보는 프로젝트 메모 — 입력을 멈추면 자동 저장된다. 고객 화면에는 절대 노출되지 않는다. */
export function ProjectMemoField({
  projectId,
  initialValue,
  onSaved,
}: {
  projectId: string;
  initialValue: string | null;
  /** DB 저장 성공 시 부모의 project 상태도 갱신한다 — 그래야 정보 수정 모달을 열고 닫아
   *  이 컴포넌트가 리마운트돼도(상세 화면이 editMode에서 통째로 언마운트됨) 방금 저장한
   *  값이 initialValue로 되돌아오지 않는다. */
  onSaved: (note: string) => void;
}) {
  const [value, setValue] = useState(initialValue ?? "");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedValueRef = useRef(initialValue ?? "");

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function handleChange(next: string) {
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (next === savedValueRef.current) return;
      setStatus("saving");
      try {
        await updateProject(projectId, { photographerNote: next.trim() || null });
        savedValueRef.current = next;
        onSaved(next);
        setStatus("saved");
      } catch {
        setStatus("error");
      }
    }, AUTOSAVE_DELAY_MS);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Lock size={11} /> 작가 메모 (나만 보임)
        </span>
        <span role="status" aria-live="polite" className="text-[11px] text-muted-foreground">
          {status === "saving" && "저장 중…"}
          {status === "saved" && "저장됨"}
          {status === "error" && <span className="text-danger">저장 실패</span>}
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="예: 신부 대기실에서 촬영, 실내 조명 어두움"
        rows={3}
        className="w-full resize-none rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-[13px] leading-5 text-foreground outline-none placeholder:text-placeholder-foreground focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
      />
    </div>
  );
}
