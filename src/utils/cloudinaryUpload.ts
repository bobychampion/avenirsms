/**
 * cloudinaryUpload.ts
 *
 * Client-side unsigned upload to Cloudinary.
 * No API secret is used — an unsigned upload preset must be configured
 * in your Cloudinary dashboard (Settings → Upload → Upload presets → unsigned).
 *
 * Usage:
 *   const url = await uploadToCloudinary(file, 'my-cloud', 'my_unsigned_preset');
 */

export async function uploadToCloudinary(
  file: File,
  cloudName: string,
  uploadPreset: string
): Promise<string> {
  if (!cloudName || !uploadPreset) {
    throw new Error(
      'Cloudinary is not configured. Please add your Cloud Name and Upload Preset in School Settings → Media & Uploads.'
    );
  }

  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', uploadPreset);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: fd }
  );

  const data = await res.json();

  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message || 'Cloudinary upload failed. Check your cloud name and upload preset.');
  }

  return data.secure_url as string;
}
