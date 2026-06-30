import { compressImageForUpload } from "@/lib/upload-client-compress";
import type { MappingResult, MappingTarget } from "@/lib/version-mapping";

export type ClipMatchOutcome = {
  photoId: string;
  filename: string;
  similarity: number;
  type: "clip" | "clip_low";
};

type RawMatchRetouchResponse = {
  matches?: Array<{
    photo_id: string;
    filename: string;
    similarity: number;
    type: "clip" | "clip_low";
  }>;
};

/**
 * exact/fuzzy 매칭 이후 남은 미매핑 target들과 미사용 파일들을 clip-service로 보내
 * CLIP 이미지 유사도 기반 매칭을 시도한다.
 * 네트워크 실패·타임아웃 시 절대 throw하지 않고 빈 배열을 반환 — 호출 측은 항상
 * "none"(수동 지정 필요) 상태로 안전하게 폴백할 수 있다.
 */
export async function matchRetouchByClip(
  projectId: string,
  leftoverPhotoIds: string[],
  leftoverFiles: File[],
  options?: { signal?: AbortSignal },
): Promise<ClipMatchOutcome[]> {
  if (leftoverPhotoIds.length === 0 || leftoverFiles.length === 0) return [];

  try {
    // CLIP 임베딩 추출용이라 최종 업로드 압축보다 더 작게 줄여도 충분함
    const compressed = await Promise.all(
      leftoverFiles.map((f) => compressImageForUpload(f, { maxEdge: 768, jpegQuality: 0.75 })),
    );

    const form = new FormData();
    form.append("project_id", projectId);
    form.append("photo_ids", leftoverPhotoIds.join(","));
    compressed.forEach((f, i) => form.append("files", f, leftoverFiles[i].name));

    const res = await fetch(`/api/photographer/projects/${projectId}/retouch-match`, {
      method: "POST",
      body: form,
      signal: options?.signal,
    });
    if (!res.ok) return [];

    const data: RawMatchRetouchResponse = await res.json();
    return (data.matches ?? []).map((m) => ({
      photoId: m.photo_id,
      filename: m.filename,
      similarity: m.similarity,
      type: m.type,
    }));
  } catch {
    return [];
  }
}

/**
 * clip-service 매칭 결과를 mapping 행에 병합한다. type "none"인 행만 대상으로 하며,
 * 파일은 filename으로 leftoverFiles에서 역참조한다(같은 이름이 여러 개면 첫 번째부터 소진).
 */
export function applyClipMatches<T extends MappingTarget>(
  rows: MappingResult<T>[],
  leftoverFiles: File[],
  matches: ClipMatchOutcome[],
): MappingResult<T>[] {
  if (matches.length === 0) return rows;

  const filesByName = new Map<string, File[]>();
  leftoverFiles.forEach((f) => {
    const list = filesByName.get(f.name);
    if (list) list.push(f);
    else filesByName.set(f.name, [f]);
  });

  return rows.map((row) => {
    if (row.type !== "none") return row;
    const match = matches.find((m) => m.photoId === row.target.id);
    if (!match) return row;
    const candidates = filesByName.get(match.filename);
    const file = candidates?.shift() ?? null;
    if (!file) return row;
    return { ...row, file, type: match.type, similarity: match.similarity };
  });
}
