import type { PhotoState } from "@/contexts/SelectionContext";

const KEY_PREFIX = "confirmed-";

export type ConfirmedPayload = {
  selectedIds: string[];
  photoStates: Record<string, PhotoState>;
};

export function getConfirmedKey(token: string): string {
  return `${KEY_PREFIX}${token}`;
}

export function saveConfirmedData(token: string, selectedIds: Set<string>, photoStates: Record<string, PhotoState>): void {
  if (typeof window === "undefined") return;
  const payload: ConfirmedPayload = {
    selectedIds: Array.from(selectedIds),
    photoStates,
  };
  window.localStorage.setItem(getConfirmedKey(token), JSON.stringify(payload));
}

export function loadConfirmedData(token: string): ConfirmedPayload | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(getConfirmedKey(token));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as ConfirmedPayload;
    if (!data || !Array.isArray(data.selectedIds) || typeof data.photoStates !== "object") return null;
    return data;
  } catch {
    return null;
  }
}
