/**
 * 셀프 고객 셀렉의 "장면": 촬영 시각 사이에 큰 공백이 생기는 지점에서 사진을 나눈다.
 * 장면 이름은 붙이지 않고 시간대로 보여준다 — 공백만으로는 "예식"·"폐백" 같은 의미를
 * 알 수 없어서, 틀린 이름보다 실제 시간이 더 정확하다.
 */

export type ScenePhoto = { id: string; orderIndex: number; takenAt?: string | null; takenAtSource?: "exif" | "file" | null };
export type Scene = { index: number; photoIds: string[]; start: string | null; end: string | null };

// ponytail: 고정 임계값 휴리스틱. 실제 촬영 데이터로 장면 경계가 어긋나면 이 값들부터 조정한다.
// 3분: 행사 스냅(돌잔치 등)은 쉬지 않고 찍다가 순서가 바뀔 때만 3~10분 쉰다. 공백이 많으면 장면 상한(maxScenes) 안에서 큰 공백부터 자른다.
const SCENE_GAP_MS = 3 * 60_000;
const MIN_SCENE_PHOTOS = 10;
// 장면 상한: 사진 40장당 1개(최소 8, 최대 30) — Python `max_scenes`와 같은 규칙. 고정 8개는 1,572장 홈스냅(장소 12곳)에서 막혔다.
const maxScenes = (photoCount: number) => Math.min(30, Math.max(8, Math.floor(photoCount / 40)));
export const MIN_PHOTOS_FOR_SCENES = 100;
const MIN_TIMED_RATIO = 0.8;
// 이보다 짧은 공백은 "이어진 촬영": 작은 장면은 공백이 더 짧은 이웃에 붙이되, 양쪽(첫·마지막 장면은 한쪽) 공백이
// 모두 이 이상이면 작아도 따로 둔다(입장·케이크 커팅처럼 짧은 장면).
const CLOSE_GAP_MS = 10 * 60_000;
// 따로 떨어져 있어도 이보다 적으면(한두 장 튄 사진) 장면으로 두지 않고 가까운 쪽에 붙인다.
const MIN_ISOLATED_PHOTOS = 3;

const time = (value: string) => Date.parse(`${value}Z`);
/** 장면 경계에 쓸 수 있는 촬영 시각. 파일 수정 시각("file")은 실제 촬영 시각이 아니라 뺀다(출처 기록 전 사진은 그대로 쓴다). */
export const sceneTime = (photo: Pick<ScenePhoto, "takenAt" | "takenAtSource">) => (photo.takenAtSource === "file" ? null : photo.takenAt ?? null);

// 파일명 연번 — clip-service `scenes._filename_sequence`와 같은 규칙(값도 같게 유지).
const FILENAME_MIN_DIGITS = 4;
const FILENAME_LEADING_MAX_DIGITS = 6;
const FILENAME_MAX_SPAN_FACTOR = 10;

/**
 * 파일명마다 순서 번호. 하나의 촘촘한 연번으로 읽히지 않으면 null.
 * 1) 숫자가 한 묶음뿐인 이름(`IMG_0001.jpg`) — 앞뒤 글자까지 같은 체계. 2) 앞에 붙인 연번(`0001_SJ7_3213.jpg`) — 앞 4~6자리가 같은 자릿수
 * (휴대폰 이름 `20261008_…`의 8자리 날짜는 제외). 번호가 겹치거나 범위가 사진 수의 10배를 넘으면 null.
 */
export function filenameSequence(names: readonly string[]): number[] | null {
  if (!names.length) return null;
  const single = names.map((name) => name.match(new RegExp(`^(\\D*)(\\d{${FILENAME_MIN_DIGITS},})(\\D*)$`)));
  let signatures: Set<string>;
  let numbers: number[];
  if (single.every(Boolean)) {
    signatures = new Set(single.map((m) => `${m![1].toLowerCase()}|${m![2].length}|${m![3].toLowerCase()}`));
    numbers = single.map((m) => Number(m![2]));
  } else {
    const leading = names.map((name) => name.match(new RegExp(`^(\\d{${FILENAME_MIN_DIGITS},${FILENAME_LEADING_MAX_DIGITS}})\\D`)));
    if (!leading.every(Boolean)) return null;
    signatures = new Set(leading.map((m) => String(m![1].length)));
    numbers = leading.map((m) => Number(m![1]));
  }
  if (signatures.size !== 1 || new Set(numbers).size !== numbers.length
    || Math.max(...numbers) - Math.min(...numbers) > names.length * FILENAME_MAX_SPAN_FACTOR) return null;
  return numbers;
}

export type OrderablePhoto = { orderIndex: number; takenAt?: string | null; takenAtSource?: "exif" | "file" | null; filename?: string | null };

/**
 * 촬영 순서 — clip-service `capture_order` + `content_order`와 같다. 촬영 시각(EXIF만, 파일 수정 시각 제외)이 있으면 시각순, 없는 사진은
 * 뒤에 업로드 순. 모든 사진에 촬영 시각이 없고 파일명이 하나의 연번이면 그 번호순(보정본은 업로드 순서가 섞일 수 있다 — 2026-10-15
 * 본식 보정본이 역순으로 올라가 장면 안 사진이 거꾸로 보였다). view: 항목 → 순서에 쓰는 값.
 */
export function captureOrder<T>(items: readonly T[], view: (item: T) => OrderablePhoto): T[] {
  const rows = items.map((item) => ({ item, photo: view(item) }));
  if (!rows.some(({ photo }) => sceneTime(photo))) {
    const numbers = filenameSequence(rows.map(({ photo }) => photo.filename ?? ""));
    if (numbers) return rows.map((row, i) => ({ ...row, n: numbers[i] })).sort((a, b) => a.n - b.n).map(({ item }) => item);
  }
  return rows.sort((a, b) => {
    const ta = sceneTime(a.photo), tb = sceneTime(b.photo);
    return (ta === null ? 1 : 0) - (tb === null ? 1 : 0) || (ta ?? "").localeCompare(tb ?? "") || a.photo.orderIndex - b.photo.orderIndex;
  }).map(({ item }) => item);
}

const gapBetween = (before: ScenePhoto[], after: ScenePhoto[]) => time(sceneTime(after[0])!) - time(sceneTime(before[before.length - 1])!);

/** 작은 장면을 공백이 더 짧은 이웃에 붙인다(같으면 앞). 양쪽 공백이 모두 CLOSE_GAP 이상이면 그대로 둔다. Python `_merge_small`과 같은 규칙. */
function mergeSmall(ranges: ScenePhoto[][]): ScenePhoto[][] {
  for (let merged = true; merged && ranges.length > 1;) {
    merged = false;
    for (let i = 0; i < ranges.length; i++) {
      const part = ranges[i];
      if (part.length >= MIN_SCENE_PHOTOS) continue;
      const before = i > 0 ? gapBetween(ranges[i - 1], part) : null;
      const after = i < ranges.length - 1 ? gapBetween(part, ranges[i + 1]) : null;
      if (part.length >= MIN_ISOLATED_PHOTOS && [before, after].every((gap) => gap === null || gap >= CLOSE_GAP_MS)) continue;
      const j = after === null || (before !== null && before <= after) ? i - 1 : i + 1;
      const lo = Math.min(i, j);
      ranges.splice(lo, 2, [...ranges[lo], ...ranges[lo + 1]]);
      merged = true;
      break;
    }
  }
  return ranges;
}

/** 장면으로 나눌 근거가 부족하면(사진이 적거나 촬영 시각 대부분이 없으면) null. gapMs: 촬영 종류별 경계 공백(`customerSceneGapSeconds`). */
export function splitScenes(photos: readonly ScenePhoto[], gapMs = SCENE_GAP_MS): Scene[] | null {
  const timed = photos.filter((photo) => sceneTime(photo) && !Number.isNaN(time(sceneTime(photo)!)));
  if (photos.length < MIN_PHOTOS_FOR_SCENES || timed.length < photos.length * MIN_TIMED_RATIO) return null;

  const sorted = timed.slice().sort((a, b) => time(sceneTime(a)!) - time(sceneTime(b)!) || a.orderIndex - b.orderIndex);
  const cuts = sorted
    .map((photo, index) => ({ index, gap: index === 0 ? 0 : time(sceneTime(photo)!) - time(sceneTime(sorted[index - 1])!) }))
    .filter((item) => item.gap >= gapMs)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, maxScenes(photos.length) - 1)
    .map((item) => item.index)
    .sort((a, b) => a - b);

  const bounds = [0, ...cuts, sorted.length];
  const ranges = mergeSmall(bounds.slice(1).map((end, index) => sorted.slice(bounds[index], end)));

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
