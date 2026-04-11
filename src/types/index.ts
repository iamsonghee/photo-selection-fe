// ========== 공통 ==========
export type StarRating = 1 | 2 | 3 | 4 | 5;

export type ColorTag = "red" | "yellow" | "green" | "blue" | "purple";

export type CommentCategory = "retouch" | "feedback" | "question";

export interface PhotoTag {
  star?: StarRating;
  color?: ColorTag[];
}

const VALID_COLOR_TAGS: ColorTag[] = ["red", "yellow", "green", "blue", "purple"];

/** DB color_tag 문자열("red,blue") → ColorTag 배열 */
export function parseColorTags(raw: string | null | undefined): ColorTag[] {
  if (!raw) return [];
  return raw.split(",").filter((v): v is ColorTag => VALID_COLOR_TAGS.includes(v as ColorTag));
}

/** ColorTag 배열 → DB 저장용 문자열("red,blue"). 빈 배열이면 null */
export function serializeColorTags(colors: ColorTag[] | undefined): string | null {
  if (!colors?.length) return null;
  return colors.join(",");
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
  url: string; // r2_thumb — 그리드·썸네일
  /** r2_preview (또는 동일 해상도). 없으면 뷰어에서 url 사용 */
  previewUrl?: string | null;
  /** DB original_filename. 없으면 URL에서 추출하거나 number로 fallback */
  originalFilename?: string | null;
  /** DB file_size (bytes). R2에 올라간 썸네일+미리보기 JPEG 합계 */
  fileSize?: number | null;
  selected?: boolean;
  tag?: PhotoTag;
  comment?: string;
  photographerMemo?: string;
}

// ========== 프로젝트 ==========
// preparing: 작가가 아직 사진 업로드 중 (M < N)
// selecting: 고객이 사진 셀렉 중
// confirmed: 고객이 최종확정 완료
// editing:   작가가 보정 중
// reviewing_v1: 고객이 v1 검토 중
// editing_v2:   작가가 v2 재보정 중
// reviewing_v2: 고객이 v2 검토 중
// delivered:   최종 완료
export type ProjectStatus =
  | "preparing"
  | "selecting"
  | "confirmed"
  | "editing"
  | "reviewing_v1"
  | "editing_v2"
  | "reviewing_v2"
  | "delivered";

export interface Project {
  id: string;
  name: string;
  photographerId: string;
  customerName: string;
  shootDate: string; // ISO date
  deadline: string; // ISO date
  requiredCount: number; // N
  photoCount: number; // M (실제 업로드된 장수)
  /** 생성 시 입력한 예상 업로드 장수 (DB 컬럼 photo_count_expected) */
  photoCountExpected?: number | null;
  /** 촬영 유형: wedding | family | graduation | profile | etc */
  shootType?: string | null;
  customerPhone?: string | null;
  status: ProjectStatus;
  accessToken: string;
  accessPin?: string | null;
  confirmedAt?: string; // ISO, when customer final-confirmed
  deliveredAt?: string; // ISO, when status = delivered
  /** 고객이 확정 취소한 횟수 (최대 3회, 고객 측 "확정 취소"용) */
  customerCancelCount?: number;
  displayId?: string; // "20260410-001" 형식 (작가별 당일 순번)
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
export type SortOrder = "newest" | "oldest" | "filename";

// ========== N 변경 알림 (고객 갤러리) ==========
export interface NChangeNotice {
  previousN: number;
  newN: number;
  noticedAt: string;
}

// ========== 보정본 검토 (목업/추후 DB) ==========
export type ReviewStatus = "approved" | "revision_requested";

export interface PhotoVersion {
  id: string;
  photoId: string;
  version: 1 | 2;
  r2Url: string;
  photographerMemo: string | null;
  createdAt: string;
}

export interface VersionReview {
  id: string;
  photoVersionId: string;
  photoId: string;
  status: ReviewStatus;
  customerComment: string | null;
  reviewedAt: string | null;
}
