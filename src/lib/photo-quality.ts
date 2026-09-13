/**
 * 사진 품질(눈감음·흔들림) 판정의 **단일 출처**: Gemini Flash(`gemini_quality_assessments`).
 *
 * 예전에는 `photos.is_blurry` / `eyes_closed` 컬럼(OpenCLIP `/analyze` 경로)이 출처였는데,
 * 그 경로를 호출하는 프론트 진입점이 사라지면서 **아무도 채우지 않는 값**이 됐다.
 * 실측(2026-09-12): photos 12,593장 중 `is_blurry`가 채워진 건 514장(4%)뿐이고
 * 최근 프로젝트 8개는 전부 0장 — 고객 갤러리의 흔들림·눈감음 배지가 사실상 죽어 있었다.
 * 그래서 읽기 출처를 Gemini Flash 한 곳으로 옮긴다.
 *
 * Gemini는 4개 축을 `ok | possible | likely | unknown` 3단계(+불명)로 답한다. 화면이 쓰는 것은
 * boolean이므로 **어느 단계부터 참으로 볼지**를 정해야 하는데, 그 답이 보는 사람에 따라 다르다.
 */

export type QualityLevel = "ok" | "possible" | "likely" | "unknown";

/** `gemini_quality_assessments` 행 중 판정에 쓰는 컬럼만 */
export type GeminiQualityRow = {
  photo_id: string;
  eyes_closed: QualityLevel | string;
  blur_or_shake: QualityLevel | string;
  focus_issue: QualityLevel | string;
  face_occluded: QualityLevel | string;
  primary_subject_detected: boolean | null;
  created_at?: string | null;
};

/** 화면이 읽는 boolean 형태 — `Photo` 타입의 품질 필드와 같은 모양이라 교체가 국소적이다. */
export type PhotoQualityFlags = {
  isBlurry: boolean | null;
  faceDetected: boolean | null;
  eyesClosed: boolean | null;
};

/**
 * 같은 데이터를 보는 사람에 따라 다르게 자른다.
 *
 * - `photographer`: **골라내기 전 훑어보는 사람**이라 놓치는 쪽이 더 아프다(재현율 우선).
 *   `possible`까지 표시해 "한 번 봐야 할 사진"을 넓게 잡는다.
 * - `customer`: **고르는 사람**이라 잘못된 경고가 더 아프다(정밀도 우선). 멀쩡한 사진에
 *   "흔들림 의심"이 붙으면 고객이 좋은 컷을 스스로 지운다. `likely`일 때만 알린다.
 */
export type QualityAudience = "customer" | "photographer";

const TRUE_LEVELS: Record<QualityAudience, ReadonlySet<string>> = {
  customer: new Set(["likely"]),
  photographer: new Set(["likely", "possible"]),
};

function flag(level: string, audience: QualityAudience): boolean | null {
  // `unknown`은 "판정하지 못함"이지 "문제 없음"이 아니다 — false로 단정하지 않고 null로 남긴다.
  if (level === "unknown") return null;
  return TRUE_LEVELS[audience].has(level);
}

/**
 * 여러 축을 하나의 표시로 합친다. 하나라도 참이면 참, 전부 판정불가면 null, 그 밖에는 거짓.
 *
 * (`unknown` 하나 때문에 나머지 축의 확실한 "문제 없음"이 지워지면 안 되므로, 전부 null일 때만 null)
 */
function anyFlag(levels: readonly string[], audience: QualityAudience): boolean | null {
  const flags = levels.map((lv) => flag(lv, audience));
  if (flags.some((f) => f === true)) return true;
  if (flags.every((f) => f === null)) return null;
  return false;
}

export function toPhotoQualityFlags(
  row: GeminiQualityRow,
  audience: QualityAudience
): PhotoQualityFlags {
  return {
    /* **흔들림과 초점을 하나로 합친다**(배지 문구도 "흐림 의심").
     *
     * 한때 `blur_or_shake`만 봤는데 두 가지 이유로 틀린 판단이었다:
     *  1. 작가에게는 결론이 같다 — 흔들렸든 초점이 나갔든 "이 컷은 못 쓴다"이고 둘 다 고칠 수 없다.
     *  2. 나누면 **Gemini가 둘 중 어느 이름을 고르는지에 결과가 좌우된다.** 흐릿한 사진 하나를
     *     `blur_or_shake`로 부를지 `focus_issue`로 부를지는 사실상 동전 던지기라, 나눠 두면
     *     동전이 맞게 떨어져야만 배지가 켜진다. 합치면 어느 쪽으로 판정하든 잡힌다. */
    isBlurry: anyFlag([String(row.blur_or_shake), String(row.focus_issue)], audience),
    /* `faceDetected`는 판정이 아니라 **전제**다: 인물이 없으면 눈감음 판정 자체가 무의미하다.
     * 화면들이 이미 `faceDetected === true && eyesClosed === true`로 검사하므로 모양을 맞춰 둔다. */
    faceDetected: row.primary_subject_detected,
    eyesClosed: flag(String(row.eyes_closed), audience),
  };
}

/**
 * 사진 목록에 붙일 수 있도록 photo_id → 판정 맵으로 만든다.
 *
 * 한 사진에 행이 여럿일 수 있다(테이블 UNIQUE가 `model`·`prompt_version`까지 포함해서,
 * 모델이나 프롬프트를 올리면 예전 판정과 나란히 쌓인다). **가장 최근 행만** 쓴다.
 */
export function buildQualityFlagMap(
  rows: readonly GeminiQualityRow[],
  audience: QualityAudience
): Map<string, PhotoQualityFlags> {
  const latest = new Map<string, GeminiQualityRow>();
  for (const row of rows) {
    const prev = latest.get(row.photo_id);
    if (!prev || (row.created_at ?? "") > (prev.created_at ?? "")) latest.set(row.photo_id, row);
  }

  const out = new Map<string, PhotoQualityFlags>();
  for (const [photoId, row] of latest) out.set(photoId, toPhotoQualityFlags(row, audience));
  return out;
}

/** 판정이 없는 사진 — 분석 전이거나 실패한 경우. "문제 없음"과 구분해 전부 null로 둔다. */
export const NO_QUALITY_FLAGS: PhotoQualityFlags = {
  isBlurry: null,
  faceDetected: null,
  eyesClosed: null,
};
