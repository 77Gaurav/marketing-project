/**
 * Validation rules and helpers for Store Custom Creatives.
 * Supported media formats: PNG, JPEG, JPG, MP4, MKV.
 */

export const ACCEPTED_STORE_CREATIVE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'mp4', 'mkv'] as const;
export type AcceptedStoreCreativeExtension = (typeof ACCEPTED_STORE_CREATIVE_EXTENSIONS)[number];

export const ACCEPTED_STORE_CREATIVE_LABEL = 'PNG, JPG, JPEG, MP4, or MKV';

export const ACCEPTED_STORE_CREATIVE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'video/mp4',
  'video/x-matroska',
  'video/mkv',
  'video/webm',
  'video/quicktime',
]);

export const MAX_STORE_CREATIVE_BYTES = 500 * 1024 * 1024; // 500 MB

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase().trim() : '';
}

/**
 * Resolves a reliable MIME type given a filename and/or provided browser MIME type.
 * Browsers often report empty or generic "application/octet-stream" for MKV files.
 */
export function resolveCreativeMimeType(fileName: string, mimeType?: string): string {
  const ext = getFileExtension(fileName);

  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'mkv') return 'video/x-matroska';

  if (mimeType && mimeType.trim() && mimeType !== 'application/octet-stream') {
    return mimeType.toLowerCase().trim();
  }

  return 'application/octet-stream';
}

export function isAcceptedStoreCreative(fileName: string, mimeType?: string): boolean {
  const ext = getFileExtension(fileName);
  if (ACCEPTED_STORE_CREATIVE_EXTENSIONS.includes(ext as any)) {
    return true;
  }

  if (mimeType && ACCEPTED_STORE_CREATIVE_MIME_TYPES.has(mimeType.toLowerCase().trim())) {
    return true;
  }

  return false;
}

export function isVideoCreative(fileName: string, mimeType?: string): boolean {
  const ext = getFileExtension(fileName);
  if (ext === 'mp4' || ext === 'mkv' || ext === 'webm' || ext === 'mov') {
    return true;
  }
  const resolved = resolveCreativeMimeType(fileName, mimeType);
  return resolved.startsWith('video/');
}

export function isImageCreative(fileName: string, mimeType?: string): boolean {
  const ext = getFileExtension(fileName);
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
    return true;
  }
  const resolved = resolveCreativeMimeType(fileName, mimeType);
  return resolved.startsWith('image/');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
