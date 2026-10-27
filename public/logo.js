// Normalize any browser-decodable still image into a compact, square WebP/JPEG logo.
// No original files or untrusted SVG markup are persisted.
export const MAX_LOGO_BYTES = 100 * 1024;
export async function optimizeCompanyLogo(file, { decode = createImageBitmap, createCanvas = () => document.createElement('canvas') } = {}) {
  if (!(file instanceof Blob) || !file.type.startsWith('image/')) throw new TypeError('Kies een afbeeldingsbestand.');
  // Bound hostile decoded file input; the stored result is independently limited to 100 KB.
  if (!file.size || file.size > 50 * 1024 * 1024) throw new RangeError('Deze afbeelding is te groot om veilig te verwerken (maximaal 50 MB invoer).');
  let image;
  try {
    image = await decode(file);
    const width = image.width, height = image.height;
    if (!width || !height || width * height > 100_000_000) throw new RangeError('Afbeeldingsafmetingen zijn niet toegestaan.');
    const canvas = createCanvas();
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Afbeeldingsbewerking niet beschikbaar.');
    for (const size of [512, 384, 256, 192, 128, 96, 64]) {
      canvas.width = size; canvas.height = size;
      ctx.clearRect(0, 0, size, size);
      const side = Math.min(width, height);
      ctx.drawImage(image, (width-side)/2, (height-side)/2, side, side, 0, 0, size, size);
      for (const type of ['image/webp', 'image/jpeg']) {
        for (const quality of [0.85, 0.70, 0.55, 0.4, 0.25]) {
          const blob = await new Promise(resolve => canvas.toBlob(resolve, type, quality));
          if (blob && blob.size <= MAX_LOGO_BYTES && blob.size > 0 && blob.type === type) {
            return await new Promise((resolve,reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error('Logo kon niet worden gelezen.'));
              reader.readAsDataURL(blob);
            });
          }
        }
      }
    }
    throw new Error('Logo kon niet tot 100 KB worden verkleind.');
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new Error('Dit afbeeldingsformaat kan je browser niet verwerken.');
  } finally {
    image?.close?.();
  }
}
