/**
 * 셀프 고객 셀렉의 "장면": 촬영 시각 사이에 큰 공백이 생기는 지점에서 사진을 나눈다.
 * 장면 이름은 붙이지 않고 시간대로 보여준다 — 공백만으로는 "예식"·"폐백" 같은 의미를
 * 알 수 없어서, 틀린 이름보다 실제 시간이 더 정확하다.
 */

export type ScenePhoto = { id: string; orderIndex: number; takenAt?: string | null; takenAtSource?: "exif" | "file" | null };
export type Scene = { index: number; photoIds: string[]; start: string | null; end: string | null };

// ponytail: 고정 임계값 휴리스틱. 실제 촬영 데이터로 장면 경계가 어긋나면 이 값들부터 조정한다.
// 3분: 행사 스냅(돌잔치 등)은 쉬지 않고 찍다가 순서가 바뀔 때만 3~10분 쉰다. 공백이 많으면 MAX_SCENES 안에서 큰 공백부터 자른다.
const SCENE_GAP_MS = 3 * 60_000;
const MIN_SCENE_PHOTOS = 10;
const MAX_SCENES = 8;
const MIN_PHOTOS_FOR_SCENES = 20;
const MIN_TIMED_RATIO = 0.8;

const time = (value: string) => Date.parse(`${value}Z`);
/** 장면 경계에 쓸 수 있는 촬영 시각. 파일 수정 시각("file")은 실제 촬영 시각이 아니라 뺀다(출처 기록 전 사진은 그대로 쓴다). */
const sceneTime = (photo: ScenePhoto) => (photo.takenAtSource === "file" ? null : photo.takenAt ?? null);

/** 장면으로 나눌 근거가 부족하면(사진이 적거나 촬영 시각 대부분이 없으면) null. */
export function splitScenes(photos: readonly ScenePhoto[]): Scene[] | null {
  const timed = photos.filter((photo) => sceneTime(photo) && !Number.isNaN(time(sceneTime(photo)!)));
  if (photos.length < MIN_PHOTOS_FOR_SCENES || timed.length < photos.length * MIN_TIMED_RATIO) return null;

  const sorted = timed.slice().sort((a, b) => time(sceneTime(a)!) - time(sceneTime(b)!) || a.orderIndex - b.orderIndex);
  const cuts = sorted
    .map((photo, index) => ({ index, gap: index === 0 ? 0 : time(sceneTime(photo)!) - time(sceneTime(sorted[index - 1])!) }))
    .filter((item) => item.gap >= SCENE_GAP_MS)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, MAX_SCENES - 1)
    .map((item) => item.index)
    .sort((a, b) => a - b);

  const ranges: ScenePhoto[][] = [];
  let start = 0;
  for (const cut of [...cuts, sorted.length]) {
    const range = sorted.slice(start, cut);
    start = cut;
    // 너무 작은 장면은 바로 앞 장면에 붙인다(첫 장면이면 아래에서 다음 장면과 합친다).
    if (range.length < MIN_SCENE_PHOTOS && ranges.length) ranges[ranges.length - 1].push(...range);
    else ranges.push(range);
  }
  if (ranges.length > 1 && ranges[0].length < MIN_SCENE_PHOTOS) ranges.splice(0, 2, [...ranges[0], ...ranges[1]]);

  const untimed = photos.filter((photo) => !timed.includes(photo)).sort((a, b) => a.orderIndex - b.orderIndex);
  const scenes: Scene[] = ranges.map((range, index) => ({
    index,
    photoIds: range.map((photo) => photo.id),
    start: sceneTime(range[0]),
    end: sceneTime(range[range.length - 1]),
  }));
  if (untimed.length) scenes.push({ index: scenes.length, photoIds: untimed.map((photo) => photo.id), start: null, end: null });
  return scenes;
}

/** 목표 장수를 장면별 사진 수 비율로 나눈다(최대 잔여 방식 — 합계가 정확히 total). */
export function sceneTargets(counts: readonly number[], total: number): number[] {
  const sum = counts.reduce((acc, count) => acc + count, 0);
  if (!sum || total <= 0) return counts.map(() => 0);
  const exact = counts.map((count) => (total * count) / sum);
  const result = exact.map(Math.floor);
  let remaining = total - result.reduce((acc, value) => acc + value, 0);
  const order = exact.map((value, index) => ({ index, rest: value % 1 })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (remaining-- <= 0) break;
    result[index] += 1;
  }
  return result;
}

/** "오전 11:02" 형식. 시간대 없는 카메라 현지 시각 문자열을 그대로 해석한다. */
export function formatSceneClock(value: string | null): string {
  const match = value ? /T(\d{2}):(\d{2})/.exec(value) : null;
  if (!match) return "";
  const hour = Number(match[1]);
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 || 12}:${match[2]}`;
}

export function formatSceneRange(scene: Scene): string {
  if (!scene.start) return "촬영 시각 없음";
  const start = formatSceneClock(scene.start);
  const end = formatSceneClock(scene.end);
  return start === end ? start : `${start} – ${end.replace(/^(오전|오후) /, start.slice(0, 2) === end.slice(0, 2) ? "" : "$1 ")}`;
}
