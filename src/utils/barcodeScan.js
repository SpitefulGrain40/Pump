// Uses the native BarcodeDetector when available (Chrome/Android), else zxing.
export async function detectBarcodeFromImage(bitmapSource) {
  if ('BarcodeDetector' in window) {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    const codes = await detector.detect(bitmapSource);
    return codes[0]?.rawValue || null;
  }
  const { BrowserMultiFormatReader } = await import('@zxing/library');
  const reader = new BrowserMultiFormatReader();
  try {
    const result = await reader.decodeFromImageElement(bitmapSource);
    return result?.getText() || null;
  } catch { return null; }
}

// Convenience: detect a barcode in a base64 data URL. Returns the code or null,
// never throws — a missing/unsupported detector just means "no barcode here".
export async function detectBarcodeFromDataUrl(dataUrl) {
  try {
    if ('BarcodeDetector' in window) {
      const blob = await (await fetch(dataUrl)).blob();
      const bitmap = await createImageBitmap(blob);
      return await detectBarcodeFromImage(bitmap);
    }
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    return await detectBarcodeFromImage(img);
  } catch {
    return null;
  }
}
