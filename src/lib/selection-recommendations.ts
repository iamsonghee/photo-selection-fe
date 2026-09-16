/** Existing customer choices win; never partially apply an oversized recommendation. */
export function planRecommendationSelection(selected: ReadonlySet<string>, recommended: readonly string[], limit: number) {
  const additions = [...new Set(recommended)].filter((id) => !selected.has(id));
  return { additions, fits: limit > 0 && selected.size + additions.length <= limit };
}
