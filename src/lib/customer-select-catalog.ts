"use client";

import { useMemo } from "react";
import { useCustomerSelectDraft } from "@/contexts/CustomerSelectDraftContext";
import { SELECT_SCENES, SELECT_TIMELINE, SHOOT_TYPES, type SelectPhoto } from "./customer-select-sample";

export type CatalogPhoto = SelectPhoto & { sceneIndex: number; scene: string; unitId: string };

export function useCustomerSelectCatalog() {
  const { shootType, uploadFiles, sceneByPhotoId, personByPhotoId, compositionByPhotoId, categoryByPhotoId } = useCustomerSelectDraft();
  return useMemo(() => {
    const template = SHOOT_TYPES.find(item => item.id === shootType) ?? SHOOT_TYPES[0];
    const definitions = template.id === "ceremony" ? SELECT_SCENES : template.scenes.map(name => ({ name, shortName: name, count: 0, target: 1, description: "촬영 흐름을 확인하고 사진을 골라보세요." }));
    const sample = !uploadFiles.some(item => item.file);
    // ponytail: 실제 장면 분석 전까지 업로드 사진은 시간순 균등 구간으로만 나눈다. 분석 연동 시 이 배정을 교체한다.
    const source: SelectPhoto[][] = sample ? SELECT_TIMELINE.flat() : [...uploadFiles]
      .sort((a, b) => (a.capturedAt ?? a.file?.lastModified ?? 0) - (b.capturedAt ?? b.file?.lastModified ?? 0))
      .map(item => [{ id: item.id, filename: item.name, src: item.url ?? "", person: "", composition: "", groupId: null, quality: null, relativePath: item.relativePath, capturedAt: item.capturedAt, sourceSize: item.file?.size }]);
    const timeline: SelectPhoto[][][] = definitions.map(() => []);
    let position = 0;
    for (const group of source) {
      const pieces = new Map<number, SelectPhoto[]>();
      for (const photo of group) {
        const scene = sceneByPhotoId[photo.id] ?? (sample && shootType === "ceremony"
          ? Number(photo.id.split(":")[0])
          : Math.min(definitions.length - 1, Math.floor(position * definitions.length / Math.max(1, uploadFiles.length || 5000))));
        const safeScene = Math.max(0, Math.min(definitions.length - 1, scene));
        pieces.set(safeScene, [...(pieces.get(safeScene) ?? []), photo]);
        position++;
      }
      pieces.forEach((photos, scene) => timeline[scene].push(photos));
    }
    const scenes = definitions.map((scene, index) => ({ ...scene, count: timeline[index].reduce((count, group) => count + group.length, 0) }));
    const taggedTimeline = timeline.map((groups, sceneIndex) => groups.map(group => group.map(photo => ({ ...photo,
      person: personByPhotoId[photo.id] ?? photo.person,
      composition: compositionByPhotoId[photo.id] ?? photo.composition,
      categories: categoryByPhotoId[photo.id] ?? (sample ? [template.categories[Math.min(sceneIndex, template.categories.length - 1)], ...(photo.person === "부모님" ? ["가족·단체사진"] : [])].filter((tag, index, tags) => tags.indexOf(tag) === index) : []),
    }))));
    const photos: CatalogPhoto[] = taggedTimeline.flatMap((groups, sceneIndex) => groups.flatMap(group => group.map(photo => ({ ...photo, sceneIndex, scene: scenes[sceneIndex].name, unitId: group[0].id }))));
    return { sample, scenes, timeline: taggedTimeline, photos, template };
  }, [shootType, uploadFiles, sceneByPhotoId, personByPhotoId, compositionByPhotoId, categoryByPhotoId]);
}
