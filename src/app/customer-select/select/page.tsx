"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { SelectImage as Image } from "../SelectImage";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowLeft, Check, ChevronRight, Grid2X2, Heart, Layers3, MessageCircle, SlidersHorizontal, TriangleAlert, UsersRound, X } from "lucide-react";
import { CustomerEntryShell } from "@/components/customer/CustomerEntryShell";
import { useCustomerSelectDraft } from "@/contexts/CustomerSelectDraftContext";
import { useCustomerSelectCatalog } from "@/lib/customer-select-catalog";
import { sceneTargetsWithEdits } from "@/lib/scene-targets";

import { PhotoComparison, type ComparisonUnit as Unit } from "./PhotoComparison";

const button = "cs-secondary min-h-11 rounded-lg border border-[var(--customer-divider)] px-3 text-sm font-medium disabled:opacity-35";


function SelectContent() {
  "use no memo"; // Virtualizer 인스턴스는 유지되지만 스크롤마다 내부 범위가 바뀐다.
  const router = useRouter();
  const params = useSearchParams();
  const { scenes: SELECT_SCENES, timeline: SELECT_TIMELINE, photos: catalogPhotos, template, sample } = useCustomerSelectCatalog();
  const sceneIndex = Math.min(Math.max(Math.trunc(Number(params.get("scene"))) || 0, 0), SELECT_SCENES.length - 1);
  const scenesEnabled = params.get("scenes") !== "0";
  const similarEnabled = params.get("similar") !== "0";
  const qualityEnabled = params.get("quality") === "1";
  const fromUpload = params.get("from") === "upload";
  const { finalIds, toggleFinal, favorites, notes, guests, addGuest, toggleGuestAccess, activeActor, setActiveActor, setGuestDone, targetCount, excludedScenes, sceneTargets: targetOverrides, reviewedScenes, toggleReviewedScene, closed, setClosed } = useCustomerSelectDraft();
  const [favoriteScope, setFavoriteScope] = useState<"all" | "mine" | "person" | "common" | "different">("all");
  const [selectionScope, setSelectionScope] = useState<"all" | "selected">("all");
  const [mobileColumns, setMobileColumns] = useState<2 | 3 | 4>(2);
  const [favoritePersonId, setFavoritePersonId] = useState("owner");
  const [guestName, setGuestName] = useState("");
  const [collaborationOpen, setCollaborationOpen] = useState(params.get("collab") === "1");
  const collaborationDialog = useRef<HTMLDialogElement>(null);
  const [person, setPerson] = useState("");
  const [composition, setComposition] = useState("");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [comparison, setComparison] = useState<{ units: Unit[]; index: number } | null>(null);
  const positions = useRef<Record<string, number>>({});
  const viewKey = scenesEnabled ? String(sceneIndex) : "all";
  const sceneDialog = useRef<HTMLDialogElement>(null);
  const [scenePicker, setScenePicker] = useState(false);
  useEffect(() => {
    if (!scenePicker) return;
    const dialog = sceneDialog.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, [scenePicker]);
  useEffect(() => {
    if (!collaborationOpen) return;
    const dialog = collaborationDialog.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog?.close(); document.body.style.overflow = overflow; };
  }, [collaborationOpen]);
  const grid = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState({ width: 0, columns: 2, rowHeight: 200, margin: 180, mobile: true });
  const scene = SELECT_SCENES[sceneIndex];
  const catalogSceneByPhotoId = useMemo(() => Object.fromEntries(catalogPhotos.map(photo => [photo.id, photo.sceneIndex])), [catalogPhotos]);
  const sceneTargets = targetCount === null ? null : sceneTargetsWithEdits(SELECT_SCENES.map(scene => scene.count ? scene.target : 0), excludedScenes, targetCount, targetOverrides);
  const nextSceneIndex = SELECT_SCENES.findIndex((item, index) => index > sceneIndex && item.count > 0 && !excludedScenes.has(index));
  const groups = useMemo(() => scenesEnabled ? SELECT_TIMELINE[sceneIndex] : SELECT_TIMELINE.flat(), [SELECT_TIMELINE, sceneIndex, scenesEnabled]);
  const units = useMemo(() => (similarEnabled ? groups : groups.flatMap(group => group.map(photo => [photo]))).map(photos => ({
    id: photos[0].id, scene: scenesEnabled ? scene.name : "촬영 순서", photos,
  })), [groups, similarEnabled, scenesEnabled, scene.name]);
  const favoriteCount = units.reduce((count, unit) => count + unit.photos.filter(photo => favorites[activeActor]?.has(photo.id)).length, 0);
  const scopedIds = useMemo(() => {
    const ids = new Set<string>();
    if (favoriteScope === "all") return ids;
    const actors = ["owner", ...guests.map(guest => guest.id)];
    for (const unit of units) for (const photo of unit.photos) {
      const liked = actors.filter(id => favorites[id]?.has(photo.id)).length;
      if (favoriteScope === "mine" && favorites[activeActor]?.has(photo.id)
        || favoriteScope === "person" && favorites[favoritePersonId]?.has(photo.id)
        || favoriteScope === "common" && liked >= 2
        || favoriteScope === "different" && liked > 0 && liked < actors.length) ids.add(photo.id);
    }
    return ids;
  }, [units, favoriteScope, favoritePersonId, favorites, activeActor, guests]);
  const filtered = useMemo(() => units.flatMap(unit => {
    const photos = unit.photos.filter(photo => (!person || person === photo.person) && (!composition || composition === photo.composition)
      && (!category || photo.categories?.includes(category)) && photo.filename.toLowerCase().includes(search.trim().toLowerCase()));
    if (!photos.length || (favoriteScope !== "all" && !photos.some(photo => scopedIds.has(photo.id))) || (selectionScope === "selected" && !photos.some(photo => finalIds.has(photo.id)))) return [];
    // 찜 보기에서는 묶음 전체를 유지하고 찜한 사진부터 열어 비교한다.
    const visible = favoriteScope !== "all" && unit.photos.length > 1
      ? [...unit.photos.filter(photo => scopedIds.has(photo.id)), ...unit.photos.filter(photo => !scopedIds.has(photo.id))]
      : photos;
    return [{ ...unit, photos: visible }];
  }), [units, favoriteScope, scopedIds, selectionScope, finalIds, person, composition, category, search]);
  const rows = useMemo(() => {
    const result: Unit[][] = [];
    for (const unit of filtered) {
      const previous = result.at(-1);
      if (previous && previous.length < layout.columns) previous.push(unit);
      else result.push([unit]);
    }
    return result;
  }, [filtered, layout.columns]);

  useLayoutEffect(() => {
    function update() {
      if (!grid.current) return;
      const width = grid.current.clientWidth;
      const mobile = window.innerWidth < 768;
      const columns = mobile ? mobileColumns : width >= 1100 ? 10 : width >= 760 ? 8 : 6;
      const next = { width, columns, rowHeight: (width - (columns - 1) * 8) / columns + 24, margin: grid.current.getBoundingClientRect().top + window.scrollY, mobile };
      setLayout(current => current.width === next.width && current.columns === next.columns && current.rowHeight === next.rowHeight && current.margin === next.margin && current.mobile === next.mobile ? current : next);
    }
    update();
    const observer = new ResizeObserver(update);
    if (main.current) observer.observe(main.current);
    window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [mobileColumns]);
  const rowKey = useMemo(() => (index: number) => `${rows[index]?.[0].id}:${layout.width}:${layout.columns}`, [rows, layout.width, layout.columns]);
  const virtualizer = useWindowVirtualizer({
    count: rows.length, estimateSize: () => layout.rowHeight,
    getItemKey: rowKey,
    overscan: 3, scrollMargin: layout.margin,
  });
  // 행 크기를 다시 측정할 때 브라우저의 명시적 스크롤 이동을 되돌리지 않는다.
  // TanStack Virtualizer의 공개 인스턴스 설정이며 React 상태를 변경하지 않는다.
  // eslint-disable-next-line react-hooks/immutability
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;

  function moveScene(index: number) {
    positions.current[viewKey] = window.scrollY;
    setScenePicker(false);
    router.replace(`/customer-select/select?scene=${index}&scenes=${scenesEnabled ? 1 : 0}&similar=${similarEnabled ? 1 : 0}&quality=${qualityEnabled ? 1 : 0}${fromUpload ? "&from=upload" : ""}`, { scroll: false });
  }
  useEffect(() => { window.scrollTo(0, positions.current[viewKey] ?? 0); }, [viewKey]);
  const sceneCounts = SELECT_SCENES.map((_, index) => catalogPhotos.filter(photo => photo.sceneIndex === index && finalIds.has(photo.id)).length);
  function sceneLinks() {
    return SELECT_SCENES.map((item, index) => item.count > 0 && <button key={item.name} aria-current={sceneIndex === index ? "step" : undefined} onClick={() => moveScene(index)} className={`w-full rounded-lg border px-3 py-3 text-left ${sceneIndex === index ? "border-[var(--select-accent-line)] bg-[var(--select-accent-soft)]" : "border-transparent hover:bg-[var(--select-surface)]"}`}>
      <span className="block text-sm font-semibold">{index + 1}. {item.shortName}{sceneIndex === index && <span className="ml-2 text-[12px] text-[var(--select-accent-ink)]">현재</span>}</span>
      <span className="mt-1 block text-xs text-[var(--select-muted)]">선택 {sceneCounts[index]}장{sceneTargets && ` · ${excludedScenes.has(index) ? "추천 제외" : `추천 ${sceneTargets[index]}장`}`}{reviewedScenes.has(index) && " · 검토 완료"}</span>
    </button>);
  }
  const count = scenesEnabled ? sceneCounts[sceneIndex] : finalIds.size;
  const filterCount = [person, composition, category, search.trim()].filter(Boolean).length;
  const scopeLabel = favoriteScope === "common" ? "공통 찜" : favoriteScope === "different" ? "의견 차이" : favoriteScope === "person" ? `${guests.find(guest => guest.id === favoritePersonId)?.name ?? "참여자"}의 찜` : "찜한 사진만";
  function clearFilters() { setPerson(""); setComposition(""); setCategory(""); setSearch(""); }
  function chooseScope(scope: typeof favoriteScope, personId = "owner") { setFavoriteScope(scope); setFavoritePersonId(personId); setCollaborationOpen(false); }
  function invite(event: FormEvent<HTMLFormElement>) { event.preventDefault(); addGuest(guestName); setGuestName(""); }

  return <CustomerEntryShell layout="responsive" className="!overflow-visible">
    <header className="sticky top-0 z-30 border-b border-[var(--select-line)] bg-white/95 px-3 backdrop-blur md:px-8">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-2">
        <Link href={fromUpload ? "/customer-select/upload" : `/customer-select/results?${scenesEnabled ? "scenes=1&" : ""}${similarEnabled ? "similar=1&" : ""}${qualityEnabled ? "quality=1" : ""}`} aria-label={fromUpload ? "업로드 화면으로" : "정리 결과로"} className="grid h-11 w-11 shrink-0 place-items-center"><ArrowLeft size={20} /></Link>
        <h1 className="sr-only">{scenesEnabled ? scene.name : "전체 사진"}</h1>
        {scenesEnabled ? <button aria-label="전체 장면 열기" aria-haspopup="dialog" onClick={() => setScenePicker(true)} className="min-h-11 min-w-0 text-left">
          <span className="block truncate text-sm font-semibold">{scene.shortName}<span className="ml-2 lg:hidden">⌄</span></span>
          <span className="block text-[12px] text-[var(--select-muted)]">장면 {sceneIndex + 1} / {SELECT_SCENES.length}</span>
        </button> : <span className="flex-1 text-sm font-semibold">촬영 순서대로</span>}
        <Link href={`/customer-select/review?${params}`} className="ml-auto shrink-0 rounded-lg px-2 py-2 text-right text-xs font-semibold md:text-sm"><span className="block">최종 {finalIds.size}{targetCount !== null && ` / ${targetCount}`}장</span><span className="mt-1 block text-[12px] text-[var(--select-accent-ink)]">최종 검토 →</span></Link>
      </div>
    </header>
    <div className={`mx-auto max-w-[1504px] ${scenesEnabled ? "lg:grid lg:grid-cols-[210px_minmax(0,1fr)]" : ""}`}>
    {scenesEnabled && <aside className="sticky top-16 hidden h-fit max-h-[calc(100dvh-150px)] overflow-y-auto border-r px-3 py-5 lg:block" aria-label="전체 장면">
      <h2 className="mb-3 px-3 text-xs font-semibold text-[var(--select-muted)]">전체 장면 {SELECT_SCENES.length}개</h2>
      <nav className="space-y-2">{sceneLinks()}</nav>
    </aside>}
    <main ref={main} className="min-w-0 px-3 pb-28 md:px-6">
      <div className="sticky top-16 z-20 bg-white">
      <div className="flex items-center gap-1 border-b border-[var(--select-line)] py-2 sm:gap-2">
        <select aria-label="사진 보기 범위" value={selectionScope} onChange={event => setSelectionScope(event.target.value as "all" | "selected")} className="min-h-11 rounded-lg border border-[var(--customer-divider)] bg-white px-2 text-sm font-semibold"><option value="all">전체</option><option value="selected">선택한 사진</option></select>
        <button className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-2 text-sm font-semibold sm:px-3 ${favoriteScope !== "all" ? "border-[var(--customer-control)] bg-[var(--customer-control)] text-white" : "border-[var(--customer-divider)] bg-white text-[var(--customer-control)]"}`} aria-label={`${scopeLabel} ${favoriteScope === "all" ? favoriteCount : scopedIds.size}`} aria-pressed={favoriteScope !== "all"} onClick={() => setFavoriteScope(favoriteScope === "all" ? "mine" : "all")}><Heart size={16} fill={favoriteScope !== "all" ? "currentColor" : "none"} aria-hidden="true" /><span className="sm:hidden">찜</span><span className="hidden sm:inline">{scopeLabel}</span><span className="text-xs">{favoriteScope === "all" ? favoriteCount : scopedIds.size}</span></button>
        <button type="button" aria-pressed={similarEnabled} onClick={() => { const next = new URLSearchParams(params.toString()); next.set("similar", similarEnabled ? "0" : "1"); router.replace(`/customer-select/select?${next}`, { scroll: false }); }} className={`hidden min-h-11 items-center gap-1 rounded-lg border px-3 text-sm font-semibold sm:inline-flex ${similarEnabled ? "border-[var(--customer-control)] bg-[var(--select-surface)]" : "border-[var(--customer-divider)]"}`}><Layers3 size={16} aria-hidden="true" />유사컷</button>
        <button type="button" aria-label={`사진 크기 변경 · 현재 ${mobileColumns}열`} title={`현재 ${mobileColumns}열`} onClick={() => setMobileColumns(current => current === 4 ? 2 : (current + 1) as 2 | 3 | 4)} className="ml-auto grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--customer-divider)] md:hidden"><Grid2X2 size={18} aria-hidden="true" /></button>
        <details className="relative md:ml-auto">
          <summary className="cs-filter-trigger"><SlidersHorizontal size={16} aria-hidden="true" /><span>필터</span>{filterCount > 0 && <span className="cs-filter-count" aria-label={`적용된 필터 ${filterCount}개`}>{filterCount}</span>}</summary>
          <div className="absolute right-0 top-12 z-40 grid w-72 gap-3 rounded-xl border border-[var(--customer-divider)] bg-white p-4 shadow-lg">
            <label className="text-xs">인물<select value={person} onChange={e => setPerson(e.target.value)} className={button + " mt-1 w-full bg-white"}><option value="">전체 인물</option>{template.people.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-xs">구도<select value={composition} onChange={e => setComposition(e.target.value)} className={button + " mt-1 w-full bg-white"}>{["", "전신", "클로즈업", "가로"].map(value => <option key={value} value={value}>{value || "전체 구도"}</option>)}</select></label>
            {!sample && <p className="text-xs leading-5 text-[var(--select-muted)]">실제 사진의 자동 태그는 미연결입니다. 상세보기에서 직접 지정한 인물·구도·종류로 찾을 수 있어요.</p>}
            <label className="text-xs">사진 종류<select aria-label="사진 종류" value={category} onChange={e => setCategory(e.target.value)} className={button + " mt-1 w-full bg-white"}><option value="">전체 종류</option>{template.categories.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <input aria-label="원본 파일명 검색" placeholder="원본 파일명 검색" value={search} onChange={e => setSearch(e.target.value)} className={button} />
            <button onClick={clearFilters} disabled={!filterCount} className={button}>필터 초기화</button>
          </div>
        </details>
      </div>
      <div className="flex min-h-11 items-center justify-between gap-2 border-b border-[var(--select-line)] text-xs">
        <span className="truncate text-[var(--select-muted)]">{guests.length > 0 && <strong className="mr-1 text-[var(--customer-control)]">현재: {activeActor === "owner" ? "나" : guests.find(guest => guest.id === activeActor)?.name}</strong>}{sample ? "검수용 샘플 · 장면과 유사컷은 예시" : "촬영 순서 기준 임시 구간 · 분석은 아직 연결되지 않았어요"}</span>
        <button type="button" aria-pressed={similarEnabled} onClick={() => { const next = new URLSearchParams(params.toString()); next.set("similar", similarEnabled ? "0" : "1"); router.replace(`/customer-select/select?${next}`, { scroll: false }); }} className="shrink-0 font-semibold sm:hidden">{similarEnabled ? "유사컷 묶음" : "유사컷 묶기"}</button>
      </div>
      </div>
      <p className="my-2 text-[12px] leading-4 text-[var(--select-muted)]">이 화면은 프론트 시안입니다. 새로고침하면 선택이 초기화돼요.</p>
      <div ref={grid} aria-label="현재 장면 사진" className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {layout.width > 0 && virtualizer.getVirtualItems().map(row => <div key={row.key} ref={virtualizer.measureElement} data-index={row.index} data-photo-row className="absolute left-0 top-0 w-full pb-2" style={{ transform: `translateY(${row.start - layout.margin}px)` }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0,1fr))` }}>
            {rows[row.index].map(unit => {
              const cover = unit.photos[0];
              const selected = unit.photos.filter(photo => finalIds.has(photo.id)).length;
              const liked = unit.photos.filter(photo => favorites[activeActor]?.has(photo.id)).length;
              const quickSelect = unit.photos.length === 1 && activeActor === "owner" && !closed && (!layout.mobile || layout.columns === 2);
              return <article key={unit.id} data-photo-card className="cs-photo-card min-w-0">
                <div className={`cs-photo-card group relative overflow-hidden rounded border border-[#e4e5e5] ${unit.photos.length === 1 && selected ? "ring-2 ring-inset ring-[var(--accent)]" : ""}`}>
                  <button onClick={() => setComparison({ units: filtered, index: filtered.findIndex(item => item.id === unit.id) })} aria-label={`${cover.filename} ${unit.photos.length > 1 ? unit.photos.length + "장 유사컷 보기" : "크게 보기"}`} className="relative block aspect-square w-full bg-[var(--select-surface)]">
                    <Image src={cover.src} alt={cover.filename} fill sizes="(max-width: 639px) 50vw, 160px" className="object-cover" />
                    {unit.photos.length > 1 && <span aria-label={`유사컷 ${unit.photos.length}장`} className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--customer-control)]/85 px-2 py-1 text-[12px] font-semibold text-white"><Layers3 size={13} aria-hidden="true" />{unit.photos.length}</span>}
                    {(liked > 0 || guests.some(guest => unit.photos.some(photo => favorites[guest.id]?.has(photo.id)))) && <span className="absolute bottom-1 left-1 flex max-w-[70%] items-center gap-0.5 rounded bg-white/90 px-1 text-[var(--customer-control)]"><Heart size={13} fill="currentColor" aria-hidden="true" />{unit.photos.length > 1 && liked > 0 && <span className="text-[10px]">{liked}</span>}{guests.filter(guest => unit.photos.some(photo => favorites[guest.id]?.has(photo.id))).map(guest => <span key={guest.id} title={`${guest.name} 찜`} className="ml-0.5 text-[10px] font-semibold">{guest.name.slice(0, 1)}</span>)}</span>}
                    <span className="absolute bottom-1 right-1 flex items-center gap-1">{qualityEnabled && unit.photos.some(photo => photo.quality) && <span aria-label={unit.photos.filter(photo => photo.quality).map(photo => photo.quality).join(" · ")} title={unit.photos.filter(photo => photo.quality).map(photo => photo.quality).join(" · ")} className="rounded bg-white/95 p-1 text-[#886341]"><TriangleAlert size={13} aria-hidden="true" /></span>}{unit.photos.some(photo => notes[photo.id]?.trim()) && <span aria-label="요청 사항 있음" className="rounded bg-white/95 p-1"><MessageCircle size={13} aria-hidden="true" /></span>}</span>
                  </button>
                  {quickSelect ? <button type="button" onClick={() => toggleFinal(cover.id)} aria-label={cover.filename + " 최종 선택"} aria-pressed={Boolean(selected)} className={`absolute right-1 top-1 z-10 grid h-11 w-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${selected ? "opacity-100" : layout.mobile ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}><span className={`grid h-7 w-7 place-items-center rounded-full border-2 shadow-sm ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-white bg-white/95 text-transparent"}`}><Check size={16} aria-hidden="true" className={selected ? "opacity-100" : "opacity-0"} /></span></button> : selected > 0 && <span aria-label={unit.photos.length > 1 ? `유사컷 ${selected}장 최종 선택됨` : "최종 선택됨"} className="absolute right-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-[var(--accent)] text-white"><Check size={15} aria-hidden="true" /></span>}
                </div>
                {selected > 0 && <div data-photo-status className="truncate text-[11px] text-[var(--select-accent-ink)]">{unit.photos.length > 1 ? `${unit.photos.length}장 중 ${selected}장 선택` : "최종 선택됨"}</div>}
              </article>;
            })}
          </div>
        </div>)}
      </div>
      {!filtered.length && <div className="py-20 text-center text-sm text-[var(--select-muted)]">{favoriteScope !== "all" && !filterCount ? "이 장면에서 조건에 맞는 찜이 없어요." : "표시할 사진이 없어요."}<br /><button onClick={() => { clearFilters(); setFavoriteScope("all"); setSelectionScope("all"); }} className={button + " mt-4"}>전체 사진 보기</button></div>}
    </main>
    </div>
    <footer aria-label="선택 진행 상태" className="cs-actionbar fixed inset-x-0 bottom-0 z-30 border-t border-[var(--customer-divider)] bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
        <div className="min-w-0 flex-1"><p className="text-xs font-semibold">{scenesEnabled ? `이 장면 ${count}장${sceneTargets ? ` · 추천 ${sceneTargets[sceneIndex]}장` : ""}  ·  ` : ""}전체 {finalIds.size}{targetCount !== null && ` / ${targetCount}`}장</p>{targetCount !== null && targetCount > 0 && <div role="progressbar" aria-label="전체 선택 진행" aria-valuenow={Math.min(finalIds.size, targetCount)} aria-valuemin={0} aria-valuemax={targetCount} className="mt-2 h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-[var(--select-line)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${Math.min(100, finalIds.size / targetCount * 100)}%` }} /></div>}<div className="mt-1 flex gap-3 text-[12px]"><button onClick={() => setCollaborationOpen(true)} className="inline-flex items-center gap-1 underline"><UsersRound size={13} aria-hidden="true" />함께 고르기{guests.length > 0 && ` ${guests.length + 1}명`}</button></div></div>
        <button className="cs-primary cs-compact shrink-0 whitespace-nowrap" onClick={() => {
          if (!scenesEnabled || nextSceneIndex < 0) { router.push(`/customer-select/review?${params}`); return; }
          if (window.confirm(`${scene.name} · ${count}장 선택\n‘${SELECT_SCENES[nextSceneIndex].name}’으로 이동할까요?\n선택은 나중에 바꿀 수 있어요.`)) moveScene(nextSceneIndex);
        }}>{scenesEnabled && nextSceneIndex >= 0 ? <>다음: {SELECT_SCENES[nextSceneIndex].shortName}</> : "최종 검토"} <ChevronRight size={16} className="inline" /></button>
      </div>
    </footer>
    {scenePicker && <dialog ref={sceneDialog} onCancel={() => setScenePicker(false)} aria-labelledby="scene-picker-title" className="cs-actionbar fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--customer-control)] backdrop:bg-black/40 sm:inset-0 sm:m-auto sm:max-w-md sm:rounded-2xl">
      <div className="mb-2 flex items-center justify-between"><h2 id="scene-picker-title" className="font-semibold">전체 장면 {SELECT_SCENES.length}개</h2><button autoFocus className={button} onClick={() => setScenePicker(false)} aria-label="장면 목록 닫기"><X size={18} /></button></div>
      <p className="mb-3 text-xs text-[var(--select-muted)]">원하는 장면부터 골라도 돼요.</p>
      <nav className="space-y-2">{sceneLinks()}</nav>
      {activeActor === "owner" && <button type="button" onClick={() => toggleReviewedScene(sceneIndex)} className={button + " mt-4 w-full"}>{reviewedScenes.has(sceneIndex) ? "이 장면 검토 완료 취소" : "이 장면 검토 완료 표시"}</button>}
    </dialog>}
    {collaborationOpen && <dialog ref={collaborationDialog} onCancel={() => setCollaborationOpen(false)} aria-labelledby="collaboration-title" className="cs-actionbar fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-[var(--customer-control)] backdrop:bg-black/40 sm:inset-0 sm:m-auto sm:max-w-md sm:rounded-2xl">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 id="collaboration-title" className="text-base font-semibold">함께 고르기</h2><button autoFocus className={button} onClick={() => setCollaborationOpen(false)} aria-label="함께 고르기 닫기"><X size={18} /></button></div>
      <p className="text-xs leading-5 text-[var(--select-muted)]">같은 사진을 보며 각자 찜하고, 소유주가 최종 선택해요. 초대 링크·공유 저장은 아직 연결되지 않은 시안입니다.</p>
      <section className="mt-5" aria-label="참여자"><h3 className="text-sm font-semibold">함께 고르는 사람</h3>
        <div className="mt-2 flex flex-wrap gap-2"><button className={button + (activeActor === "owner" ? " border-[var(--customer-control)] bg-[var(--select-surface)]" : "")} aria-pressed={activeActor === "owner"} onClick={() => { setActiveActor("owner"); chooseScope("all"); }}>나 · 소유주</button>{guests.map(guest => <button key={guest.id} disabled={guest.blocked} className={button + (activeActor === guest.id ? " border-[var(--customer-control)] bg-[var(--select-surface)]" : "")} aria-pressed={activeActor === guest.id} onClick={() => { setActiveActor(guest.id); chooseScope("all"); }}>{guest.name} · {guest.done ? "찜 완료" : "고르는 중"}</button>)}</div>
        {activeActor === "owner" && <form className="mt-3 flex gap-2" onSubmit={invite}><input aria-label="참여자 이름" required maxLength={20} disabled={closed} value={guestName} onChange={event => setGuestName(event.target.value)} placeholder="함께 고를 사람 이름" className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--customer-divider)] px-3" /><button className={button} disabled={closed || guests.length >= 5}>참여자 추가</button></form>}
        {activeActor !== "owner" && !closed && <button className={button + " mt-3"} onClick={() => setGuestDone(activeActor, !guests.find(guest => guest.id === activeActor)?.done)}>{guests.find(guest => guest.id === activeActor)?.done ? "찜 완료 취소" : "내 찜 완료 표시"}</button>}
      </section>
      {guests.length > 0 && <section className="mt-5 border-t border-[var(--select-line)] pt-4" aria-label="함께 찜한 사진 보기"><h3 className="text-sm font-semibold">사진 모아보기</h3><div className="mt-2 flex flex-wrap gap-2"><button className={button} onClick={() => chooseScope("common")}>공통 찜</button><button className={button} onClick={() => chooseScope("different")}>의견 차이</button>{guests.map(guest => <button key={guest.id} className={button} onClick={() => chooseScope("person", guest.id)}>{guest.name}의 찜</button>)}</div></section>}
      {activeActor === "owner" && guests.length > 0 && <details className="mt-5 border-t border-[var(--select-line)] pt-3 text-xs"><summary className="min-h-11 cursor-pointer font-semibold">참여자·마감 관리</summary><div className="mt-2 flex flex-wrap gap-2">{guests.map(guest => <button key={guest.id} className={button} onClick={() => toggleGuestAccess(guest.id)}>{guest.name} {guest.blocked ? "접근 다시 열기" : "접근 차단"}</button>)}<button className={button} onClick={() => setClosed(!closed)}>{closed ? "셀렉 다시 열기" : "셀렉 마감하기"}</button></div></details>}
      {closed && <p className="mt-3 text-xs text-[var(--select-accent-ink)]">셀렉이 마감되어 읽기 전용이에요.</p>}
    </dialog>}
    {comparison && <PhotoComparison units={comparison.units} initialIndex={comparison.index} onClose={() => setComparison(null)} qualityAnalyzed={qualityEnabled} scenes={scenesEnabled ? SELECT_SCENES.map(item => item.name) : []} categories={template.categories} people={template.people} sceneByPhotoId={catalogSceneByPhotoId} />}
  </CustomerEntryShell>;
}

export default function CustomerSelectScenePage() {
  return <Suspense><SelectContent /></Suspense>;
}
