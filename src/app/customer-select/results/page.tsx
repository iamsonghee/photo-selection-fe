"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Images, RotateCcw } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { sceneTargetsWithEdits } from "@/lib/scene-targets";
import { useCustomerSelectCatalog } from "@/lib/customer-select-catalog";
import { useCustomerSelectDraft } from "@/contexts/CustomerSelectDraftContext";

function ResultsContent() {
  const router = useRouter();
  const { scenes: SCENES, photos, sample } = useCustomerSelectCatalog();
  const { targetCount, finalIds, favorites, guests, reviewedScenes, excludedScenes: excluded, setExcludedScenes: setExcluded, sceneTargets: targetOverrides, setSceneTarget, activeActor } = useCustomerSelectDraft();
  const searchParams = useSearchParams();
  const scenesAnalyzed = searchParams.get("scenes") === "1";
  const similarAnalyzed = searchParams.get("similar") === "1";
  const qualityAnalyzed = searchParams.get("quality") === "1";
  const anyAnalysis = scenesAnalyzed || similarAnalyzed || qualityAnalyzed;
  const targets = targetCount === null ? null : sceneTargetsWithEdits(SCENES.map(({ target, count }) => count ? target : 0), excluded, targetCount, targetOverrides);
  const lastSuggestedScene = SCENES.findLastIndex((scene, index) => scene.count > 0 && !excluded.has(index));
  const analysisHref = `/customer-select/analysis?similar=${similarAnalyzed ? 1 : 0}&scenes=${scenesAnalyzed ? 1 : 0}&quality=${qualityAnalyzed ? 1 : 0}`;

  function toggleScene(index: number) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else if (SCENES.some((scene, sceneIndex) => scene.count > 0 && sceneIndex !== index && !next.has(sceneIndex))) next.add(index);
      return next;
    });
  }

  return (
    <CustomerEntryShell layout="responsive">
      <div className="cs-brand-header relative border-b border-[var(--select-line)]">
        <CustomerEntryHeader href="/customer-select/new" />
        <span className="absolute bottom-[15px] right-6 text-[12px] font-semibold text-[var(--select-muted)]">정리 결과</span>
      </div>

      <main className="mx-auto w-full max-w-[1180px] px-6 py-8 md:px-10 md:py-14">
        <button type="button" onClick={() => router.push(analysisHref)} className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-[var(--customer-ink-secondary)] hover:text-[var(--customer-ink)]"><ArrowLeft size={17} aria-hidden="true" /> 분석 설정으로</button>

        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="m-0 text-[12px] font-bold text-[var(--accent)]">{sample ? "검수용 샘플" : "선택한 사진"} {photos.length.toLocaleString()}장</p>
            <h1 className="cs-title mt-2 ">
              {scenesAnalyzed ? <>장면별로<br />골라보세요.</> : anyAnalysis ? <>촬영 순서대로<br />골라보세요.</> : <>AI 분석 없이 준비했어요.<br />사진을 골라보세요.</>}
            </h1>
            <p className="mt-4 text-[14px] leading-6 text-[var(--customer-ink-secondary)]">{targetCount === null ? "목표 장수 미설정" : `목표 ${targetCount}장`} · 최종 선택 {finalIds.size}장 · 모든 사진을 확인할 수 있어요.</p>
          </div>
          <div className="grid grid-cols-3 border-y border-[var(--select-line)] py-3 text-center md:min-w-[330px]">
            <div><p className="m-0 text-[12px] text-[var(--select-muted)]">전체 사진</p><p className="mt-1 text-[18px] font-semibold">{photos.length.toLocaleString()}장</p></div>
            <div className="border-x border-[var(--select-line)]"><p className="m-0 text-[12px] text-[var(--select-muted)]">목표 가이드</p><p className="mt-1 text-[18px] font-semibold">{targetCount ?? "미설정"}{targetCount !== null && "장"}</p></div>
            <div><p className="m-0 text-[12px] text-[var(--select-muted)]">내 찜</p><p className="mt-1 text-[18px] font-semibold">{favorites[activeActor]?.size ?? 0}장</p></div>
          </div>
        </div>

        <section className="mt-9 cs-section" aria-labelledby="analysis-summary-title">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div><p className="m-0 text-[12px] font-semibold text-[var(--select-muted)]">정리 결과</p><h2 id="analysis-summary-title" className="mt-1 text-[19px] font-semibold text-[var(--customer-ink)]">{scenesAnalyzed ? "촬영 흐름대로 시작해 보세요." : "촬영 순서대로 시작해 보세요."}</h2></div>
            <div className="flex flex-wrap gap-2 text-[12px]">
              <span className={`rounded-full px-2.5 py-1 ${similarAnalyzed ? "bg-[var(--select-accent-soft)] text-[var(--select-accent-ink)]" : "bg-[var(--select-surface)] text-[var(--select-muted)]"}`}>유사컷 {similarAnalyzed ? sample ? "예시 적용" : "연동 전" : "미사용"}</span>
              <span className={`rounded-full px-2.5 py-1 ${scenesAnalyzed ? "bg-[var(--select-accent-soft)] text-[var(--select-accent-ink)]" : "bg-[var(--select-surface)] text-[var(--select-muted)]"}`}>장면 분류 {scenesAnalyzed ? sample ? "예시 적용" : "임시 구간" : "미사용"}</span>
              <span className={`rounded-full px-2.5 py-1 ${qualityAnalyzed ? "bg-[var(--select-accent-soft)] text-[var(--select-accent-ink)]" : "bg-[var(--select-surface)] text-[var(--select-muted)]"}`}>품질 표시 {qualityAnalyzed ? sample ? "예시 적용" : "연동 전" : "미사용"}</span>
            </div>
          </div>
        </section>

        {scenesAnalyzed ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 bg-[var(--select-surface)] px-4 py-3 text-[12px] text-[var(--customer-ink-secondary)]">
              <p className="m-0">촬영하지 않은 장면은 추천에서 제외하세요.</p>
              {excluded.size ? <button type="button" onClick={() => setExcluded(new Set())} className="inline-flex min-h-11 items-center gap-1 font-semibold text-[var(--customer-control)]"><RotateCcw size={14} aria-hidden="true" /> 모두 다시 포함</button> : null}
            </div>
            {!sample && <p className="mb-4 text-xs text-[var(--select-muted)]">장면은 촬영 순서로 나눈 임시 구간입니다. 상세보기에서 직접 바꿀 수 있어요.</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SCENES.map((scene, index) => {
                if (scene.count === 0) return null;
                const isExcluded = excluded.has(index);
                const scenePhotos = photos.filter(photo => photo.sceneIndex === index);
                const reserved = Object.entries(targetOverrides).reduce((sum, [key, value]) => {
                  const other = Number(key);
                  return sum + (other !== index && other !== lastSuggestedScene && SCENES[other]?.count && !excluded.has(other) ? value : 0);
                }, 0);
                const maxTarget = Math.max(0, (targetCount ?? 0) - reserved);
                return (
                  <article key={scene.name} className={`cs-photo-card overflow-hidden border ${isExcluded ? "border-[var(--customer-divider)] bg-[var(--select-surface)] opacity-65" : "border-[var(--customer-divider)] bg-white"}`}>
                    <div className="relative aspect-[16/9] bg-[var(--select-line)]"><Image src={scenePhotos[0]?.src ?? `/landing/sample-project/studio-v2/originals/ACUT_${String((index % 14) + 1).padStart(4, "0")}.jpg`} alt="" fill sizes="(max-width: 639px) 100vw, 280px" className="object-cover" /></div>
                    <div className="p-4">
                      <p className="m-0 min-h-11 text-[14px] font-semibold leading-5 text-[var(--customer-ink)]">{scene.name}</p>
                      <div className="mt-3 flex items-end justify-between"><p className="m-0 text-[12px] text-[var(--select-muted)]">{scene.count.toLocaleString()}장 · 내 찜 {scenePhotos.filter(photo => favorites[activeActor]?.has(photo.id)).length}장 · 최종 {scenePhotos.filter(photo => finalIds.has(photo.id)).length}장</p><p className="m-0 text-[12px] font-semibold text-[var(--select-accent-ink)]">{targets && (isExcluded ? "추천 제외" : `추천 ${targets[index]}장`)}</p></div>
                      {targets && activeActor === "owner" && <div className="mt-2 flex items-center gap-2 text-xs"><label>추천 장수 <input type="number" min={0} max={maxTarget} disabled={isExcluded || index === lastSuggestedScene} value={targets[index]} onChange={event => setSceneTarget(index, Math.min(maxTarget, Number(event.target.value)))} className="ml-1 w-16 rounded border px-1 py-1 disabled:opacity-50" /></label><label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={isExcluded} onChange={() => toggleScene(index)} />추천 제외</label></div>}
                      {reviewedScenes.has(index) && <p className="mt-2 text-xs font-semibold text-[var(--select-accent-ink)]">검토 완료</p>}
                      <Link className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold underline" href={`/customer-select/select?scene=${index}&scenes=1&similar=${similarAnalyzed ? 1 : 0}&quality=${qualityAnalyzed ? 1 : 0}`}>이 장면 고르기</Link>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--select-muted)]">모든 사진은 장면에서 확인할 수 있어요. 잘못 나뉜 사진은 상세보기에서 촬영 구간을 수정하세요.</p>
          </>
        ) : (
          <div className="grid gap-5 border border-[var(--customer-divider)] p-5 md:grid-cols-[180px_1fr_auto] md:items-center">
            <div className="grid grid-cols-2 gap-1">{[1, 2, 3, 4].map((number) => <div key={number} className="relative aspect-square overflow-hidden bg-[var(--select-line)]"><Image src={`/landing/sample-project/studio-v2/originals/ACUT_${String(number).padStart(4, "0")}.jpg`} alt="" fill sizes="90px" className="object-cover" /></div>)}</div>
            <div><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--select-surface)] text-[var(--customer-ink-secondary)]"><Images size={18} aria-hidden="true" /></span><h3 className="mt-3 text-[18px] font-semibold text-[var(--customer-ink)]">촬영 순서대로 전체 사진 보기</h3><p className="mt-2 text-[12px] leading-5 text-[var(--customer-ink-secondary)]">장면을 임의로 나누지 않고 원본 파일명과 촬영 순서를 유지합니다.{similarAnalyzed ? " 유사한 사진은 비교하기 쉽게 묶여 있어요." : ""}</p></div>
            <div className="border-l-2 border-[var(--customer-control)] pl-4"><p className="m-0 text-[12px] text-[var(--select-muted)]">전체</p><p className="mt-1 text-[22px] font-semibold">{photos.length.toLocaleString()}장</p></div>
          </div>
        )}

        {targets && <p className="mt-3 text-xs text-[var(--select-muted)]">마지막 장면 추천은 전체 목표에 맞춰 자동으로 계산해요. 추천보다 많거나 적게 골라도 됩니다.</p>}

        {guests.length > 0 && <p className="mt-6 text-xs">함께 고르는 사람: {guests.map(guest => `${guest.name} ${guest.done ? "찜 완료" : "고르는 중"}`).join(" · ")}</p>}
        <div className="mt-7 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => router.push(`/customer-select/select?scene=0&scenes=${scenesAnalyzed ? 1 : 0}&similar=${similarAnalyzed ? 1 : 0}&quality=${qualityAnalyzed ? 1 : 0}&collab=1`)} className="cs-secondary min-h-[52px] border px-5">함께 고르기</button>
          <button type="button" onClick={() => router.push(analysisHref)} className="cs-secondary min-h-[52px] border px-5">정리 방식 바꾸기</button>
          <button type="button" onClick={() => router.push(`/customer-select/select?scene=${scenesAnalyzed ? Math.max(0, SCENES.findIndex((scene, index) => scene.count > 0 && !excluded.has(index))) : 0}&scenes=${scenesAnalyzed ? 1 : 0}&similar=${similarAnalyzed ? 1 : 0}&quality=${qualityAnalyzed ? 1 : 0}`)} className={`cs-primary sm:max-w-[280px]`}>{scenesAnalyzed ? "첫 장면부터 고르기" : "촬영 순서대로 고르기"} <ChevronRight size={17} aria-hidden="true" /></button>
        </div>
      </main>
    </CustomerEntryShell>
  );
}

export default function CustomerSelectResultsPage() {
  return <Suspense><ResultsContent /></Suspense>;
}
