"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useProfile } from "@/contexts/ProfileContext";
import type { PhotographerQuota } from "@/app/api/photographer/quota/route";

interface QuotaContextValue {
  quota: PhotographerQuota | null;
  loading: boolean;
  error: boolean;
  refetch: () => Promise<void>;
}

const QuotaContext = createContext<QuotaContextValue | null>(null);

export function QuotaProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: profileLoading } = useProfile();
  const [quota, setQuota] = useState<PhotographerQuota | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState(false);
  // 로그인 여부는 ProfileContext가 먼저 확인한다 — 미로그인으로 확정되면 quota API를
  // 호출조차 하지 않으므로(불필요한 401 방지) 이 경우 loading은 즉시 false로 계산된다.
  const loading = profileLoading || (!!profile?.id && fetchLoading);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/photographer/quota");
      if (!res.ok) {
        setError(true);
        return;
      }
      const data: PhotographerQuota = await res.json();
      setQuota(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (profileLoading || !profile?.id) return;
    let ignore = false;
    async function load() {
      await refetch();
      if (!ignore) setFetchLoading(false);
    }
    load();
    return () => {
      ignore = true;
    };
  }, [refetch, profileLoading, profile?.id]);

  return (
    <QuotaContext.Provider value={{ quota, loading, error, refetch }}>
      {children}
    </QuotaContext.Provider>
  );
}

export function useQuota() {
  const ctx = useContext(QuotaContext);
  if (!ctx) throw new Error("useQuota must be used within QuotaProvider");
  return ctx;
}
