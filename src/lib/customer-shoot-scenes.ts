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
 * sceneByStage: 같은 구조로 사진마다 촬영 단계(scenes 중 하나)를 판정해 단계가 바뀌는 곳에서 나눈다(웨딩 본식). 촬영 시각이 없는
 *   보정본도 파일명 연번 순서로 나누고, 장면 정리는 이 판정이 끝날 때까지 기다렸다가 단계 장면만 보인다(중간 장면 없음).
 *   sceneHints: 단계마다 판정 문구에 넣는 판단 기준. 이름·기준을 바꾸면 다음 정리에서 전체 사진을 다시 판정한다(비용).
 *   sceneMainStages: 그중 본식 단계 — 장면 목록을 식 전 / 본식 / 식 후로 묶는 기준(`src/lib/scene-phases.ts`, 화면 표시만).
 *   설계: docs/wedding-ceremony-scene-plan.md, 화면: docs/wedding-ceremony-scene-prd.md.
 */
export type CustomerShootType = {
  value: string; label: string; icon: LucideIcon; scenes: readonly string[]; sceneGapSeconds?: number;
  sceneByPlace?: boolean; sceneByStage?: boolean; sceneHints?: Readonly<Record<string, string>>; sceneMainStages?: readonly string[];
};

/**
 * 웨딩 본식 촬영 단계(시간 순서)와 판단 기준. 2026-10-14 1차 목록 — 사진 한 장으로 구분되고 시간상 이어진 단계만 둔다.
 * 어느 단계에나 나오는 피사체(하객·혼주 반응, 소품 디테일, 신랑신부 반응)는 장면이 아니라 후속 사진 태그 후보라 뺐고,
 * 단상 앞에서 말로 진행되는 서약·반지 교환·성혼선언·덕담은 사진 한 장으로 갈리지 않아 "예식" 하나로 묶었다.
 * 판단 기준 v2(2026-10-15): 짱쭌 본식 오판정(키스 → 예식, 노래 듣는 신부 → 예식, 아버지 인계 → 예식, 신랑신부만 선 원판 → 연출)을 반영했다.
 * 10장 묶음 판정에서 짱쭌 89.3%·해군 75.3%(다듬기 전). 하객 유무·앉은 신부를 더 적은 v3는 두 프로젝트 모두 낮아져 쓰지 않는다
 * (docs/wedding-ceremony-scene-plan.md). 문구를 바꾸면 판정 캐시 버전이 바뀌어 다음 정리에서 전체를 다시 판정한다(유료).
 */
const WEDDING_CEREMONY_STAGES: Readonly<Record<string, string>> = {
  "웨딩홀·디테일": "사람 없이 식장·연회장 전경, 꽃장식, 청첩장·방명록·소품을 찍은 사진",
  "메이크업·준비": "메이크업·헤어를 하거나 드레스·턱시도를 입는 준비 과정(대기실 안 화장 수정은 신부대기실)",
  "신부대기실": "신부대기실 소파·꽃장식 배경에서 신부가 가족·하객과 찍은 사진, 대기실 안 화장 수정 포함",
  "로비·하객 맞이": "식 전 로비·식장 입구에서 신랑·혼주가 하객을 맞아 인사·악수하는 장면, 방명록·축의대",
  "신랑신부 연출촬영": "하객 없이 신랑신부 또는 신부 단독이 포즈를 잡은 연출 사진 — 식 전 홀 촬영, 식 후 버진로드·세트 연출",
  "화촉점화·혼주 입장": "양가 어머니가 입장해 단상 앞 촛불을 켜는 장면, 혼주가 하객에게 인사하는 장면",
  "신랑 입장": "사회자 개식 선언, 신랑이 혼자 버진로드를 걸어 입장하거나 단상 앞에서 신부를 기다리는 장면",
  "신부 입장": "신부가 아버지와 버진로드로 입장하는 장면, 아버지가 신랑에게 신부를 인계하며 악수·포옹하는 장면, 인계 뒤 둘이 단상으로 가는 장면",
  "예식": "단상 앞에서 진행되는 서약·반지 교환·성혼선언·주례·덕담, 혼주석 반응, 양가 부모님께 인사·포옹 (축가 무대와 행진은 제외)",
  "축가·축하공연": "노래·연주·춤 같은 축하 무대를 하는 사람, 그리고 그 무대를 지켜보거나 듣는 신랑신부·신부 단독 컷",
  "행진·퇴장": "단상 앞에서 하객을 향해 서서 인사하고 버진로드를 함께 걸어 나가는 장면, 행진 중 키스·포옹 클로즈업, 꽃가루·축포·예도",
  "원판·단체 기념촬영": "포토월·단상 앞 정면에서 찍는 가족·친구·하객 단체 사진과, 원판을 시작하며 신랑신부 둘만 정면으로 선 컷(식 전이든 식 후든)",
  "폐백": "한복 차림, 폐백실 병풍·상차림, 절하기·대추·밤 받기",
  "피로연·연회장": "연회장 식사 테이블, 신랑신부가 테이블을 돌며 하객과 인사·건배하는 장면, 2부 드레스",
};
/** 본식 단계 — 이 단계들의 처음과 끝을 기준으로 앞은 식 전, 뒤는 식 후로 묶는다. clip-service도 받아 카메라별 본식 범위를 정한다. */
const WEDDING_CEREMONY_MAIN_STAGES = ["화촉점화·혼주 입장", "신랑 입장", "신부 입장", "예식", "축가·축하공연", "행진·퇴장"] as const;

export const OTHER_SCENE = "기타 장면";
const LEGACY_SHOOT_TYPE_LABELS: Record<string, string> = { wedding: "웨딩" };

export const CUSTOMER_SHOOT_TYPES: readonly CustomerShootType[] = [
  // 이름은 사진만 보고 구분되는 것으로 둔다 — 순서·시점만 다른 이름("장소 1/2", "준비/마무리 컷", "행사 진행/이벤트")은 AI가 고를 수 없다.
  // 같은 이름이 떨어져 두 번 나오면 clip-service가 "야외 1", "야외 2"처럼 번호를 붙인다(`number_repeated`).
  { value: "wedding_ceremony", label: "웨딩 본식", icon: Heart, scenes: Object.keys(WEDDING_CEREMONY_STAGES), sceneByStage: true, sceneHints: WEDDING_CEREMONY_STAGES, sceneMainStages: WEDDING_CEREMONY_MAIN_STAGES },
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

/** 사진마다 판정한 라벨로 장면을 나누는 종류: 장소(홈스냅) 또는 촬영 단계(웨딩 본식). 시간·내용 기준이면 undefined. */
export function customerSceneLabelBasis(shootType: string | null | undefined): "place" | "stage" | undefined {
  const type = CUSTOMER_SHOOT_TYPES.find((item) => item.value === shootType);
  return type?.sceneByStage ? "stage" : type?.sceneByPlace ? "place" : undefined;
}

/**
 * AI 정리 요청(장면·흔들림 확인)에 함께 보낼 라벨 옵션. 흔들림 확인이 사진마다 이 목록에서 라벨을 고르고, 장면 정리가 그 라벨로 나눈다.
 * 웨딩 본식은 단계별 판단 기준과 본식 단계도 보낸다(본식 단계는 장면 정리만 쓴다). 라벨로 나누지 않는 종류는 빈 객체.
 */
export function customerSceneLabelOptions(shootType: string | null | undefined): {
  placeNames?: readonly string[]; placeBasis?: "place" | "stage"; placeHints?: Readonly<Record<string, string>>; placeMainStages?: readonly string[];
} {
  const type = CUSTOMER_SHOOT_TYPES.find((item) => item.value === shootType);
  const basis = customerSceneLabelBasis(shootType);
  if (!type || !basis) return {};
  return {
    placeNames: type.scenes, placeBasis: basis,
    ...(basis === "stage" && type.sceneHints ? { placeHints: type.sceneHints } : {}),
    ...(basis === "stage" && type.sceneMainStages ? { placeMainStages: type.sceneMainStages } : {}),
  };
}

/** 장면 목록을 식 전 / 본식 / 식 후로 묶을 때의 본식 단계(웨딩 본식만). 묶지 않는 종류는 undefined. */
export function customerSceneMainStages(shootType: string | null | undefined): readonly string[] | undefined {
  return CUSTOMER_SHOOT_TYPES.find((type) => type.value === shootType)?.sceneMainStages;
}

export function customerSceneCatalog(shootType: string | null | undefined): readonly string[] {
  return CUSTOMER_SHOOT_TYPES.find((type) => type.value === shootType)?.scenes ?? [];
}
