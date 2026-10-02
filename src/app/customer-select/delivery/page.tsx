"use client";

import { Suspense, useState } from "react";
import { SelectImage as Image, SelectPhotoFocus } from "../SelectImage";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Download, Eye, ArrowLeft } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { useCustomerSelectDraft } from "@/contexts/CustomerSelectDraftContext";
import { useCustomerSelectCatalog } from "@/lib/customer-select-catalog";
import { resultCsv, resultPhotos } from "@/lib/customer-select-result";

const button = "cs-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--customer-divider)] px-4 text-xs font-semibold";

function DeliveryContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { photos: catalogPhotos } = useCustomerSelectCatalog();
  const { deliveries } = useCustomerSelectDraft();
  const version = params.has("v") ? Number(params.get("v")) : deliveries.length;
  const delivery = deliveries.find(item => item.version === version);
  const preview = params.get("preview") === "1";
  const [status, setStatus] = useState("");
  const [manualCopy, setManualCopy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const photos = resultPhotos(delivery?.photoIds ?? [], delivery?.photos ?? catalogPhotos);
  const deletedSinceDelivery = photos.some(photo => !catalogPhotos.some(current => current.id === photo.id));
  const activeIndex = photos.findIndex(photo => photo.id === activeId);
  const active = photos[activeIndex];
  const href = (nextVersion: number, nextPreview = preview) => {
    const query = new URLSearchParams(params.toString()); query.set("v", String(nextVersion));
    if (nextPreview) query.set("preview", "1"); else query.delete("preview");
    return `/customer-select/delivery?${query}`;
  };
  const reviewQuery = new URLSearchParams(params.toString()); reviewQuery.delete("v"); reviewQuery.delete("preview");
  const filenames = photos.map(photo => photo.filename).join("\n");
  const requests = delivery ? `${delivery.projectName} · 결과 v${version}\n선택 ${photos.length}장\n\n` + photos.map(photo => `${photo.filename}${delivery.notes[photo.id]?.trim() ? "\n요청: " + delivery.notes[photo.id] : ""}`).join("\n\n") : "";
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setStatus(`${label} 복사 완료`); }
    catch { setManualCopy(true); setStatus("복사가 안 됐어요. 아래 목록을 직접 복사하세요."); }
  }
  function download() {
    if (!delivery) return;
    const url = URL.createObjectURL(new Blob([resultCsv(photos, delivery.notes, version)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `A-CUT_셀렉결과_v${version}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`v${version} CSV 다운로드를 시작했어요.`);
  }
  function movePhoto(direction: number) { setActiveId(photos[(activeIndex + direction + photos.length) % photos.length].id); }

  return <CustomerEntryShell layout="responsive">
    <div className="cs-brand-header border-b border-[var(--select-line)]"><CustomerEntryHeader href="/customer-select/new" /></div>
    <main className="mx-auto max-w-[1180px] px-6 pb-16 pt-6 md:px-10 md:pt-10">
      {!delivery ? <section className="py-16 text-center"><h1 className="cs-title ">전달 결과가 없어요.</h1><p className="mt-3 text-sm leading-6 text-[var(--select-muted)]">최종 검토에서 결과를 먼저 만들어 주세요.<br />프론트 검수 중에는 새로고침하면 결과가 초기화됩니다.</p><Link href={`/customer-select/review?${reviewQuery}`} className={button + " mt-5"}>최종 검토로</Link></section> : <>
        <Link href={preview ? href(version, false) : `/customer-select/review?${reviewQuery}`} className={button}><ArrowLeft size={16} />{preview ? "결과 전달로" : "선택·요청 수정하기"}</Link>
        <p className="mt-7 text-xs font-semibold text-[var(--accent)]">{preview ? "공유 결과 미리보기" : "결과 전달"}</p>
        <h1 className="cs-title mt-2 ">{preview ? "작가에게 보여줄 결과" : "작가에게 전달해 주세요."}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--customer-ink-secondary)]">{delivery.projectName}<br />결과 v{version} · {photos.length}장 · {new Date(delivery.createdAt).toLocaleString("ko-KR")}</p>
        <p className="mt-3 text-xs leading-5 text-[var(--select-muted)]">파일명과 요청 사항을 전달해요. 자동 발송은 하지 않아요.</p>
        {new Set(photos.map(photo => photo.filename)).size < photos.length && <p role="alert" className="mt-2 text-xs text-[var(--select-accent-ink)]">같은 파일명이 있어요. CSV의 원본 경로·크기·시간을 확인하고 작가에게 구분해서 전달하세요.</p>}
        {deletedSinceDelivery && <p role="alert" className="mt-2 text-xs text-[var(--select-accent-ink)]">결과 생성 후 사진 목록에서 삭제한 파일이 있어요. 이전 버전의 파일명과 메모는 유지되지만 미리보기는 보이지 않을 수 있어요.</p>}
        <p className="mt-2 text-xs leading-5 text-[var(--select-muted)]">프론트 시안 · 새로고침하면 결과가 초기화됩니다.</p>
        {version < deliveries.length && <p role="status" className="mt-4 rounded-lg border border-[var(--select-accent-line)] bg-[var(--select-accent-soft)] p-3 text-xs">이전 결과 v{version}입니다. 최신 결과는 v{deliveries.length}이에요.</p>}

        {!preview && <section className="mt-7 rounded-lg border border-[var(--customer-divider)] p-4 md:p-5" aria-label="전달 방법">
          <h2 className="text-base font-semibold">복사하거나 CSV로 보내세요.</h2>
          <p className="mt-2 text-xs leading-5 text-[var(--customer-ink-secondary)]">작가가 A-CUT을 쓰지 않아도 받을 수 있어요.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button className={button} onClick={() => copy(filenames, "파일명 목록")}><Copy size={15} />파일명 목록 복사</button>
            <button className={button} onClick={() => copy(requests, "파일명과 요청 사항")}><Copy size={15} />요청 사항까지 복사</button>
            <button className="cs-primary cs-compact" onClick={download}><Download size={15} />CSV 다운로드</button>
          </div>
          <div className="mt-4 border-t border-[var(--select-line)] pt-4"><Link href={href(version, true)} className={button}><Eye size={15} />공유 결과 미리보기</Link><p className="mt-2 text-xs leading-5 text-[var(--select-muted)]">화면 미리보기만 지원해요. 외부 공유는 미연결입니다.</p></div>
        </section>}
        {status && <p role="status" className="mt-4 rounded border border-[var(--customer-divider)] bg-[var(--select-surface)] p-3 text-xs leading-5">{status}</p>}
        {!preview && <details open={manualCopy || undefined} className="mt-4 rounded border border-[var(--customer-divider)] p-3"><summary className="cursor-pointer text-xs font-semibold">직접 복사할 목록 보기</summary><label className="mt-3 block text-xs">파일명과 요청 사항<textarea readOnly aria-label="직접 복사할 결과" value={requests} rows={8} className="mt-2 w-full rounded border border-[var(--customer-divider)] p-3 text-xs leading-5" onFocus={event => event.target.select()} /></label></details>}

        <section className="mt-8 border-t border-[var(--customer-divider)] pt-5" aria-label="전달 사진과 요청 사항">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">사진과 요청 사항 · {photos.length}장</h2>{!preview && <label className="text-xs">결과 버전<select aria-label="결과 버전" value={version} className="ml-2 min-h-11 rounded-lg border border-[var(--customer-divider)] px-3" onChange={event => { setStatus(""); router.push(href(Number(event.target.value))); }}>{[...deliveries].reverse().map(item => <option key={item.version} value={item.version}>v{item.version}{item.version === deliveries.length ? " · 최신" : " · 이전 결과"}</option>)}</select></label>}</div>
          <p className="mt-2 text-xs leading-5 text-[var(--select-muted)]">수정 후 결과를 다시 만들면 새 버전이 생겨요.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">{photos.map(photo => <article key={photo.id} className="cs-photo-card min-w-0 overflow-hidden rounded-lg border border-[var(--customer-divider)]">
            <button aria-label={photo.filename + " 크게 보기"} className="relative block aspect-square w-full bg-[var(--select-surface)]" onClick={() => setActiveId(photo.id)}><Image src={photo.src} alt={photo.filename} fill sizes="(max-width: 767px) 50vw, 270px" className="object-cover" /></button>
            <div className="p-3"><p className="break-all text-[12px] font-semibold">{photo.filename}</p><p className="mt-1 text-[12px] text-[var(--select-muted)]">{params.get("scenes") === "0" ? "촬영 순서" : photo.scene}</p><p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-[var(--customer-ink-secondary)]">{delivery.notes[photo.id]?.trim() || "별도 요청 없음"}</p></div>
          </article>)}</div>
        </section>
      </>}
    </main>
    <SelectPhotoFocus key={active?.id ?? "closed"} open={Boolean(active)} src={active?.src ?? ""} alt={active?.filename ?? ""} onClose={() => setActiveId(null)} onPrev={photos.length > 1 ? () => movePhoto(-1) : undefined} onNext={photos.length > 1 ? () => movePhoto(1) : undefined} />
  </CustomerEntryShell>;
}

export default function DeliveryPage() { return <Suspense><DeliveryContent /></Suspense>; }
