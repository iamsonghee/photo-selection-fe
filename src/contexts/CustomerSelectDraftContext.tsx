"use client";

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { CatalogPhoto } from "@/lib/customer-select-catalog";

export type ShootType = "ceremony" | "wedding" | "first_birthday" | "family" | "couple" | "other";
export type UploadDraftFile = { id: string; name: string; url?: string; file?: File; relativePath?: string; capturedAt?: number };
export type Guest = { id: string; name: string; color: string; done: boolean; blocked: boolean };
export type DeliveryDraft = { version: number; createdAt: string; photoIds: string[]; photos: CatalogPhoto[]; notes: Record<string, string>; projectName: string; targetCount: number | null };

type DraftContextValue = {
  finalIds: Set<string>;
  toggleFinal: (id: string) => void;
  setFinalMany: (ids: readonly string[], selected: boolean) => void;
  favorites: Record<string, Set<string>>;
  toggleFavorite: (id: string) => void;
  guests: Guest[];
  addGuest: (name: string) => void;
  toggleGuestAccess: (id: string) => void;
  activeActor: string;
  setActiveActor: (id: string) => void;
  setGuestDone: (id: string, done: boolean) => void;
  closed: boolean;
  setClosed: (closed: boolean) => void;
  notes: Record<string, string>;
  setNote: (id: string, text: string) => void;
  opinions: Record<string, Record<string, string>>;
  setOpinion: (id: string, text: string) => void;
  projectName: string;
  shootType: ShootType;
  targetCount: number | null;
  setProject: (name: string, type: ShootType, target: number | null) => void;
  deliveries: DeliveryDraft[];
  createDelivery: (photos: CatalogPhoto[]) => number;
  excludedScenes: Set<number>;
  setExcludedScenes: Dispatch<SetStateAction<Set<number>>>;
  sceneTargets: Record<number, number>;
  setSceneTarget: (index: number, count: number) => void;
  sceneByPhotoId: Record<string, number>;
  setPhotoScene: (id: string, scene: number) => void;
  personByPhotoId: Record<string, string>;
  setPhotoPerson: (id: string, person: string) => void;
  compositionByPhotoId: Record<string, string>;
  setPhotoComposition: (id: string, composition: string) => void;
  categoryByPhotoId: Record<string, string[]>;
  setPhotoCategories: (id: string, categories: string[]) => void;
  reviewedScenes: Set<number>;
  toggleReviewedScene: (index: number) => void;
  analyses: Set<string>;
  setAnalyses: Dispatch<SetStateAction<Set<string>>>;
  uploadFiles: UploadDraftFile[];
  setUploadFiles: Dispatch<SetStateAction<UploadDraftFile[]>>;
  prunePhotos: (ids: readonly string[]) => void;
};
const DraftContext = createContext<DraftContextValue | null>(null);

export function CustomerSelectDraftProvider({ children }: { children: ReactNode }) {
  const [finalIds, setFinalIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Record<string, Set<string>>>({ owner: new Set() });
  const [guests, setGuests] = useState<Guest[]>([]);
  const [activeActor, setActiveActor] = useState("owner");
  const [closed, setClosed] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [opinions, setOpinions] = useState<Record<string, Record<string, string>>>({});
  const [projectName, setProjectName] = useState("본식 사진 셀렉");
  const [shootType, setShootType] = useState<ShootType>("ceremony");
  const [targetCount, setTargetCount] = useState<number | null>(60);
  const [deliveries, setDeliveries] = useState<DeliveryDraft[]>([]);
  const [excludedScenes, setExcludedScenes] = useState<Set<number>>(new Set());
  const [sceneTargets, setSceneTargets] = useState<Record<number, number>>({});
  const [sceneByPhotoId, setSceneByPhotoId] = useState<Record<string, number>>({});
  const [personByPhotoId, setPersonByPhotoId] = useState<Record<string, string>>({});
  const [compositionByPhotoId, setCompositionByPhotoId] = useState<Record<string, string>>({});
  const [categoryByPhotoId, setCategoryByPhotoId] = useState<Record<string, string[]>>({});
  const [reviewedScenes, setReviewedScenes] = useState<Set<number>>(new Set());
  const [analyses, setAnalyses] = useState<Set<string>>(new Set(["similar"]));
  const [uploadFiles, setUploadFiles] = useState<UploadDraftFile[]>([]);

  function setProject(name: string, type: ShootType, target: number | null) {
    uploadFiles.forEach(item => { if (item.file && item.url) URL.revokeObjectURL(item.url); });
    setProjectName(name); setShootType(type); setTargetCount(target);
    setFinalIds(new Set()); setFavorites({ owner: new Set() }); setGuests([]); setActiveActor("owner");
    setClosed(false); setNotes({}); setOpinions({}); setDeliveries([]);
    setExcludedScenes(new Set()); setSceneTargets({}); setSceneByPhotoId({}); setPersonByPhotoId({}); setCompositionByPhotoId({}); setCategoryByPhotoId({}); setReviewedScenes(new Set());
    setAnalyses(new Set(["similar"])); setUploadFiles([]);
  }
  function setFinalMany(ids: readonly string[], selected: boolean) {
    if (activeActor !== "owner" || closed) return;
    setFinalIds(current => { const next = new Set(current); ids.forEach(id => selected ? next.add(id) : next.delete(id)); return next; });
  }
  function toggleFinal(id: string) { setFinalMany([id], !finalIds.has(id)); }
  function setFavoriteMany(ids: readonly string[], selected: boolean) {
    if (closed) return;
    setFavorites(current => {
      const next = new Set(current[activeActor] ?? []);
      ids.forEach(id => selected ? next.add(id) : next.delete(id));
      return { ...current, [activeActor]: next };
    });
  }
  function toggleFavorite(id: string) { setFavoriteMany([id], !(favorites[activeActor]?.has(id) ?? false)); }
  function addGuest(name: string) {
    const label = name.trim(); if (!label || guests.length >= 5) return;
    setGuests(current => [...current, { id: crypto.randomUUID(), name: label, color: ["#2563eb", "#9333ea", "#059669", "#db2777", "#a16207"][current.length], done: false, blocked: false }]);
  }
  function toggleGuestAccess(id: string) {
    if (activeActor !== "owner") return;
    setGuests(current => current.map(guest => guest.id === id ? { ...guest, blocked: !guest.blocked } : guest));
  }
  function createDelivery(photos: CatalogPhoto[]) {
    const version = deliveries.length + 1;
    setDeliveries(current => [...current, { version, createdAt: new Date().toISOString(), photoIds: [...finalIds], photos: photos.map(photo => ({ ...photo, categories: [...(photo.categories ?? [])] })), notes: { ...notes }, projectName, targetCount }]);
    return version;
  }
  function prunePhotos(ids: readonly string[]) {
    const removed = new Set(ids);
    setFinalIds(current => new Set([...current].filter(id => !removed.has(id))));
    setFavorites(current => Object.fromEntries(Object.entries(current).map(([actor, photos]) => [actor, new Set([...photos].filter(id => !removed.has(id)))])));
    setNotes(current => Object.fromEntries(Object.entries(current).filter(([id]) => !removed.has(id))));
    setOpinions(current => Object.fromEntries(Object.entries(current).map(([actor, notes]) => [actor, Object.fromEntries(Object.entries(notes).filter(([id]) => !removed.has(id)))])));
    setSceneByPhotoId(current => Object.fromEntries(Object.entries(current).filter(([id]) => !removed.has(id))));
    setPersonByPhotoId(current => Object.fromEntries(Object.entries(current).filter(([id]) => !removed.has(id))));
    setCompositionByPhotoId(current => Object.fromEntries(Object.entries(current).filter(([id]) => !removed.has(id))));
    setCategoryByPhotoId(current => Object.fromEntries(Object.entries(current).filter(([id]) => !removed.has(id))));
  }
  return <DraftContext.Provider value={{
    finalIds, toggleFinal, setFinalMany, favorites, toggleFavorite, guests, addGuest, toggleGuestAccess,
    activeActor, setActiveActor, setGuestDone: (id, done) => setGuests(current => current.map(guest => guest.id === id ? { ...guest, done } : guest)),
    closed, setClosed, notes, setNote: (id, text) => setNotes(current => ({ ...current, [id]: text })),
    opinions, setOpinion: (id, text) => setOpinions(current => ({ ...current, [activeActor]: { ...current[activeActor], [id]: text } })),
    projectName, shootType, targetCount, setProject, deliveries, createDelivery, excludedScenes, setExcludedScenes,
    sceneTargets, setSceneTarget: (index, count) => setSceneTargets(current => ({ ...current, [index]: Math.max(0, count) })),
    sceneByPhotoId, setPhotoScene: (id, scene) => setSceneByPhotoId(current => ({ ...current, [id]: scene })),
    personByPhotoId, setPhotoPerson: (id, person) => setPersonByPhotoId(current => ({ ...current, [id]: person })),
    compositionByPhotoId, setPhotoComposition: (id, composition) => setCompositionByPhotoId(current => ({ ...current, [id]: composition })),
    categoryByPhotoId, setPhotoCategories: (id, categories) => setCategoryByPhotoId(current => ({ ...current, [id]: categories })),
    reviewedScenes, toggleReviewedScene: index => setReviewedScenes(current => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; }),
    analyses, setAnalyses, uploadFiles, setUploadFiles, prunePhotos,
  }}>{children}</DraftContext.Provider>;
}

export function useCustomerSelectDraft() {
  const context = useContext(DraftContext);
  if (!context) throw new Error("useCustomerSelectDraft must be used inside CustomerSelectDraftProvider");
  return context;
}
