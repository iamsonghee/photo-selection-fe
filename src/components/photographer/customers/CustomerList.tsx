"use client";

import { Search, UserRound } from "lucide-react";
import { formatPhone } from "@/lib/phone";
import { PhotographerLightButton } from "@/components/photographer/PhotographerLightButton";

import type { CustomerSummary } from "@/lib/photographer-customers";
export type { CustomerSummary } from "@/lib/photographer-customers";

export type CustomerFilter = "all" | "new" | "returning";

export function CustomerList({ customers, selectedId, search, filter, counts, loading, error, onSearch, onFilter, onSelect, onRetry, onCreateProject }: {
  customers: CustomerSummary[];
  selectedId: string | null;
  search: string;
  filter: CustomerFilter;
  counts: Record<CustomerFilter, number>;
  loading: boolean;
  error: string | null;
  onSearch: (value: string) => void;
  onFilter: (value: CustomerFilter) => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
  onCreateProject: () => void;
}) {
  return (
    <section aria-label="고객 목록" className="min-w-0 overflow-hidden rounded-xl border border-border-subtle bg-surface">
      <div className="border-b border-border-subtle p-4">
        <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border-subtle px-3 focus-within:border-accent">
          <Search size={17} className="shrink-0 text-muted-foreground" aria-hidden />
          <input aria-label="고객 이름 또는 전화번호 검색" type="search" maxLength={100} value={search} onChange={event => onSearch(event.target.value)} placeholder="이름 또는 전화번호 검색" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none" />
        </label>
        <div role="group" aria-label="고객 구분" className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-surface-raised p-1">
          {(["all", "new", "returning"] as const).map(value => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => onFilter(value)} className={`min-h-11 rounded-md px-2 text-xs font-semibold ${filter === value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground"}`}>
              {{ all: "전체", new: "신규", returning: "재방문" }[value]} <span>{counts[value]}</span>
            </button>
          ))}
        </div>
      </div>
      {loading ? <p role="status" className="p-8 text-center text-sm text-muted-foreground">고객을 불러오는 중이에요.</p>
        : error ? <div className="space-y-3 p-6 text-center"><p role="alert" className="text-sm text-danger">{error}</p><PhotographerLightButton variant="outline" onClick={onRetry}>다시 시도</PhotographerLightButton></div>
        : customers.length === 0 ? <div className="px-5 py-12 text-center">
          <UserRound size={28} className="mx-auto mb-3 text-subtle-foreground" aria-hidden />
          <p className="text-sm font-semibold">{search || filter !== "all" ? "조건에 맞는 고객이 없어요" : "아직 등록된 고객이 없어요"}</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{search || filter !== "all" ? "검색어나 고객 구분을 바꿔보세요." : "프로젝트를 만들면 고객 정보와 촬영 이력이 이곳에 모여요."}</p>
          {!search && filter === "all" && <PhotographerLightButton className="mt-5" onClick={onCreateProject}>새 프로젝트 만들기</PhotographerLightButton>}
        </div>
        : <ul className="divide-y divide-border-subtle md:max-h-[max(240px,calc(100dvh-320px))] md:overflow-y-auto">
          {customers.map(customer => <li key={customer.id}>
            <button type="button" aria-current={selectedId === customer.id ? "true" : undefined} onClick={() => onSelect(customer.id)} className={`w-full border-l-[3px] p-4 text-left transition-colors hover:bg-surface-raised ${selectedId === customer.id ? "border-l-accent bg-surface-raised" : "border-l-transparent"}`}>
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-words text-sm font-bold">{customer.name}</span>
                {customer.projectCount > 0 && <span className="shrink-0 rounded-full bg-surface-raised px-2 py-1 text-[11px] font-medium text-muted-foreground">{customer.projectCount > 1 ? "재방문" : "신규"}</span>}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{customer.phone ? formatPhone(customer.phone) : "연락처 미등록"}</span>
              <span className="mt-3 block text-xs text-muted-foreground">{customer.latestShootDate ? `최근 촬영 ${customer.latestShootDate.replaceAll("-", ".")}` : "촬영 이력 없음"}</span>
              <span className="mt-1 block text-xs">프로젝트 {customer.projectCount}건{customer.activeProjectCount > 0 ? ` · 진행 중 ${customer.activeProjectCount}건` : ""}</span>
            </button>
          </li>)}
        </ul>}
    </section>
  );
}
