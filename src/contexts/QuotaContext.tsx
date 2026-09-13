"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { PhotographerQuota } from "@/app/api/photographer/quota/route";

interface QuotaContextValue {
  quota: PhotographerQuota | null;
  loading: boolean;
  error: boolean;
  refetch: () => Promise<void>;
}

const QuotaContext = createContext<QuotaContextValue | null>(null);

export function QuotaProvider({ children }: { children: React.ReactNode }) {
  const [quota, setQuota] = useState<PhotographerQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
    let ignore = false;
    async function load() {
      await refetch();
      if (!ignore) setLoading(false);
    }
    load();
    return () => {
      ignore = true;
    };
  }, [refetch]);

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
