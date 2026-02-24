import type {
  Photographer,
  Project,
  Photo,
  ActivityLog,
  Comment,
  NChangeNotice,
} from "@/types";

// ========== 작가 (목업: 단일) ==========
export const mockPhotographer: Photographer = {
  id: "ph1",
  name: "김사진",
  avatarUrl: "https://api.dicebear.com/7.x/avataaars/svg?seed=kim",
  email: "kim@example.com",
};

// 새 프로젝트 생성 후 업로드 페이지용 mock id (M<N 부족 상태 표시)
export const MOCK_NEW_PROJECT_ID = "mock-id-1";

// ========== 프로젝트 목록 (대시보드용) ==========
// status: preparing | selecting | confirmed | editing (4가지만 사용)
export const mockProjects: Project[] = [
  {
    id: MOCK_NEW_PROJECT_ID,
    name: "새 프로젝트",
    photographerId: "ph1",
    customerName: "",
    shootDate: new Date().toISOString().slice(0, 10),
    deadline: new Date().toISOString().slice(0, 10),
    requiredCount: 200,
    photoCount: 150,
    status: "preparing",
    inviteToken: "inv-mock-new",
    customerCancelCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "proj1",
    name: "웨딩 스튜디오 A",
    photographerId: "ph1",
    customerName: "이혜진",
    shootDate: "2026-02-10",
    deadline: "2026-03-15",
    requiredCount: 10,
    photoCount: 280,
    status: "selecting",
    inviteToken: "inv-abc-001",
    customerCancelCount: 0,
    createdAt: "2026-02-15T10:00:00Z",
    updatedAt: "2026-02-20T14:30:00Z",
  },
  {
    id: "proj2",
    name: "스냅 사진 B",
    photographerId: "ph1",
    customerName: "박민수",
    shootDate: "2026-02-01",
    deadline: "2026-02-28",
    requiredCount: 150,
    photoCount: 150,
    status: "confirmed",
    inviteToken: "inv-abc-002",
    customerCancelCount: 0,
    confirmedAt: "2026-02-18T16:00:00Z",
    createdAt: "2026-02-05T09:00:00Z",
    updatedAt: "2026-02-18T16:00:00Z",
  },
  {
    id: "proj3",
    name: "가족 사진 C",
    photographerId: "ph1",
    customerName: "최지영",
    shootDate: "2026-01-20",
    deadline: "2026-02-20",
    requiredCount: 80,
    photoCount: 120,
    status: "editing",
    inviteToken: "inv-abc-003",
    customerCancelCount: 0,
    confirmedAt: "2026-02-18T16:00:00Z",
    createdAt: "2026-01-25T10:00:00Z",
    updatedAt: "2026-02-18T16:00:00Z",
  },
  {
    id: "proj4",
    name: "부족한 사진 프로젝트",
    photographerId: "ph1",
    customerName: "정고객",
    shootDate: "2026-02-15",
    deadline: "2026-03-01",
    requiredCount: 100,
    photoCount: 60,
    status: "preparing",
    inviteToken: "inv-abc-004",
    customerCancelCount: 0,
    createdAt: "2026-02-16T10:00:00Z",
    updatedAt: "2026-02-16T10:00:00Z",
  },
  {
    id: "proj5",
    name: "보정 진행 중 프로젝트",
    photographerId: "ph1",
    customerName: "한고객",
    shootDate: "2026-02-01",
    deadline: "2026-03-10",
    requiredCount: 200,
    photoCount: 250,
    status: "editing",
    inviteToken: "inv-mno-005",
    customerCancelCount: 0,
    confirmedAt: "2026-02-20T14:30:00Z",
    createdAt: "2026-02-05T10:00:00Z",
    updatedAt: "2026-02-21T09:00:00Z",
  },
  {
    id: "proj6",
    name: "Lock 상태 프로젝트",
    photographerId: "ph1",
    customerName: "Lock고객",
    shootDate: "2026-01-25",
    deadline: "2026-03-01",
    requiredCount: 150,
    photoCount: 180,
    status: "editing",
    inviteToken: "inv-lock-006",
    customerCancelCount: 0,
    confirmedAt: "2026-02-19T12:00:00Z",
    createdAt: "2026-01-28T10:00:00Z",
    updatedAt: "2026-02-21T08:00:00Z",
  },
];

// ========== 프로젝트별 사진 (갤러리/뷰어/결과용) ==========
function generatePhotos(projectId: string, count: number, selectedCount: number): Photo[] {
  const photos: Photo[] = [];
  for (let i = 0; i < count; i++) {
    const selected = i < selectedCount;
    photos.push({
      id: `photo-${projectId}-${i + 1}`,
      projectId,
      orderIndex: i + 1,
      url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect fill="#1f2937" width="600" height="600"/><text x="50%" y="50%" fill="#9ca3af" font-size="24" text-anchor="middle" dominant-baseline="middle">${i + 1}</text></svg>`)}`,
      selected,
      tag: selected
        ? {
            star: ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5,
            color: ["red", "yellow", "green", "blue", "purple"][i % 5] as
              | "red"
              | "yellow"
              | "green"
              | "blue"
              | "purple",
          }
        : undefined,
      comment: selected && i % 4 === 0 ? `이 사진 보정 시 밝기 살려주세요 (${i + 1}번)` : undefined,
      photographerMemo: selected && i % 3 === 0 ? "Lightroom 밝기+2" : undefined,
    });
  }
  return photos;
}

export function getPhotosByProject(projectId: string): Photo[] {
  const proj = mockProjects.find((p) => p.id === projectId);
  if (!proj) return [];
  // selecting / preparing: 초기 선택 0장. confirmed / editing: 확정된 N장 선택된 상태로 표시
  const selectedCount =
    proj.status === "confirmed" || proj.status === "editing"
      ? proj.requiredCount
      : 0;
  return generatePhotos(projectId, proj.photoCount, selectedCount);
}

// ========== 토큰으로 프로젝트 조회 ==========
// token 불일치 시 null 반환 (fallback 사용 안 함) → UI에서 "존재하지 않는 초대 링크" 표시
export function getProjectByToken(token: string | undefined | null): Project | undefined {
  if (token == null || token === "") return undefined;
  return mockProjects.find((p) => p.inviteToken === token) ?? undefined;
}

// ========== 프로젝트 상태 변경 (확정 취소 등) ==========
export function updateProject(
  projectId: string,
  patch: Partial<Pick<Project, "status" | "customerCancelCount">>
): void {
  const project = mockProjects.find((p) => p.id === projectId);
  if (!project) return;
  if (patch.status != null) project.status = patch.status;
  if (patch.customerCancelCount != null) project.customerCancelCount = patch.customerCancelCount;
  project.updatedAt = new Date().toISOString();
}

// ========== 활동 로그 ==========
export const mockActivityLogs: Record<string, ActivityLog[]> = {
  proj1: [
    { id: "a1", projectId: "proj1", type: "final_confirmed", label: "최종확정", createdAt: "2026-02-20T14:30:00Z" },
    { id: "a2", projectId: "proj1", type: "comment_added", label: "코멘트 추가", createdAt: "2026-02-20T14:15:00Z" },
    { id: "a3", projectId: "proj1", type: "tagged", label: "200장 태깅", createdAt: "2026-02-20T12:00:00Z" },
    { id: "a4", projectId: "proj1", type: "first_visit", label: "첫 접속", createdAt: "2026-02-18T10:00:00Z" },
    { id: "a5", projectId: "proj1", type: "invite_click", label: "초대 링크 클릭", createdAt: "2026-02-18T09:55:00Z" },
  ],
  proj2: [
    { id: "b1", projectId: "proj2", type: "first_visit", label: "첫 접속", createdAt: "2026-02-18T11:00:00Z" },
    { id: "b2", projectId: "proj2", type: "invite_click", label: "초대 링크 클릭", createdAt: "2026-02-18T10:58:00Z" },
  ],
};

export function getActivityLogs(projectId: string): ActivityLog[] {
  return mockActivityLogs[projectId] ?? [];
}

// ========== 코멘트 목록 (결과 페이지 필터용) ==========
export function getCommentsByProject(projectId: string): Comment[] {
  const photos = getPhotosByProject(projectId).filter((p) => p.comment);
  return photos.map((p, i) => ({
    id: `c-${p.id}`,
    photoId: p.id,
    category: (i % 3 === 0 ? "retouch" : i % 3 === 1 ? "feedback" : "question") as "retouch" | "feedback" | "question",
    text: p.comment!,
    createdAt: "2026-02-20T14:00:00Z",
  }));
}

// ========== N 변경 알림 (갤러리 상태 변형용) ==========
export const mockNChangeNotice: NChangeNotice = {
  previousN: 200,
  newN: 250,
  noticedAt: "2026-02-22T10:00:00Z",
};

// ========== 대시보드 통계 ==========
export function getDashboardStats() {
  const inProgress = mockProjects.filter((p) => p.status === "selecting").length;
  const completed = mockProjects.filter((p) => p.status === "confirmed" || p.status === "editing").length;
  const waiting = mockProjects.filter((p) => p.status === "preparing").length;
  return { inProgress, completed, waiting };
}
