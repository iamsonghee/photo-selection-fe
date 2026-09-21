export type UploadTimingSample = { milliseconds: number; photoCount: number };

export function estimateUploadRemainingSeconds(samples: UploadTimingSample[], remainingPhotos: number): number | null {
  const valid = samples.filter((sample) => sample.milliseconds > 0 && sample.photoCount > 0);
  if (remainingPhotos <= 0 || valid.length === 0) return null;
  const milliseconds = valid.reduce((sum, sample) => sum + sample.milliseconds, 0);
  const photos = valid.reduce((sum, sample) => sum + sample.photoCount, 0);
  return Math.ceil((milliseconds / photos) * remainingPhotos / 1000);
}

export function formatUploadRemainingTime(seconds: number): string {
  if (seconds < 60) return "1분 미만 남음";
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes < 60) return `약 ${minutes}분 남음`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `약 ${hours}시간 ${remainder}분 남음` : `약 ${hours}시간 남음`;
}
