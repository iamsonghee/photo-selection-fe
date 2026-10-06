/**
 * /admin/settings에서 관리자가 실시간으로 편집하는 정책 값의 단일 소스.
 * 서버 전용(getAdminClient 사용) — API Route, Server Component에서만 import.
 */
import { getAdminClient } from "@/lib/supabase-admin";
import {
  DEFAULT_GENERAL_MAX_PROJECTS,
  DEFAULT_GENERAL_MAX_PHOTOS_PER_PROJECT,
  DEFAULT_BETA_MAX_PROJECTS_TOTAL,
  DEFAULT_BETA_MAX_PHOTOS_PER_PROJECT,
  DEFAULT_BETA_MAX_REVISION_COUNT,
  DEFAULT_BETA_DEFAULT_DURATION_DAYS,
} from "@/lib/beta-limits";

export interface AppSettings {
  generalMaxProjects: number;
  generalMaxPhotosPerProject: number;
  betaMaxProjectsTotal: number;
  betaMaxPhotosPerProject: number;
  betaMaxRevisionCount: number;
  betaDefaultDurationDays: number;
  /** 하객 사진 모으기 — 임시값(2026-10-06), guest-album-server의 getGuestUploadLimits와 같은 컬럼 */
  guestPhotoMaxMb: number;
  guestVideoMaxMb: number;
  guestRetentionDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  generalMaxProjects: DEFAULT_GENERAL_MAX_PROJECTS,
  generalMaxPhotosPerProject: DEFAULT_GENERAL_MAX_PHOTOS_PER_PROJECT,
  betaMaxProjectsTotal: DEFAULT_BETA_MAX_PROJECTS_TOTAL,
  betaMaxPhotosPerProject: DEFAULT_BETA_MAX_PHOTOS_PER_PROJECT,
  betaMaxRevisionCount: DEFAULT_BETA_MAX_REVISION_COUNT,
  betaDefaultDurationDays: DEFAULT_BETA_DEFAULT_DURATION_DAYS,
  guestPhotoMaxMb: 20,
  guestVideoMaxMb: 500,
  guestRetentionDays: 90,
  updatedAt: null,
  updatedBy: null,
};

/** 현재 유효한 정책 값을 DB에서 읽는다. 테이블/행이 없거나 조회 실패 시 기본값으로 폴백한다(절대 throw하지 않음). */
export async function getAppSettings(): Promise<AppSettings> {
  try {
    const admin = getAdminClient();
    // 하객 한도는 따로 읽는다 — 컬럼이 없어도(마이그레이션 전) 기존 한도는 그대로 쓰게. 두 조회는 함께 보낸다.
    const [{ data, error }, guest] = await Promise.all([
      admin
        .from("app_settings")
        .select(
          "general_max_projects, general_max_photos_per_project, beta_max_projects_total, beta_max_photos_per_project, beta_max_revision_count, beta_default_duration_days, updated_at, updated_by"
        )
        .eq("id", 1)
        .maybeSingle(),
      admin.from("app_settings").select("guest_photo_max_mb, guest_video_max_mb, guest_retention_days").eq("id", 1).maybeSingle(),
    ]);

    if (error || !data) return DEFAULT_APP_SETTINGS;

    return {
      generalMaxProjects: data.general_max_projects,
      generalMaxPhotosPerProject: data.general_max_photos_per_project,
      betaMaxProjectsTotal: data.beta_max_projects_total,
      betaMaxPhotosPerProject: data.beta_max_photos_per_project,
      betaMaxRevisionCount: data.beta_max_revision_count,
      betaDefaultDurationDays: data.beta_default_duration_days,
      guestPhotoMaxMb: guest.data?.guest_photo_max_mb ?? DEFAULT_APP_SETTINGS.guestPhotoMaxMb,
      guestVideoMaxMb: guest.data?.guest_video_max_mb ?? DEFAULT_APP_SETTINGS.guestVideoMaxMb,
      guestRetentionDays: guest.data?.guest_retention_days ?? DEFAULT_APP_SETTINGS.guestRetentionDays,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}
