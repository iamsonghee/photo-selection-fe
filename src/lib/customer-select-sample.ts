import type { ShootType } from "@/contexts/CustomerSelectDraftContext";

export const SHOOT_TYPES: { id: ShootType; label: string; scenes: readonly string[]; categories: readonly string[]; people: readonly string[] }[] = [
  { id: "ceremony", label: "웨딩 본식", scenes: ["식전·신부대기실", "입장과 예식", "축하와 퇴장", "원판·가족사진", "2부·폐백·피로연"], categories: ["식전", "입장", "예식", "행진·퇴장", "가족·단체사진", "피로연"], people: ["신부", "신랑", "부모님", "하객", "기타"] },
  { id: "wedding", label: "웨딩 촬영", scenes: ["첫 촬영 구간", "장소·의상 변화", "마지막 촬영 구간"], categories: ["장소·배경", "의상", "두 사람", "단독"], people: ["신부", "신랑", "함께", "기타"] },
  { id: "first_birthday", label: "돌잔치·백일잔치", scenes: ["행사 전 촬영", "가족사진", "행사 진행", "하객사진"], categories: ["행사 전", "가족사진", "행사 진행", "하객사진"], people: ["아이", "부모님", "가족", "하객", "기타"] },
  { id: "family", label: "아기·가족 촬영", scenes: ["첫 촬영 구간", "인물 구성 변화", "마지막 촬영 구간"], categories: ["장소", "의상", "인물 구성"], people: ["아이", "부모님", "가족", "기타"] },
  { id: "couple", label: "커플·개인 촬영", scenes: ["첫 촬영 구간", "장소·의상 변화", "마지막 촬영 구간"], categories: ["장소", "의상", "인물 구성"], people: ["두 사람", "단독", "기타"] },
  { id: "other", label: "기타 촬영", scenes: ["첫 촬영 구간", "중간 촬영 구간", "마지막 촬영 구간"], categories: ["시간순", "배경 변화"], people: ["주인공", "가족", "하객", "기타"] },
];

export const SELECT_SCENES = [
  { name: "식전·신부대기실", shortName: "식전·대기실", count: 900, target: 12, description: "신부대기실, 예식장 모습, 가족과 하객을 맞이하는 장면을 골고루 남겨보세요." },
  { name: "입장과 예식", shortName: "입장·예식", count: 2000, target: 24, description: "입장부터 서약과 반지 교환까지 예식의 중요한 흐름을 골라보세요." },
  { name: "축하와 퇴장", shortName: "축하·퇴장", count: 750, target: 9, description: "축사와 축가, 가족의 반응, 부모님 인사와 행진을 함께 살펴보세요." },
  { name: "원판·가족사진", shortName: "원판·가족", count: 900, target: 10, description: "양가 가족과 친척, 친구들이 빠지지 않았는지 확인해보세요." },
  { name: "2부·폐백·피로연", shortName: "2부·폐백", count: 450, target: 5, description: "2부와 폐백, 피로연을 촬영했다면 기억하고 싶은 장면을 골라보세요." },
] as const;

const people = ["신부", "신랑", "부모님", "신부", "신랑", "하객", "신부", "부모님", "신랑", "신부", "하객", "부모님", "신랑", "신부"] as const;
const compositions = ["클로즈업", "전신", "가로", "클로즈업", "전신", "가로", "전신", "클로즈업", "가로", "전신", "클로즈업", "가로", "전신", "클로즈업"] as const;

export const SELECT_PHOTOS = Array.from({ length: 14 }, (_, index) => ({
  id: `select-${index + 1}`,
  filename: `ACUT_${String(index + 1).padStart(4, "0")}.jpg`,
  src: `/landing/sample-project/studio-v2/originals/ACUT_${String(index + 1).padStart(4, "0")}.jpg`,
  person: people[index],
  composition: compositions[index],
  groupId: index < 9 ? `group-${Math.floor(index / 3) + 1}` : null,
  quality: index === 4 ? "눈 감음 의심" : index === 7 ? "흐림 의심" : null,
}));

export const SELECT_GROUPS = ["group-1", "group-2", "group-3"].map((id) => ({ id, photos: SELECT_PHOTOS.filter((photo) => photo.groupId === id) }));

export type SelectPhoto = { id: string; filename: string; src: string; person: string; composition: string; groupId: string | null; quality: string | null; relativePath?: string; capturedAt?: number; sourceSize?: number; categories?: string[] };

// 검수용 메타데이터 5,000건. 실제 이미지는 기존 샘플 14장을 반복하며 AI 결과가 아니다.
export const SELECT_TIMELINE = SELECT_SCENES.map((scene, sceneIndex) => {
  let offset = 0;
  let unit = 0;
  const groups: SelectPhoto[][] = [];
  while (offset < scene.count) {
    const size = Math.min([3, 1, 8, 2, 1, 30, 5][unit++ % 7], scene.count - offset);
    groups.push(Array.from({ length: size }, () => {
      const index = offset++;
      return { ...SELECT_PHOTOS[index % 14], id: `${sceneIndex}:photo-${index}`, filename: `ACUT_${sceneIndex + 1}_${String(index + 1).padStart(4, "0")}.jpg` };
    }));
  }
  return groups;
});
