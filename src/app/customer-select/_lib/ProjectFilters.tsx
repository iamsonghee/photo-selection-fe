"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomerProjectFilter } from "./project-routing";

export function ProjectFilters({ query, status }: { query: string; status: CustomerProjectFilter }) {
  const router = useRouter();
  const [text, setText] = useState(query);
  const [selectedStatus, setSelectedStatus] = useState(status);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function search(nextText: string, nextStatus: CustomerProjectFilter, delay = 0) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (nextText.trim()) params.set("q", nextText.trim());
      if (nextStatus !== "all") params.set("status", nextStatus);
      router.replace(`/customer-select${params.size ? `?${params}` : ""}`, { scroll: false });
    }, delay);
  }

  return <form onSubmit={(event) => { event.preventDefault(); search(text, selectedStatus); }} className="mt-6 flex items-center gap-2 rounded-xl border border-border-subtle bg-surface p-2 sm:p-3">
    <label className="min-w-0 flex-1">
      <span className="sr-only">프로젝트 검색</span>
      <input value={text} onChange={(event) => { setText(event.target.value); search(event.target.value, selectedStatus, 300); }} placeholder="프로젝트명·업체·작가 검색" className="h-10 w-full rounded-lg border border-border-subtle bg-background px-3 text-sm outline-none focus:border-accent" />
    </label>
    <label className="shrink-0">
      <span className="sr-only">진행 상태</span>
      <select value={selectedStatus} onChange={(event) => { const next = event.target.value as CustomerProjectFilter; setSelectedStatus(next); search(text, next); }} className="h-10 rounded-lg border border-border-subtle bg-background pl-2.5 pr-1 text-sm outline-none focus:border-accent w-[96px] sm:w-32 sm:px-3">
        <option value="all">전체 상태</option>
        <option value="active">진행 중</option>
        <option value="done">보정 완료</option>
      </select>
    </label>
  </form>;
}
