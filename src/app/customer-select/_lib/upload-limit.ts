// Keep aligned with BE MAX_PHOTOS_PER_CUSTOMER_PROJECT until plan-specific limits exist.
export const CUSTOMER_PHOTO_LIMIT = 2000;

export function uploadLimitError(currentCount: number, selectedCount: number): string | null {
  const remaining = Math.max(0, CUSTOMER_PHOTO_LIMIT - currentCount);
  return selectedCount > remaining
    ? `${selectedCount.toLocaleString()}장을 선택했어요. 현재 ${currentCount.toLocaleString()}장으로, ${remaining.toLocaleString()}장까지 추가할 수 있어요. 업로드하지 않았습니다. 파일을 다시 선택해 주세요.`
    : null;
}
