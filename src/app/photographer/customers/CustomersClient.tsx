"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, Users, NotebookPen } from "lucide-react";
import { CustomerList, type CustomerFilter } from "@/components/photographer/customers/CustomerList";
import { CustomerProjectHistory } from "@/components/photographer/customers/CustomerProjectHistory";
import { PhotographerLightPageFrame, PhotographerLightPageHeader } from "@/components/layout/PhotographerLightPageHeader";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";
import { PhotographerModal } from "@/components/ui/PhotographerModal";
import { ProjectLimitModal } from "@/components/photographer/ProjectLimitModal";
import { useNewProjectGate } from "@/hooks/useNewProjectGate";
import { formatPhone, normalizePhone, isValidKoreanPhone } from "@/lib/phone";
import { CUSTOMER_NAME_MAX_LENGTH, CUSTOMER_NOTE_MAX_LENGTH, CUSTOMER_PAGE_SIZE } from "@/lib/photographer-customers";
import type { CustomerSummary, CustomerDetail, PhotographerCustomer } from "@/lib/photographer-customers";

import { useCustomerCache, CUSTOMER_CACHE_STALE_MS, CUSTOMER_CACHE_MAX_ENTRIES, type ListData } from "@/contexts/CustomerCacheContext";

const inputClass = "mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

export default function CustomersClient({ ownerId, initialData, fetchedAt }: { ownerId: string; initialData: ListData | null; fetchedAt: number }) {
  const cache = useCustomerCache(ownerId);
  return <CustomersContent key={ownerId} cache={cache} initialData={initialData} fetchedAt={fetchedAt} />;
}

function CustomersContent({ cache, initialData, fetchedAt }: { cache: ReturnType<typeof useCustomerCache>; initialData: ListData | null; fetchedAt: number }) {
  const params = useSearchParams();
  const requestedId = params.get("customerId");
  const { handleNewProject, handleNewProjectForCustomer, limitInfo, closeLimitModal } = useNewProjectGate();
  const listCache = useMemo(() => ({ current: cache.lists }), [cache]);
  const detailCache = useMemo(() => ({ current: cache.details }), [cache]);
  const [initial] = useState(() => {
    const key = JSON.stringify(["", "all", 1]);
    const existing = cache.lists.get(key);
    if (initialData && (!existing || fetchedAt > existing.fetchedAt)) {
      cache.lists.set(key, { data: initialData, fetchedAt, revision: 0 });
    }
    return cache.lists.get(key)?.data ?? null;
  });
  const previousSearch = useRef("");
  const lastFocusRefresh = useRef(0);
  const [customers, setCustomers] = useState<CustomerSummary[]>(initial?.customers ?? []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CustomerFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [counts, setCounts] = useState(initial?.counts ?? { all: 0, new: 0, returning: 0 });
  const [loading, setLoading] = useState(!initial);
  const [listError, setListError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<"info" | "note" | null>(null);
  const [editCustomer, setEditCustomer] = useState<PhotographerCustomer | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const listKey = JSON.stringify([search.trim(), filter, page]);
  const selectedId = requestedId ?? customers[0]?.id ?? null;
  const selected = detail?.id === selectedId ? detail : null;

  useEffect(() => {
    const controller = new AbortController();
    const cached = listCache.current.get(listKey);
    const apply = (data: ListData) => { setCustomers(data.customers); setTotal(data.total); setCounts(data.counts); };
    const searchChanged = previousSearch.current !== search;
    previousSearch.current = search;
    setListError(null);
    if (cached) apply(cached.data);
    setLoading(!cached);
    if (cached && cached.revision === reload && Date.now() - cached.fetchedAt < CUSTOMER_CACHE_STALE_MS) return;
    const timer = window.setTimeout(async () => {
      try {
        const query = new URLSearchParams({ q: search, filter, page: String(page) });
        const response = await fetch(`/api/photographer/customers?${query}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "고객 목록을 불러오지 못했습니다.");
        if (controller.signal.aborted) return;
        if (page > 1 && !data.customers.length && data.total > 0) { setPage(1); return; }
        listCache.current.set(listKey, { data, fetchedAt: Date.now(), revision: reload });
        if (listCache.current.size > CUSTOMER_CACHE_MAX_ENTRIES) listCache.current.delete(listCache.current.keys().next().value!);
        apply(data);
      } catch (reason) {
        if (!controller.signal.aborted) {
          const message = reason instanceof Error ? reason.message : "고객 목록을 불러오지 못했습니다.";
          if (cached) setNotice("최신 고객 목록을 확인하지 못했어요. 잠시 후 다시 확인해 주세요.");
          else { setCustomers([]); setListError(message); }
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, searchChanged ? 250 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, filter, page, reload, listKey, listCache]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(""); setDetailLoading(false); return; }
    const controller = new AbortController();
    const cached = detailCache.current.get(selectedId);
    setDetailError("");
    setDetail(cached?.data ?? null);
    setDetailLoading(!cached);
    if (cached && cached.revision === reload && Date.now() - cached.fetchedAt < CUSTOMER_CACHE_STALE_MS) return;
    (async () => {
      let missing = false;
      try {
        const response = await fetch(`/api/photographer/customers/${selectedId}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        missing = response.status === 404 || response.status === 401;
        if (!response.ok) throw new Error(data.error ?? "고객 정보를 불러오지 못했습니다.");
        if (!controller.signal.aborted) {
          detailCache.current.set(selectedId, { data: data.customer, fetchedAt: Date.now(), revision: reload });
          if (detailCache.current.size > CUSTOMER_CACHE_MAX_ENTRIES) detailCache.current.delete(detailCache.current.keys().next().value!);
          setDetail(data.customer);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          if (cached && !missing) setNotice("최신 고객 정보를 확인하지 못했어요. 잠시 후 다시 확인해 주세요.");
          else { detailCache.current.delete(selectedId); setDetail(null); setDetailError(reason instanceof Error ? reason.message : "고객 정보를 불러오지 못했습니다."); }
        }
      } finally { if (!controller.signal.aborted) setDetailLoading(false); }
    })();
    return () => controller.abort();
  }, [selectedId, reload, detailCache]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible" || editing || saving) return;
      const now = Date.now();
      const list = listCache.current.get(listKey);
      const customer = selectedId ? detailCache.current.get(selectedId) : null;
      if (now - lastFocusRefresh.current >= CUSTOMER_CACHE_STALE_MS &&
        ((list && now - list.fetchedAt >= CUSTOMER_CACHE_STALE_MS) ||
        (customer && now - customer.fetchedAt >= CUSTOMER_CACHE_STALE_MS))) {
        lastFocusRefresh.current = now;
        setReload(value => value + 1);
      }
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [editing, saving, listKey, selectedId, listCache, detailCache]);

  function resetSelection() { if (requestedId) window.history.replaceState(null, "", "/photographer/customers"); setNotice(""); }
  function edit(mode: "info" | "note") {
    if (!selected) return;
    setEditCustomer(selected); setDraftName(selected.name); setDraftPhone(selected.phone ? formatPhone(selected.phone) : "");
    setDraftNote(selected.note); setError(""); setEditing(mode);
  }
  async function save() {
    if (!editCustomer || saving) return;
    if (editing === "info" && (!draftName.trim() || (draftPhone.trim() && !isValidKoreanPhone(draftPhone)))) {
      setError(!draftName.trim() ? "고객 이름을 입력해 주세요." : "연락처는 010-0000-0000 형식으로 입력해 주세요."); return;
    }
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/photographer/customers/${editCustomer.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updatedAt: editCustomer.updatedAt, ...(editing === "info" ? { name: draftName.trim(), phone: normalizePhone(draftPhone) || null } : { note: draftNote }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "고객 정보를 저장하지 못했습니다.");
      const currentList = listCache.current.get(listKey);
      listCache.current.clear();
      if (currentList) listCache.current.set(listKey, { ...currentList, data: { ...currentList.data,
        customers: currentList.data.customers.map(customer => customer.id === editCustomer.id ? { ...customer, name: data.customer.name, phone: data.customer.phone } : customer),
      } });
      const cached = detailCache.current.get(editCustomer.id);
      if (cached) detailCache.current.set(editCustomer.id, { ...cached, data: { ...cached.data, ...data.customer }, fetchedAt: Date.now() });
      setDetail(current => current?.id === editCustomer.id ? { ...current, ...data.customer } : current);
      setCustomers(current => current.map(customer => customer.id === editCustomer.id ? { ...customer, name: data.customer.name, phone: data.customer.phone } : customer));
      setEditing(null); setNotice("고객 정보를 저장했어요."); setReload(value => value + 1);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "저장에 실패했습니다. 다시 시도해 주세요."); }
    finally { setSaving(false); }
  }
  async function createProject(customerId?: string) {
    if (creating) return;
    setCreating(true);
    try { if (customerId) await handleNewProjectForCustomer(customerId); else await handleNewProject(); }
    finally { setCreating(false); }
  }

  return <PhotographerLightPageFrame className="mx-auto max-w-[1504px] pb-10">
    <PhotographerLightPageHeader title="고객관리" description="고객 정보와 지난 촬영을 한곳에서 확인하세요." />
    {notice && <div role="status" className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-surface-raised px-4 py-2 text-xs"><span>{notice}</span><button className="min-h-11 shrink-0" onClick={() => setNotice("")}>닫기</button></div>}
    <div className="mt-6 grid items-start gap-5 md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] lg:gap-6">
      <div className={requestedId ? "hidden md:block" : ""}>
        <CustomerList customers={customers} selectedId={selectedId} search={search} filter={filter} counts={counts} loading={loading} error={listError}
          onSearch={value => { setSearch(value); setPage(1); resetSelection(); }} onFilter={value => { setFilter(value); setPage(1); resetSelection(); }}
          onSelect={id => { window.history.pushState(null, "", `/photographer/customers?customerId=${id}`); setNotice(""); }}
          onRetry={() => setReload(value => value + 1)} onCreateProject={() => void createProject()} />
        {!loading && !listError && total > CUSTOMER_PAGE_SIZE && <nav aria-label="고객 목록 페이지" className="mt-3 flex items-center justify-between gap-2 text-xs">
          <PhotographerLightButton variant="outline" disabled={page === 1} onClick={() => { setPage(page - 1); resetSelection(); }}>이전</PhotographerLightButton>
          <span>{page} / {Math.ceil(total / CUSTOMER_PAGE_SIZE)}</span>
          <PhotographerLightButton variant="outline" disabled={page * CUSTOMER_PAGE_SIZE >= total} onClick={() => { setPage(page + 1); resetSelection(); }}>다음</PhotographerLightButton>
        </nav>}
      </div>
      <div className={`${requestedId ? "block" : "hidden md:block"} min-w-0`}>
        {requestedId && <button type="button" className="mb-3 flex min-h-11 items-center gap-2 text-sm md:hidden" onClick={() => window.history.pushState(null, "", "/photographer/customers")}><ArrowLeft size={16} />고객 목록</button>}
        {detailLoading ? <div role="status" aria-label="고객 정보를 불러오는 중" aria-busy="true" className="space-y-4 rounded-xl border border-border-subtle bg-surface p-8"><span className="block h-7 w-44 rounded-md skeleton-block" /><span className="block h-4 w-64 max-w-full rounded-md skeleton-block" /><span className="block h-32 rounded-md skeleton-block" /></div>
          : detailError ? <div className="space-y-4 rounded-xl border border-border-subtle bg-surface p-6"><p role="alert" className="text-sm text-danger">{detailError}</p><PhotographerLightButton variant="outline" onClick={() => setReload(value => value + 1)}>다시 시도</PhotographerLightButton></div>
          : selected ? <article aria-label="고객 상세" className="rounded-xl border border-border-subtle bg-surface p-5 md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="break-words text-2xl font-bold tracking-tight">{selected.name}</h2><p className="mt-2 text-sm text-muted-foreground">{selected.phone ? formatPhone(selected.phone) : "연락처 미등록"}</p></div>
            <PhotographerLightButton variant="outline" onClick={() => edit("info")}>정보 수정</PhotographerLightButton>
          </div>
          <div className="my-5 flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-muted-foreground">프로젝트 {selected.projects.length}건 · 진행 중 {selected.projects.filter(project => project.status !== "delivered").length}건</p><PhotographerLightButton className="w-full sm:w-auto" pending={creating} pendingLabel="확인 중..." onClick={() => void createProject(selected.id)}><Plus size={16} />새 프로젝트 만들기</PhotographerLightButton></div>
          <section className="mb-7 rounded-lg bg-surface-raised p-4" aria-label="고객 메모"><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-sm font-semibold"><NotebookPen size={16} />고객 메모</h3><button className="min-h-11 px-2 text-xs font-semibold" onClick={() => edit("note")}>{selected.note ? "수정" : "메모 추가"}</button></div><p className={`whitespace-pre-wrap break-words text-sm leading-6 ${selected.note ? "" : "text-muted-foreground"}`}>{selected.note || "선호하는 분위기나 다음 촬영에 참고할 내용을 남겨보세요."}</p></section>
          <CustomerProjectHistory key={selected.id} projects={selected.projects} />
        </article> : <div className="grid min-h-80 place-items-center rounded-xl border border-dashed border-border-subtle p-8 text-center text-sm text-muted-foreground"><div><Users size={32} className="mx-auto mb-3" aria-hidden />고객을 선택하면 촬영 이력을 볼 수 있어요.</div></div>}
      </div>
    </div>
    <PhotographerModal open={editing !== null} onClose={() => { if (!saving) setEditing(null); }} closeDisabled={saving} title={editing === "info" ? "고객 정보 수정" : "고객 메모"} description={editing === "info" ? "변경한 정보는 이후 새 프로젝트에 사용돼요. 기존 촬영 기록은 유지됩니다." : "여러 촬영에 걸쳐 참고할 내용을 남겨주세요. 개별 촬영의 메모는 프로젝트에서 관리해요."} footer={<><PhotographerLightButton variant="outline" disabled={saving} onClick={() => setEditing(null)}>취소</PhotographerLightButton><PhotographerLightButton pending={saving} pendingLabel="저장 중..." onClick={() => void save()}>저장</PhotographerLightButton></>}>
      {editing === "info" ? <div className="space-y-4"><label className="block text-sm font-medium">고객 이름<input className={inputClass} disabled={saving} value={draftName} maxLength={CUSTOMER_NAME_MAX_LENGTH} onChange={event => setDraftName(event.target.value)} /></label><label className="block text-sm font-medium">연락처<input type="tel" className={inputClass} disabled={saving} value={draftPhone} onChange={event => setDraftPhone(event.target.value)} placeholder="010-0000-0000" /></label></div> : <label className="block text-sm font-medium">다음 촬영에 참고할 내용<textarea rows={6} className={inputClass} disabled={saving} value={draftNote} maxLength={CUSTOMER_NOTE_MAX_LENGTH} onChange={event => setDraftNote(event.target.value)} /><span className="mt-1 block text-right text-xs text-muted-foreground">{draftNote.length} / {CUSTOMER_NOTE_MAX_LENGTH}</span></label>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </PhotographerModal>
    <ProjectLimitModal info={limitInfo} onClose={closeLimitModal} />
  </PhotographerLightPageFrame>;
}
