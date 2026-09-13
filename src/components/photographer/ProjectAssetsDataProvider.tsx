"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { getPhotosWithSelections, getProjectById } from "@/lib/db";
import type { ColorTag, Photo, Project } from "@/types";

export type AssetPhotoState = {
  rating?: number;
  color?: ColorTag[];
  comment?: string;
};

type ProjectAssetsData = {
  project: Project | null;
  photos: Photo[];
  selectedIds: Set<string>;
  photoStates: Record<string, AssetPhotoState>;
  loading: boolean;
  error: string | null;
  setProject: Dispatch<SetStateAction<Project | null>>;
  refreshPhotos: () => Promise<void>;
  reload: () => Promise<void>;
};

const ProjectAssetsDataContext = createContext<ProjectAssetsData | null>(null);

export function ProjectAssetsDataProvider({
  children,
  projectId,
}: {
  children: ReactNode;
  projectId: string;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [photoStates, setPhotoStates] = useState<Record<string, AssetPhotoState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyPhotos = useCallback((result: Awaited<ReturnType<typeof getPhotosWithSelections>>) => {
    setPhotos(result.photos);
    setSelectedIds(result.selectedIds);
    setPhotoStates(result.photoStates ?? {});
  }, []);

  const refreshPhotos = useCallback(async () => {
    const result = await getPhotosWithSelections(projectId);
    applyPhotos(result);
  }, [applyPhotos, projectId]);

  const reload = useCallback(async () => {
    setError(null);
    const [nextProject, result] = await Promise.all([
      getProjectById(projectId),
      getPhotosWithSelections(projectId),
    ]);
    setProject(nextProject);
    applyPhotos(result);
  }, [applyPhotos, projectId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProjectById(projectId), getPhotosWithSelections(projectId)])
      .then(([nextProject, result]) => {
        if (cancelled) return;
        setProject(nextProject);
        applyPhotos(result);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "프로젝트 사진을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [applyPhotos, projectId]);

  const value = useMemo<ProjectAssetsData>(() => ({
    project,
    photos,
    selectedIds,
    photoStates,
    loading,
    error,
    setProject,
    refreshPhotos,
    reload,
  }), [error, loading, photoStates, photos, project, refreshPhotos, reload, selectedIds]);

  return <ProjectAssetsDataContext.Provider value={value}>{children}</ProjectAssetsDataContext.Provider>;
}

export function useProjectAssetsData() {
  const context = useContext(ProjectAssetsDataContext);
  if (!context) throw new Error("useProjectAssetsData must be used inside ProjectAssetsDataProvider");
  return context;
}
