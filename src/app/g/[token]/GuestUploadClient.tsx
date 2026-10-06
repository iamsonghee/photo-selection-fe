"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, ImagePlus, Lock, Play, Plus, X } from "lucide-react";
import { DEFAULT_GUEST_GREETING, GUEST_MESSAGE_MAX, GUEST_NAME_MAX, mediaSummary, weddingMeta, type GuestAlbumInfo, type GuestMediaKind, type GuestUploadLimits } from "@/lib/guest-album";
import { GuestUploadError, createGuestSubmission, mediaKindOf, uploadGuestFile } from "@/lib/guest-upload-client";

type UploadStatus = "ready" | "queued" | "uploading" | "done" | "failed";
type Item = { id: string; file: File; url: string; kind: GuestMediaKind; status: UploadStatus; progress: number; error?: string };
type Phase = "edit" | "sending" | "failed" | "done" | "closed";

const INPUT_CLASS = "block w-full rounded-xl border border-border-subtle bg-surface px-4 py-3 text-[16px] outline-none transition-colors placeholder:text-placeholder-foreground focus:border-accent/50 disabled:bg-surface-raised";
const UPLOAD_CONCURRENCY = 4;

export function GuestClosedScreen({ album }: { album: Pick<GuestAlbumInfo, "name" | "uploadToken"> }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-surface-raised text-muted-foreground"><Lock size={26} /></span>
      <p className="mt-5 text-[13px] font-semibold text-muted-foreground">{album.name}</p>
      <h1 className="mt-1 text-[22px] font-bold tracking-[-0.03em]">사진 받기가 끝났어요</h1>
      <p className="mt-2 text-[15px] leading-6 text-muted-foreground">신랑신부가 사진 고르기를 시작해서 더 이상 보낼 수 없어요. 보내 주셔서 고마워요.</p>
      <Link href={`/g/${album.uploadToken}/mine`} className="mt-8 inline-flex h-12 items-center rounded-xl border border-border-subtle bg-surface px-6 text-[15px] font-bold">내가 보낸 사진 보기</Link>
    </main>
  );
}

export function GuestUploadClient({ album, limits }: { album: GuestAlbumInfo; limits: GuestUploadLimits }) {
  const token = album.uploadToken;
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [nameError, setNameError] = useState("");
  const [notice, setNotice] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>("edit");
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  // 한 번 보내기(이름·메시지)의 묶음. 실패한 파일을 다시 보낼 때도 같은 묶음을 쓴다.
  const submissionRef = useRef<string | null>(null);
  const mineHref = `/g/${token}/mine`;

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);
  useEffect(() => {
    if (phase !== "sending") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [phase]);

  const update = (id: string, patch: Partial<Item>) => setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: Item[] = [];
    let tooLarge = 0;
    let unsupported = 0;
    for (const file of files) {
      const kind = mediaKindOf(file);
      if (!kind) { unsupported++; continue; }
      if (file.size > (kind === "photo" ? limits.photoMaxMb : limits.videoMaxMb) * 1024 * 1024) { tooLarge++; continue; }
      next.push({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), kind, status: "ready", progress: 0 });
    }
    setNotice([
      tooLarge ? `${tooLarge}개는 용량이 커서 뺐어요.` : "",
      unsupported ? `${unsupported}개는 사진·영상이 아니라서 뺐어요.` : "",
    ].filter(Boolean).join(" "));
    setItems((current) => [...current, ...next]);
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => {
      if (item.id === id) URL.revokeObjectURL(item.url);
      return item.id !== id;
    }));
  }

  async function send() {
    if (!name.trim()) {
      setNameError("이름이나 별명을 입력해 주세요.");
      nameRef.current?.focus();
      return;
    }
    const queue = itemsRef.current.filter((item) => item.status === "ready" || item.status === "failed");
    if (!queue.length) return;
    setNotice("");
    setItems((current) => current.map((item) => queue.some((queued) => queued.id === item.id) ? { ...item, status: "queued", progress: 0, error: undefined } : item));
    setPhase("sending");

    let closed = false;
    try {
      submissionRef.current ??= await createGuestSubmission(token, name.trim(), message.trim());
    } catch (error) {
      if (error instanceof GuestUploadError && error.code === "closed") return setPhase("closed");
      const text = error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.";
      setItems((current) => current.map((item) => item.status === "queued" ? { ...item, status: "failed", error: text } : item));
      return setPhase("failed");
    }
    const submissionId = submissionRef.current;

    // ponytail: 앱 전환·화면 잠금으로 끊기면 실패로 표시하고 '다시 보내기'에 맡긴다. 자동 이어 보내기는 lib/upload-resume.ts 참고.
    const worker = async () => {
      for (let item = queue.shift(); item && !closed; item = queue.shift()) {
        const { id, file } = item;
        update(id, { status: "uploading", progress: 0 });
        try {
          await uploadGuestFile(token, submissionId, id, file, (ratio) => update(id, { progress: ratio * 100 }));
          update(id, { status: "done", progress: 100 });
        } catch (error) {
          if (error instanceof GuestUploadError && error.code === "closed") closed = true;
          update(id, { status: "failed", error: error instanceof Error ? error.message : "보내지 못했어요." });
        }
      }
    };
    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
    if (closed) return setPhase("closed");
    setPhase(itemsRef.current.some((item) => item.status === "failed") ? "failed" : "done");
  }

  function sendMore() {
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    setItems([]);
    setMessage("");
    submissionRef.current = null;
    setPhase("edit");
  }

  if (phase === "closed") return <GuestClosedScreen album={album} />;

  const counts = { photos: items.filter((item) => item.kind === "photo").length, videos: items.filter((item) => item.kind === "video").length };
  const doneCount = items.filter((item) => item.status === "done").length;
  const failed = items.filter((item) => item.status === "failed");
  const locked = phase === "sending" || phase === "failed";

  if (phase === "done") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <span className="grid size-16 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 size={34} /></span>
        <h1 className="mt-5 text-[22px] font-bold tracking-[-0.03em]">{name.trim()}님, 보내 주셔서 고마워요</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">신랑신부에게 잘 전달했어요 · {mediaSummary(counts)}</p>
        <div className="mt-8 flex w-full flex-col gap-2">
          <button type="button" onClick={sendMore} className="h-[52px] rounded-xl bg-accent text-[16px] font-bold text-white active:scale-[0.98]">사진 더 보내기</button>
          <Link href={mineHref} className="grid h-[52px] place-items-center rounded-xl border border-border-subtle bg-surface text-[16px] font-bold">내가 보낸 사진 보기</Link>
        </div>
      </main>
    );
  }

  return (
    <>
      <header className="flex items-start gap-3 px-5 pb-2 pt-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.03em]">{album.name}</h1>
          <p className="mt-1 text-[13px] font-semibold text-muted-foreground">{weddingMeta(album)}</p>
          <p className="mt-2 text-[15px] leading-6 text-muted-foreground">{album.greeting ?? DEFAULT_GUEST_GREETING}</p>
        </div>
        <Link href={mineHref} className="shrink-0 rounded-full border border-border-subtle bg-surface px-3 py-2 text-[13px] font-semibold">내가 보낸 사진</Link>
      </header>

      <main className="flex flex-1 flex-col gap-5 px-5 pb-40 pt-3">
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold">이름 또는 별명 <span className="text-accent">*</span></span>
          <input ref={nameRef} value={name} maxLength={GUEST_NAME_MAX} disabled={locked} autoComplete="nickname" placeholder="예: 신부 대학 친구 민지"
            aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? "guest-name-error" : undefined}
            onChange={(event) => { setName(event.target.value); setNameError(""); }}
            className={`${INPUT_CLASS} ${nameError ? "!border-danger/70" : ""}`} />
          {nameError ? <span id="guest-name-error" role="alert" className="text-[13px] font-semibold text-danger">{nameError}</span> : <span className="text-[12px] text-subtle-foreground">신랑신부가 누가 보낸 사진인지 알 수 있어요.</span>}
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold">축하 메시지 <span className="font-normal text-muted-foreground">(선택)</span></span>
          <textarea value={message} maxLength={GUEST_MESSAGE_MAX} rows={3} disabled={locked} placeholder="두 분께 전하고 싶은 말을 남겨 주세요."
            onChange={(event) => setMessage(event.target.value)} className={`${INPUT_CLASS} resize-none`} />
          <span className="self-end text-[12px] text-subtle-foreground">{message.length} / {GUEST_MESSAGE_MAX}</span>
        </label>

        <section aria-labelledby="guest-files-title" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 id="guest-files-title" className="text-[14px] font-semibold">사진·영상 <span className="text-accent">*</span></h2>
            {items.length ? <span className="text-[13px] text-muted-foreground">{mediaSummary(counts)}</span> : null}
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
          {items.length === 0 ? (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface px-6 py-10 text-center active:bg-surface-raised">
              <ImagePlus size={32} strokeWidth={1.6} className="text-accent" />
              <span className="text-[16px] font-bold">사진·영상 고르기</span>
              <span className="text-[13px] text-muted-foreground">여러 개를 한 번에 고를 수 있어요</span>
            </button>
          ) : (
            <ul className="grid grid-cols-3 gap-1.5">
              {items.map((item) => (
                <li key={item.id} title={item.error} className={`relative aspect-square overflow-hidden rounded-xl bg-surface-raised ${item.status === "failed" ? "ring-2 ring-inset ring-danger" : ""}`}>
                  {item.kind === "video"
                    ? <video src={`${item.url}#t=0.1`} muted playsInline preload="metadata" className="size-full object-cover" />
                    : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.url} alt={item.file.name} className="size-full object-cover" />
                    )}
                  {item.kind === "video" ? <span className="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white"><Play size={11} fill="currentColor" aria-label="영상" /></span> : null}
                  {item.status === "ready" ? (
                    <button type="button" onClick={() => removeItem(item.id)} aria-label={`${item.file.name} 빼기`} className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-black/55 text-white"><X size={16} /></button>
                  ) : null}
                  {item.status === "queued" || item.status === "uploading" ? (
                    <span className="absolute inset-0 flex items-end bg-black/35 p-2">
                      <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/30"><span className="block h-full rounded-full bg-white transition-[width]" style={{ width: `${Math.min(100, item.progress)}%` }} /></span>
                    </span>
                  ) : null}
                  {item.status === "done" ? <span className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-success text-white"><Check size={14} strokeWidth={3} aria-label="보냄" /></span> : null}
                  {item.status === "failed" ? <span className="absolute inset-0 grid place-items-center bg-black/45 text-white"><span className="flex flex-col items-center gap-1 text-[12px] font-bold"><AlertCircle size={20} />실패</span></span> : null}
                </li>
              ))}
              {!locked ? (
                <li>
                  <button type="button" onClick={() => fileRef.current?.click()} aria-label="사진·영상 더 고르기" className="grid aspect-square w-full place-items-center rounded-xl border-2 border-dashed border-border text-muted-foreground active:bg-surface-raised"><Plus size={26} /></button>
                </li>
              ) : null}
            </ul>
          )}
          {notice ? <p role="status" className="text-[13px] font-semibold text-danger">{notice}</p> : null}
          <p className="text-[12px] leading-5 text-subtle-foreground">사진은 {limits.photoMaxMb.toLocaleString()}MB, 영상은 {limits.videoMaxMb.toLocaleString()}MB까지 원본 그대로 보낼 수 있어요. 영상은 크기에 따라 시간이 걸려요.</p>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto max-w-[480px] px-5 py-3">
          {phase === "sending" ? (
            <div role="status" aria-live="polite">
              <p className="text-[14px] font-bold">보내는 중 · {doneCount} / {items.length}</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-raised"><div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${items.length ? doneCount / items.length * 100 : 0}%` }} /></div>
              <p className="mt-2 text-[12px] text-muted-foreground">다 보낼 때까지 이 화면을 닫거나 다른 앱으로 옮기지 말아 주세요.</p>
            </div>
          ) : phase === "failed" ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-[14px] font-semibold text-danger">{failed.length}개를 보내지 못했어요. {failed[0]?.error ?? "인터넷 연결을 확인해 주세요."}</p>
              <button type="button" onClick={send} className="h-[52px] rounded-xl bg-accent text-[16px] font-bold text-white active:scale-[0.98]">실패한 {failed.length}개 다시 보내기</button>
            </div>
          ) : (
            <>
              {items.length === 0 ? <p className="mb-2 text-center text-[12px] text-muted-foreground">사진이나 영상을 골라 주세요.</p> : null}
              <button type="button" onClick={send} disabled={items.length === 0} className="h-[52px] w-full rounded-xl bg-accent text-[16px] font-bold text-white transition-opacity active:scale-[0.98] disabled:opacity-40">
                {items.length ? `${items.length}개 보내기` : "보내기"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
