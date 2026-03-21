"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
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
      const res = await fetch("/api/photographer/profile");
      if (!res.ok) return;
      const data: PhotographerProfile = await res.json();
      setProfile(data);
    } catch {}
  }, []);

  useEffect(() => {
    refetch().finally(() => setLoading(false));
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
