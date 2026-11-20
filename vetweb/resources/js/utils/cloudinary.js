// Diri i-compress ang image una i-upload.
export async function compressImageFile(file, { maxSize = 1200, quality = 0.8 } = {}) {
    if (!(file instanceof Blob) || !file.type?.startsWith('image/') || file.type === 'image/gif') {
        return file;
    }

    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));

        if (scale === 1 && file.size < 400_000) {
            bitmap.close?.();
            return file;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext('2d');
        if (!context) {
            bitmap.close?.();
            return file;
        }
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();

        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) {
            return file;
        }

        const name = typeof file.name === 'string' ? file.name.replace(/\.[^.]+$/, '.jpg') : 'photo.jpg';
        return new File([blob], name, { type: 'image/jpeg' });
    } catch {
        return file;
    }
}

// Diri i-upload ang image sa Cloudinary.
export async function uploadImageToCloudinary(file, { cloudName, uploadPreset } = {}) {
    const resolvedCloudName =
        cloudName || import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dlscihgvx';
    const resolvedUploadPreset =
        uploadPreset || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'vetmob';

    if (!resolvedCloudName || !resolvedUploadPreset) {
        throw new Error('Cloudinary is not configured.');
    }

    const formData = new FormData();
    formData.append('upload_preset', resolvedUploadPreset);
    formData.append('file', file);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${resolvedCloudName}/image/upload`, {
        method: 'POST',
        body: formData,
    });

    const data = await response.json();
    if (!response.ok || !data?.secure_url) {
        throw new Error(data?.error?.message || 'Image upload failed.');
    }

    return data.secure_url;
}
