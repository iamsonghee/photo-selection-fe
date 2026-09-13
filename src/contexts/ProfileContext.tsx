"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PhotographerProfile } from "@/app/api/photographer/profile/route";

interface ProfileContextValue {
  profile: PhotographerProfile | null;
  loading: boolean;
  updateProfile: (patch: Partial<PhotographerProfile>) => void;
  refetch: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<PhotographerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      // 로그인 세션이 없으면 /api/photographer/profile을 호출하지 않는다 — 호출해도
      // 401만 돌아오고, 미로그인 상태에서 매번 콘솔에 실패한 네트워크 요청으로 남는다.
      // getSession()은 로컬 쿠키/스토리지만 읽으므로 우리 서버로의 왕복이 없다.
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch("/api/photographer/profile");
      if (!res.ok) return;
      const data: PhotographerProfile = await res.json();
      setProfile(data);
    } catch {}
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

  const updateProfile = useCallback((patch: Partial<PhotographerProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <ProfileContext.Provider value={{ profile, loading, updateProfile, refetch }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
