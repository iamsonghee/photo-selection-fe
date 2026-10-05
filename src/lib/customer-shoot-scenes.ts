import type { LucideIcon } from "lucide-react";
import { Baby, Briefcase, Cake, Camera, GraduationCap, Heart, Home, Sparkles, Users } from "lucide-react";

/**
 * 셀프 고객 촬영 종류와 종류별 주요 장면 목록(시간 순서). AI 장면 정리는 이 목록 안에서만 이름을 고르고,
 * 맞는 이름이 없으면 `OTHER_SCENE`을 쓴다 — 고객·작가가 보는 장면 이름을 일관되게 유지하기 위함.
 * 작가 프로젝트의 `SHOOT_TYPES`와는 별개다. 2026-10-01 이전 셀프 고객 프로젝트는 작가와 같은 값을 썼는데,
 * 그중 새 목록에 없는 값은 `wedding`뿐이라 그 값만 호환용으로 계속 허용한다(장면 목록 없음).
 */
/**
 * sceneGapSeconds: 장면 경계 공백(초). 없으면 기본(`customer-scenes.ts` SCENE_GAP_MS, 3분).
 * sceneByPlace: 흔들림 확인에서 사진마다 장소(scenes 중 하나)도 판정해, 끝나면 장면을 장소가 바뀌는 곳에서 다시 나눈다(홈스냅).
 */
export type CustomerShootType = { value: string; label: string; icon: LucideIcon; scenes: readonly string[]; sceneGapSeconds?: number; sceneByPlace?: boolean };

export const OTHER_SCENE = "기타 장면";
const LEGACY_SHOOT_TYPE_LABELS: Record<string, string> = { wedding: "웨딩" };

export const CUSTOMER_SHOOT_TYPES: readonly CustomerShootType[] = [
  // 이름은 사진만 보고 구분되는 것으로 둔다 — 순서·시점만 다른 이름("장소 1/2", "준비/마무리 컷", "행사 진행/이벤트")은 AI가 고를 수 없다.
  // 같은 이름이 떨어져 두 번 나오면 clip-service가 "야외 1", "야외 2"처럼 번호를 붙인다(`number_repeated`).
  { value: "wedding_ceremony", label: "웨딩 본식", icon: Heart, scenes: ["식전·신부 대기실", "입장", "예식(주례·서약)", "축가·축하 무대", "행진·퇴장", "원판·단체", "폐백", "2부·피로연"] },
  { value: "wedding_shoot", label: "웨딩 촬영", icon: Sparkles, scenes: ["메이크업·준비", "스튜디오", "야외", "한복", "야간·조명"] },
  // 보통 식 전에 야외·식장 밖에서 먼저 찍고 돌상으로 옮긴다. 이름은 사진만 보고 구분되는 것으로 둔다("행사 전"처럼 시점만 다른 이름은 AI가 고를 수 없다). 돌잡이 뒤에는 보통 퀴즈·경품 이벤트를 한다. 아기 단독·가족처럼 번갈아 찍는 인물 구성은 장면이 아니라 사진별 구분으로 다룬다(장면으로 나누면 잘게 쪼개짐).
  { value: "first_birthday", label: "돌·백일잔치", icon: Cake, scenes: ["야외·식장 밖", "돌상 촬영", "가족사진", "사회·성장 영상", "돌잡이", "퀴즈·경품", "하객", "단체사진"] },
  { value: "family", label: "가족·베이비", icon: Baby, scenes: ["가족 단체", "아이 단독", "부모와 아이", "형제·자매"] },
  // 집 안 장소별로 나눈다. 방을 옮길 때 1~2분만 쉬어서(2026-10-05 실촬영 459장: 방 이동 공백 1.4~2분, 같은 방 안 공백 대부분 1분 남짓) 공백 기준을 75초로 낮춘다.
  // 같은 방 안에서 한 번 더 잘려도 이웃한 같은 이름 장면은 합쳐진다. 아기 단독·가족 같은 인물 구성은 장면이 아니라 사진별 구분.
  // 배경 없이 손·발·얼굴만 찍은 디테일 컷 묶음은 장소를 알 수 없어 기타 장면이 되므로 "클로즈업·디테일"로 받는다.
  // 쉬지 않고 방을 옮기면 시간 공백으로는 못 나눠서 사진마다 장소를 판정해 다시 나눈다(sceneByPlace) — 2026-10-05 실험: 경계 8/8·11/12(시간 기준 7/8·8/12).
  { value: "home_snap", label: "홈스냅", icon: Home, scenes: ["거실", "침실·침대", "아기방·기저귀", "거울·드레스룸", "주방·식탁", "욕실·목욕", "서재·책장", "작업실·책상", "베란다·창가", "현관·복도", "야외·산책", "식당·카페", "클로즈업·디테일"], sceneGapSeconds: 75, sceneByPlace: true },
  { value: "couple", label: "커플·스냅", icon: Users, scenes: ["야외", "실내·카페", "야경·노을", "소품·디테일"] },
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
    ?? "촬영 유형 미입력";
}

export function customerSceneGapSeconds(shootType: string | null | undefined): number | undefined {
  return CUSTOMER_SHOOT_TYPES.find((type) => type.value === shootType)?.sceneGapSeconds;
}

/** 흔들림 확인에서 사진마다 물을 장소 목록(장면 이름 목록 그대로 — 장소 아닌 이름은 clip-service가 뺀다). 장소로 나누지 않는 종류는 undefined. */
export function customerPlaceNames(shootType: string | null | undefined): readonly string[] | undefined {
  const type = CUSTOMER_SHOOT_TYPES.find((item) => item.value === shootType);
  return type?.sceneByPlace ? type.scenes : undefined;
}

export function customerSceneCatalog(shootType: string | null | undefined): readonly string[] {
  return CUSTOMER_SHOOT_TYPES.find((type) => type.value === shootType)?.scenes ?? [];
}
