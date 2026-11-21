export const MAX_UPLOAD_SIZE = 4 * 1024 * 1024;
export const UPLOAD_SIZE_ERROR = 'File must be 4 MB or smaller';
export function uploadSizeError(file?: {size: number} | null) {
  return file && file.size > MAX_UPLOAD_SIZE ? UPLOAD_SIZE_ERROR : '';
}
