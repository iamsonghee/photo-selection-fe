export function redistributeSceneTargets(weights: readonly number[], excluded: ReadonlySet<number>, total: number) {
  const active = weights.map((weight, index) => ({ index, weight })).filter(({ index }) => !excluded.has(index));
  const weightTotal = active.reduce((sum, item) => sum + item.weight, 0);
  if (!active.length || !weightTotal) return weights.map(() => 0);
  const exact = active.map((item) => ({ ...item, value: total * item.weight / weightTotal }));
  const result = weights.map(() => 0);
  exact.forEach(({ index, value }) => { result[index] = Math.floor(value); });
  const remaining = total - result.reduce((sum, value) => sum + value, 0);
  exact.sort((a, b) => (b.value % 1) - (a.value % 1) || a.index - b.index);
  for (let index = 0; index < remaining; index++) result[exact[index].index] += 1;
  return result;
}

export function sceneTargetsWithEdits(weights: readonly number[], excluded: ReadonlySet<number>, total: number, edits: Record<number, number>) {
  const active = weights.map((weight, index) => weight > 0 && !excluded.has(index) ? index : -1).filter(index => index >= 0);
  const remainderScene = active.at(-1);
  const result = weights.map(() => 0);
  let remaining = total;
  for (const index of active) {
    if (index === remainderScene || edits[index] === undefined) continue;
    result[index] = Math.min(remaining, Math.max(0, edits[index]));
    remaining -= result[index];
  }
  const fixed = new Set([...excluded, ...active.filter(index => index !== remainderScene && edits[index] !== undefined)]);
  const automatic = redistributeSceneTargets(weights, fixed, remaining);
  return result.map((count, index) => count + automatic[index]);
}
