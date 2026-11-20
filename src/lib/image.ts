const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

/**
 * Validate and normalise an uploaded logo: decoded in the browser, scaled to fit
 * 800×400 and re-encoded as PNG (keeps transparency, works in jsPDF, small to store).
 * Re-encoding also strips any metadata or script content from the original file.
 */
export async function processLogo(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) throw new Error('Please choose a PNG, JPG, WebP or SVG image.');
  if (file.size > MAX_BYTES) throw new Error('The image is larger than 5 MB. Please choose a smaller file.');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('The image could not be read.'));
      el.src = url;
    });
    const w = img.naturalWidth || 800;
    const h = img.naturalHeight || 400;
    const scale = Math.min(800 / w, 400 / h, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(Math.round(w * scale), 1);
    canvas.height = Math.max(Math.round(h * scale), 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser could not process the image.');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
