"use client";

import { SystemLoadingScreen } from "@/components/SystemLoadingScreen";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { Check, RefreshCw, Clock, Lock, ChevronLeft, CheckCircle2, ChevronDown, Search, X } from "lucide-react";
import { formatKstDateTime } from "@/lib/kst-date";
import { useSelectionOptional } from "@/contexts/SelectionContext";
import Link from "next/link";
import { SelectionConfirmDialog } from "@/components/customer/SelectionConfirmDialog";
import { useCustomerLightCanvas } from "@/lib/use-customer-light-canvas";
import { CustomerFooter } from "@/components/customer/CustomerFooter";
import OriginalDownloadEntry from "@/components/customer/OriginalDownloadEntry";
import { LockedPhotoViewer } from "@/components/customer/LockedPhotoViewer";
import type { ReviewResultPhoto } from "@/app/api/c/review-result/route";
import type { Photo } from "@/types";

const CUSTOMER_CANCEL_MAX = 3;

/* ── status badge (워크플로우와 동일) ── */
/* 확정=초록 #12833f, 재보정=앰버 #b26a00 — 검토 목록 카드 배지와 같은 값이다(흰 배경 + 색 테두리·글자).
 * 라이트 화면에서 다크용 반투명 틴트(emerald-500/10 등)를 그대로 쓰면 거의 보이지 않는다. */
const LOCKED_STATUS_TONE = {
  approved: { color: "#12833f", label: "확정" },
  revision_requested: { color: "#b26a00", label: "재보정 요청" },
  pending: { color: "#7d7a75", label: "검토 대기" },
} as const;

/* 배지는 사진 위 오른쪽 위에 얹고, 값은 전 페이지(검토 목록 `.rgv-card-pill`)와 똑같이 쓴다 —
 * 같은 결과를 두 화면에서 보는데 모양이 다르면 같은 것으로 읽히지 않는다. */
function StatusBadge({ status }: { status: "approved" | "revision_requested" | "pending" | null }) {
  const key = status === "approved" || status === "revision_requested" ? status : "pending";
  const { color, label } = LOCKED_STATUS_TONE[key];
  return (
    <span className="lk-badge" style={{ borderColor: color, color }}>
      {key === "approved" ? <Check size={9} strokeWidth={3} /> : key === "revision_requested" ? <RefreshCw size={9} strokeWidth={2.8} /> : <Clock size={9} />}
      {label}
    </span>
  );
}

/* ── photo card ── */
function PhotoCard({ photo }: { photo: ReviewResultPhoto }) {
  const filename = photo.originalFilename?.split("/").pop() ?? "—";
  const isRevision = photo.reviewStatus === "revision_requested";
  const isApproved = photo.reviewStatus === "approved";
  const ring = isApproved ? "#12833f55" : isRevision ? "#b26a0055" : "var(--customer-divider)";

  return (
    <div className="lk-card rounded-xl p-2 flex flex-col gap-2" style={{ borderColor: ring }}>
      {/* 썸네일 */}
      <div className="lk-thumb w-full aspect-square rounded-lg overflow-hidden relative">
        {photo.thumbUrl ? (
          <img src={photo.thumbUrl} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <div className="lk-noimg w-full h-full flex items-center justify-center text-xs font-mono">NO IMG</div>
        )}
        <StatusBadge status={photo.reviewStatus} />
      </div>

      {/* ⚠️ 이 카드에만 파일명이 남는다 — **상세보기가 없는 카드**이기 때문이다(div, onClick 없음).
        * "파일명은 상세보기 한 곳에서만"이라는 규칙은 상세보기가 있다는 전제 위에 선다.
        * 재보정 요청한 사진을 작가와 이야기할 때 쓸 이름이 여기 말고는 나올 자리가 없다. */}
      <p className="lk-filename text-[11px] font-mono truncate" title={filename}>{filename}</p>

      {/* 코멘트 (재보정 요청 시) */}
      {isRevision && (
        <div className="lk-comment rounded-lg p-2 text-[11px] leading-relaxed">
          <div className="lk-comment-label text-[9px] font-bold tracking-wide mb-1">재보정 요청</div>
          {photo.customerComment
            ? <>&ldquo;{photo.customerComment}&rdquo;</>
            : <span className="lk-comment-empty italic">코멘트 없음</span>
          }
        </div>
      )}
    </div>
  );
}

/* ── 선택 사진 카드 (검토 결과 없을 때) ── */
function SimplePhotoCard({ photo, comment, onOpen }: { photo: Photo; comment?: string; onOpen?: () => void }) {
  const filename = photo.originalFilename?.split("/").pop() ?? `#${photo.orderIndex}`;
  /* 셀렉 때 남긴 코멘트는 작가가 읽어야 할 내용이다 — 모바일 뷰는 보여주는데 PC 카드만
   * 전달조차 받지 않아 비어 있었다. 없을 때는 "코멘트 없음" 자리를 만들지 않는다
   * (격자에서 빈 자리를 10칸 만들면 그게 잡음이다 — 검토 결과의 재보정 코멘트와 같은 규칙). */
  const note = comment?.trim() ?? "";
  return (
    <button type="button" onClick={onOpen} disabled={!onOpen} aria-label={onOpen ? `${filename} 상세보기` : undefined} className="lk-card lk-card-btn w-full rounded-xl p-2 flex flex-col gap-2 text-left transition-colors enabled:cursor-pointer disabled:cursor-default">
      <div className="lk-thumb w-full aspect-square rounded-lg overflow-hidden relative">
        {photo.url ? (
          <img src={photo.url} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <div className="lk-noimg w-full h-full flex items-center justify-center text-xs font-mono">NO IMG</div>
        )}
      </div>
      {/* 파일명은 상세보기(`LockedPhotoViewer` 헤더)가 말하므로 격자에서는 뺀다.
        * 단 상세보기를 열 수 없을 때(`onOpen` 없음 = 아직 원본 열람 불가 상태)는 격자가 유일한 자리다. */}
      {!onOpen && <p className="lk-filename text-[11px] font-mono truncate" title={filename}>{filename}</p>}
      {note && (
        <span className="lk-comment lk-comment-plain rounded-lg p-2 text-[11px] leading-relaxed">
          <span className="lk-comment-label text-[9px] font-bold tracking-wide">코멘트</span>
          &ldquo;{note}&rdquo;
        </span>
      )}
    </button>
  );
}

/* ── 비선택 원본 카드 (선택하지 않은 사진) ── */
function UnselectedPhotoCard({ photo, onOpen }: { photo: Photo; onOpen?: () => void }) {
  const filename = photo.originalFilename?.split("/").pop() ?? `#${photo.orderIndex}`;
  return (
    <button type="button" onClick={onOpen} disabled={!onOpen} aria-label={onOpen ? `${filename} 상세보기` : undefined} className="lk-card lk-card-btn lk-card-muted w-full rounded-xl p-2 flex flex-col gap-2 text-left transition-colors enabled:cursor-pointer disabled:cursor-default">
      <div className="lk-thumb w-full aspect-square rounded-lg overflow-hidden relative">
        {photo.url ? (
          <img src={photo.url} alt={filename} className="w-full h-full object-cover" />
        ) : (
          <div className="lk-noimg w-full h-full flex items-center justify-center text-xs font-mono">NO IMG</div>
        )}
      </div>
      {/* 상세보기를 열 수 없을 때만 — 근거는 `SimplePhotoCard`와 같다 */}
      {!onOpen && <p className="lk-filename-muted text-[11px] font-mono truncate" title={filename}>{filename}</p>}
    </button>
  );
}

const GRID_MIN_CELL = 180;
const GRID_GAP = 12;

/**
 * 원본 그리드 가상화(화면 + overscan 범위만 실제 DOM에 렌더).
 * `unselected`(선택하지 않은 원본)는 프로젝트 전체 사진 수만큼(수천 장까지) 커질 수 있는데,
 * 가상화 없이 전부 <img>로 마운트하면 모바일에서 이미지 디코딩 메모리 압박으로 일부가
 * 조용히 빈 칸으로 남는다(실사용자 리포트로 확인, 2026-09-20). 메인 갤러리(GalleryPageClient)가
 * 이미 같은 문제를 `@tanstack/react-virtual`로 풀어둔 패턴을 그대로 옮겨온다 — 이 페이지는
 * 필터·presign 큐가 없어 컬럼/행 계산만 가져오면 충분하다.
 */
function VirtualizedPhotoGrid({
  items,
  hasFilenameRow,
  renderItem,
}: {
  items: Photo[];
  /** 카드에 파일명 줄이 붙는지(onOpen 유무로 프로젝트 전체가 동일) — 행 높이 추정에 필요. */
  hasFilenameRow: boolean;
  renderItem: (photo: Photo, index: number) => React.ReactNode;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ cols: 4, rowHeight: 220 });
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const cols = Math.max(1, Math.floor((width + GRID_GAP) / (GRID_MIN_CELL + GRID_GAP)));
      const cellSize = (width - GRID_GAP * (cols - 1)) / cols;
      // 카드 p-2(8px 상하) + (파일명 줄이 있으면 gap-2 8px + text-[11px] 한 줄 ~16px).
      const cardExtra = hasFilenameRow ? 40 : 16;
      const rowHeight = Math.ceil(cellSize) + cardExtra + GRID_GAP;
      setLayout((prev) => (prev.cols === cols && prev.rowHeight === rowHeight ? prev : { cols, rowHeight }));
      const rect = el.getBoundingClientRect();
      setScrollMargin(rect.top + window.scrollY);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [hasFilenameRow]);

  const rowCount = layout.cols > 0 ? Math.ceil(items.length / layout.cols) : 0;
  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => layout.rowHeight,
    overscan: 6,
    scrollMargin,
  });

  useEffect(() => {
    rowVirtualizer.measure();
    // layout이 바뀌면(rowHeight/cols) 명시적으로 재측정해야 한다 — virtualizer는 함수
    // 참조가 그대로면 자동 remeasure하지 않는다(GalleryPageClient와 동일 이유).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.cols, layout.rowHeight]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div ref={gridRef} style={{ position: "relative", width: "100%", height: rowVirtualizer.getTotalSize() }}>
      {virtualRows.map((vRow) => {
        const rowStart = vRow.index * layout.cols;
        const cells: React.ReactNode[] = [];
        for (let c = 0; c < layout.cols; c++) {
          const index = rowStart + c;
          if (index >= items.length) break;
          cells.push(renderItem(items[index], index));
        }
        return (
          <div
            key={vRow.key}
            style={{
              position: "absolute", top: 0, left: 0, width: "100%",
              height: Math.max(vRow.size - GRID_GAP, 0),
              transform: `translateY(${vRow.start - scrollMargin}px)`,
              display: "grid",
              gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
              gap: GRID_GAP,
              alignItems: "start",
              boxSizing: "border-box",
            }}
          >
            {cells}
          </div>
        );
      })}
    </div>
  );
}

/* ── 섹션 헤더 ── */
const SECTION_DOT = {
  brand: "var(--accent)",
  muted: "#a9a6a1",
  revision: "#b26a00",
  approved: "#12833f",
} as const;

function SectionHeader({ label, count, tone }: { label: string; count: number; tone: "brand" | "muted" | "revision" | "approved" }) {
  /* 카드마다 붙던 `선택`/`미선택` 배지를 뺀 대신 이 줄이 sticky로 따라다닌다 —
   * 비선택이 31장이면 섹션 제목이 스크롤로 사라져 "지금 어느 묶음인지"를 잃는다. */
  return (
    <div className="lk-section flex items-center gap-2">
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: SECTION_DOT[tone] }} />
      <h3 className="lk-section-label text-[12px] font-bold tracking-wide">{label}</h3>
      <span className="lk-section-count font-mono text-[11px]">{count}장</span>
    </div>
  );
}

/**
 * 실제 버그의 진짜 원인 — `LockedMobileGallery`가 실제 모바일 화면(`md:hidden`으로
 * 항상 마운트)이고, 위 `VirtualizedPhotoGrid`는 이 너비에서 `hidden md:block`으로
 * 숨어 있어 실제로는 렌더되지 않는다. 밀도(2~5열)마다 카드 높이가 달라 고정 상수로
 * 추정하는 대신, react-virtual의 동적 측정(measureElement)으로 실제 렌더된 행 높이를
 * 그때그때 보정한다 — 열 폭 계산이 필요 없어(그리드 자체가 CSS `fr` 단위) 위쪽 데스크톱
 * 버전보다 오히려 더 단순하다.
 */
function VirtualizedRowGrid({
  items,
  columns,
  gap,
  renderItem,
}: {
  items: Photo[];
  columns: number;
  gap: number;
  renderItem: (photo: Photo, index: number) => React.ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [columns]);

  const rowCount = columns > 0 ? Math.ceil(items.length / columns) : 0;
  const rowVirtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => 160,
    overscan: 6,
    scrollMargin,
  });

  useEffect(() => {
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, items.length]);

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div ref={parentRef} style={{ position: "relative", width: "100%", height: rowVirtualizer.getTotalSize() }}>
      {virtualRows.map((vRow) => {
        const rowStart = vRow.index * columns;
        const cells: React.ReactNode[] = [];
        for (let c = 0; c < columns; c++) {
          const index = rowStart + c;
          if (index >= items.length) break;
          cells.push(renderItem(items[index], index));
        }
        return (
          <div
            key={vRow.key}
            ref={rowVirtualizer.measureElement}
            data-index={vRow.index}
            style={{
              position: "absolute", top: 0, left: 0, width: "100%",
              transform: `translateY(${vRow.start - scrollMargin}px)`,
              display: "grid",
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap,
              paddingBottom: gap,
              boxSizing: "border-box",
            }}
          >
            {cells}
          </div>
        );
      })}
    </div>
  );
}

/** 밀도별 그리드 gap — 예전 CSS(`.locked-density-N .locked-mobile-grid`)에 있던 값을 그대로 JS로 옮겼다.
 * gap을 이제 VirtualizedRowGrid에 직접 넘겨야 해서(행마다 별도 grid이므로 CSS만으로는 못 정함). */
const DENSITY_GAP: Record<2 | 3 | 4 | 5, number> = { 2: 10, 3: 8, 4: 6, 5: 4 };

type LockedMobileGalleryProps = {
  token: string;
  selectedPhotos: Photo[];
  allPhotos: Photo[];
  selectedIds: Set<string>;
  comments: Record<string, { comment?: string }>;
  onOpen: (photos: Photo[], index: number, sectionLabel: string) => void;
  /** 상세보기를 열 수 있는 상태인지 — false면 격자가 파일명이 나올 유일한 자리다 */
  canOpenDetail: boolean;
};

function LockedMobileGallery({ token, selectedPhotos, allPhotos, selectedIds, comments, onOpen, canOpenDetail }: LockedMobileGalleryProps) {
  const router = useRouter();
  const [scope, setScope] = useState<"selected" | "original">("selected");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [columns, setColumns] = useState<2 | 3 | 4 | 5>(2);
  const gridRef = useRef<HTMLDivElement>(null);
  const suppressClickUntilRef = useRef(0);

  const sourcePhotos = scope === "selected" ? selectedPhotos : allPhotos;
  const normalizedQuery = query.trim().toLowerCase();
  const visiblePhotos = normalizedQuery
    ? sourcePhotos.filter((photo) => (photo.originalFilename ?? "").toLowerCase().includes(normalizedQuery))
    : sourcePhotos;

  const changeScope = (next: "selected" | "original") => {
    setScope(next);
    setColumns(next === "selected" ? 2 : 3);
    setScopeOpen(false);
    setQuery("");
    setSearchOpen(false);
  };

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let baseline = 0;
    const distance = () => {
      const points = [...pointers.values()];
      return points.length < 2 ? 0 : Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) baseline = distance();
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size !== 2 || baseline <= 0) return;
      const currentDistance = distance();
      const ratio = currentDistance / baseline;
      if (ratio <= 0.86) {
        suppressClickUntilRef.current = Date.now() + 350;
        setColumns((current) => Math.min(5, current + 1) as 2 | 3 | 4 | 5);
        baseline = currentDistance;
      } else if (ratio >= 1.14) {
        suppressClickUntilRef.current = Date.now() + 350;
        setColumns((current) => Math.max(2, current - 1) as 2 | 3 | 4 | 5);
        baseline = currentDistance;
      }
    };
    const handlePointerEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) baseline = 0;
    };
    grid.addEventListener("pointerdown", handlePointerDown);
    grid.addEventListener("pointermove", handlePointerMove);
    grid.addEventListener("pointerup", handlePointerEnd);
    grid.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      grid.removeEventListener("pointerdown", handlePointerDown);
      grid.removeEventListener("pointermove", handlePointerMove);
      grid.removeEventListener("pointerup", handlePointerEnd);
      grid.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, []);

  return (
    <div className={`locked-mobile locked-density-${columns}`}>
      <header className="locked-mobile-appbar">
        <button type="button" onClick={() => router.push(`/c/${token}/confirmed`)} aria-label="완료 화면으로 돌아가기"><ChevronLeft size={24} /></button>
        <h1>셀렉 상세보기</h1>
      </header>

      <aside className="locked-mobile-status">
        <span><CheckCircle2 size={16} fill="#ff4d00" color="#fff" aria-hidden />사진 셀렉이 완료되어 작가가 보정 중이에요</span>
        <OriginalDownloadEntry token={token} variant="banner" />
      </aside>

      <div className="locked-mobile-toolbar">
        <div className="locked-mobile-scope">
          <button type="button" onClick={() => setScopeOpen((open) => !open)} aria-expanded={scopeOpen}>
            <strong>{scope === "selected" ? "셀렉" : "원본"}</strong>
            <span>{sourcePhotos.length.toLocaleString()}장</span>
            <ChevronDown size={8} aria-hidden />
          </button>
          {scopeOpen && (
            <div role="menu">
              <button type="button" role="menuitem" onClick={() => changeScope("selected")}>셀렉 <span>{selectedPhotos.length.toLocaleString()}장</span></button>
              <button type="button" role="menuitem" onClick={() => changeScope("original")}>원본 <span>{allPhotos.length.toLocaleString()}장</span></button>
            </div>
          )}
        </div>
        <button type="button" className="locked-mobile-search-toggle" onClick={() => { setSearchOpen((open) => !open); if (searchOpen) setQuery(""); }} aria-label={searchOpen ? "검색 닫기" : "파일명 검색"}>
          {searchOpen ? <X size={14} /> : <Search size={14} />}
        </button>
      </div>

      {searchOpen && (
        <label className="locked-mobile-search">
          <Search size={15} aria-hidden />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="파일명 검색" />
        </label>
      )}

      <main ref={gridRef} className="locked-mobile-grid-wrap">
        {visiblePhotos.length > 0 ? (
          <VirtualizedRowGrid
            items={visiblePhotos}
            columns={columns}
            gap={DENSITY_GAP[columns]}
            renderItem={(photo, index) => {
              const filename = photo.originalFilename?.split("/").pop() ?? `#${photo.orderIndex}`;
              const comment = comments[photo.id]?.comment?.trim() ?? "";
              return (
                <button
                  key={photo.id}
                  type="button"
                  className="locked-mobile-card"
                  onClick={() => {
                    if (Date.now() < suppressClickUntilRef.current) return;
                    onOpen(visiblePhotos, index, scope === "selected" ? "선택된 원본" : "원본");
                  }}
                  aria-label={`${filename} 상세보기${selectedIds.has(photo.id) ? ", 선택됨" : ""}`}
                >
                  <span className="locked-mobile-image">
                    {photo.url ? <img src={photo.url} alt="" loading="lazy" decoding="async" /> : <span className="locked-mobile-placeholder">NO IMG</span>}
                    {scope === "original" && selectedIds.has(photo.id) && (
                      <span className="locked-mobile-selected-check" aria-hidden>
                        <Check size={12} strokeWidth={3} />
                      </span>
                    )}
                  </span>
                  <span className="locked-mobile-meta">
                    {/* 파일명은 평소 감춘다 — 격자에서 읽는 것은 사진과 코멘트이고 이름은 상세보기가 말한다.
                      * 두 경우에만 되살린다:
                      *  1) 검색 중 — 파일명이 곧 작업의 대상이라 안 보이면 무엇이 왜 걸렸는지 알 수 없다.
                      *  2) 상세보기를 열 수 없는 상태 — 그러면 격자가 이름이 나올 유일한 자리다. */}
                    {(normalizedQuery || !canOpenDetail) && <strong>{filename}</strong>}
                    {scope === "selected" && <small className={comment ? "has-comment" : ""}>{comment || "코멘트 없음"}</small>}
                  </span>
                </button>
              );
            }}
          />
        ) : (
          <p className="locked-mobile-empty">검색 결과가 없습니다.</p>
        )}
      </main>

      <style>{`
        .locked-mobile { min-height: 100dvh; background: #fff; color: #191918; font-family: Pretendard, "Pretendard Variable", sans-serif; }
        .locked-mobile-appbar { height: calc(48px + env(safe-area-inset-top)); box-sizing: border-box; padding: env(safe-area-inset-top) 20px 0; display: flex; align-items: center; border-bottom: 1px solid #dfe1e4; background: #fff; }
        .locked-mobile-appbar button { width: 24px; height: 44px; padding: 0; border: 0; background: transparent; color: #26282c; display: grid; place-items: center; }
        .locked-mobile-appbar h1 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 600; letter-spacing: -.32px; }
        .locked-mobile-status { min-height: 52px; box-sizing: border-box; padding: 10px 24px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(255,77,0,.08); border-bottom: 1px solid rgba(255,77,0,.18); }
        .locked-mobile-status > span { min-width: 0; display: flex; align-items: center; gap: 6px; color: #26282c; font-size: 12px; line-height: 19px; font-weight: 700; letter-spacing: -.24px; white-space: nowrap; }
        .locked-mobile-toolbar { height: 48px; padding: 0 20px; display: flex; align-items: center; justify-content: space-between; background: #fff; }
        .locked-mobile-scope { position: relative; }
        .locked-mobile-scope > button { height: 36px; padding: 0 4px; border: 0; background: transparent; display: flex; align-items: center; gap: 6px; color: #26282c; font-size: 12px; }
        .locked-mobile-scope > button strong { font-weight: 600; }
        .locked-mobile-scope > button span { color: #7d7a75; }
        .locked-mobile-scope > div { position: absolute; top: 40px; left: 0; z-index: 20; width: 132px; padding: 6px; border: 1px solid #dfe1e4; border-radius: 8px; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
        .locked-mobile-scope > div button { width: 100%; height: 38px; padding: 0 10px; border: 0; border-radius: 5px; background: transparent; display: flex; align-items: center; justify-content: space-between; color: #26282c; font-size: 12px; }
        .locked-mobile-scope > div button:active { background: #f1f3f6; }
        .locked-mobile-search-toggle { width: 30px; height: 30px; padding: 0; border: 1px solid #bfbfbf; border-radius: 4px; background: #fff; color: #7d7a75; display: grid; place-items: center; }
        .locked-mobile-search { height: 42px; margin: 0 20px 8px; padding: 0 12px; border: 1px solid #c6cbd0; border-radius: 6px; display: flex; align-items: center; gap: 8px; color: #7d7a75; }
        .locked-mobile-search input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: #191918; font-size: 13px; }
        .locked-mobile-grid-wrap { padding: 0 20px 20px; touch-action: pan-y; }
        .locked-mobile-card { min-width: 0; padding: 4px 4px 8px; overflow: hidden; border: 1.5px solid #fff; border-radius: 4px; background: #f1f3f6; color: #191918; text-align: left; }
        .locked-mobile-image { position: relative; width: 100%; aspect-ratio: 1; overflow: hidden; border-radius: 3px; background: #aab0b8; display: block; }
        .locked-density-2 .locked-mobile-image { aspect-ratio: 151.5 / 103.479; }
        .locked-mobile-image img { width: 100%; height: 100%; display: block; object-fit: cover; }
        .locked-mobile-placeholder { width: 100%; height: 100%; display: grid; place-items: center; color: #fff; font-size: 8px; }
        .locked-mobile-selected-check { position: absolute; top: 4px; left: 4px; width: 20px; height: 20px; display: grid; place-items: center; border-radius: 2px; background: #ff4d00; color: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); }
        .locked-density-4 .locked-mobile-selected-check { width: 14px; height: 14px; }
        .locked-density-4 .locked-mobile-selected-check svg { width: 9px; height: 9px; }
        .locked-density-5 .locked-mobile-selected-check { top: 3px; left: 3px; width: 12px; height: 12px; }
        .locked-density-5 .locked-mobile-selected-check svg { width: 8px; height: 8px; }
        .locked-mobile-meta { display: none; }
        .locked-density-2 .locked-mobile-meta { min-height: 31px; padding: 5px 3px 0; display: flex; flex-direction: column; gap: 2px; }
        .locked-mobile-meta strong { overflow: hidden; font-size: 10px; line-height: 16px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
        .locked-mobile-meta small { overflow: hidden; color: #787878; font-size: 8px; line-height: 14px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
        .locked-mobile-meta small.has-comment { color: #ff4d00; }
        .locked-density-3 .locked-mobile-image { aspect-ratio: 106.333 / 103.479; }
        .locked-density-4 .locked-mobile-image { aspect-ratio: 79.25 / 79; }
        .locked-density-3 .locked-mobile-card, .locked-density-4 .locked-mobile-card, .locked-density-5 .locked-mobile-card { padding: 0; }
        .locked-mobile-empty { margin: 80px 0; color: #7d7a75; font-size: 13px; text-align: center; }
      `}</style>
    </div>
  );
}

export default function LockedPage() {
  /* 모바일·PC 모두 라이트 화면이다 — body 바탕까지 흰색으로 바꿔 러버밴드·주소창 전환에서
   * 검은 바탕이 드러나지 않게 한다(갤러리·검토 목록과 같은 처리). */
  useCustomerLightCanvas();
  const params  = useParams();
  const router  = useRouter();
  const token   = (params?.token as string) ?? "";
  const ctx     = useSelectionOptional();
  const project = ctx?.project ?? null;
  const loading = ctx?.loading ?? true;

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelling,      setCancelling]      = useState(false);
  const [reviewResult,    setReviewResult]    = useState<ReviewResultPhoto[] | null>(null);
  const [viewer, setViewer] = useState<{ photos: Photo[]; initialIndex: number; sectionLabel: string } | null>(null);

  useEffect(() => {
    if (!project || !token) return;
    if (project.status === "selecting") router.replace(`/c/${token}/gallery`);
  }, [project, token, router]);

  const projectStatus = project?.status;
  useEffect(() => {
    if (!token || !projectStatus) return;
    if (!["editing_v2", "reviewing_v2", "delivered"].includes(projectStatus)) return;
    fetch(`/api/c/review-result?token=${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.photos && setReviewResult(data.photos))
      .catch(() => {});
  }, [token, projectStatus]);

  const contextPhotos = ctx?.photos;
  const selectedIds = ctx?.selectedIds;
  const photoStates = ctx?.photoStates ?? {};
  const { photos, unselected, allPhotos, N } = useMemo(() => {
    if (!project || !contextPhotos?.length) {
      return { photos: [] as Photo[], unselected: [] as Photo[], allPhotos: [] as Photo[], N: 0 };
    }
    const sel: Photo[] = [];
    const unsel: Photo[] = [];
    for (const p of contextPhotos) {
      if (selectedIds?.has(p.id)) sel.push(p);
      else unsel.push(p);
    }
    sel.sort((a, b) => a.orderIndex - b.orderIndex);
    unsel.sort((a, b) => a.orderIndex - b.orderIndex);
    const all = [...contextPhotos].sort((a, b) => a.orderIndex - b.orderIndex);
    return { photos: sel, unselected: unsel, allPhotos: all, N: sel.length };
  }, [project, contextPhotos, selectedIds]);

  const cancelCount      = project?.customerCancelCount ?? 0;
  const remainingCancels = Math.max(0, CUSTOMER_CANCEL_MAX - cancelCount);
  const atCancelLimit    = cancelCount >= CUSTOMER_CANCEL_MAX;
  const canCancel        = project?.status === "confirmed" && !atCancelLimit;

  const handleConfirmCancel = async () => {
    if (!project?.id || !token) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/c/cancel-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, project_id: project.id }),
      });
      if (!res.ok) { setCancelling(false); return; }
      setCancelModalOpen(false);
      if (typeof window !== "undefined") window.location.replace(`/c/${token}/gallery`);
    } catch { setCancelling(false); }
  };

  if (loading) return <SystemLoadingScreen />;
  if (!project) return (
    <div className="flex min-h-dvh items-center justify-center bg-background text-subtle-foreground font-mono text-sm">
      존재하지 않는 초대 링크입니다.
    </div>
  );
  if (project.status === "selecting") return <div className="min-h-dvh bg-background" />;

  const confirmedDate = project.confirmedAt ? formatKstDateTime(project.confirmedAt) : null;

  const isEditing  = ["editing", "editing_v2"].includes(project.status);
  const isConfirmed = project.status === "confirmed";
  const hasReview  = reviewResult && reviewResult.length > 0;
  const showUnselected = isConfirmed && !hasReview && unselected.length > 0;
  const canViewOriginals = project.status === "confirmed" || project.status === "editing";

  /* 셀렉 결과 뷰와 같은 방식으로 묶는다 — **재보정 요청이 먼저(위)**다.
   * 작가가 손대야 할 것이 위, 이미 끝난 것이 아래. 확정 8장을 지나 스크롤해야
   * 재보정 2장이 나오면 정작 할 일이 묻힌다. */
  const revisionPhotos = hasReview ? reviewResult!.filter((p) => p.reviewStatus === "revision_requested") : [];
  const approvedPhotos = hasReview ? reviewResult!.filter((p) => p.reviewStatus === "approved") : [];
  const pendingPhotos  = hasReview ? reviewResult!.filter((p) => p.reviewStatus !== "approved" && p.reviewStatus !== "revision_requested") : [];
  const approved = approvedPhotos.length;
  const revision = revisionPhotos.length;

  const reviewedThumbByPhotoId = hasReview
    ? new Map(reviewResult!.map((photo) => [photo.photoId, photo.thumbUrl] as const))
    : null;
  // 모바일 셀렉 범위도 PC 카드와 같은 보정본 URL을 사용한다. 원본 범위는 비교·다운로드를 위해 유지한다.
  const lockedSelectedPhotos = reviewedThumbByPhotoId
    ? photos.map((photo) => {
        const reviewedThumb = reviewedThumbByPhotoId.get(photo.id);
        return reviewedThumb ? { ...photo, url: reviewedThumb, previewUrl: reviewedThumb } : photo;
      })
    : photos;

  const statusText = (() => {
    switch (project.status) {
      case "confirmed":   return "작가가 보정을 준비하고 있습니다";
      case "editing":     return "작가가 보정을 진행 중입니다";
      case "editing_v2":  return "작가가 재보정을 진행 중입니다";
      case "reviewing_v2": return "재보정본 검토를 요청드립니다";
      case "delivered":   return "모든 보정이 완료되었습니다";
      default:            return "진행 중";
    }
  })();

  return (
    <>
      <div className="md:hidden">
        <LockedMobileGallery
          token={token}
          selectedPhotos={lockedSelectedPhotos}
          allPhotos={allPhotos}
          selectedIds={selectedIds ?? new Set<string>()}
          comments={photoStates}
          canOpenDetail={canViewOriginals}
          onOpen={(viewerPhotos, initialIndex, sectionLabel) => {
            if (canViewOriginals) setViewer({ photos: viewerPhotos, initialIndex, sectionLabel });
          }}
        />
      </div>

      {/* PC도 라이트다 — 격자/목록 화면은 라이트라는 규칙(§고객 디자인)을 따른다.
        * 모바일 뷰(LockedMobileGallery)는 원래 라이트였는데 PC만 다크로 남아,
        * 같은 링크를 노트북에서 열면 갑자기 검은 화면이 나왔다. */}
      <div className="lk-desktop hidden min-h-dvh md:flex md:flex-col" style={{ fontFamily: "'Pretendard Variable',-apple-system,sans-serif" }}>

      {/* 머리 한 줄 — 검토 목록(.rgv-header)과 같은 뼈대다(A 마크 + 이름/보조줄, 오른쪽에 카운트).
        * 예전에는 브랜드바와 상태바가 따로 있어 같은 화면에 머리가 두 겹이었다. */}
      <header className="lk-header">
        <div className="lk-head-left">
          <Link href={token ? `/c/${token}` : "#"} aria-label="처음 화면으로" className="lk-brand-mark">A</Link>
          <div className="lk-head-text">
            <h1 className="lk-title">{project.name}</h1>
            <p className="lk-status">
              <span className={`lk-dot${isEditing ? " lk-dot-working" : ""}`} aria-hidden />
              {statusText}
              <span className="lk-readonly">
                <Lock size={10} />
                읽기 전용
              </span>
            </p>
          </div>
        </div>
        <div className="lk-head-right">
          <div className="lk-counts">
            {hasReview ? (
              <>
                {approved > 0 && <span style={{ color: "#12833f" }}>확정 {approved}</span>}
                {revision > 0 && <span style={{ color: "#b26a00" }}>재보정 {revision}</span>}
              </>
            ) : (
              <>
                <span>{N}장 선택</span>
                {showUnselected && <span className="lk-counts-muted">비선택 {unselected.length}</span>}
              </>
            )}
            {confirmedDate && <span className="lk-counts-muted">{confirmedDate}</span>}
          </div>
        </div>
      </header>

      {/* 원본 다운로드는 머리 아래 sub 헤더 띠로 — 모바일(.locked-mobile-status)과 같은 자리·같은 주황 틴트다.
        * 기한이 있는 안내라 버튼만 두면 "언제까지"를 알 수 없어, 만료일과 남은 일수를 같은 줄에 둔다.
        * 아카이브가 없는 프로젝트에서는 컴포넌트가 스스로 아무것도 렌더하지 않아 띠도 사라진다. */}
      <OriginalDownloadEntry token={token} variant="subheader" />

      {/* Photo grid */}
      <div className={`lk-body flex-1${isConfirmed ? " lk-body-footer" : ""}`}>
        {hasReview ? (
          <div className="flex flex-col gap-6">
            {revisionPhotos.length > 0 && (
              <section>
                <SectionHeader label="재보정 요청" count={revisionPhotos.length} tone="revision" />
                <div className="lk-grid">
                  {revisionPhotos.map((photo) => <PhotoCard key={photo.photoId} photo={photo} />)}
                </div>
              </section>
            )}
            {approvedPhotos.length > 0 && (
              <section>
                <SectionHeader label="확정" count={approvedPhotos.length} tone="approved" />
                <div className="lk-grid">
                  {approvedPhotos.map((photo) => <PhotoCard key={photo.photoId} photo={photo} />)}
                </div>
              </section>
            )}
            {pendingPhotos.length > 0 && (
              <section>
                <SectionHeader label="검토 대기" count={pendingPhotos.length} tone="muted" />
                <div className="lk-grid">
                  {pendingPhotos.map((photo) => <PhotoCard key={photo.photoId} photo={photo} />)}
                </div>
              </section>
            )}
          </div>
        ) : photos.length > 0 ? (
          <div className="flex flex-col gap-6">
            <section>
              <SectionHeader label="선택된 원본" count={photos.length} tone="brand" />
              <VirtualizedPhotoGrid
                items={photos}
                hasFilenameRow={!canViewOriginals}
                renderItem={(photo, index) => (
                  <SimplePhotoCard
                    key={photo.id}
                    photo={photo}
                    comment={photoStates[photo.id]?.comment ?? undefined}
                    onOpen={canViewOriginals ? () => setViewer({ photos, initialIndex: index, sectionLabel: "선택된 원본" }) : undefined}
                  />
                )}
              />
            </section>

            {showUnselected && (
              <section>
                <SectionHeader label="선택하지 않은 원본" count={unselected.length} tone="muted" />
                <VirtualizedPhotoGrid
                  items={unselected}
                  hasFilenameRow={!canViewOriginals}
                  renderItem={(photo, index) => (
                    <UnselectedPhotoCard
                      key={photo.id}
                      photo={photo}
                      onOpen={canViewOriginals ? () => setViewer({ photos: unselected, initialIndex: index, sectionLabel: "선택하지 않은 원본" }) : undefined}
                    />
                  )}
                />
              </section>
            )}
          </div>
        ) : (
          <div className="lk-loading flex items-center justify-center h-48 font-mono text-sm">
            불러오는 중...
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {/* 풋터는 **되돌릴 수 있을 때만** 둔다. 예전에는 확정 취소가 없을 때도 풋터가 남아
        * 머리의 상태 문구("작가가 재보정을 진행 중입니다")를 글자 그대로 한 번 더 적었다 —
        * 한 줄을 차지하면서 아무것도 더하지 않았다. */}
      {isConfirmed && (
        <CustomerFooter theme="customerLight">
          <span className="lk-footer-note">
            아직 선택을 되돌릴 수 있어요 · <b>{remainingCancels}회</b> 남음
          </span>
          <button
            type="button"
            disabled={!canCancel}
            onClick={() => canCancel && setCancelModalOpen(true)}
            className="lk-cancel-btn">
            확정 취소
          </button>
        </CustomerFooter>
      )}

      {/* 확정 취소도 "되돌릴 수 없는 한 걸음" 앞의 확인이라 전달 모달과 같은 컴포넌트를 쓴다 */}
      {cancelModalOpen && (
        <SelectionConfirmDialog
          title="확정을 취소할까요?"
          description={
            <>
              갤러리로 돌아가 사진을 다시 선택할 수 있습니다.
              <br />
              취소 횟수가 차감돼 {remainingCancels}회 남습니다.
            </>
          }
          confirmLabel="취소하기"
          busyLabel="처리 중..."
          confirming={cancelling}
          onCancel={() => { if (!cancelling) setCancelModalOpen(false); }}
          onConfirm={handleConfirmCancel}
        />
      )}

      <style>{`
        /* PC 잠금 갤러리 — 모바일(.locked-mobile)과 같은 라이트 팔레트 */
        .lk-desktop {
          background: var(--customer-canvas); color: var(--customer-ink);
          /* 섹션 헤더가 이 높이만큼 아래에 달라붙는다(머리와 겹치지 않게) */
          --lk-header-h: 69px;
        }

        /* 머리 — 검토 목록(.rgv-header)과 같은 값 */
        .lk-header {
          position: sticky; top: 0; z-index: 50; flex-shrink: 0;
          display: flex; align-items: center; justify-content: space-between; gap: 20px;
          min-height: 64px; padding: 10px 32px;
          background: #fff; border-bottom: 1px solid #eef0f2;
        }
        .lk-head-left { display: flex; align-items: center; gap: 16px; min-width: 0; }
        .lk-brand-mark {
          width: 32px; height: 32px; flex: 0 0 32px;
          display: grid; place-items: center; border-radius: 8px;
          background: #ff4d00; color: #fff; text-decoration: none;
          font: 800 16px/1 Pretendard, sans-serif;
          box-shadow: 0 1px 2px rgba(25,25,24,.12);
        }
        .lk-head-text { min-width: 0; }
        .lk-title {
          margin: 0; font: 700 18px/1.3 Pretendard, sans-serif; letter-spacing: -.2px;
          color: var(--customer-ink);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .lk-status {
          margin: 4px 0 0; display: flex; align-items: center; gap: 8px;
          font: 12px/1 Pretendard, sans-serif; color: var(--customer-ink-secondary); white-space: nowrap;
        }
        .lk-dot { width: 7px; height: 7px; border-radius: 50%; background: #12833f; flex: 0 0 7px; }
        .lk-dot-working { background: #f0a500; }
        .lk-readonly {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 7px; border-radius: 999px;
          background: rgba(255,77,0,.08); border: 1px solid rgba(255,77,0,.22); color: var(--accent);
          font: 700 10px/1.4 Pretendard, sans-serif;
        }
        .lk-head-right { flex: 0 0 auto; display: flex; align-items: center; gap: 16px; }
        .lk-counts {
          display: flex; align-items: baseline; gap: 10px;
          font: 700 13px/1 Pretendard, sans-serif; color: var(--customer-ink);
          font-variant-numeric: tabular-nums; white-space: nowrap;
        }
        .lk-counts-muted { font-weight: 600; font-size: 12px; color: var(--customer-ink-secondary); }
        .lk-download { width: 200px; }

        .lk-body { padding: 20px 32px 40px; }
        .lk-body-footer { padding-bottom: 96px; }
        /* 카드가 내용 높이만큼만 차지하게 — 기본(stretch)이면 코멘트 없는 확정 카드도
         * 코멘트 있는 재보정 카드 높이(272px)에 맞춰 늘어나 아래가 80px씩 빈다. */
        .lk-grid {
          display: grid; gap: 12px; align-items: start;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        }
        .lk-loading { color: var(--customer-ink-secondary); }
        .lk-section-label { color: var(--customer-ink); }
        .lk-section-count { color: var(--customer-ink-secondary); }

        .lk-card { background: #fff; border: 1px solid var(--customer-divider); }
        /* 값은 검토 목록 .rgv-card-pill과 동일 — 같은 결과를 두 화면에서 같은 모양으로 본다 */
        .lk-badge {
          position: absolute; top: 8px; right: 8px; z-index: 3;
          display: inline-flex; align-items: center; gap: 3px;
          padding: 2px 7px; border: 1px solid; border-radius: 999px;
          background: #fff; font: 700 10px/1.5 Pretendard, sans-serif; letter-spacing: -.2px;
        }
        .lk-card-btn { transition: border-color .15s ease, box-shadow .15s ease; }
        .lk-card-btn:enabled:hover { border-color: #b9bec4; box-shadow: 0 2px 8px rgba(25,25,24,.06); }
        .lk-card-btn:enabled:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .lk-card-muted { background: #fafafa; }
        /* 비선택은 "고르지 않은 것"이지 "못 보는 것"이 아니다 — 흐림은 구분이 되는 선까지만 */
        .lk-card-muted .lk-thumb img { opacity: .82; transition: opacity .15s ease; }
        .lk-card-muted:hover .lk-thumb img { opacity: 1; }
        /* 주의: .lk-body에 overflow-y:auto가 있으면 sticky가 "그 상자"를 기준으로 잡는데
         * 실제로 스크롤되는 것은 window라, 영영 달라붙지 않는다. 그래서 .lk-body는 overflow를 두지 않는다. */
        .lk-section {
          position: sticky; top: var(--lk-header-h); z-index: 5;
          margin: 0 -8px 8px; padding: 8px;
          background: var(--customer-canvas);
        }
        .lk-thumb { background: #f1f3f6; border: 1px solid var(--customer-divider); }
        .lk-noimg { color: #aab0b8; }
        /* 파일명은 상세보기가 없는 카드에만 나타난다(§파일명 규칙) */
        .lk-filename { color: var(--customer-ink); }
        .lk-filename-muted { color: var(--customer-ink-secondary); }
        .lk-unselected { background: rgba(255,255,255,.9); border: 1px solid var(--customer-divider); color: var(--customer-ink-secondary); }

        /* 재보정 코멘트 — 앰버 왼쪽 선으로 "작가가 읽을 요청"임을 드러낸다 */
        .lk-comment {
          background: #fffaf0; border: 1px solid rgba(178,106,0,.28); border-left: 2px solid #b26a00;
          color: var(--customer-ink);
        }
        .lk-comment-label { display: block; color: #b26a00; margin-bottom: 4px; }
        /* 셀렉 코멘트는 "요청"이 아니라 고객의 메모다 — 앰버(재보정)와 구분되는 중립 톤.
         * 주황도 쓰지 않는다(방금 카드마다 붙던 주황 배지를 덜어낸 화면이다). */
        .lk-comment-plain {
          display: block; text-align: left;
          background: #f7f8f9; border: 1px solid var(--customer-divider); border-left: 2px solid #a9a6a1;
          color: var(--customer-ink);
        }
        .lk-comment-plain .lk-comment-label { color: var(--customer-ink-secondary); }
        .lk-comment-empty { color: var(--customer-ink-secondary); }

        .lk-footer-note { font: 600 12px/1.4 Pretendard, sans-serif; color: var(--customer-ink-secondary); }
        .lk-footer-note b { color: var(--customer-ink); }
        .lk-cancel-btn {
          height: 36px; padding: 0 16px; border-radius: 8px;
          border: 1px solid var(--customer-divider); background: #fff; color: var(--customer-danger-text);
          font: 700 12px/1 Pretendard, sans-serif; cursor: pointer;
          transition: border-color .15s ease, color .15s ease;
        }
        .lk-cancel-btn:enabled:hover { border-color: var(--customer-danger); color: var(--customer-danger); }
        .lk-cancel-btn:disabled { opacity: .45; cursor: not-allowed; }
      `}</style>
      </div>

      {viewer && (
        <LockedPhotoViewer
          token={token}
          photos={viewer.photos}
          initialIndex={viewer.initialIndex}
          sectionLabel={viewer.sectionLabel}
          selectedPhotoIds={selectedIds ?? new Set<string>()}
          comments={photoStates}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
