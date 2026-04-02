export type MappingType = "exact" | "order" | "none";

export type MappingTarget = {
  id: string;
  filename: string;
};

export type MappingResult<T extends MappingTarget> = {
  target: T;
  file: File | null;
  type: MappingType;
  orderIndex?: number;
};

export function normalizeFilename(name: string): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.[a-z0-9]+$/i, "");
}

export function buildVersionMapping<T extends MappingTarget>(
  files: File[],
  targets: T[]
): MappingResult<T>[] {
  const remaining = [...files];
  return targets.map((target, index) => {
    const targetName = normalizeFilename(target.filename);
    const exactIdx = remaining.findIndex((f) => normalizeFilename(f.name) === targetName);
    if (exactIdx >= 0) {
      const exact = remaining.splice(exactIdx, 1)[0];
      return { target, file: exact, type: "exact" };
    }
    const order = files[index] ?? null;
    if (order) return { target, file: order, type: "order", orderIndex: index + 1 };
    return { target, file: null, type: "none" };
  });
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
