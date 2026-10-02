/**
 * 장면 검수 채점: 운영자가 남긴 정답 장면과 그때의 AI 장면을 비교한다(/admin/scenes).
 * 두 장면 목록 모두 같은 사진을 촬영 시간순으로 나눈 것이다(정답 photoIds를 이어 붙인 순서가 기준).
 */

export type LabeledScene = { name: string | null; photoIds: string[] };

export type SceneScore = {
  /** 경계: AI 경계 중 정답 근처(±tolerance장)에 있는 비율 */
  boundaryPrecision: number;
  /** 경계: 정답 경계 중 AI가 근처에서 찾은 비율 */
  boundaryRecall: number;
  /** 이름: 사진마다 AI 장면 이름이 정답 장면 이름과 같은 비율(정답 이름이 있는 사진만) */
  nameAccuracy: number;
  aiSceneCount: number;
  labelSceneCount: number;
};

// ponytail: 경계 위치 허용 오차 고정 3장. 촬영 밀도가 크게 다르면 시간(초) 기준 허용으로 바꾼다.
const TOLERANCE = 3;

/** 장면이 시작하는 사진의 순서 번호(첫 장면 제외) */
function boundaries(scenes: LabeledScene[], indexOf: Map<string, number>): number[] {
  return scenes.slice(1).map((scene) => indexOf.get(scene.photoIds[0])).filter((index): index is number => index !== undefined);
}

/** a의 경계 중 b의 경계와 ±TOLERANCE 안에서 한 번씩 짝지어지는 수 */
function matched(a: number[], b: number[]): number {
  const used = new Set<number>();
  let count = 0;
  for (const x of a) {
    const hit = b.findIndex((y, i) => !used.has(i) && Math.abs(x - y) <= TOLERANCE);
    if (hit >= 0) { used.add(hit); count += 1; }
  }
  return count;
}

export function scoreScenes(label: LabeledScene[], ai: LabeledScene[]): SceneScore {
  const order = label.flatMap((scene) => scene.photoIds);
  const indexOf = new Map(order.map((id, index) => [id, index]));
  const gt = boundaries(label, indexOf);
  const pred = boundaries(ai, indexOf);
  // 같은 이름이 두 번 나오면 AI가 "야외 1"·"야외 2"로 번호를 붙인다 — 이름 정확도는 번호를 떼고 비교한다.
  const base = (name: string | null) => name?.replace(/ \d+$/, "") ?? null;
  const aiName = new Map(ai.flatMap((scene) => scene.photoIds.map((id) => [id, base(scene.name)] as const)));
  const named = label.flatMap((scene) => (scene.name ? scene.photoIds.map((id) => [id, base(scene.name)] as const) : []));
  return {
    boundaryPrecision: pred.length ? matched(pred, gt) / pred.length : gt.length ? 0 : 1,
    boundaryRecall: gt.length ? matched(gt, pred) / gt.length : 1,
    nameAccuracy: named.length ? named.filter(([id, name]) => aiName.get(id) === name).length / named.length : 1,
    aiSceneCount: ai.length,
    labelSceneCount: label.length,
  };
}
