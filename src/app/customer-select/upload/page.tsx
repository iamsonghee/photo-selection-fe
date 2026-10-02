"use client";

import { ChangeEvent, DragEvent, PointerEvent, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, Check, FileImage, Trash2, UploadCloud, X } from "lucide-react";
import { CustomerEntryHeader, CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { PhotoFocusOverlay } from "@/components/customer/PhotoFocusOverlay";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { PhotoThumbnailFrame } from "@/components/ui/PhotoThumbnailFrame";
import { selectGridPhotos, selectPhotoRange, type SelectionRect } from "@/lib/drag-selection";
import { useCustomerSelectDraft, type UploadDraftFile as PreviewFile } from "@/contexts/CustomerSelectDraftContext";

const MAX_PHOTOS = 5000;
const ANALYSIS_OPTIONS = [
  { id: "similar", label: "유사컷 묶기", description: "비슷한 사진을 함께 볼 수 있어요." },
  { id: "scenes", label: "장면별 정리", description: "촬영 흐름에 따라 나눠 볼 수 있어요." },
  { id: "quality", label: "눈 감음·흐림 의심 표시", description: "확인이 필요한 사진에 표시해요." },
] as const;
type AnalysisOption = typeof ANALYSIS_OPTIONS[number]["id"];
const PREVIEW_FILES = Array.from({ length: MAX_PHOTOS }, (_, index) => ({
  id: `sample-${index}`,
  name: `ACUT_${String(index + 1).padStart(4, "0")}.jpg`,
  url: `/landing/sample-project/studio-v2/originals/ACUT_${String((index % 14) + 1).padStart(4, "0")}.jpg`,
}));
const PICKER_CLASS = "cs-secondary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--customer-divider)] bg-white px-4 text-[14px] font-semibold text-[var(--customer-control)] hover:bg-[var(--select-surface)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
const droppedPaths = new WeakMap<File, string>();

function readDroppedEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) return new Promise((resolve) => (entry as FileSystemFileEntry).file((file) => { droppedPaths.set(file, entry.fullPath.replace(/^\//, "")); resolve([file]); }, () => resolve([])));
  if (!entry.isDirectory) return Promise.resolve([]);
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  return new Promise((resolve) => {
    const found: FileSystemEntry[] = [];
    const readBatch = () => reader.readEntries(async (entries) => {
      if (!entries.length) {
        resolve((await Promise.all(found.map(readDroppedEntry))).flat());
        return;
      }
      found.push(...entries);
      readBatch();
    }, () => resolve([]));
    readBatch();
  });
}

async function getDroppedFiles(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  return entries.length ? (await Promise.all(entries.map(readDroppedEntry))).flat() : Array.from(dataTransfer.files);
}

function UploadPreviewImage({ photo }: { photo: PreviewFile }) {
  const [src, setSrc] = useState(photo.url ?? "");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!photo.file) return;
    const objectUrl = URL.createObjectURL(photo.file);
    // 개발 모드의 effect 재검사에서도 해제된 blob URL을 다시 만들어야 한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.file]);

  return <>
    {src && <Image src={src} alt={photo.name} fill sizes="(max-width: 639px) 33vw, (max-width: 1023px) 20vw, 150px" unoptimized draggable={false} className={failed ? "invisible" : "object-cover"} onLoad={() => setFailed(false)} onError={() => setFailed(true)} />}
    {failed && <span className="absolute inset-0 grid place-items-center text-xs text-[var(--customer-ink-secondary)]">미리보기 불가</span>}
  </>;
}

function UploadPhotoButton({ photo, selected, mobile, mobileSelecting, onSelect, onLongPress, onOpen }: { photo: PreviewFile; selected: boolean; mobile: boolean; mobileSelecting: boolean; onSelect: (options: { range: boolean; additive: boolean }) => void; onLongPress: () => void; onOpen: () => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const didLongPressRef = useRef(false);
  const clearPress = () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null; startRef.current = null; };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!mobile || mobileSelecting || event.button !== 0) return;
    didLongPressRef.current = false;
    startRef.current = { x: event.clientX, y: event.clientY };
    timerRef.current = setTimeout(() => { didLongPressRef.current = true; clearPress(); onLongPress(); }, 450);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (startRef.current && Math.hypot(event.clientX - startRef.current.x, event.clientY - startRef.current.y) > 10) clearPress();
  };
  const click = () => {
    clearPress();
    if (didLongPressRef.current) { didLongPressRef.current = false; return; }
    if (mobile && mobileSelecting) onSelect({ range: false, additive: true });
    else onOpen();
  };
  return (
    <PhotoThumbnailFrame
      data-preview-id={photo.id}
      active={selected}
      className="cs-photo-card group relative aspect-square bg-[var(--select-line)]"
    >
      <button type="button" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={clearPress} onPointerCancel={clearPress} onPointerLeave={clearPress} onContextMenu={mobile ? (event) => event.preventDefault() : undefined} onClick={click} aria-label={`${photo.name} ${mobile && mobileSelecting ? selected ? "선택 해제" : "선택" : "크게 보기"}`} className="absolute inset-0 w-full touch-pan-y text-left focus-visible:ring-2 focus-visible:ring-[var(--customer-control)] focus-visible:ring-inset">
        <UploadPreviewImage photo={photo} />
      </button>
      <span data-upload-selected-shade aria-hidden="true" className={`pointer-events-none absolute inset-0 z-[5] bg-black/20 transition-opacity duration-150 motion-reduce:transition-none ${selected ? "opacity-100" : "opacity-0"}`} />
      {mobile && mobileSelecting && selected ? <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] text-white"><Check size={15} /></span> : null}
      {!mobile ? <button type="button" data-upload-select onClick={(event) => { event.stopPropagation(); onSelect({ range: event.shiftKey, additive: true }); }} aria-label={`${photo.name} ${selected ? "선택 해제" : "선택"}`} aria-pressed={selected} className={`cs-upload-select absolute left-1 top-1 z-10 flex h-10 w-10 items-center justify-center rounded-md transition-opacity duration-150 motion-reduce:transition-none ${selected ? "opacity-100" : "opacity-0"}`}><span className={`grid h-6 w-6 place-items-center rounded border-2 shadow-sm ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-white bg-black/30 text-transparent"}`}><Check size={15} aria-hidden="true" /></span></button> : null}
    </PhotoThumbnailFrame>
  );
}

function UploadAddTile({ onClick }: { onClick: () => void }) {
  return <button type="button" data-upload-add onClick={onClick} className="flex aspect-square min-w-0 flex-col items-center justify-center gap-2 rounded-[var(--select-photo-radius)] border border-dashed border-[var(--customer-divider)] bg-[var(--select-surface)] text-[13px] font-semibold text-[var(--customer-control)] hover:border-[var(--customer-control)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><FileImage size={22} aria-hidden="true" />사진 추가</button>;
}

type UploadPhotoGridProps = {
  photos: PreviewFile[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onSelect: (id: string, options: { range: boolean; additive: boolean }) => void;
  mobileSelecting: boolean;
  onLongPress: (id: string) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
};

function DesktopUploadPhotoGrid({
  photos,
  selectedIds,
  onSelectionChange,
  onSelect,
  onOpen,
  onAdd,
}: UploadPhotoGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);
  const [width, setWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const gap = 12;
  const sidePadding = 40;
  const verticalPadding = 12;
  const hasAddTile = photos.length < MAX_PHOTOS;
  const columns = Math.max(1, Math.floor((width + gap) / (164 + gap)));
  const cellSize = width ? (width - gap * (columns - 1)) / columns : 120;
  const rowHeight = cellSize + gap;
  const virtualizer = useWindowVirtualizer({
    count: Math.ceil((photos.length + Number(hasAddTile)) / columns),
    estimateSize: () => rowHeight,
    overscan: 4,
    scrollMargin,
  });

  useLayoutEffect(() => {
    const container = gridRef.current;
    if (!container) return;
    const update = () => {
      setWidth(container.clientWidth - sidePadding * 2);
      setScrollMargin(container.getBoundingClientRect().top + window.scrollY + verticalPadding);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, rowHeight]);

  const interactionRef = useRef({ photos, selectedIds, onSelectionChange, columns, rowHeight });
  interactionRef.current = { photos, selectedIds, onSelectionChange, columns, rowHeight };
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let drag: { x: number; y: number; base: Set<string>; active: boolean } | null = null;
    const down = (event: globalThis.PointerEvent) => {
      const current = interactionRef.current;
      if (event.pointerType === "touch" || event.button !== 0 || (event.target instanceof Element && event.target.closest("[data-upload-select], [data-upload-add]"))) return;
      const bounds = grid.getBoundingClientRect();
      drag = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
        base: event.metaKey || event.ctrlKey || event.shiftKey ? new Set(current.selectedIds) : new Set(),
        active: false,
      };
    };
    const move = (event: globalThis.PointerEvent) => {
      if (!drag) return;
      const current = interactionRef.current;
      const bounds = grid.getBoundingClientRect();
      const x = Math.max(0, Math.min(grid.clientWidth, event.clientX - bounds.left));
      const y = Math.max(0, Math.min(grid.clientHeight, event.clientY - bounds.top));
      if (!drag.active && Math.hypot(x - drag.x, y - drag.y) < 5) return;
      drag.active = true;
      event.preventDefault();
      const rect = { left: Math.min(drag.x, x), top: Math.min(drag.y, y), width: Math.max(1, Math.abs(drag.x - x)), height: Math.max(1, Math.abs(drag.y - y)) };
      setSelectionRect(rect);
      current.onSelectionChange(selectGridPhotos(current.photos, rect, { width: grid.clientWidth, paddingX: sidePadding, paddingTop: verticalPadding, gap, cols: current.columns, rowHeight: current.rowHeight, leading: current.photos.length < MAX_PHOTOS }, drag.base));
    };
    const stop = () => {
      if (drag?.active) suppressClickRef.current = true;
      drag = null;
      setSelectionRect(null);
    };
    grid.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      grid.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, []);

  return (
    <div
      ref={gridRef}
      className="relative -mx-10 -my-3 w-[calc(100%+80px)] touch-pan-y select-none"
      aria-label={`업로드한 사진 ${photos.length}장`}
      tabIndex={0}
      onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
          event.preventDefault();
          onSelectionChange(new Set(photos.map((photo) => photo.id)));
        }
      }}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => { if (event.target instanceof Element && !event.target.closest("[data-preview-id], [data-upload-add]")) onSelectionChange(new Set()); }}
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() + verticalPadding * 2 }}>
        {selectionRect ? <span aria-hidden="true" className="pointer-events-none absolute z-20 border border-[var(--accent)] bg-[var(--accent)]/15" style={selectionRect} /> : null}
        {virtualizer.getVirtualItems().map((row) => (
          <div key={row.key} className="absolute left-10 grid w-[calc(100%-80px)]" style={{ top: 0, height: cellSize, gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap, transform: `translateY(${row.start - scrollMargin + verticalPadding}px)` }}>
            {Array.from({ length: columns }, (_, column) => row.index * columns + column).map((index) => hasAddTile && index === 0 ? <UploadAddTile key="add" onClick={onAdd} /> : photos[index - Number(hasAddTile)] ? (
              <UploadPhotoButton
                key={photos[index - Number(hasAddTile)].id}
                photo={photos[index - Number(hasAddTile)]}
                selected={selectedIds.has(photos[index - Number(hasAddTile)].id)}
                mobile={false}
                mobileSelecting={false}
                onSelect={(options) => onSelect(photos[index - Number(hasAddTile)].id, options)}
                onLongPress={() => {}}
                onOpen={() => onOpen(photos[index - Number(hasAddTile)].id)}
              />
            ) : null)}
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileUploadPhotoGrid({ photos, selectedIds, mobileSelecting, onSelect, onLongPress, onOpen, onAdd }: UploadPhotoGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ width: 0, rowHeight: 126 });
  const [scrollMargin, setScrollMargin] = useState(0);
  const columns = 3;
  const gap = 6;
  const hasAddTile = photos.length < MAX_PHOTOS;
  const cellSize = layout.width ? (layout.width - gap * (columns - 1)) / columns : 120;

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const update = () => {
      const width = grid.clientWidth;
      if (!width) return;
      setLayout((current) => current.width === width ? current : { width, rowHeight: (width - gap * (columns - 1)) / columns + gap });
      setScrollMargin(grid.getBoundingClientRect().top + window.scrollY);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(grid);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, []);

  const virtualizer = useWindowVirtualizer({
    count: Math.ceil((photos.length + Number(hasAddTile)) / columns),
    estimateSize: () => layout.rowHeight,
    overscan: 5,
    scrollMargin,
  });

  useEffect(() => {
    virtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.rowHeight]);

  return (
    <div ref={gridRef} className="relative w-full" aria-label={`업로드한 사진 ${photos.length}장`} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((row) => (
        <div key={row.key} className="absolute left-0 grid w-full grid-cols-3" style={{ top: 0, height: cellSize, gap, transform: `translateY(${row.start - scrollMargin}px)` }}>
          {Array.from({ length: columns }, (_, column) => row.index * columns + column).map((index) => hasAddTile && index === 0 ? <UploadAddTile key="add" onClick={onAdd} /> : photos[index - Number(hasAddTile)] ? (
            <UploadPhotoButton key={photos[index - Number(hasAddTile)].id} photo={photos[index - Number(hasAddTile)]} selected={selectedIds.has(photos[index - Number(hasAddTile)].id)} mobile mobileSelecting={mobileSelecting} onSelect={(options) => onSelect(photos[index - Number(hasAddTile)].id, options)} onLongPress={() => onLongPress(photos[index - Number(hasAddTile)].id)} onOpen={() => onOpen(photos[index - Number(hasAddTile)].id)} />
          ) : null)}
        </div>
      ))}
    </div>
  );
}

function subscribeDesktopGrid(callback: () => void) {
  const query = window.matchMedia("(min-width: 768px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function UploadPhotoGrid(props: UploadPhotoGridProps) {
  const desktop = useSyncExternalStore(subscribeDesktopGrid, () => window.matchMedia("(min-width: 768px)").matches, () => false);
  if (desktop) return <DesktopUploadPhotoGrid {...props} />;
  return <MobileUploadPhotoGrid {...props} />;
}

export default function CustomerSelectUploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
  const { uploadFiles: files, setUploadFiles: setFiles, prunePhotos, analyses, setAnalyses } = useCustomerSelectDraft();
  const [selectedPreviewIds, setSelectedPreviewIds] = useState<Set<string>>(new Set());
  const [mobileSelecting, setMobileSelecting] = useState(false);
  const [viewerPhotoId, setViewerPhotoId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [selectionDialogOpen, setSelectionDialogOpen] = useState(false);
  const [analysisOptions, setAnalysisOptions] = useState<Set<AnalysisOption>>(() => new Set(ANALYSIS_OPTIONS.filter((option) => analyses.has(option.id) || !analyses.size && option.id === "similar").map((option) => option.id)));
  const completionDialogRef = useRef<HTMLDialogElement>(null);
  const [addNotice, setAddNotice] = useState("");
  const total = files.length;
  const pendingUploadCount = Math.min(pendingFiles.filter((file) => /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)).length, MAX_PHOTOS - total);
  const displayFiles = files;
  const viewerIndex = files.findIndex((photo) => photo.id === viewerPhotoId);
  const viewerPhoto = files[viewerIndex];
  const duplicateNames = new Set<string>();
  const seenNames = new Set<string>();
  for (const file of files) { if (seenNames.has(file.name)) duplicateNames.add(file.name); else seenNames.add(file.name); }

  useEffect(() => {
    if (!selectionDialogOpen) return;
    const dialog = completionDialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; };
  }, [selectionDialogOpen]);

  function startSelecting(options: Set<AnalysisOption>) {
    setAnalyses(new Set(options));
    setSelectionDialogOpen(false);
    router.push(`/customer-select/select?scene=0&scenes=${options.has("scenes") ? 1 : 0}&similar=${options.has("similar") ? 1 : 0}&quality=${options.has("quality") ? 1 : 0}&from=upload`);
  }

  function addFiles(incoming: File[]) {
    const supported = incoming.filter((file) => /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name));
    const selected = supported
      .slice(0, Math.max(0, MAX_PHOTOS - total));
    setAddNotice(`${incoming.length - supported.length ? `지원하지 않는 파일 ${incoming.length - supported.length}개는 제외했어요. ` : ""}${supported.length - selected.length ? `5,000장 제한으로 ${supported.length - selected.length}장은 추가하지 못했어요.` : ""}`);
    // 원본 메타데이터를 변환 전에 고유 ID에 묶는다. 같은 파일명이 여러 폴더에 있어도 ID는 충돌하지 않는다.
    const addedPreviews = selected.map((file) => ({ id: crypto.randomUUID(), name: file.name, file, url: URL.createObjectURL(file), relativePath: file.webkitRelativePath || droppedPaths.get(file), capturedAt: file.lastModified }));
    setFiles((current) => [...current, ...addedPreviews.slice(0, MAX_PHOTOS - current.length)]);
    setSelectedPreviewIds(new Set());
    setMobileSelecting(false);
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    queueFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function queueFiles(incoming: File[]) {
    if (!incoming.length) return;
    if (total >= MAX_PHOTOS) { setAddNotice("5,000장까지 추가할 수 있어요."); return; }
    if (!incoming.some((file) => /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name))) {
      setAddNotice("추가할 수 있는 사진이 없어요. JPG, PNG, HEIC, WebP 파일을 선택해 주세요.");
      return;
    }
    setAddNotice("");
    setPendingFiles(incoming);
  }

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;
    input.removeAttribute("webkitdirectory");
    input.click();
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(false);
    queueFiles(await getDroppedFiles(event.dataTransfer));
  }

  function selectPreview(id: string, { range, additive }: { range: boolean; additive: boolean }) {
    setSelectedPreviewIds((current) => {
      if (mobileSelecting) { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }
      if (range && lastSelectedIdRef.current) return selectPhotoRange(displayFiles.map((file) => file.id), lastSelectedIdRef.current, id, additive ? current : []);
      if (!additive) return new Set([id]);
      const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
    });
    if (!range) lastSelectedIdRef.current = id;
  }

  function clearSelection() { setSelectedPreviewIds(new Set()); setMobileSelecting(false); lastSelectedIdRef.current = null; }

  function deletePhotos(ids: Set<string>) {
    if (!ids.size) return;
    files.forEach(item => { if (ids.has(item.id) && item.file && item.url) URL.revokeObjectURL(item.url); });
    prunePhotos([...ids]);
    setFiles((current) => current.filter((file) => !ids.has(file.id)));
    clearSelection();
    if (viewerPhotoId && ids.has(viewerPhotoId)) setViewerPhotoId(null);
  }

  return (
    <CustomerEntryShell layout="responsive">
      <div className="cs-brand-header relative border-b border-[var(--select-line)]">
        <CustomerEntryHeader href="/customer-select/new" />
        <span className="absolute bottom-[15px] right-6 text-[12px] font-semibold text-[var(--select-muted)]">2단계 · 사진 업로드</span>
      </div>

      <main
        className={`relative w-full px-6 py-8 pb-28 md:px-10 md:py-12 md:pb-32 ${total ? "" : "mx-auto max-w-[980px]"}`}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
        onDrop={handleDrop}
      >
        {dragOver ? (
          <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center border-2 border-dashed border-[var(--accent)] bg-white/95 md:inset-8">
            <div className="text-center text-[var(--accent)]"><UploadCloud className="mx-auto" size={30} aria-hidden="true" /><p className="mt-3 text-[15px] font-semibold">사진이나 폴더를 여기에 놓아주세요.</p></div>
          </div>
        ) : null}
        <button type="button" onClick={() => router.push("/customer-select/new")} className="mb-5 inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-[var(--customer-ink-secondary)] hover:text-[var(--customer-ink)]">
          <ArrowLeft size={17} aria-hidden="true" /> 시작 설정으로
        </button>

        <div className="mb-5 flex items-end justify-between gap-4">
          <h1 className="cs-title">사진 업로드</h1>
          <p className="shrink-0 text-[14px] font-semibold tabular-nums text-[var(--customer-ink)]">{total.toLocaleString()} <span className="font-normal text-[var(--select-muted)]">/ {MAX_PHOTOS.toLocaleString()}장</span></p>
        </div>

        <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/heic,image/heif,image/webp" className="sr-only" onChange={handleFiles} />
        {addNotice && <p role="status" className="mb-3 text-[12px] text-[var(--select-accent-ink)]">{addNotice}</p>}

        {total === 0 ? (
          <section className="grid min-h-[50vh] place-items-center border border-dashed border-[var(--customer-divider)] bg-white px-5 py-12 text-center" aria-labelledby="upload-empty-title">
            <div>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--select-accent-soft)] text-[var(--accent)]">
              <UploadCloud size={24} aria-hidden="true" />
            </span>
            <h2 id="upload-empty-title" className="mt-5 text-[20px] font-semibold text-[var(--customer-ink)]">사진이나 폴더를 선택해 주세요.</h2>
            <p className="mx-auto mt-2 max-w-[480px] text-[13px] leading-6 text-[var(--customer-ink-secondary)]">
              <span className="hidden md:inline">사진이나 폴더를 이곳에 끌어놓을 수 있어요.<br /></span>
              JPG · PNG · HEIC · WebP · 최대 5,000장
            </p>
            <div className="mx-auto mt-7 flex max-w-[420px] flex-col justify-center gap-2 sm:flex-row">
              <button type="button" className={PICKER_CLASS} onClick={openPicker}><FileImage size={17} aria-hidden="true" /> 사진 추가</button>
            </div>
            <button type="button" onClick={() => setFiles(PREVIEW_FILES)} className="mt-5 min-h-11 px-3 text-[12px] font-medium text-[var(--select-muted)] underline underline-offset-4 hover:text-[var(--customer-ink)]">
              검수용 5,000장 예시 보기
            </button>
            </div>
          </section>
        ) : (
          <section aria-label="준비한 사진" className="mt-8">
            <div className="mb-3 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-[var(--select-line)] pb-3">
              <p className="m-0 text-[13px] text-[var(--customer-ink-secondary)]"><span className="md:hidden">{mobileSelecting ? `${selectedPreviewIds.size}장 선택됨 · 삭제할 사진을 더 고르세요.` : "사진을 누르면 크게 보고, 길게 누르면 선택해요."}</span><span className="hidden md:inline">사진 클릭으로 크게 보기 · 좌측 상단 표시나 드래그로 삭제할 사진 선택</span></p>
              {mobileSelecting ? <button type="button" onClick={clearSelection} className="min-h-11 px-3 text-[13px] font-semibold text-[var(--customer-control)] md:hidden">취소</button> : null}
              <button type="button" onClick={() => setDeleteAllConfirmOpen(true)} className={`min-h-11 items-center gap-2 px-3 text-[13px] font-semibold text-[var(--customer-ink-secondary)] hover:text-[var(--customer-ink)] ${mobileSelecting ? "hidden md:inline-flex" : "inline-flex"}`}><Trash2 size={16} aria-hidden="true" /> 전체 삭제</button>
            </div>
            {duplicateNames.size > 0 && <p className="mb-3 text-[12px] text-[var(--select-accent-ink)]">같은 파일명 {duplicateNames.size}종이 있어요. 결과에서 경로와 사진 ID로 구분해요.</p>}
            <div className="mt-6">
              <UploadPhotoGrid photos={displayFiles} selectedIds={selectedPreviewIds} mobileSelecting={mobileSelecting} onSelectionChange={setSelectedPreviewIds} onSelect={selectPreview} onLongPress={(id) => { setSelectedPreviewIds(new Set([id])); setMobileSelecting(true); lastSelectedIdRef.current = id; }} onOpen={setViewerPhotoId} onAdd={openPicker} />
            </div>
          </section>
        )}
      </main>
      <div className="cs-actionbar fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-[var(--customer-divider)] bg-white px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-10" aria-label={selectedPreviewIds.size || mobileSelecting ? "사진 선택 작업" : "업로드 다음 단계"}>
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-semibold text-[var(--customer-ink)]">{selectedPreviewIds.size || mobileSelecting ? `${selectedPreviewIds.size.toLocaleString()}장 선택됨` : `${total.toLocaleString()}장 준비됨`}</p>
          <p className="m-0 text-[12px] text-[var(--select-muted)]">{selectedPreviewIds.size || mobileSelecting ? "삭제할 사진을 확인해 주세요" : "현재 시안은 서버에 전송하지 않아요"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedPreviewIds.size || mobileSelecting ? <>
            <button type="button" onClick={clearSelection} className="hidden min-h-11 px-2 text-[12px] font-semibold text-[var(--customer-control)] md:inline-flex">선택 해제</button>
            <button type="button" disabled={!selectedPreviewIds.size} onClick={() => setDeleteConfirmOpen(true)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[var(--accent)] px-3 text-[13px] font-semibold text-[var(--select-accent-ink)] disabled:opacity-40"><Trash2 size={16} aria-hidden="true" /> 선택 삭제 ({selectedPreviewIds.size.toLocaleString()})</button>
          </> : <button type="button" disabled={!total} onClick={() => setSelectionDialogOpen(true)} className="cs-primary cs-compact disabled:opacity-40">사진 고르기 시작</button>}
        </div>
      </div>
      {viewerPhoto?.url ? <PhotoFocusOverlay open src={viewerPhoto.url} alt={viewerPhoto.name} onClose={() => setViewerPhotoId(null)} onPrev={viewerIndex > 0 ? () => setViewerPhotoId(files[viewerIndex - 1].id) : undefined} onNext={viewerIndex < files.length - 1 ? () => setViewerPhotoId(files[viewerIndex + 1].id) : undefined} /> : null}
      {pendingUploadCount > 0 ? (
        <SelectionConfirmDialog
          title={`사진 ${pendingUploadCount.toLocaleString()}장을 업로드할까요?`}
          description={<>현재 시안에서는 확인 후 브라우저에 사진을 준비합니다.<br />서버 전송은 아직 진행되지 않아요.{pendingFiles.length > pendingUploadCount ? <><br />지원 형식·5,000장 제한으로 {pendingFiles.length - pendingUploadCount}장은 제외돼요.</> : null}</>}
          confirmLabel="사진 준비하기"
          confirming={false}
          onCancel={() => setPendingFiles([])}
          onConfirm={() => { addFiles(pendingFiles); setPendingFiles([]); }}
        />
      ) : null}
      {deleteConfirmOpen ? (
        <SelectionConfirmDialog
          title={`선택한 사진 ${selectedPreviewIds.size}장을 삭제할까요?`}
          description="업로드 목록에서만 삭제되며 원본 파일에는 영향을 주지 않아요."
          confirmLabel="삭제하기"
          confirming={false}
          onCancel={() => setDeleteConfirmOpen(false)}
          onConfirm={() => { deletePhotos(selectedPreviewIds); setDeleteConfirmOpen(false); }}
        />
      ) : null}
      {deleteAllConfirmOpen ? (
        <SelectionConfirmDialog
          title={`사진 ${total.toLocaleString()}장을 모두 삭제할까요?`}
          description="업로드 목록에서만 삭제되며 원본 파일에는 영향을 주지 않아요."
          confirmLabel="전체 삭제하기"
          confirming={false}
          onCancel={() => setDeleteAllConfirmOpen(false)}
          onConfirm={() => { deletePhotos(new Set(files.map((file) => file.id))); setDeleteAllConfirmOpen(false); }}
        />
      ) : null}
      {selectionDialogOpen ? (
        <dialog ref={completionDialogRef} aria-labelledby="upload-completion-title" aria-describedby="upload-completion-description" onCancel={(event) => { event.preventDefault(); setSelectionDialogOpen(false); }} onClose={() => setSelectionDialogOpen(false)} className="fixed inset-0 m-auto max-h-[calc(100dvh-32px)] w-[min(92vw,480px)] overflow-y-auto rounded-xl border border-[var(--customer-divider)] bg-white p-0 text-[var(--customer-ink)] shadow-2xl backdrop:bg-black/45">
          <div className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <h2 id="upload-completion-title" className="text-[22px] font-semibold leading-8">사진을 정리할까요?</h2>
              <button type="button" onClick={() => setSelectionDialogOpen(false)} aria-label="닫기" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-[var(--customer-ink-secondary)] hover:bg-[var(--select-surface)]"><X size={20} /></button>
            </div>
            <p id="upload-completion-description" className="mt-2 text-[13px] leading-5 text-[var(--customer-ink-secondary)]">필요한 분석만 선택하세요. 건너뛰고 바로 고를 수도 있어요.</p>
            <div className="mt-6 divide-y divide-[var(--select-line)] border-y border-[var(--select-line)]">
              {ANALYSIS_OPTIONS.map((option) => <label key={option.id} className="flex min-h-16 cursor-pointer items-start gap-3 py-3">
                <input type="checkbox" checked={analysisOptions.has(option.id)} onChange={() => setAnalysisOptions((current) => { const next = new Set(current); if (next.has(option.id)) next.delete(option.id); else next.add(option.id); return next; })} className="mt-1 h-5 w-5 shrink-0" />
                <span><span className="block text-[14px] font-semibold">{option.label}{option.id === "similar" ? <span className="ml-2 text-[12px] text-[var(--select-accent-ink)]">추천</span> : null}</span><span className="mt-1 block text-[12px] text-[var(--customer-ink-secondary)]">{option.description}</span></span>
              </label>)}
            </div>
            <p className="mt-3 text-[12px] text-[var(--select-muted)]">현재 시안은 실제 AI 분석 없이 화면만 미리 보여줘요.</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => startSelecting(new Set())} className="cs-secondary min-h-[52px] w-full border border-[var(--customer-divider)] bg-white px-4">분석 없이 사진 고르기</button>
              <button type="button" disabled={!analysisOptions.size} onClick={() => startSelecting(analysisOptions)} className="cs-primary min-h-[52px] disabled:opacity-40">AI 이미지 분석</button>
            </div>
          </div>
        </dialog>
      ) : null}
    </CustomerEntryShell>
  );
}
