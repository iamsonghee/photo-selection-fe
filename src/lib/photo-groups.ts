/**
 * AI 유사컷 그룹(photo_groups) 조회/판정 로직. 고객 갤러리와 뷰어가 공용으로 사용한다.
 */
import type { Photo, PhotoGroupInfo } from "@/types";

export function buildGroupsById(photoGroups: PhotoGroupInfo[]): Map<string, PhotoGroupInfo> {
  const map = new Map<string, PhotoGroupInfo>();
  for (const g of photoGroups) map.set(g.id, g);
  return map;
}

export function buildPhotoIdSet(photos: Photo[]): Set<string> {
  return new Set(photos.map((p) => p.id));
}

/** groupId → 그룹 멤버 전체(대표컷 포함), orderIndex 오름차순 정렬 */
export function buildMembersByGroup(photos: Photo[]): Map<string, Photo[]> {
  const map = new Map<string, Photo[]>();
  for (const p of photos) {
    if (!p.similarityGroupId) continue;
    const arr = map.get(p.similarityGroupId) ?? [];
    arr.push(p);
    map.set(p.similarityGroupId, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.orderIndex - b.orderIndex);
  return map;
}

/**
 * 그룹에 속한 사진은 대표컷만 남기고 나머지를 제외한다.
 * 작가가 대표컷을 삭제한 직후 photoGroups가 아직 갱신되지 않은 경우(방어 폴백) 대비 —
 * 대표컷이 현재 photos 목록에 없는 그룹은 없는 것처럼 취급해 멤버가 전부 누락되는 걸 막는다.
 */
export function filterToRepresentatives(
  photos: Photo[],
  groupsById: Map<string, PhotoGroupInfo>,
  photoIdSet: Set<string>
): Photo[] {
  return photos.filter((photo) => {
    const groupId = photo.similarityGroupId;
    if (!groupId) return true;
    const group = groupsById.get(groupId);
    if (!group || !photoIdSet.has(group.representativePhotoId)) return true;
    return photo.id === group.representativePhotoId;
  });
}
