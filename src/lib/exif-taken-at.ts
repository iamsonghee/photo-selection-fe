/**
 * 원본 JPEG·HEIC의 EXIF 촬영 시각(DateTimeOriginal)을 읽는다. 업로드 압축(canvas 재인코딩)이 EXIF를
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

/**
 * HEIC/HEIF(ISOBMFF)에서 Exif 항목의 파일 내 위치. meta 박스의 iinf에서 Exif 항목 ID를 찾고 iloc으로
 * 위치를 얻는다 — 아이폰 HEIC는 meta가 파일 앞쪽에 있어 앞부분만 읽으면 된다. 못 찾으면 null.
 */
export function heifExifRange(bytes: Uint8Array): { offset: number; length: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const children = (start: number, end: number) => {
    const list: { type: string; body: number; end: number }[] = [];
    for (let at = start; at + 8 <= end;) {
      let size = view.getUint32(at);
      let header = 8;
      if (size === 1) {
        size = Number(view.getBigUint64(at + 8));
        header = 16;
      } else if (size === 0) size = end - at;
      if (size < header) break;
      list.push({ type: readAscii(bytes, at + 4, 4), body: at + header, end: Math.min(end, at + size) });
      at += size;
    }
    return list;
  };
  if (readAscii(bytes, 4, 4) !== "ftyp") return null;
  const meta = children(0, bytes.length).find((box) => box.type === "meta");
  if (!meta) return null;
  const metaChildren = children(meta.body + 4, meta.end); // meta는 FullBox(version+flags 4바이트)
  const iinf = metaChildren.find((box) => box.type === "iinf");
  const iloc = metaChildren.find((box) => box.type === "iloc");
  if (!iinf || !iloc) return null;

  let exifId: number | null = null;
  for (const infe of children(iinf.body + 4 + (bytes[iinf.body] === 0 ? 2 : 4), iinf.end)) {
    const version = bytes[infe.body];
    if (infe.type !== "infe" || version < 2) continue;
    const idSize = version === 2 ? 2 : 4;
    if (readAscii(bytes, infe.body + 4 + idSize + 2, 4) === "Exif") {
      exifId = idSize === 2 ? view.getUint16(infe.body + 4) : view.getUint32(infe.body + 4);
      break;
    }
  }
  if (exifId === null) return null;

  const version = bytes[iloc.body];
  let at = iloc.body + 4;
  const read = (size: number) => {
    const value = size === 8 ? Number(view.getBigUint64(at)) : size === 4 ? view.getUint32(at) : size === 2 ? view.getUint16(at) : 0;
    at += size;
    return value;
  };
  const offsetSize = bytes[at] >> 4;
  const lengthSize = bytes[at] & 15;
  const baseSize = bytes[at + 1] >> 4;
  const indexSize = version > 0 ? bytes[at + 1] & 15 : 0;
  at += 2;
  const count = read(version < 2 ? 2 : 4);
  for (let i = 0; i < count; i++) {
    const id = read(version < 2 ? 2 : 4);
    const method = version > 0 ? read(2) & 15 : 0;
    read(2); // data_reference_index
    const base = read(baseSize);
    const extents = Array.from({ length: read(2) }, () => {
      read(indexSize);
      return { offset: read(offsetSize), length: read(lengthSize) };
    });
    // 파일 오프셋(construction_method 0)·한 조각으로 저장된 경우만 읽는다 — 아이폰·일반 카메라 HEIC가 이 형태다.
    if (id === exifId) return method === 0 && extents.length === 1 ? { offset: base + extents[0].offset, length: extents[0].length } : null;
  }
  return null;
}

/** HEIF Exif 항목: 앞 4바이트가 TIFF 헤더까지의 거리, 그 뒤는 JPEG APP1과 같은 TIFF 구조. */
export function heifExifTakenAt(item: Uint8Array): string | null {
  if (item.length < 12) return null;
  const view = new DataView(item.buffer, item.byteOffset, item.byteLength);
  return readTiffDate(view, 4 + view.getUint32(0), item.length);
}

function readAscii(bytes: Uint8Array, start: number, length: number) {
  let text = "";
  for (let i = start; i < start + length && i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

export type TakenAtSource = "exif" | "file";
export type TakenAt = { takenAt: string | null; source: TakenAtSource | null };

/**
 * EXIF가 없거나(스크린샷 등) 읽지 못하면 원본 파일의 수정 시각으로 대신한다 — 정렬 참고용일 뿐이라
 * source를 "file"로 구분해 장면 경계에는 쓰지 않는다(카카오톡 등은 받은 시각이라 실제 촬영 시각과 다르다).
 */
export async function readTakenAt(file: File): Promise<TakenAt> {
  try {
    const bytes = new Uint8Array(await file.slice(0, EXIF_READ_BYTES).arrayBuffer());
    const exif = exifTakenAtFromBytes(bytes);
    if (exif) return { takenAt: exif, source: "exif" };
    const range = heifExifRange(bytes);
    if (range) {
      const heifExif = heifExifTakenAt(new Uint8Array(await file.slice(range.offset, range.offset + range.length).arrayBuffer()));
      if (heifExif) return { takenAt: heifExif, source: "exif" };
    }
  } catch {
    /* 읽기 실패 — 아래 수정 시각으로 대체 */
  }
  if (!file.lastModified) return { takenAt: null, source: null };
  const local = new Date(file.lastModified - new Date(file.lastModified).getTimezoneOffset() * 60_000);
  return { takenAt: local.toISOString().slice(0, 19), source: "file" };
}
