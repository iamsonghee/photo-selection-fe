/**
 * 원본 JPEG의 EXIF 촬영 시각(DateTimeOriginal)을 읽는다. 업로드 압축(canvas 재인코딩)이 EXIF를
 * 지우므로 반드시 압축 전 원본 파일에서 호출한다. 시간대 정보가 없는 카메라 현지 시각이므로
 * "YYYY-MM-DDTHH:mm:ss" 형태(시간대 없음)로 돌려준다.
 */

const EXIF_READ_BYTES = 256 * 1024;

export function exifTakenAtFromBytes(bytes: Uint8Array): string | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) return null; // 이미지 데이터 시작 — EXIF 없음
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && readAscii(bytes, offset + 4, 6) === "Exif\0\0") {
      return readTiffDate(view, offset + 10, Math.min(bytes.length, offset + 2 + length));
    }
    offset += 2 + length;
  }
  return null;
}

function readTiffDate(view: DataView, tiff: number, end: number): string | null {
  if (tiff + 8 > end) return null;
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);

  const findTag = (ifdOffset: number, tag: number): number | null => {
    const ifd = tiff + ifdOffset;
    if (ifd + 2 > end) return null;
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > end) return null;
      if (u16(entry) === tag) return entry;
    }
    return null;
  };
  const readDate = (entry: number | null): string | null => {
    if (entry === null || u32(entry + 4) < 19) return null;
    const at = tiff + u32(entry + 8);
    if (at + 19 > end) return null;
    const raw = readAscii(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), at, 19);
    const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(raw);
    if (!match || match[1] === "0000") return null;
    return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
  };

  const ifd0 = u32(tiff + 4);
  const exifPointer = findTag(ifd0, 0x8769);
  const original = exifPointer === null ? null : readDate(findTag(u32(exifPointer + 8), 0x9003));
  return original ?? readDate(findTag(ifd0, 0x0132));
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  let text = "";
  for (let i = start; i < start + length && i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

/** EXIF가 없거나(HEIC·스크린샷 등) 읽지 못하면 원본 파일의 수정 시각으로 대신한다. */
export async function readTakenAt(file: File): Promise<string | null> {
  try {
    const bytes = new Uint8Array(await file.slice(0, EXIF_READ_BYTES).arrayBuffer());
    const exif = exifTakenAtFromBytes(bytes);
    if (exif) return exif;
  } catch {
    /* 읽기 실패 — 아래 수정 시각으로 대체 */
  }
  if (!file.lastModified) return null;
  const local = new Date(file.lastModified - new Date(file.lastModified).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 19);
}
