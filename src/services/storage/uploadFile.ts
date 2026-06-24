import { UploadResult, StorageProviderName } from '../../types';
import { StorageProviderAdapter } from './StorageProviderAdapter';
import { cloudinaryClientProvider } from './cloudinaryClientProvider';

const ADAPTERS: Partial<Record<StorageProviderName, StorageProviderAdapter>> = {
  cloudinary: cloudinaryClientProvider,
  // firebase / s3 / supabase: add an adapter here once implemented —
  // every call site below stays the same.
};

export interface UploadFileParams {
  schoolId: string;
  file: File;
  /** e.g. 'students', 'documents', 'logos', 'certificates', 'assignments' */
  folder: string;
  provider?: StorageProviderName;
}

/**
 * Reusable upload entry point for the whole app. Resolves which provider a
 * school has connected (defaulting to cloudinary, the only provider
 * implemented today) and delegates to its adapter.
 */
export async function uploadFile({
  schoolId,
  file,
  folder,
  provider = 'cloudinary',
}: UploadFileParams): Promise<UploadResult> {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`No storage adapter registered for provider "${provider}".`);
  }
  return adapter.upload({ schoolId, file, folder });
}

export async function deleteFile(
  schoolId: string,
  publicId: string,
  provider: StorageProviderName = 'cloudinary'
): Promise<void> {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`No storage adapter registered for provider "${provider}".`);
  }
  return adapter.delete(schoolId, publicId);
}
