-- selections 테이블에 "최종 선택 여부"를 별도 컬럼으로 분리.
--
-- 기존에는 별점/컬러태그/코멘트만 남겨도(고객이 선택 체크박스를 누르지 않아도)
-- selections 행이 생성되어, 이 행의 존재 자체가 "선택됨"으로 취급됐다.
-- 그 결과 고객이 후보 사진에 별점만 매겨도 선택 개수(N)에 포함되어,
-- 실제로 체크한 장수와 화면에 표시되는 선택 개수가 어긋나 확정 버튼이
-- 활성화되지 않는 문제가 있었다.
--
-- is_selected를 명시적 플래그로 분리해 "메타데이터(별점/색상/코멘트) 저장"과
-- "최종 선택"을 독립적으로 다룬다.
ALTER TABLE public.selections
  ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT false;

-- 기존 행은 모두 현재 화면에 보이는 선택 상태를 그대로 유지하기 위해 true로 백필.
UPDATE public.selections SET is_selected = true WHERE is_selected IS DISTINCT FROM true;
