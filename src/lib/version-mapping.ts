export type MappingType = "exact" | "fuzzy" | "clip" | "clip_low" | "order" | "none" | "server";

export type MappingTarget = {
  id: string;
  filename: string;
};

export type MappingResult<T extends MappingTarget> = {
  target: T;
  file: File | null;
  type: MappingType;
  orderIndex?: number;
  /** CLIP 유사도 매칭 결과 (0~1). type이 "clip" | "clip_low"일 때만 설정됨 */
  similarity?: number;
};

export function normalizeFilename(name: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "");
}

/**
 * 편집 툴이 추가하는 공통 suffix를 제거해 원본 파일명의 stem만 추출.
 * 예: "DSC_0001-Edit" → "DSC_0001", "DSC_0001_v1_final" → "DSC_0001"
 */
export function stemFilename(normalized: string): string {
  return normalized
    // Lightroom: -Edit, -Edit-2, -Edit-3 ...
    .replace(/-edit(-\d+)?$/, "")
    // Capture One: _Angle1, _1, _2 ...
    .replace(/_angle\d+$/, "")
    // 공통: _retouched, _retouche, _retouch, _edited, _final, _comp, _web
    .replace(/[_-](retouched?|edited?|final|comp|web|export|out|lr|co|ps)$/, "")
    // 한글 접미사: 보정, 편집, 수정, 완성, 최종, 납품, 리터칭
    .replace(/[_-](보정|편집|수정|완성|최종|납품|리터칭)$/, "")
    // 공통: _v1, _v2, -v1, -v2, -1, -2, _1, _2 (버전 표기·1~2자리 변형 번호만 — "DSC_0001"처럼
    // 3자리 이상인 원본 파일명 고유 번호까지 지워버리면 서로 다른 사진이 같은 stem으로 충돌한다)
    .replace(/[_-](?:v\d+|\d{1,2})$/, "")
    // 연속 처리 (중첩 suffix 제거)
    .replace(/[_-](retouched?|edited?|final|comp|web|export|out|lr|co|ps)$/, "")
    .replace(/[_-](보정|편집|수정|완성|최종|납품|리터칭)$/, "")
    .replace(/[_-](?:v\d+|\d{1,2})$/, "")
    .trim();
}

export function buildVersionMapping<T extends MappingTarget>(
  files: File[],
  targets: T[]
): MappingResult<T>[] {
  const remaining = [...files];
  return targets.map((target) => {
    const targetNorm = normalizeFilename(target.filename);
    const targetStem = stemFilename(targetNorm);

    // 1단계: 정확 매칭 (확장자 제외 동일)
    const exactIdx = remaining.findIndex((f) => normalizeFilename(f.name) === targetNorm);
    if (exactIdx >= 0) {
      const file = remaining.splice(exactIdx, 1)[0];
      return { target, file, type: "exact" };
    }

    // 2단계: 퍼지 매칭 — 원본 stem ↔ 보정본 stem 비교
    const fuzzyIdx = remaining.findIndex((f) => {
      const fStem = stemFilename(normalizeFilename(f.name));
      return fStem === targetStem && targetStem.length > 0;
    });
    if (fuzzyIdx >= 0) {
      const file = remaining.splice(fuzzyIdx, 1)[0];
      return { target, file, type: "fuzzy" };
    }

    // 3단계(CLIP 유사도 매칭)는 비동기라 여기선 처리할 수 없음 — 호출부에서
    // type "none"인 행과 미점유 파일을 모아 matchRetouchByClip으로 넘긴다.
    return { target, file: null, type: "none" };
  });
}

/** 서버에 이미 있는 보정본 URL이 있으면 그 행을 "server"로 채워 검토·부분 교체 UI에 사용 */
export function mergeServerPlaceholders<T extends MappingTarget & { serverRetouchUrl?: string | null }>(
  rows: MappingResult<T>[]
): MappingResult<T>[] {
  return rows.map((m) => {
    if (m.file != null) return m;
    const url = (m.target as { serverRetouchUrl?: string | null }).serverRetouchUrl;
    if (url) return { ...m, file: null, type: "server" as const };
    return m;
  });
}

export function buildServerPlaceholderMapping<T extends MappingTarget & { serverRetouchUrl?: string | null }>(
  targets: T[]
): MappingResult<T>[] {
  return targets.map((target) =>
    target.serverRetouchUrl
      ? { target, file: null, type: "server" as const }
      : { target, file: null, type: "none" as const }
  );
}

export function remapSingleFile<T extends MappingTarget>(
  prev: MappingResult<T>[],
  targetId: string,
  file: File
): MappingResult<T>[] {
  return prev.map((m) => (m.target.id === targetId ? { ...m, file, type: "order" as const } : m));
}

/** 해당 타깃에 매핑된 로컬 파일만 제거 (일괄 업로드 배열과 별도로 행 단위 취소할 때 사용) */
export function clearSingleFile<T extends MappingTarget>(
  prev: MappingResult<T>[],
  targetId: string
): MappingResult<T>[] {
  return prev.map((m) =>
    m.target.id === targetId
      ? { ...m, file: null, type: "none" as const, orderIndex: undefined }
      : m
  );
}
