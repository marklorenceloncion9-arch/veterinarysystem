import { File as ExpoFile } from 'expo-file-system';
import { Platform } from 'react-native';

const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

// Diri andamon ang file para i-upload.
async function getFilePart(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') {
    return fetch(uri).then((res) => res.blob());
  }

  // Expo's global fetch only accepts Blob/File parts.
  // The RN { uri, type, name } object throws "Unsupported FormDataPart implementation".
  return new ExpoFile(uri);
}

// Diri i-upload ang litrato sa Cloudinary.
export async function uploadImageToCloudinary(uri: string): Promise<string> {
  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary env vars are missing.');
  }

  const fileName = uri.split('/').pop() || `upload-${Date.now()}.jpg`;
  const formData = new FormData();
  formData.append('upload_preset', uploadPreset);
  formData.append('file', await getFilePart(uri), fileName);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || 'Image upload failed');
  }

  return data.secure_url as string;
}
