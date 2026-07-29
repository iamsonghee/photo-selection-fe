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

export type GroupSelectionInfo = { selectedCount: number; earliestSelectedId: string | null };

/**
 * membersByGroup 전체를 1회 순회해 그룹별 셀렉 수/가장 앞선(orderIndex 기준) 셀렉 사진 id를
 * 미리 계산한다. 카드 렌더링마다 개별적으로 members.filter(selectedIds.has)를 반복하지 않기
 * 위한 캐시 — selectedIds가 바뀔 때 한 번만 다시 만들면 되고, 그룹에 속한 사진 수만큼만
 * 순회한다(전체 사진 수가 아니라 그룹화된 사진 수 기준이라 대형 프로젝트에서도 가볍다).
 * members는 buildMembersByGroup에서 이미 orderIndex 오름차순 정렬돼 있으므로, 순회 중 처음
 * 만나는 셀렉 사진이 곧 "셀렉된 사진 중 원래 순서가 가장 앞선 사진"이다 — 셀렉 개수와 무관하게
 * (1장이든 2장 이상이든) 항상 이 값을 기록한다.
 */
export function buildGroupSelectionInfo(
  membersByGroup: Map<string, Photo[]>,
  selectedIds: Set<string>
): Map<string, GroupSelectionInfo> {
  const map = new Map<string, GroupSelectionInfo>();
  for (const [groupId, members] of membersByGroup) {
    let count = 0;
    let earliestSelectedId: string | null = null;
    for (const m of members) {
      if (selectedIds.has(m.id)) {
        count++;
        if (earliestSelectedId === null) earliestSelectedId = m.id;
      }
    }
    map.set(groupId, { selectedCount: count, earliestSelectedId });
  }
  return map;
}

/**
 * 그룹의 표지(front) 사진 id. 셀렉이 하나도 없으면 내부 기본 표지(대표컷)를 쓰고,
 * 1장 이상 셀렉돼 있으면 개수와 무관하게 항상 "셀렉된 사진 중 원래 순서가 가장 앞선 사진"이다.
 * 대표컷은 화면에 "대표컷"이라는 문구로 노출되지 않는 내부 기본값일 뿐이다.
 */
export function getGroupFrontPhotoId(group: PhotoGroupInfo, info?: GroupSelectionInfo): string {
  return info?.earliestSelectedId ?? group.representativePhotoId;
}

/**
 * 그룹에 속한 사진은 "앞자리(표지)" 사진(getGroupFrontPhotoId)만 남기고 나머지를 제외한다.
 * 작가가 대표컷을 삭제한 직후 photoGroups가 아직 갱신되지 않은 경우(방어 폴백) 대비 —
 * 대표컷이 현재 photos 목록에 없는 그룹은 없는 것처럼 취급해 멤버가 전부 누락되는 걸 막는다.
 * ⚠️ 이 폴백이 발동하면 같은 groupId를 가진 사진이 이 함수의 반환 배열에 2장 이상 남을 수
 * 있다(그룹의 모든 멤버가 필터를 통과) — 이 배열을 순회해 그룹을 펼치는 호출부(예:
 * GalleryPageClient의 displayPhotos)는 반드시 groupId당 한 번만 처리하도록 자체적으로 가드해야
 * 멤버 중복 렌더링을 막을 수 있다.
 */
export function filterToGroupFrontPhotos(
  photos: Photo[],
  groupsById: Map<string, PhotoGroupInfo>,
  photoIdSet: Set<string>,
  groupSelectionInfo: Map<string, GroupSelectionInfo>
): Photo[] {
  return photos.filter((photo) => {
    const groupId = photo.similarityGroupId;
    if (!groupId) return true;
    const group = groupsById.get(groupId);
    if (!group || !photoIdSet.has(group.representativePhotoId)) return true;
    const frontId = getGroupFrontPhotoId(group, groupSelectionInfo.get(groupId));
    return photo.id === frontId;
  });
}
