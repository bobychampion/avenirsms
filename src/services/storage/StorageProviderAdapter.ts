import { UploadResult } from '../../types';

export interface UploadOptions {
  schoolId: string;
  file: File;
  /** Logical bucket within the school, e.g. 'students', 'documents', 'logos', 'certificates', 'assignments'. */
  folder: string;
}

/**
 * Common contract every storage provider implements. Cloudinary is the only
 * concrete adapter today; Firebase Storage / S3 / Supabase implementations
 * can be added later without changing any call site that uses uploadFile().
 */
export interface StorageProviderAdapter {
  upload(opts: UploadOptions): Promise<UploadResult>;
  delete(schoolId: string, publicId: string): Promise<void>;
  getUrl(publicId: string): string;
}
