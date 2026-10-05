// Keep aligned with BE MAX_PHOTOS_PER_CUSTOMER_ACCOUNT until plan-specific limits exist.
export const CUSTOMER_PHOTO_LIMIT = 3000;

export function uploadLimitError(currentCount: number, selectedCount: number): string | null {
  const remaining = Math.max(0, CUSTOMER_PHOTO_LIMIT - currentCount);
  return selectedCount > remaining
    ? `${selectedCount.toLocaleString()}장을 선택했어요. 셀프 고객 전체에 현재 ${currentCount.toLocaleString()}장이 저장되어 있어, ${remaining.toLocaleString()}장까지 추가할 수 있어요. 업로드하지 않았습니다. 파일을 다시 선택해 주세요.`
    : null;
}

// BE가 저장하는 가장 큰 이미지(미리보기)가 1200px이라 더 크게 보내도 BE가 줄여서 버린다. AI 분석도 이 미리보기를 쓴다.
export const CUSTOMER_UPLOAD_MAX_EDGE = 1200;
// 업로드는 브라우저→BE 직접(소유자 JWT). Vercel 함수를 거치면 본문 4.5MB 한도에 막힌다(413).
export const CUSTOMER_UPLOAD_API = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/customer-upload`;
