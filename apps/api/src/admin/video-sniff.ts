/** Max size of an admin video upload (independent of environment configuration). */
export const MEDIA_UPLOAD_MAX_BYTES = 500 * 1024 * 1024;

export interface SniffedVideo {
  format: 'WEBM' | 'MP4';
  ext: 'webm' | 'mp4';
  mimeType: 'video/webm' | 'video/mp4';
}

const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

/**
 * Identifies a video container by its magic bytes (client-supplied names/types are never trusted).
 * WebM/Matroska starts with the EBML header `1A 45 DF A3`; MP4 (ISO-BMFF) has `ftyp` at byte 4.
 */
export function sniffVideo(head: Buffer): SniffedVideo | null {
  if (head.length >= 4 && head.subarray(0, 4).equals(EBML_MAGIC)) {
    return { format: 'WEBM', ext: 'webm', mimeType: 'video/webm' };
  }
  if (head.length >= 8 && head.subarray(4, 8).toString('latin1') === 'ftyp') {
    return { format: 'MP4', ext: 'mp4', mimeType: 'video/mp4' };
  }
  return null;
}
