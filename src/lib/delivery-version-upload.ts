const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const MAX_FILE_BYTES = 100 * 1024 * 1024;
const DIRECT_UPLOAD_CONCURRENCY = 3;

export type DeliveryVersionUpload = {
  photo_id: string;
  key: string;
  filename: string;
  content_type: string;
  byte_size: number;
};

type PresignedItem = DeliveryVersionUpload & { url: string };

function inferredContentType(file: File): string {
  if (file.type) return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

export async function uploadDeliveryVersions(params: {
  projectId: string;
  version: 1 | 2;
  token: string;
  files: Array<{ photoId: string; file: File }>;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}): Promise<DeliveryVersionUpload[]> {
  for (const { file } of params.files) {
    if (file.size <= 0) throw new Error(`${file.name}: 비어 있는 파일입니다.`);
    if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name}: 보정본 한 장은 최대 100MB까지 업로드할 수 있습니다.`);
  }
  const response = await fetch(`${API_BASE}/api/upload/versions/delivery/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.token}` },
    body: JSON.stringify({
      project_id: params.projectId,
      version: params.version,
      items: params.files.map(({ photoId, file }) => ({
        photo_id: photoId,
        filename: file.name,
        content_type: inferredContentType(file),
        byte_size: file.size,
      })),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { items?: PresignedItem[]; detail?: string };
  if (!response.ok || !payload.items || payload.items.length !== params.files.length) {
    throw new Error(typeof payload.detail === "string" ? payload.detail : "납품용 보정본 업로드를 준비하지 못했습니다.");
  }

  const fileByPhoto = new Map(params.files.map((item) => [item.photoId, item.file]));
  const totalBytes = params.files.reduce((sum, item) => sum + item.file.size, 0);
  let uploadedBytes = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < payload.items!.length) {
      const item = payload.items![cursor++];
      const file = fileByPhoto.get(item.photo_id);
      if (!file) throw new Error("업로드 파일 매핑이 변경되었습니다.");
      const put = await fetch(item.url, {
        method: "PUT",
        headers: { "Content-Type": item.content_type },
        body: file,
      });
      if (!put.ok) throw new Error(`${file.name}: 원본 크기 보정본 업로드에 실패했습니다.`);
      uploadedBytes += file.size;
      params.onProgress?.(uploadedBytes, totalBytes);
    }
  }
  const resultItems = payload.items.map((item) => ({
    photo_id: item.photo_id,
    key: item.key,
    filename: item.filename,
    content_type: item.content_type,
    byte_size: item.byte_size,
  }));
  try {
    await Promise.all(Array.from({ length: Math.min(DIRECT_UPLOAD_CONCURRENCY, payload.items.length) }, worker));
  } catch (error) {
    await abandonDeliveryVersions({
      projectId: params.projectId, version: params.version, token: params.token, items: resultItems,
    });
    throw error;
  }
  return resultItems;
}

export async function abandonDeliveryVersions(params: {
  projectId: string; version: 1 | 2; token: string; items: DeliveryVersionUpload[];
}): Promise<void> {
  if (params.items.length === 0) return;
  await fetch(`${API_BASE}/api/upload/versions/delivery/abandon`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.token}` },
    body: JSON.stringify({
      project_id: params.projectId,
      version: params.version,
      keys: params.items.map((item) => item.key),
    }),
  }).catch(() => {});
}
