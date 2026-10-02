/**
 * 셀프 고객 셀렉의 사진 칸 기준. 화면마다 칸 크기가 달라 보이지 않도록 여기 값만 쓴다.
 * - 갤러리(사진을 훑어보는 화면: 업로드·고르기·결과 보기): 정사각형, 모서리 8px, PC는 최소 너비로 열 수를 정하고 모바일은 3열.
 * - 요약 썸네일(검토 화면의 고른 사진 목록): 정사각형 112px — review.module.css `.grid`.
 */
export const CUSTOMER_GALLERY_GRID = {
  desktopMinCell: 180,
  desktopGap: 12,
  mobileCols: 3,
  mobileGap: 8,
};
