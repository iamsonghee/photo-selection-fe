/**
 * 베타 신청서 선택형 문항 정의 — 공개 폼(클라이언트)과 제출 API(서버) 양쪽에서 공유.
 *
 * 모든 선택지는 화면 라벨이 아니라 안정적인 key로 저장한다(beta_applications.additional_answers).
 * 라벨 문구를 바꿔도 DB 마이그레이션이 필요 없게 하기 위함 — 표시 시점에만 key→라벨로 변환한다.
 */

export interface BetaOption {
  key: string;
  label: string;
}

/** 주 촬영 분야 — 복수선택. "기타" 선택 시 genre_other 보조 입력 필수. */
export const BETA_GENRE_OPTIONS: readonly BetaOption[] = [
  { key: "wedding_ceremony", label: "웨딩 본식" },
  { key: "wedding_studio", label: "웨딩 스튜디오" },
  { key: "first_birthday", label: "돌잔치" },
  { key: "family_snap", label: "가족·홈스냅" },
  { key: "profile", label: "프로필" },
  { key: "event", label: "행사" },
  { key: "other", label: "기타" },
] as const;

/** 월평균 프로젝트 수 — 단일선택. key는 legacy monthly_shoot_count(정수) 컬럼에도 대표값으로 병행 기록. */
export const BETA_MONTHLY_PROJECT_OPTIONS: readonly (BetaOption & { repValue: number })[] = [
  { key: "under_1", label: "1건 미만", repValue: 0 },
  { key: "1_3", label: "1~3건", repValue: 2 },
  { key: "4_10", label: "4~10건", repValue: 7 },
  { key: "11_20", label: "11~20건", repValue: 15 },
  { key: "over_21", label: "21건 이상", repValue: 21 },
] as const;

/** 프로젝트당 평균 사진 수 — 단일선택. key는 legacy avg_photos_per_project(정수) 컬럼에도 대표값으로 병행 기록. */
export const BETA_AVG_PHOTOS_OPTIONS: readonly (BetaOption & { repValue: number })[] = [
  { key: "under_500", label: "500장 미만", repValue: 300 },
  { key: "500_999", label: "500~999장", repValue: 750 },
  { key: "1000_1499", label: "1,000~1,499장", repValue: 1250 },
  { key: "1500_1999", label: "1,500~1,999장", repValue: 1750 },
  { key: "over_2000", label: "2,000장 이상", repValue: 2000 },
] as const;

/** 현재 고객 셀렉 방식 — 복수선택. "기타" 선택 시 workflow_other 보조 입력 필수. */
export const BETA_WORKFLOW_OPTIONS: readonly BetaOption[] = [
  { key: "kakao_messenger", label: "카카오톡·메신저" },
  { key: "email", label: "이메일" },
  { key: "cloud_drive", label: "구글드라이브·클라우드" },
  { key: "filename_list", label: "파일명 목록" },
  { key: "dedicated_gallery", label: "전용 갤러리 서비스" },
  { key: "photographer_selects", label: "고객 셀렉 없이 작가가 직접 셀렉" },
  { key: "other", label: "기타" },
] as const;

/** 베타에서 사용해보고 싶은 기능 — 복수선택. "기타" 선택 시 feature_other 보조 입력 필수. */
export const BETA_DESIRED_FEATURE_OPTIONS: readonly BetaOption[] = [
  { key: "customer_gallery", label: "고객 셀렉 갤러리" },
  { key: "rating_color_tag", label: "별점·컬러 태그" },
  { key: "photo_comment", label: "사진별 코멘트" },
  { key: "similar_grouping", label: "유사컷 그룹핑" },
  { key: "retouch_management", label: "보정 요청 관리" },
  { key: "confirm_revision_management", label: "고객 확정·재요청 관리" },
  { key: "other", label: "기타" },
] as const;

/** 가장 불편한 단계 — 단일선택, 선택 입력. */
export const BETA_PAIN_POINT_OPTIONS: readonly BetaOption[] = [
  { key: "original_delivery", label: "원본 전달" },
  { key: "customer_selection", label: "고객 사진 선택" },
  { key: "retouch_request", label: "보정 요청 정리" },
  { key: "revision_request", label: "재보정 요청" },
  { key: "final_approval", label: "최종 승인" },
  { key: "filename_matching", label: "파일명 매칭" },
  { key: "none", label: "특별히 없음" },
] as const;

/** 월 사용 의향 — 단일선택, 선택 입력. */
export const BETA_USAGE_INTENT_OPTIONS: readonly BetaOption[] = [
  { key: "immediate_use", label: "바로 업무에 사용 가능" },
  { key: "partial_test", label: "일부 프로젝트에서 테스트" },
  { key: "decide_after_check", label: "기능 확인 후 결정" },
  { key: "trial_only", label: "단순 체험 목적" },
] as const;

/** 연락 가능 채널 — 복수선택, 선택 입력. */
export const BETA_CONTACT_CHANNEL_OPTIONS: readonly BetaOption[] = [
  { key: "phone", label: "전화" },
  { key: "sms", label: "문자" },
  { key: "kakao", label: "카카오톡" },
  { key: "email", label: "이메일" },
] as const;

function labelOf(options: readonly BetaOption[], key: string): string {
  return options.find((o) => o.key === key)?.label ?? key;
}

export function genreLabel(key: string): string {
  return labelOf(BETA_GENRE_OPTIONS, key);
}
export function monthlyProjectLabel(key: string): string {
  return labelOf(BETA_MONTHLY_PROJECT_OPTIONS, key);
}
export function avgPhotosLabel(key: string): string {
  return labelOf(BETA_AVG_PHOTOS_OPTIONS, key);
}
export function workflowLabel(key: string): string {
  return labelOf(BETA_WORKFLOW_OPTIONS, key);
}
export function desiredFeatureLabel(key: string): string {
  return labelOf(BETA_DESIRED_FEATURE_OPTIONS, key);
}
export function painPointLabel(key: string): string {
  return labelOf(BETA_PAIN_POINT_OPTIONS, key);
}
export function usageIntentLabel(key: string): string {
  return labelOf(BETA_USAGE_INTENT_OPTIONS, key);
}
export function contactChannelLabel(key: string): string {
  return labelOf(BETA_CONTACT_CHANNEL_OPTIONS, key);
}

export function monthlyProjectRepValue(key: string): number {
  return BETA_MONTHLY_PROJECT_OPTIONS.find((o) => o.key === key)?.repValue ?? 0;
}
export function avgPhotosRepValue(key: string): number {
  return BETA_AVG_PHOTOS_OPTIONS.find((o) => o.key === key)?.repValue ?? 0;
}

/** beta_applications.additional_answers jsonb 컬럼의 구조 — 신규(선택형) 신청서 전용, 구버전 신청은 null. */
export interface BetaAdditionalAnswers {
  genres: string[];
  genre_other?: string;
  monthly_project_range: string;
  avg_photos_range: string;
  workflow_methods: string[];
  workflow_other?: string;
  desired_features: string[];
  desired_features_other?: string;
  pain_point?: string;
  usage_intent?: string;
  contact_channels?: string[];
  expectation?: string;
}
