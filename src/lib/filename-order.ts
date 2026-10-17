/**
 * 파일명 자연 정렬(숫자는 크기순: `IMG_2` < `IMG_10`). 셀프 고객 업로드는 고른 파일을 이 순서로 올려 `order_index`를 매긴다 —
 * 보정본은 촬영 시각(EXIF)이 없어 올린 순서가 곧 사진 순서이고, 파일 선택창·드래그가 주는 순서는 이름순이 보장되지 않는다
 * (2026-10-14 본식 보정본 1,285장이 역순·일부 섞여 저장됨). 촬영 시각이 있는 사진은 화면·AI가 시각순으로 다시 놓으므로 영향이 없다.
 */
const collator = new Intl.Collator("ko", { numeric: true });

export function sortFilesByName<T extends { name: string }>(files: readonly T[]): T[] {
  // 이름이 같으면 고른 순서를 지킨다(Array.prototype.sort는 안정 정렬).
  return [...files].sort((a, b) => collator.compare(a.name, b.name));
}
