/** 랜딩 전용 가상 촬영. 파일명·이미지·초기 상태는 모든 예시 화면이 이 데이터만 참조한다. */
// 화면 검토용 가상 수치. 운영 app_settings를 조회하지 않는다.
export const SAMPLE_PLAN_LIMITS = {
  generalMaxProjects: 1,
  generalMaxPhotosPerProject: 500,
  betaMaxProjectsTotal: 5,
  betaMaxPhotosPerProject: 2000,
} as const;

export const SAMPLE_PROJECT = {
  name: "민서와 지훈의 스튜디오 스냅",
  photoCount: 13,
  requiredCount: 4,
} as const;

const descriptions = [
  "따뜻한 배경에서 뒤에서 안고 미소 짓는 커플",
  "같은 포즈에서 함께 크게 웃는 커플",
  "눈을 감은 남성의 볼에 입 맞추는 커플",
  "같은 자리에서 볼을 맞대고 웃는 커플",
  "앉아서 머리를 맞대고 아래를 바라보는 커플",
  "같은 자리에서 머리를 기대고 웃는 커플",
  "꽃다발을 들고 서로 기대어 웃는 커플",
  "같은 꽃다발을 들고 카메라를 바라보는 커플",
  "흰 꽃을 들고 상대에게 기대어 차분히 바라보는 여성",
  "같은 흰 꽃을 들고 상대에게 기대어 미소 짓는 여성",
  "뒤에서 안긴 채 머리에 손을 올리고 장난치는 커플",
  "같은 포즈에서 윙크하며 웃는 커플",
  "나란히 누워 얼굴을 맞대고 웃는 커플",
  "서로 업고 카메라를 보며 크게 웃는 커플",
];
const selectedIndexes = [0, 5, 9, 12];
const comments: Record<number, string> = {
  0: "배경을 조금 밝게 해주세요.",
  2: "피부톤을 자연스럽고 따뜻하게 맞춰주세요.",
  6: "그늘진 얼굴을 조금 밝게 해주세요.",
  9: "배경의 노란 기운을 조금 줄여주세요.",
  5: "피부톤을 자연스럽고 따뜻하게 맞춰주세요.",
  12: "얼굴의 명암을 부드럽게 정리해 주세요.",
  3: "표정이 좋아서 후보로 남겨둘게요.",
  7: "꽃다발 사진은 7번을 최종 선택했어요.",
};

export const SAMPLE_PHOTOS = descriptions.map((description, index) => {
  const id = String(index + 1).padStart(2, "0");
  const filename = `ACUT_${String(index + 1).padStart(4, "0")}.jpg`;
  return {
    id, filename, description,
    originalSrc: `/landing/sample-project/studio-v2/originals/${filename}`,
    retouchedSrc: `/landing/sample-project/studio-v2/retouched/${filename}`,
    originalAvailable: true,
    retouchedAvailable: [0, 5, 9, 12].includes(index),
    width: [1280, 1280, 1067, 1067, 1280, 1280, 1280, 1280, 1093, 1093, 1280, 1280, 1280, 1600][index],
    height: [1280, 1280, 1600, 1600, 1280, 1280, 1599, 1599, 1600, 1600, 1280, 1280, 1596, 1067][index],
    objectPosition: index === 13 ? "20% 42%" : index === 6 || index === 7 ? "50% 15%" : "50% 42%",
    group: index === 13 ? "H" : String.fromCharCode(65 + Math.floor(index / 2)),
    selected: selectedIndexes.includes(index),
    rating: selectedIndexes.includes(index) ? 5 : [4, 3, 4, 2, 3, 4, 3, 2][index % 8],
    comment: comments[index] ?? "",
    likes: index === 0 || index === 3 ? ["민", "지"] : index % 2 === 0 ? ["민"] : ["지"],
  };
});
export const SAMPLE_SELECTED_PHOTOS = SAMPLE_PHOTOS.filter((photo) => photo.selected);
export function getSamplePhoto(id: string) {
  const photo = SAMPLE_PHOTOS.find((item) => item.id === id);
  if (!photo) throw new Error(`Unknown landing sample photo: ${id}`);
  return photo;
}
export function createSamplePhotoStates() {
  return Object.fromEntries(SAMPLE_PHOTOS.map((photo) => [photo.id, {
    selected: photo.selected, rating: photo.rating, comment: photo.comment, likes: [...photo.likes],
  }]));
}
