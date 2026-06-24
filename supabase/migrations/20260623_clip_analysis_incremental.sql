-- AI 유사컷 분석을 증분 처리하기 위한 진행 기준점 컬럼.
-- clip-service가 매번 프로젝트의 모든 사진을 재다운로드/재임베딩하던 것을, 마지막으로
-- 분석을 마친 시점(photos.number 기준)보다 뒤에 추가된 사진만 분석하도록 바꾼다.
-- 사진 삭제나 임계값 변경으로 기준점이 깨지면 안전하게 전체 재분석으로 폴백한다(analyzer.py).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS clip_analysis_last_number INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS clip_analysis_threshold NUMERIC(5,4);
