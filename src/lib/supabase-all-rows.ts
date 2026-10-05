const PAGE = 1000; // PostgREST 최대 행 수 — 넘는 조회는 잘린다(셀프 고객 사진 한도 5,000장)

/** query(from, to): 정렬이 고정된 조회에 range를 붙여 돌려준다. PAGE씩 끝까지 읽고, 오류면 던진다. */
export async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}
