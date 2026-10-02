"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, Clock3, Images, LoaderCircle, TriangleAlert } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { useCustomerSelectDraft } from "@/contexts/CustomerSelectDraftContext";

const ANALYSIS_STAGES = [
  { id: "similar", label: "유사한 사진끼리 묶기", detail: "분석 상태 예시" },
  { id: "scenes", label: "촬영 구간별로 정리", detail: "촬영 흐름 확인" },
  { id: "quality", label: "눈 감음·흐림 의심 사진 표시", detail: "품질 확인" },
] as const;

function OrganizingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { uploadFiles } = useCustomerSelectDraft();
  const count = (uploadFiles.length || 5000).toLocaleString();
  const [notice, setNotice] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState("progress");
  const selected = ANALYSIS_STAGES.filter(({ id }) => searchParams.get(id) === "1");
  const resultQuery = new URLSearchParams(selected.map(({ id }) => [id, "1"])).toString();

  return (
    <CustomerEntryShell layout="responsive">
      <div className="cs-brand-header relative border-b border-[var(--select-line)]">
        <CustomerEntryHeader href="/customer-select/new" />
        <span className="absolute bottom-[15px] right-6 text-[12px] font-semibold text-[var(--select-muted)]">사진 정리</span>
      </div>

      <main className="mx-auto w-full max-w-[760px] px-6 py-9 md:px-10 md:py-16">
        <div className="grid gap-10 md:grid-cols-[1fr_320px] md:gap-16">
          <section aria-labelledby="organizing-title">
            <p className="m-0 text-[12px] font-bold text-[var(--accent)]">분석 진행 화면 예시</p>
            <h1 id="organizing-title" className="cs-title mt-3 ">사진을 정리하고 있어요.</h1>
            <p className="mt-4 text-[14px] leading-6 text-[var(--customer-ink-secondary)]">진행 상태 예시입니다.<br />실제 분석·백그라운드 처리는 미연결입니다.</p>
            <label className="mt-4 block text-xs">검수할 상태 <select aria-label="분석 진행 상태 예시" value={previewState} onChange={event => setPreviewState(event.target.value)} className="ml-2 min-h-11 rounded border px-2"><option value="progress">진행 중</option><option value="partial">일부 실패</option><option value="missing_time">촬영시간 없음</option></select></label>
            {previewState === "partial" && <p role="status" className="mt-3 text-xs">일부 사진 분석에 실패했어요. 전체 사진은 그대로 볼 수 있어요.</p>}
            {previewState === "missing_time" && <p role="status" className="mt-3 text-xs">촬영 시각 분석 전에는 파일 수정 시각 기준으로 임시 정렬해요. 촬영 구간은 직접 바꿀 수 있어요.</p>}

            <div className="mt-8 border-y border-[var(--select-line)] py-5">
              <div className="flex items-end justify-between gap-4">
                <div><p className="m-0 text-[12px] text-[var(--select-muted)]">전체 진행률</p><p className="mt-1 text-[28px] font-semibold text-[var(--customer-ink)]">58%</p></div>
                <p className="m-0 inline-flex items-center gap-1.5 text-[12px] text-[var(--customer-ink-secondary)]"><Clock3 size={14} aria-hidden="true" /> 진행 상태 예시</p>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--select-line)]" aria-label="사진 정리 58% 완료"><div className="h-full w-[58%] bg-[var(--accent)]" /></div>
            </div>

            <div className="mt-6 flex gap-3 border-l-2 border-[var(--customer-divider)] bg-[var(--select-surface)] px-4 py-3">
              <TriangleAlert className="mt-0.5 shrink-0 text-[var(--select-muted)]" size={18} aria-hidden="true" />
              <p className="m-0 text-[12px] leading-5 text-[var(--customer-ink-secondary)]">분석에 실패해도 사진은 삭제하거나 숨기지 않아요.</p>
            </div>
          </section>

          <section className="self-start cs-section" aria-label="사진 정리 단계">
            {[{ label: "준비한 사진 확인", detail: `${count}장`, status: "done" }, { label: "로컬 미리보기 연결", detail: `${count}장`, status: "done" }, ...selected.map((stage, index) => ({ ...stage, status: index ? "waiting" : "active" }))].map((stage) => (
              <div key={stage.label} className="flex min-h-[68px] items-center gap-3 border-b border-[var(--select-line)] py-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${stage.status === "done" ? "bg-[var(--customer-control)] text-white" : stage.status === "active" ? "bg-[var(--select-accent-soft)] text-[var(--accent)]" : "bg-[var(--select-surface)] text-[var(--select-muted)]"}`}>
                  {stage.status === "done" ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : stage.status === "active" ? <LoaderCircle size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                </span>
                <div className="min-w-0"><p className="m-0 text-[13px] font-semibold text-[var(--customer-ink)]">{stage.label}</p><p className="mt-1 text-[12px] text-[var(--select-muted)]">{stage.detail}</p></div>
              </div>
            ))}
          </section>
        </div>

        {notice ? <p role="status" className="mt-6 border border-[var(--customer-divider)] bg-[var(--select-surface)] px-4 py-3 text-[12px] leading-5 text-[var(--customer-ink-secondary)]">{notice}</p> : null}

        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          <button type="button" className="cs-primary" onClick={() => router.push(`/customer-select/results${resultQuery ? `?${resultQuery}` : ""}`)}><Images size={17} aria-hidden="true" /> 정리 결과 미리보기</button>
          <button type="button" className="cs-secondary border px-4" onClick={() => setNotice("검수 화면에서는 저장·재개를 지원하지 않아요.")}>나중에 돌아오기 <ChevronRight size={17} aria-hidden="true" /></button>
        </div>

        <div className="mt-3 flex justify-center gap-3"><button type="button" onClick={() => router.push(`/customer-select/select?scene=0&scenes=0&similar=0&quality=0`)} className="min-h-11 text-xs font-semibold underline">정리 중에도 사진 보기</button><button type="button" onClick={() => router.push(`/customer-select/analysis?similar=${selected.some(stage => stage.id === "similar") ? 1 : 0}&scenes=${selected.some(stage => stage.id === "scenes") ? 1 : 0}&quality=${selected.some(stage => stage.id === "quality") ? 1 : 0}`)} className="min-h-11 text-xs underline">분석 설정으로</button></div>
      </main>
    </CustomerEntryShell>
  );
}

export default function CustomerSelectOrganizingPage() {
  return <Suspense><OrganizingContent /></Suspense>;
}
