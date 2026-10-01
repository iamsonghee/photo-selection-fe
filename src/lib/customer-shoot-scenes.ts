import type { LucideIcon } from "lucide-react";
import { Baby, Briefcase, Cake, Camera, GraduationCap, Heart, Sparkles, Users } from "lucide-react";

/**
 * 셀프 고객 촬영 종류와 종류별 주요 장면 목록(시간 순서). AI 장면 정리는 이 목록 안에서만 이름을 고르고,
 * 맞는 이름이 없으면 `OTHER_SCENE`을 쓴다 — 고객·작가가 보는 장면 이름을 일관되게 유지하기 위함.
 * 작가 프로젝트의 `SHOOT_TYPES`와는 별개다. 2026-10-01 이전 셀프 고객 프로젝트는 작가와 같은 값을 썼는데,
 * 그중 새 목록에 없는 값은 `wedding`뿐이라 그 값만 호환용으로 계속 허용한다(장면 목록 없음).
 */
export type CustomerShootType = { value: string; label: string; icon: LucideIcon; scenes: readonly string[] };

export const OTHER_SCENE = "기타 장면";
const LEGACY_SHOOT_TYPE_LABELS: Record<string, string> = { wedding: "웨딩" };

export const CUSTOMER_SHOOT_TYPES: readonly CustomerShootType[] = [
  { value: "wedding_ceremony", label: "웨딩 본식", icon: Heart, scenes: ["식전·신부 대기실", "입장", "예식", "축하·퇴장", "원판·단체", "폐백", "2부·피로연"] },
  { value: "wedding_shoot", label: "웨딩 촬영", icon: Sparkles, scenes: ["준비", "스튜디오", "야외", "드레스·의상 변경", "마무리 컷"] },
  { value: "first_birthday", label: "돌·백일잔치", icon: Cake, scenes: ["행사 전", "가족사진", "행사 진행", "돌잡이", "하객"] },
  { value: "family", label: "가족·베이비", icon: Baby, scenes: ["가족 단체", "아이 단독", "부모와 아이", "형제·자매"] },
  { value: "couple", label: "커플·스냅", icon: Users, scenes: ["장소 1", "장소 2", "의상 변경", "마무리 컷"] },
  { value: "graduation", label: "졸업·기념", icon: GraduationCap, scenes: ["단체", "개인", "가족과 함께", "친구와 함께"] },
  { value: "profile", label: "프로필·증명", icon: Briefcase, scenes: ["정면", "측면·전신", "컨셉 컷"] },
  { value: "etc", label: "기타", icon: Camera, scenes: [] },
];

export function isCustomerShootType(value: unknown): value is string {
  return typeof value === "string" && (CUSTOMER_SHOOT_TYPES.some((type) => type.value === value) || Object.hasOwn(LEGACY_SHOOT_TYPE_LABELS, value));
}

export function customerShootTypeLabel(value: string | null): string {
  return CUSTOMER_SHOOT_TYPES.find((type) => type.value === value)?.label
    ?? (value && Object.hasOwn(LEGACY_SHOOT_TYPE_LABELS, value) ? LEGACY_SHOOT_TYPE_LABELS[value] : undefined)
    ?? "촬영 종류 미입력";
}

export function customerSceneCatalog(shootType: string | null | undefined): readonly string[] {
  return CUSTOMER_SHOOT_TYPES.find((type) => type.value === shootType)?.scenes ?? [];
}
