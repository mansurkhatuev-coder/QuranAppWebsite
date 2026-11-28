// Only bounded, tree-scoped image objects may be returned by the authenticated photo endpoint.
export const MAX_PHOTO_BYTES = 900_000;
// The tree creation wizard can assign a Cyrillic ID to the first person.
export const photoPersonIdPattern = /^[A-Za-z0-9А-Яа-яЁё][A-Za-z0-9А-Яа-яЁё._-]{0,80}$/;
export function photoFileCandidates(personId, variant) {
  if (typeof personId !== 'string' || !photoPersonIdPattern.test(personId)) return [];
  if (variant === 'thumbnail') return [personId + '-thumb.jpg', personId + '-thumb.webp', personId + '.jpg'];
  if (variant === 'full') return [personId + '.jpg'];
  return [];
}
export function photoMediaType(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > MAX_PHOTO_BYTES) return null;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 &&
      bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80) return 'image/webp';
  return null;
}
export function decodeGithubPhoto(file, decode = atob) {
  if (file?.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') return null;
  const base64 = file.content.replace(/\s/g, '');
  const size = Number(file.size);
  if (!Number.isInteger(size) || size < 12 || size > MAX_PHOTO_BYTES ||
      base64.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) return null;
  try {
    const binary = decode(base64);
    if (binary.length !== size) return null;
    const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
    const contentType = photoMediaType(bytes);
    return contentType ? { contentType, contentBase64: base64 } : null;
  } catch {
    return null;
  }
}
