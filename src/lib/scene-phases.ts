/**
 * 웨딩 본식 장면 목록 표시: AI 장면을 "식 전 / 본식 / 식 후"로 묶고, 같은 묶음에서 다시 나오는 단계는 번호 대신 "(이어서)"로 적는다.
 * clip-service는 떨어져 다시 나온 같은 단계에 번호를 붙여 저장한다(`number_repeated`: "예식 2"). 번호만으로는 고객이 무엇이 다른지
 * 알 수 없어(2026-10-15 짱쭌 본식: 연출촬영 1~4, 예식 1~3) 화면에서만 바꾼다. 저장된 이름·관리자 검수 점수는 그대로다.
 * 묶음은 단계 순서로 정한다: 첫 본식 단계 앞은 식 전, 마지막 본식 단계 뒤는 식 후, 그 사이는 본식.
 * 그래서 연출촬영·원판처럼 식 전후에 모두 나오는 단계도 위치로 갈린다.
 */
export type ScenePhase = "pre" | "main" | "post";

export const SCENE_PHASE_LABELS: Record<ScenePhase, string> = { pre: "식 전", main: "본식", post: "식 후" };
export const CONTINUED_SCENE_SUFFIX = " (이어서)";

/** 저장된 이름에서 clip-service가 붙인 반복 번호(" 2")를 뗀 단계 이름. 목록에 없는 이름(새로 올린 사진 등)은 그대로. */
export function baseSceneName(name: string, catalog: readonly string[]): string {
  const match = name.match(/^(.*) (\d+)$/);
  return match && catalog.includes(match[1]) ? match[1] : name;
}

/**
 * scenes: 시간 순서의 장면(이름은 저장된 그대로). catalog: 촬영 유형의 단계 목록, mainStages: 그중 본식 단계.
 * 반환: 같은 순서·같은 객체 모양에 표시 이름과 묶음(phase)을 더한 장면. 목록에 없는 이름이나 이름 없는 장면은 묶음 없이 그대로.
 * 본식 단계가 하나도 없으면 묶지 않고 "(이어서)" 표기만 적용한다.
 */
export function phaseScenes<T extends { name: string | null }>(scenes: readonly T[], catalog: readonly string[],
  mainStages: readonly string[]): (T & { phase?: ScenePhase })[] {
  const bases = scenes.map((scene) => (scene.name ? baseSceneName(scene.name, catalog) : null));
  const known = bases.map((base) => base !== null && catalog.includes(base));
  const mains = bases.flatMap((base, index) => (known[index] && mainStages.includes(base!) ? [index] : []));
  const seen = new Set<string>();
  return scenes.map((scene, index) => {
    if (!known[index]) return { ...scene };
    const base = bases[index]!;
    const phase: ScenePhase | undefined = !mains.length ? undefined
      : index < mains[0] ? "pre" : index > mains[mains.length - 1] ? "post" : "main";
    const key = `${phase ?? ""}:${base}`;
    const name = seen.has(key) ? `${base}${CONTINUED_SCENE_SUFFIX}` : base;
    seen.add(key);
    return phase ? { ...scene, name, phase } : { ...scene, name };
  });
}
