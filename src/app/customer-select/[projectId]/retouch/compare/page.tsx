"use client";
/* eslint-disable @next/next/no-img-element -- R2 thumbnails are already resized for the gallery. */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, ImagePlus } from "lucide-react";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { useProjectShell } from "../../../_lib/ProjectShell";
import { ProjectBodySkeleton } from "../../../_lib/ProjectBodySkeleton";
import { useRetouchData, latestVersion, deleteRetouched, type RetouchPhoto, type RetouchVersion } from "../../../_lib/retouch-store";
import { RetouchErrorScreen } from "../../../_lib/RetouchErrorScreen";
import s from "../upload/upload.module.css";

export default function RetouchComparePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  useProjectShell({ step: "send" });
  const { photos, error, loading, refresh } = useRetouchData(projectId);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ photo: RetouchPhoto; version: RetouchVersion } | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function remove() {
    if (!removing || removeBusy) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      await deleteRetouched(projectId, removing.version.id);
      await refresh();
      setRemoving(null);
    } catch (cause) {
      setRemoveError(cause instanceof Error ? cause.message : "보정본을 지우지 못했어요.");
    } finally {
      setRemoveBusy(false);
    }
  }
  const ready = useMemo(() => photos.flatMap((photo) => {
    const version = latestVersion(photo);
    return version ? [{ photo, version }] : [];
  }), [photos]);
  const focusIndex = ready.findIndex(({ photo }) => photo.id === focusId);
  const focused = ready[focusIndex];

  if (loading) return <ProjectBodySkeleton variant="cards" label="보정본을 불러오고 있어요" />;
  if (error) return <RetouchErrorScreen message={error} />;

  return <main className={s.page}>
    <header className={s.header}>
      <button type="button" className={s.back} aria-label="셀렉 결과로 돌아가기" onClick={() => router.push(`/customer-select/${projectId}/review`)}><ArrowLeft size={20} /></button>
      <h1>보정본 비교</h1>
    </header>
    <div className={s.content}>
      <section className={s.intro}>
        <h2>{ready.length ? `보정본 ${ready.length}장을 비교해 보세요` : "아직 올린 보정본이 없어요"}</h2>
        <p>{ready.length ? "사진을 열고 누르고 있는 동안 원본을 볼 수 있어요." : "작가님께 받은 보정본을 올리면 선택한 원본과 비교할 수 있어요."}</p>
        <button type="button" className={ready.length ? s.secondaryButton : s.pickButton} onClick={() => router.push(`/customer-select/${projectId}/retouch/upload`)}><ImagePlus size={20} /> {ready.length ? "보정본 더 올리기" : "받은 보정본 올리기"}</button>
      </section>
      {ready.length > 0 && <section className={s.section}>
        <div className={s.sectionHead}><h2>올린 보정본</h2><span>{ready.length} / {photos.length}장</span></div>
        <div className={s.compareGrid}>{ready.map(({ photo, version }) => <div className={s.compareCard} key={photo.id}>
          <button type="button" className={s.comparePhoto} aria-label={`${photo.filename} 보정본 비교하기`} onClick={() => setFocusId(photo.id)}>
            <img src={version.thumbUrl ?? version.previewUrl ?? ""} alt="" />
            <span>{photo.filename}<ArrowRight size={16} /></span>
          </button>
          <button type="button" className={s.removeButton} aria-label={`${photo.filename} 보정본 지우기`} onClick={() => { setRemoveError(null); setRemoving({ photo, version }); }}>잘못 올렸어요 · 지우기</button>
        </div>)}</div>
      </section>}
      {photos.length > ready.length && <details className={s.section}>
        <summary className={s.missingSummary}>아직 보정본이 없는 사진 {photos.length - ready.length}장</summary>
        <div className={s.photoGrid}>{photos.filter((photo) => !latestVersion(photo)).map((photo) => <div className={s.photoTile} key={photo.id}><img src={photo.url} alt={photo.filename} /><span>{photo.filename}</span></div>)}</div>
      </details>}
    </div>
    {removing && <SelectionConfirmDialog
      title="이 보정본을 지울까요?"
      description={<>원본 {removing.photo.filename}에 연결한 보정본을 지워요.<br />맞는 원본을 골라 다시 올릴 수 있어요.</>}
      confirmLabel="지우기"
      busyLabel="지우는 중…"
      confirming={removeBusy}
      error={removeError}
      danger
      onCancel={() => setRemoving(null)}
      onConfirm={() => void remove()}
    />}
    <PhotoFocusOverlay
      open={Boolean(focused)}
      src={focused?.version.previewUrl ?? focused?.version.thumbUrl ?? ""}
      originalSrc={focused?.photo.previewUrl ?? focused?.photo.url}
      alt={focused?.photo.filename ?? "보정본"}
      onClose={() => setFocusId(null)}
      onPrev={focusIndex > 0 ? () => setFocusId(ready[focusIndex - 1].photo.id) : undefined}
      onNext={focusIndex >= 0 && focusIndex < ready.length - 1 ? () => setFocusId(ready[focusIndex + 1].photo.id) : undefined}
    />
  </main>;
}
