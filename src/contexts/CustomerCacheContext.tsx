"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CustomerSummary, CustomerDetail } from "@/lib/photographer-customers";

export const CUSTOMER_CACHE_STALE_MS = 60_000;
export const CUSTOMER_CACHE_MAX_ENTRIES = 50;
export type ListData = { customers: CustomerSummary[]; total: number; counts: { all: number; new: number; returning: number } };
type Cached<T> = { data: T; fetchedAt: number; revision: number };
type CustomerCache = { ownerId: string; lists: Map<string, Cached<ListData>>; details: Map<string, Cached<CustomerDetail>> };
const CacheContext = createContext<Map<string, CustomerCache> | null>(null);
const emptyCache = (ownerId: string): CustomerCache => ({ ownerId, lists: new Map(), details: new Map() });

export function CustomerCacheProvider({ children }: { children: React.ReactNode }) {
  const [caches] = useState(() => new Map<string, CustomerCache>());
  const [accountChanged, setAccountChanged] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    let authId: string | null | undefined;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextId = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || (authId !== undefined && authId !== nextId)) {
        caches.clear();
        setAccountChanged(true);
        // A different account must obtain a new authenticated server payload.
        window.location.replace(nextId ? window.location.href : "/");
      }
      authId = nextId;
    });
    return () => subscription.unsubscribe();
  }, [caches]);
  return <CacheContext.Provider value={caches}>{accountChanged ? null : children}</CacheContext.Provider>;
}

export function useCustomerCache(ownerId: string) {
  "use no memo"; // Mutable cache reads must run on each mount, not be compiler-memoized.
  const caches = useContext(CacheContext);
  if (!caches) throw new Error("CustomerCacheProvider is missing");
  let cache = caches.get(ownerId);
  if (!cache) {
    caches.clear();
    cache = emptyCache(ownerId);
    caches.set(ownerId, cache);
  }
  return cache;
}
