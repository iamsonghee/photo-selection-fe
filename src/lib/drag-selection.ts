export type SelectionRect = { left: number; top: number; width: number; height: number };

export function intersectsSelection(a: SelectionRect, b: SelectionRect) {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top;
}

export function selectGridPhotos(
  photos: readonly { id: string; isPending?: boolean; isUploading?: boolean }[],
  rect: SelectionRect,
  grid: { width: number; paddingX: number; paddingTop: number; gap: number; cols: number; rowHeight: number; leading: boolean },
  base: Iterable<string> = [],
) {
  const selected = new Set(base);
  const width = (grid.width - grid.paddingX * 2 - grid.gap * (grid.cols - 1)) / grid.cols;
  photos.forEach((photo, index) => {
    if (photo.isPending || photo.isUploading) return;
    const cell = index + (grid.leading ? 1 : 0);
    if (intersectsSelection(rect, {
      left: grid.paddingX + (cell % grid.cols) * (width + grid.gap),
      top: grid.paddingTop + Math.floor(cell / grid.cols) * grid.rowHeight,
      width, height: grid.rowHeight - grid.gap,
    })) selected.add(photo.id);
  });
  return selected;
}

export function selectPhotoRange(ids: readonly string[], fromId: string, toId: string, base: Iterable<string>) {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  const selected = new Set(base);
  if (from < 0 || to < 0) { selected.add(toId); return selected; }
  for (let index = Math.min(from, to); index <= Math.max(from, to); index++) selected.add(ids[index]);
  return selected;
}
