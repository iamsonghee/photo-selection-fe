"use client";

import { Suspense, useRef, useState } from "react";
import { SelectImage as Image } from "../SelectImage";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, MessageCircle, TriangleAlert } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { useCustomerSelectDraft } from "@/contexts/CustomerSelectDraftContext";
import { useCustomerSelectCatalog } from "@/lib/customer-select-catalog";
import { resultPhotos } from "@/lib/customer-select-result";
import { PhotoComparison } from "../select/PhotoComparison";

const button = "cs-secondary inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[var(--customer-divider)] px-4 text-xs font-semibold disabled:opacity-40";

function ReviewContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { scenes: SELECT_SCENES, photos: catalogPhotos } = useCustomerSelectCatalog();
  const { finalIds, toggleFinal, notes, projectName, targetCount, createDelivery, excludedScenes, activeActor, closed } = useCustomerSelectDraft();
  const photos = resultPhotos(finalIds, catalogPhotos);
  const [removed, setRemoved] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const creating = useRef(false);
  const activeIndex = photos.findIndex(photo => photo.id === activeId);
  const scenesEnabled = params.get("scenes") !== "0";
  const qualityEnabled = params.get("quality") === "1";
  const sceneHref = (scene: number) => { const query = new URLSearchParams(params.toString()); query.set("scene", String(scene)); return `/customer-select/select?${query}`; };
  const sceneCounts = SELECT_SCENES.map((_, index) => photos.filter(photo => photo.sceneIndex === index).length);
  const unitCounts = new Map<string, number>();
  for (const photo of photos) unitCounts.set(photo.unitId, (unitCounts.get(photo.unitId) ?? 0) + 1);
  const repeatedUnits = [...unitCounts.values()].filter(count => count > 1).length;
  const repeatedPhoto = photos.find(photo => (unitCounts.get(photo.unitId) ?? 0) > 1);
  const qualityPhotos = qualityEnabled ? photos.filter(photo => photo.quality) : [];
  const missingScene = scenesEnabled ? SELECT_SCENES.findIndex((scene, index) => scene.count > 0 && !excludedScenes.has(index) && sceneCounts[index] === 0) : -1;
  const sections = scenesEnabled
    ? SELECT_SCENES.map((scene, index) => ({ name: scene.name, index, selected: photos.filter(photo => photo.sceneIndex === index) })).filter(section => section.selected.length)
    : [{ name: "선택한 사진", index: 0, selected: photos }];
  const reviewUnits = photos.map(photo => ({ id: photo.id, scene: scenesEnabled ? photo.scene : "촬영 순서", photos: [photo] }));
  const noteCount = photos.filter(photo => notes[photo.id]?.trim()).length;
  function createResult() {
    if (creating.current || !photos.length) return;
    creating.current = true;
    const version = createDelivery(photos);
    const query = new URLSearchParams(params.toString()); query.set("v", String(version));
    router.push(`/customer-select/delivery?${query}`);
  }

  return <CustomerEntryShell layout="responsive">
    <div className="cs-brand-header border-b border-[var(--select-line)]"><CustomerEntryHeader href="/customer-select/new" /></div>
    <main className="mx-auto max-w-[1180px] px-6 pb-32 pt-4 md:px-10 md:pt-7">
      <Link href={sceneHref(Number(params.get("scene")) || 0)} className={button}><ArrowLeft size={16} />{photos.length > 0 ? "사진 더 고르기" : "사진 선택으로"}</Link>
      <div className="mt-5"><h1 className="cs-title">최종 검토</h1><p className="mt-1 text-sm text-[var(--customer-ink-secondary)]">{projectName} · 최종 선택 {photos.length}장{targetCount !== null && ` · 목표 ${targetCount}장`}</p></div>

      {photos.length > 0 && <>
        <div aria-label="확인할 항목" className="mt-4 flex flex-wrap gap-2 text-xs">
          {targetCount !== null && photos.length !== targetCount && <Link href={photos.length < targetCount ? sceneHref(0) : "#review-photos"} className={button}>목표보다 {Math.abs(photos.length - targetCount)}장 {photos.length > targetCount ? "많아요" : "적어요"} · 확인</Link>}
          {missingScene >= 0 && <Link href={sceneHref(missingScene)} className={button}>선택하지 않은 장면이 있어요 · 확인</Link>}
          {params.get("similar") !== "0" && repeatedPhoto && <a href={`#photo-${repeatedPhoto.id}`} className={button}>유사컷 {repeatedUnits}묶음에서 여러 장 선택 · 확인</a>}
          {qualityPhotos.length > 0 && <a href={`#photo-${qualityPhotos[0].id}`} className={button}>품질 확인 사진 {qualityPhotos.length}장 · 확인</a>}
        </div>
      </>}

      {removed && <p role="status" className="mt-4 text-xs">사진을 선택 해제했어요. <button className={button + " ml-2"} onClick={() => { toggleFinal(removed); setRemoved(null); }}>되돌리기</button></p>}
      {!photos.length && <section className="py-16 text-center"><h2 className="text-lg font-semibold">아직 선택한 사진이 없어요.</h2><p className="mt-2 text-sm text-[var(--select-muted)]">사진을 고른 뒤 다시 검토해 주세요.</p><Link className={button + " mt-5"} href={sceneHref(0)}>사진 고르기</Link></section>}

      {photos.length > 0 && <div id="review-photos" className="mt-5 space-y-8">{sections.map(section => <section key={section.name} aria-label={section.name}>
        {scenesEnabled && <div className="mb-3 flex items-center justify-between gap-2 border-t border-[var(--customer-divider)] pt-4"><h2 className="text-base font-semibold">{section.name} · {section.selected.length}장</h2><Link href={sceneHref(section.index)} className={button}>이 장면에서 더 고르기</Link></div>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{section.selected.map(photo => <article id={`photo-${photo.id}`} key={photo.id} className="cs-photo-card min-w-0 scroll-mt-24 overflow-hidden rounded border border-[var(--customer-divider)]">
          <button className="relative block aspect-square w-full bg-[var(--select-surface)]" aria-label={photo.filename + " 크게 보기"} onClick={() => setActiveId(photo.id)}><Image src={photo.src} alt={photo.filename} fill sizes="(max-width: 767px) 50vw, 270px" className="object-cover" />
            {qualityEnabled && photo.quality && <span title={photo.quality} aria-label={photo.quality} className="absolute left-2 top-2 rounded bg-white/95 p-1 text-[#886341]"><TriangleAlert size={15} aria-hidden="true" /></span>}
            {notes[photo.id]?.trim() && <span title="요청 사항 있음" aria-label="요청 사항 있음" className="absolute bottom-2 right-2 rounded bg-white/95 p-1 text-[var(--customer-control)]"><MessageCircle size={15} aria-hidden="true" /></span>}
          </button>
        </article>)}</div>
      </section>)}</div>}
      <p className="mt-8 text-xs leading-5 text-[var(--select-muted)]">프론트 시안 · 새로고침하면 선택과 메모가 초기화됩니다.</p>
    </main>
    {photos.length > 0 && <footer className="cs-actionbar fixed inset-x-0 bottom-0 z-30 border-t border-[var(--customer-divider)] bg-white px-6 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto flex max-w-[1116px] items-center justify-between gap-3"><div className="text-xs leading-5"><strong>{photos.length}장 선택</strong><br />{activeActor === "owner" ? "아직 작가에게 전달되지 않았어요" : "소유주가 최종 결정해요"}</div>{activeActor === "owner" && <button className="cs-primary cs-compact shrink-0" disabled={closed} onClick={() => confirmDialog.current?.showModal()}>결과 만들기<ChevronRight size={16} /></button>}</div>
    </footer>}
    {activeIndex >= 0 && <PhotoComparison units={reviewUnits} initialIndex={activeIndex} onClose={() => setActiveId(null)} onRemove={setRemoved} reviewMode qualityAnalyzed={qualityEnabled} scenes={[]} categories={[]} people={[]} sceneByPhotoId={{}} />}
    <dialog ref={confirmDialog} aria-labelledby="review-confirm-title" className="fixed inset-0 m-auto w-[min(90vw,420px)] rounded-xl border border-[var(--customer-divider)] bg-white p-5 text-[var(--customer-ink)] shadow-xl backdrop:bg-black/50">
      <h2 id="review-confirm-title" className="text-lg font-semibold">이 결과를 만들까요?</h2>
      <p className="mt-3 text-sm leading-6">선택한 사진 {photos.length}장{targetCount !== null && ` · 목표 ${targetCount}장`}<br />요청 사항이 있는 사진 {noteCount}장</p>
      <p className="mt-3 text-xs leading-5 text-[var(--customer-ink-secondary)]">결과를 만든 뒤 파일명과 요청 사항을 확인할 수 있어요. 작가에게 자동으로 전송되지는 않습니다.</p>
      <div className="mt-5 flex gap-2"><button className={button + " flex-1"} onClick={() => confirmDialog.current?.close()}>다시 검토</button><button className="cs-primary cs-compact flex-1" onClick={createResult}>결과 만들고 확인하기</button></div>
    </dialog>
  </CustomerEntryShell>;
}

export default function ReviewPage() { return <Suspense><ReviewContent /></Suspense>; }
