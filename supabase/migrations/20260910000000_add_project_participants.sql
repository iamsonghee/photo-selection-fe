-- 고객 셀렉은 링크 + PIN을 신랑·신부 등 여러 사람이 함께 쓰는 구조라 서버가 요청자를 구분하지 못한다.
-- 그래서 사진 태그의 색(selections.color_tags)을 "참가자 슬롯"으로 재해석해 누가 찜했는지를 표현한다
-- (docs/customer-design.md §11). 어떤 색이 쓰이는지는 태그에서 역산할 수 있지만, 그 색이 "누구"인지를
-- 나타내는 이름은 어디에도 저장할 곳이 없어 기기 localStorage에만 남았고 다른 참가자에게는 보이지 않았다.
-- 이 테이블은 프로젝트별 (색 → 표시 이름) 명단만 공유 저장한다. 본인 확인 수단이 아니라 표시용 라벨이며,
-- 링크를 공유한 사이라는 전제 위에서 동작한다.
CREATE TABLE IF NOT EXISTS public.project_participants (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  color text NOT NULL CHECK (color IN ('red', 'yellow', 'green', 'blue', 'purple')),
  -- 화면에는 1~2글자만 노출하지만, 입력 오류로 요청이 실패하지 않도록 여유를 두고 자른다.
  nickname text NOT NULL DEFAULT '' CHECK (char_length(nickname) <= 20),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, color)
);

COMMENT ON TABLE public.project_participants IS
  'Per-project display names for customer participant color slots (see docs/customer-design.md 11).';
COMMENT ON COLUMN public.project_participants.color IS
  'Participant slot; matches the ColorTag values stored in selections.color_tags.';
COMMENT ON COLUMN public.project_participants.nickname IS
  'Short label shown next to that participant mark. Display only, not an identity claim.';

-- 모든 읽기/쓰기는 서버(service role)를 통해서만 수행한다.
ALTER TABLE public.project_participants ENABLE ROW LEVEL SECURITY;
