import { SELECT_SCENES, SELECT_TIMELINE } from "./customer-select-sample";
import type { CatalogPhoto } from "./customer-select-catalog";

export const RESULT_PHOTOS = SELECT_TIMELINE.flatMap((groups, sceneIndex) => groups.flatMap(group => group.map(photo => ({
  ...photo, sceneIndex, scene: SELECT_SCENES[sceneIndex].name, unitId: group[0].id,
}))));

export function resultPhotos(ids: ReadonlySet<string> | readonly string[], catalog: readonly CatalogPhoto[] = RESULT_PHOTOS) {
  const selected = ids instanceof Set ? ids : new Set(ids);
  return catalog.filter(photo => selected.has(photo.id));
}

export function resultCsv(photos: ReturnType<typeof resultPhotos>, notes: Record<string, string>, version: number) {
  // Spreadsheet applications may execute untrusted filenames or notes as formulas.
  const cell = (text: string) => `"${(/^[\s]*[=+\-@]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
  return "\uFEFF" + [
    ["결과 버전", "사진 ID", "원본 파일명", "원본 경로", "원본 파일 크기", "파일 수정 시각", "장면", "요청 사항"],
    ...photos.map(photo => [`v${version}`, photo.id, photo.filename, photo.relativePath ?? "", photo.sourceSize?.toString() ?? "", photo.capturedAt ? new Date(photo.capturedAt).toISOString() : "", photo.scene, notes[photo.id] ?? ""]),
  ].map(row => row.map(cell).join(",")).join("\r\n");
}
