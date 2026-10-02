"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Clock3, Eye, Images, Layers3 } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { useCustomerSelectDraft } from "@/contexts/CustomerSelectDraftContext";

const ANALYSES = [
  { id: "similar", icon: Images, title: "유사한 사진끼리 묶기", body: "연속으로 촬영된 비슷한 사진을 비교하기 쉽게 묶어요.", recommended: true },
  { id: "scenes", icon: Layers3, title: "촬영 구간별로 정리하기", body: "선택한 촬영 유형에 맞춰 시간순 구간을 살펴봐요." },
  { id: "quality", icon: Eye, title: "눈 감음·흐림 의심 사진 표시", body: "사진을 숨기지 않고 확인이 필요한 이유만 표시해요." },
] as const;

type AnalysisId = typeof ANALYSES[number]["id"];

function AnalysisContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { analyses, setAnalyses, uploadFiles } = useCustomerSelectDraft();
  const fromQuery = ANALYSES.some(({ id }) => params.has(id));
  const [selected, setSelected] = useState<Set<AnalysisId>>(() => new Set(ANALYSES.filter(({ id }) => fromQuery ? params.get(id) === "1" : analyses.has(id)).map(({ id }) => id)));

  function toggle(id: AnalysisId) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next); setAnalyses(new Set(next));
  }

  function continueFlow() {
    const query = new URLSearchParams(ANALYSES.filter(({ id }) => selected.has(id)).map(({ id }) => [id, "1"]));
    setAnalyses(new Set(selected));
    router.push(selected.size ? `/customer-select/organizing?${query}` : "/customer-select/results");
  }

  return (
    <CustomerEntryShell layout="responsive">
      <div className="cs-brand-header relative border-b border-[var(--select-line)]">
        <CustomerEntryHeader href="/customer-select/new" />
        <span className="absolute bottom-[15px] right-6 text-[12px] font-semibold text-[var(--select-muted)]">분석 설정</span>
      </div>

      <main className="mx-auto w-full max-w-[720px] px-6 py-8 md:px-10 md:py-14">
        <button type="button" onClick={() => router.push("/customer-select/upload")} className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-[var(--customer-ink-secondary)] hover:text-[var(--customer-ink)]">
          <ArrowLeft size={17} aria-hidden="true" /> 업로드 확인으로
        </button>

        <p className="m-0 text-[12px] font-bold text-[var(--accent)]">사진이 브라우저에 준비됐어요</p>
        <h1 className="cs-title mt-2 ">사진 정리 방식을<br />선택해 주세요.</h1>
        <p className="mt-4 text-[14px] leading-6 text-[var(--customer-ink-secondary)]">필요한 항목만 선택하세요. 모두 건너뛰어도 괜찮아요.<br />사진은 삭제하거나 숨기지 않습니다.</p>

        <div className="mt-8 grid grid-cols-2 border-y border-[var(--select-line)] py-4">
          <div><p className="m-0 text-[12px] text-[var(--select-muted)]">{uploadFiles.length ? "준비한 사진" : "검수용 샘플"}</p><p className="mt-1 text-[20px] font-semibold text-[var(--customer-ink)]">{(uploadFiles.length || 5000).toLocaleString()}장</p></div>
          <div className="border-l border-[var(--select-line)] pl-5"><p className="m-0 text-[12px] text-[var(--select-muted)]">선택한 분석</p><p className="mt-1 text-[20px] font-semibold text-[var(--customer-ink)]">{selected.size}개</p></div>
        </div>

        <section className="mt-8 cs-section" aria-labelledby="analysis-options-title">
          <div className="py-4"><p className="m-0 text-[12px] font-semibold text-[var(--select-muted)]">사진 정리 방식 선택</p><h2 id="analysis-options-title" className="mt-1 text-[18px] font-semibold text-[var(--customer-ink)]">필요한 분석만 실행해요.</h2></div>
          {ANALYSES.map(({ id, icon: Icon, title, body, ...option }) => (
            <label key={id} className="grid cursor-pointer grid-cols-[36px_1fr_auto] items-start gap-3 border-t border-[var(--select-line)] py-4 last:border-b">
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${selected.has(id) ? "bg-[var(--select-accent-soft)] text-[var(--accent)]" : "bg-[var(--select-surface)] text-[var(--customer-ink-secondary)]"}`}><Icon size={18} aria-hidden="true" /></span>
              <span>
                <span className="flex flex-wrap items-center gap-2 text-[14px] font-semibold text-[var(--customer-ink)]">{title}{"recommended" in option ? <span className="rounded-full bg-[var(--select-accent-soft)] px-2 py-0.5 text-[12px] font-semibold text-[var(--select-accent-ink)]">추천</span> : null}</span>
                <span className="mt-1 block text-[12px] leading-5 text-[var(--customer-ink-secondary)]">{body}</span>
              </span>
              <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} className="mt-1 h-5 w-5 accent-[var(--accent)]" />
            </label>
          ))}
        </section>

        <div className="mt-7 flex items-start gap-2 bg-[var(--select-surface)] px-4 py-3 text-[12px] leading-5 text-[var(--customer-ink-secondary)]">
          <Clock3 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="m-0">{selected.size ? "검수용 화면입니다. 실제 분석은 미연결입니다." : "촬영 순서와 원본 파일명을 유지해요."}</p>
        </div>

        <button type="button" className={`cs-primary mt-6`} onClick={continueFlow}>{selected.size ? "선택한 항목으로 사진 정리" : "AI 분석 없이 사진 확인"}</button>
      </main>
    </CustomerEntryShell>
  );
}

export default function CustomerSelectAnalysisPage() { return <Suspense><AnalysisContent /></Suspense>; }
