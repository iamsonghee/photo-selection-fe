type CompressRequest = {
  id: number;
  file: File;
  maxEdge: number;
  jpegQuality: number;
};

self.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { id, file, maxEdge, jpegQuality } = event.data;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: jpegQuality });
    self.postMessage({ id, blob });
  } catch {
    self.postMessage({ id, blob: null });
  }
};
