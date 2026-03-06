// ========== 공통 ==========
export type StarRating = 1 | 2 | 3 | 4 | 5;

export type ColorTag = "red" | "yellow" | "green" | "blue" | "purple";

export type CommentCategory = "retouch" | "feedback" | "question";

export interface PhotoTag {
  star?: StarRating;
  color?: ColorTag;
}

export interface Comment {
  id: string;
  photoId: string;
  category: CommentCategory;
  text: string;
  createdAt: string; // ISO
}

// ========== 사진 ==========
export interface Photo {
  id: string;
  projectId: string;
  orderIndex: number;
  url: string; // mock: placeholder or path
  selected?: boolean;
  tag?: PhotoTag;
  comment?: string;
  photographerMemo?: string;
}

// ========== 프로젝트 ==========
// preparing: 작가가 아직 사진 업로드 중 (M < N)
// selecting: 고객이 사진 셀렉 중
// confirmed: 고객이 최종확정 완료
// editing:   작가가 보정 시작 (Lock 상태)
export type ProjectStatus = "preparing" | "selecting" | "confirmed" | "editing";

export interface Project {
  id: string;
  name: string;
  photographerId: string;
  customerName: string;
  shootDate: string; // ISO date
  deadline: string; // ISO date
  requiredCount: number; // N
  photoCount: number; // M
  status: ProjectStatus;
  accessToken: string;
  confirmedAt?: string; // ISO, when customer final-confirmed
  /** 고객이 확정 취소한 횟수 (최대 3회, 고객 측 "확정 취소"용) */
  customerCancelCount?: number;
  createdAt: string;
  updatedAt: string;
}

// ========== 작가 ==========
export interface Photographer {
  id: string;
  name: string;
  avatarUrl?: string;
  email?: string;
}

// ========== 고객 진행/활동 ==========
export type ActivityType =
  | "invite_click"
  | "first_visit"
  | "tagged"
  | "comment_added"
  | "final_confirmed";

export interface ActivityLog {
  id: string;
  projectId: string;
  type: ActivityType;
  label: string;
  createdAt: string; // ISO
}

// ========== 갤러리 필터 ==========
export type SortOrder = "newest" | "oldest";

// ========== N 변경 알림 (고객 갤러리) ==========
export interface NChangeNotice {
  previousN: number;
  newN: number;
  noticedAt: string;
}
