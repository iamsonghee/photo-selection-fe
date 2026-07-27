import { getAdminClient } from "@/lib/supabase-admin";
import { mapProjectRow } from "@/lib/db";
import type { ProjectLogAction } from "@/lib/db";
import type { Project, ProjectStatus } from "@/types";
import type { Database } from "@/types/supabase";
import { getEffectiveTier, type BetaStatus, type PhotographerTier } from "@/lib/beta-policy";

export type AdminProjectSummary = Project & {
  photographerName: string;
  photographerEmail: string | null;
};

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type PhotographerJoin = { name: string | null; email: string | null } | null;

function mapAdminProject(row: ProjectRow & { photographers: PhotographerJoin }): AdminProjectSummary {
  return {
    ...mapProjectRow(row),
    photographerName: row.photographers?.name ?? "(이름 없음)",
    photographerEmail: row.photographers?.email ?? null,
  };
}

/** 관리자용 — 전체 작가의 전체 프로젝트 조회 (service role, RLS 우회) */
export async function getAllProjectsForAdmin(): Promise<AdminProjectSummary[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("*, photographers(name, email)")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as (ProjectRow & { photographers: PhotographerJoin })[]).map(mapAdminProject);
}

/** 관리자용 — 프로젝트 단건 조회 (작가 정보 포함) */
export async function getProjectForAdmin(id: string): Promise<AdminProjectSummary | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("*, photographers(name, email)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAdminProject(data as ProjectRow & { photographers: PhotographerJoin });
}

export type AdminPhotographerStats = {
  total: number;
  newThisWeek: number;
};

/** 관리자용 — 전체 작가 수 / 최근 7일 신규 가입 수 */
export async function getPhotographerStatsForAdmin(): Promise<AdminPhotographerStats> {
  const admin = getAdminClient();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [{ count: total, error: totalError }, { count: newThisWeek, error: newError }] = await Promise.all([
    admin.from("photographers").select("*", { count: "exact", head: true }),
    admin.from("photographers").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
  ]);

  if (totalError) throw new Error(totalError.message);
  if (newError) throw new Error(newError.message);

  return { total: total ?? 0, newThisWeek: newThisWeek ?? 0 };
}

export type AdminPhotographerSummary = {
  id: string;
  authId: string;
  name: string;
  email: string | null;
  createdAt: string;
  projectCount: number;
  lastActivityAt: string | null;
  betaStatus: BetaStatus;
  betaStartDate: string | null;
  betaEndDate: string | null;
  totalProjectsCreated: number;
  adminNote: string | null;
  effectiveTier: PhotographerTier;
};

type PhotographerBetaRow = {
  id: string;
  auth_id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  beta_status: BetaStatus;
  beta_start_date: string | null;
  beta_end_date: string | null;
  total_projects_created: number | null;
  admin_note: string | null;
};

function mapPhotographerSummary(
  row: PhotographerBetaRow,
  projectCount: number,
  lastActivityAt: string | null
): AdminPhotographerSummary {
  return {
    id: row.id,
    authId: row.auth_id,
    name: row.name ?? "(이름 없음)",
    email: row.email,
    createdAt: row.created_at,
    projectCount,
    lastActivityAt,
    betaStatus: row.beta_status,
    betaStartDate: row.beta_start_date,
    betaEndDate: row.beta_end_date,
    totalProjectsCreated: row.total_projects_created ?? 0,
    adminNote: row.admin_note,
    effectiveTier: getEffectiveTier({ email: row.email, betaStatus: row.beta_status, betaEndDate: row.beta_end_date }),
  };
}

/** 관리자용 — 전체 작가 목록 (프로젝트 수 / 마지막 활동일 / 등급 포함) */
export async function getAllPhotographersForAdmin(): Promise<AdminPhotographerSummary[]> {
  const admin = getAdminClient();
  const [{ data: photographers, error: photographersError }, projects] = await Promise.all([
    admin.from("photographers").select("*").order("created_at", { ascending: false }),
    getAllProjectsForAdmin(),
  ]);

  if (photographersError) throw new Error(photographersError.message);

  return ((photographers ?? []) as PhotographerBetaRow[]).map((row) => {
    const own = projects.filter((p) => p.photographerId === row.id);
    const lastActivityAt = own.reduce<string | null>((latest, p) => {
      if (!latest || new Date(p.updatedAt) > new Date(latest)) return p.updatedAt;
      return latest;
    }, null);
    return mapPhotographerSummary(row, own.length, lastActivityAt);
  });
}

export type AdminPhotographerDetail = AdminPhotographerSummary & {
  projects: AdminProjectSummary[];
};

/** 관리자용 — 작가 상세(보유 프로젝트 목록 포함) */
export async function getPhotographerForAdmin(id: string): Promise<AdminPhotographerDetail | null> {
  const admin = getAdminClient();
  const [{ data: row, error }, allProjects] = await Promise.all([
    admin.from("photographers").select("*").eq("id", id).maybeSingle(),
    getAllProjectsForAdmin(),
  ]);

  if (error) throw new Error(error.message);
  if (!row) return null;

  const photographerRow = row as PhotographerBetaRow;
  const own = allProjects.filter((p) => p.photographerId === photographerRow.id);
  const lastActivityAt = own.reduce<string | null>((latest, p) => {
    if (!latest || new Date(p.updatedAt) > new Date(latest)) return p.updatedAt;
    return latest;
  }, null);

  return {
    ...mapPhotographerSummary(photographerRow, own.length, lastActivityAt),
    projects: own,
  };
}

export type StatusDistribution = Record<ProjectStatus, number>;

/** 상태값별 프로젝트 수 집계 */
export function countByStatus(projects: { status: ProjectStatus }[]): StatusDistribution {
  const counts: StatusDistribution = {
    preparing: 0,
    selecting: 0,
    confirmed: 0,
    editing: 0,
    reviewing_v1: 0,
    editing_v2: 0,
    reviewing_v2: 0,
    delivered: 0,
  };
  for (const p of projects) counts[p.status]++;
  return counts;
}

export const ADMIN_ACTION_LABELS: Record<ProjectLogAction, string> = {
  created: "프로젝트 생성",
  uploaded: "사진 업로드",
  selecting: "셀렉 단계 전환",
  confirmed: "셀렉 확정",
  editing: "보정 시작",
  reviewing_v1: "v1 검토 요청",
  editing_v2: "v2 재보정 시작",
  reviewing_v2: "v2 검토 요청",
  delivered: "납품 완료",
};

export type AdminActivityLogItem = {
  id: string;
  projectId: string;
  projectName: string;
  customerName: string;
  photographerName: string;
  action: ProjectLogAction;
  createdAt: string;
};

type ActivityLogRow = {
  id: string;
  project_id: string;
  action: ProjectLogAction;
  created_at: string;
  projects: { name: string; customer_name: string; photographers: { name: string | null } | null } | null;
};

function mapActivityLogRow(row: ActivityLogRow): AdminActivityLogItem {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.projects?.name ?? "프로젝트",
    customerName: row.projects?.customer_name ?? "",
    photographerName: row.projects?.photographers?.name ?? "(이름 없음)",
    action: row.action,
    createdAt: row.created_at,
  };
}

/** 관리자용 — 전체 작가 대상 활동 로그 (service role, RLS 우회) */
export async function getRecentActivityLogsForAdmin(limit = 100): Promise<AdminActivityLogItem[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("project_logs")
    .select("id, project_id, action, created_at, projects(name, customer_name, photographers(name))")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ActivityLogRow[]).map(mapActivityLogRow);
}

/** 관리자용 — 특정 프로젝트의 활동 로그 타임라인 */
export async function getActivityLogsForProject(projectId: string): Promise<AdminActivityLogItem[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("project_logs")
    .select("id, project_id, action, created_at, projects(name, customer_name, photographers(name))")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ActivityLogRow[]).map(mapActivityLogRow);
}

export type FeedbackCategory = "bug" | "suggestion";
export type FeedbackStatus = "new" | "reviewing" | "resolved";

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "버그",
  suggestion: "제안",
};

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "신규",
  reviewing: "확인중",
  resolved: "해결됨",
};

export type AdminFeedbackItem = {
  id: string;
  reporterName: string;
  projectName: string | null;
  category: FeedbackCategory;
  message: string;
  pageUrl: string | null;
  status: FeedbackStatus;
  createdAt: string;
};

type FeedbackRow = {
  id: string;
  category: FeedbackCategory;
  message: string;
  page_url: string | null;
  status: FeedbackStatus;
  created_at: string;
  photographers: { name: string | null } | null;
  projects: { name: string } | null;
};

/** 관리자용 — 전체 피드백(버그 제보/제안) 목록 */
export async function getAllFeedbackForAdmin(): Promise<AdminFeedbackItem[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .select("id, category, message, page_url, status, created_at, photographers(name), projects(name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as FeedbackRow[]).map((row) => ({
    id: row.id,
    reporterName: row.photographers?.name ?? "(알 수 없음)",
    projectName: row.projects?.name ?? null,
    category: row.category,
    message: row.message,
    pageUrl: row.page_url,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export type AuditAction =
  | "beta_granted"
  | "beta_ended"
  | "beta_suspended"
  | "beta_period_changed"
  | "project_limit_hit"
  | "photo_limit_hit";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  beta_granted: "베타 권한 부여",
  beta_ended: "베타 권한 종료",
  beta_suspended: "베타 권한 중지",
  beta_period_changed: "베타 기간 변경",
  project_limit_hit: "프로젝트 생성 제한 발생",
  photo_limit_hit: "사진 업로드 제한 발생",
};

export type AdminAuditLogItem = {
  id: string;
  actor: "admin" | "system";
  action: AuditAction;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

/** 관리자용 — 특정 작가의 관리 이력(베타 부여/종료/한도 발생 등) */
export async function getAuditLogsForPhotographer(photographerId: string): Promise<AdminAuditLogItem[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("admin_audit_logs")
    .select("id, actor, action, detail, created_at")
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

export type BetaApplicationStatus = "applied" | "reviewing" | "on_hold" | "approved" | "rejected";

export const BETA_APPLICATION_STATUS_LABELS: Record<BetaApplicationStatus, string> = {
  applied: "신청완료",
  reviewing: "검토중",
  on_hold: "보류",
  approved: "승인",
  rejected: "거절",
};

export type AdminBetaApplicationSummary = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  genre: string;
  monthlyShootCount: number;
  status: BetaApplicationStatus;
  createdAt: string;
  matchedPhotographerId: string | null;
};

export type AdminBetaApplicationDetail = AdminBetaApplicationSummary & {
  avgPhotosPerProject: number;
  currentWorkflow: string;
  reason: string;
  adminNote: string | null;
  contacted: boolean;
  matchedPhotographerName: string | null;
  matchedPhotographerEmail: string | null;
  matchedPhotographerBetaStatus: BetaStatus | null;
  /** 매칭된 계정 기준 사용 현황(§12 4단계) — 매칭 전에는 전부 null/0 */
  firstLoginAt: string | null;
  projectCount: number;
  customerLinkVisitedCount: number;
};

type BetaApplicationRow = Database["public"]["Tables"]["beta_applications"]["Row"];

function mapBetaApplicationSummary(row: BetaApplicationRow): AdminBetaApplicationSummary {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    genre: row.genre,
    monthlyShootCount: row.monthly_shoot_count,
    status: row.status,
    createdAt: row.created_at,
    matchedPhotographerId: row.matched_photographer_id,
  };
}

/** 관리자용 — 전체 베타 신청 목록 */
export async function getAllBetaApplicationsForAdmin(): Promise<AdminBetaApplicationSummary[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("beta_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as BetaApplicationRow[]).map(mapBetaApplicationSummary);
}

/** 관리자용 — 베타 신청 상세(매칭된 작가 정보 포함) */
export async function getBetaApplicationForAdmin(id: string): Promise<AdminBetaApplicationDetail | null> {
  const admin = getAdminClient();
  const { data, error } = await admin.from("beta_applications").select("*").eq("id", id).maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as BetaApplicationRow;
  let matchedPhotographerName: string | null = null;
  let matchedPhotographerEmail: string | null = null;
  let matchedPhotographerBetaStatus: BetaStatus | null = null;
  let firstLoginAt: string | null = null;
  let projectCount = 0;
  let customerLinkVisitedCount = 0;

  if (row.matched_photographer_id) {
    const matchedId = row.matched_photographer_id;
    const [{ data: pRow }, { data: loginRow }, { count: projCount }, { count: visitCount }] = await Promise.all([
      admin.from("photographers").select("name, email, beta_status").eq("id", matchedId).maybeSingle(),
      admin
        .from("beta_usage_events")
        .select("occurred_at")
        .eq("photographer_id", matchedId)
        .eq("event_type", "first_login")
        .maybeSingle(),
      admin.from("projects").select("*", { count: "exact", head: true }).eq("photographer_id", matchedId),
      admin
        .from("beta_usage_events")
        .select("*", { count: "exact", head: true })
        .eq("photographer_id", matchedId)
        .eq("event_type", "customer_link_visited"),
    ]);
    if (pRow) {
      matchedPhotographerName = pRow.name ?? null;
      matchedPhotographerEmail = pRow.email ?? null;
      matchedPhotographerBetaStatus = pRow.beta_status as BetaStatus;
    }
    firstLoginAt = loginRow?.occurred_at ?? null;
    projectCount = projCount ?? 0;
    customerLinkVisitedCount = visitCount ?? 0;
  }

  return {
    ...mapBetaApplicationSummary(row),
    avgPhotosPerProject: row.avg_photos_per_project,
    currentWorkflow: row.current_workflow,
    reason: row.reason,
    adminNote: row.admin_note,
    contacted: row.contacted,
    matchedPhotographerName,
    matchedPhotographerEmail,
    matchedPhotographerBetaStatus,
    firstLoginAt,
    projectCount,
    customerLinkVisitedCount,
  };
}

export type AdminBetaInvitation = {
  id: string;
  email: string;
  invitedAt: string;
  adminNote: string | null;
};

/** 관리자용 — 대기 중인 베타 사전 초대 목록(미소진) */
export async function getPendingBetaInvitations(): Promise<AdminBetaInvitation[]> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("beta_invitations")
    .select("id, email, invited_at, admin_note")
    .is("consumed_at", null)
    .order("invited_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    invitedAt: row.invited_at,
    adminNote: row.admin_note,
  }));
}
