export interface SniffedImage {
  ext: 'png' | 'jpg' | 'webp' | 'gif';
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

/** Identifies an image by its magic bytes (the client-supplied type/name are never trusted). */
export function sniffImage(buf: Buffer): SniffedImage | null {
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString('latin1');
    if (head === 'GIF87a' || head === 'GIF89a') return { ext: 'gif', mime: 'image/gif' };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
/** `<userId>-<random>.<ext>` as stored under `avatars/`. */
export const AVATAR_FILE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[A-Za-z0-9_-]{8,64}\.(png|jpg|webp|gif)$/;
