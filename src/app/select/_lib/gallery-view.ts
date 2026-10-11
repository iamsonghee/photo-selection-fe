import type { Photo } from "@/types";

/** 유사컷 묶기 상태에서는 그룹의 첫 사진만 남기고, 펼친 그룹만 전체 사진을 보여준다. */
export function collapseSimilarityGroups(photos: Photo[], expandedGroupIds: ReadonlySet<string>): Photo[] {
  const seen = new Set<string>();
  return photos.filter((photo) => {
    const groupId = photo.similarityGroupId;
    if (!groupId || expandedGroupIds.has(groupId)) return true;
    if (seen.has(groupId)) return false;
    seen.add(groupId);
    return true;
  });
}

/** 현재 스크롤 행의 첫 사진. 열 수가 달라져도 이 id로 같은 위치를 다시 찾는다. */
export function galleryAnchorPhotoId(
  photos: Pick<Photo, "id">[],
  scrollTop: number,
  columns: number,
  rowHeight: number,
): string | null {
  if (!photos.length || columns < 1 || rowHeight <= 0) return null;
  const index = Math.floor(Math.max(0, scrollTop) / rowHeight) * columns;
  return photos[Math.min(index, photos.length - 1)]?.id ?? null;
}
