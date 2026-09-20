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
