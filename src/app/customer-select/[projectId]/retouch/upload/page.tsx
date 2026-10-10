"use client";
/* eslint-disable @next/next/no-img-element -- R2 previews and local blob URLs already have their target size. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, ImagePlus } from "lucide-react";
import { PhotographerPageActionBar } from "@/components/photographer/PhotographerFormActionBar";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { buildUnambiguousVersionMapping } from "@/lib/version-mapping";
import { compressImagesInParallel } from "@/lib/upload-client-compress";
import { UPLOAD_INTERMEDIATE_JPEG_QUALITY } from "@/lib/upload-work-queue";
import { ProjectBodySkeleton } from "../../../_lib/ProjectBodySkeleton";
import { useRetouchData, uploadRetouched, latestVersion } from "../../../_lib/retouch-store";
import { CUSTOMER_UPLOAD_MAX_EDGE } from "../../../_lib/upload-limit";
import { RetouchErrorScreen } from "../../../_lib/RetouchErrorScreen";
import s from "./upload.module.css";

export default function RetouchUploadPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { photos, error: loadError, loading, refresh } = useRetouchData(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<(string | null)[]>([]);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);
  const assignedCount = assignments.filter(Boolean).length;
  const uploadedCount = photos.filter((photo) => latestVersion(photo)).length;
  const photoById = useMemo(() => new Map(photos.map((photo) => [photo.id, photo])), [photos]);

  function selectFiles(list: FileList | null) {
    if (!list?.length) return;
    const next = Array.from(list);
    if (new Set(next.map((file) => file.name)).size !== next.length) {
      setError("이름이 같은 파일이 있어요. 이름을 구분하거나 나누어 선택해 주세요.");
      return;
    }
    const mapping = buildUnambiguousVersionMapping(next, photos);
    setFiles(next);
    setPreviews(next.map((file) => URL.createObjectURL(file)));
    setAssignments(next.map((file) => mapping.find((row) => row.file === file)?.target.id ?? null));
    setChoosing(null);
    setError(null);
    setNotice(null);
  }

  function assign(index: number, photoId: string) {
    // 원본 하나엔 보정본 하나만 — 다른 파일에 이미 연결된 원본이면 그쪽 연결을 풀고 알려 준다.
    const displaced = assignments.findIndex((id, fileIndex) => id === photoId && fileIndex !== index);
    setNotice(displaced >= 0 ? `원본 ${photoById.get(photoId)?.filename ?? ""} 연결을 이 파일로 옮겼어요. ${files[displaced].name} 파일은 원본을 다시 골라 주세요.` : null);
    setAssignments((current) => current.map((id, fileIndex) => fileIndex === index ? photoId : id === photoId ? null : id));
    setChoosing(null);
  }

  async function upload() {
    const pairs = files.flatMap((file, index) => assignments[index] ? [{ file, photoId: assignments[index]! }] : []);
    if (!pairs.length || uploading) return;
    setUploading(true);
    setError(null);
    try {
      let uploadFiles: File[];
      try {
        uploadFiles = await compressImagesInParallel(
          pairs.map(({ file }) => file), new AbortController().signal, 3,
          { maxEdge: CUSTOMER_UPLOAD_MAX_EDGE, jpegQuality: UPLOAD_INTERMEDIATE_JPEG_QUALITY }
        );
      } catch {
        uploadFiles = pairs.map(({ file }) => file);
      }
      const result = await uploadRetouched(projectId, uploadFiles, pairs.map(({ photoId }) => photoId), pairs.map(({ file }) => file.name));
      await refresh();
      if (result.uploaded !== pairs.length) {
        // 올라간 파일만 빼고 실패한 파일은 연결 그대로 남겨 바로 다시 올릴 수 있게 한다(파일 이름은 선택 단계에서 중복을 막았다).
        const saved = new Set((result.versions ?? []).map((version) => version.filename));
        const keep = files.flatMap((file, index) => saved.has(file.name) ? [] : [index]);
        const failed = pairs.filter(({ file }) => !saved.has(file.name)).map(({ file }) => file.name);
        setFiles(keep.map((index) => files[index]));
        setPreviews(keep.map((index) => URL.createObjectURL(files[index])));
        setAssignments(keep.map((index) => assignments[index]));
        setNotice(null);
        setError(`${result.uploaded}장은 올렸어요. 올리지 못한 파일: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? ` 외 ${failed.length - 3}장` : ""}. 남겨 둔 사진을 다시 올려 주세요.`);
        return;
      }
      router.push(`/customer-select/${projectId}/retouch/compare`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "보정본을 올리지 못했어요. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <ProjectBodySkeleton variant="cards" label="선택한 사진을 불러오고 있어요" />;
  if (loadError) return <RetouchErrorScreen message={loadError} />;

  return <main className={s.page}>
    <header className={s.header}>
      <button type="button" className={s.back} aria-label="이전 화면" onClick={() => router.back()}><ArrowLeft size={20} /></button>
      <h1>보정본 올리기</h1>
    </header>
    <div className={s.content}>
      <section className={s.intro}>
        <h2>{files.length ? `${files.length}장을 선택했어요` : "받은 보정본을 올려 주세요"}</h2>
        <p>{files.length ? "원본과 보정본이 맞게 연결됐는지 사진으로 확인해 주세요." : "작가님께 받은 사진을 선택하면 내가 고른 원본 옆에 보여드릴게요."}</p>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(event) => { selectFiles(event.target.files); event.target.value = ""; }} />
        <button type="button" className={s.pickButton} disabled={uploading} onClick={() => inputRef.current?.click()}>
          <ImagePlus size={20} /> {files.length ? "파일 다시 선택하기" : "받은 사진 선택하기"}
        </button>
      </section>

      {files.length > 0 ? <section className={s.section}>
        <div className={s.sectionHead}><h2>사진 연결 확인</h2><span>{assignedCount}장 연결 · {files.length - assignedCount}장 확인 필요</span></div>
        {notice && <p role="status" className={s.help}>{notice}</p>}
        <div className={s.pairs}>
          {files.map((file, index) => {
            const photo = assignments[index] ? photoById.get(assignments[index]!) : null;
            return <article className={s.pair} key={`${file.name}-${index}`}>
              <div className={s.images}>
                <div className={s.imageSlot}><span>내가 고른 원본</span>{photo ? <img src={photo.url} alt={photo.filename} /> : <div className={s.noPhoto}>사진을 골라 주세요</div>}</div>
                <ArrowRight size={18} className={s.arrow} aria-hidden />
                <div className={s.imageSlot}><span>받은 보정본</span><img src={previews[index]} alt={file.name} /></div>
              </div>
              <div className={s.pairFooter}>
                <div><strong>{photo ? photo.filename : "어느 사진의 보정본인가요?"}</strong><small title={file.name}>{file.name}</small></div>
                <button type="button" onClick={() => setChoosing(choosing === index ? null : index)}>{photo ? "변경" : "원본 고르기"}</button>
              </div>
              {choosing === index && <div className={s.chooser}>
                <p>이 보정본에 맞는 원본을 눌러 주세요.</p>
                <div className={s.choices}>{photos.map((target) => {
                  const usedBy = assignments.findIndex((id, fileIndex) => id === target.id && fileIndex !== index);
                  return <button type="button" key={target.id} data-used={usedBy >= 0 || undefined} aria-label={`${target.filename}에 연결${usedBy >= 0 ? ` (${files[usedBy].name}에 연결됨)` : ""}`} onClick={() => assign(index, target.id)}>
                    <img src={target.url} alt="" /><span>{target.filename}</span>{usedBy >= 0 && <small>다른 파일에 연결됨</small>}
                  </button>;
                })}</div>
              </div>}
            </article>;
          })}
        </div>
        {files.length > assignedCount && <p className={s.help}>연결하지 않은 파일은 올리지 않고, 나중에 다시 선택할 수 있어요.</p>}
      </section> : <section className={s.section}>
        <div className={s.sectionHead}><h2>내가 고른 사진</h2><span>{photos.length}장</span></div>
        {photos.length ? <div className={s.photoGrid}>{photos.map((photo) => <div className={s.photoTile} key={photo.id}>
          <img src={photo.url} alt={photo.filename} /><span>{latestVersion(photo) ? <><Check size={14} /> 보정본 있음</> : "보정본 기다리는 중"}</span>
        </div>)}</div> : <p className={s.help}>고른 사진이 없어요. 먼저 사진을 골라 작가님께 보내 주세요.</p>}
        {uploadedCount > 0 && <button type="button" className={s.viewLink} onClick={() => router.push(`/customer-select/${projectId}/retouch/compare`)}>올린 보정본 비교하기 <ArrowRight size={17} /></button>}
      </section>}
      {error && <p role="alert" className={s.error}>{error}</p>}
    </div>
    {files.length > 0 && <PhotographerPageActionBar maxWidth={1040} actions={<PhotographerLightButton size="work-panel" pending={uploading} pendingLabel="보정본 올리는 중…" disabled={!assignedCount} onClick={upload}>확인한 {assignedCount}장 올리기</PhotographerLightButton>} />}
  </main>;
}
