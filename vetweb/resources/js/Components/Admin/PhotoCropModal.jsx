import { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

// Diri i-crop ang image ug himuon nga file.
async function cropImageToFile(imageSrc, pixelCrop) {
    const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener('load', () => resolve(img));
        img.addEventListener('error', () => reject(new Error('Could not load the selected photo.')));
        img.src = imageSrc;
    });

    const sourceX = Math.max(0, Math.round(pixelCrop.x));
    const sourceY = Math.max(0, Math.round(pixelCrop.y));
    const sourceWidth = Math.max(1, Math.round(pixelCrop.width));
    const sourceHeight = Math.max(1, Math.round(pixelCrop.height));
    const outputSize = 600;

    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Could not crop the photo.');
    }

    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputSize, outputSize);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) {
        throw new Error('Could not crop the photo.');
    }

    return new File([blob], 'profile.jpg', { type: 'image/jpeg' });
}

// Diri ang modal sa pag-crop sa photo.
export default function PhotoCropModal({ imageSrc, onCancel, onConfirm }) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Diri i-save ang pixel area sa na-crop nga photo.
    const onCropComplete = useCallback((_, areaPixels) => {
        setCroppedAreaPixels(areaPixels);
    }, []);

    // Diri i-confirm ang crop ug ipasa ang file.
    const handleConfirm = async () => {
        if (!imageSrc || !croppedAreaPixels || saving) return;
        setSaving(true);
        setError('');
        try {
            const file = await cropImageToFile(imageSrc, croppedAreaPixels);
            onConfirm(file);
        } catch (cropError) {
            setSaving(false);
            setError(cropError.message || 'Could not crop the photo.');
        }
    };

    if (!imageSrc) return null;

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={saving ? undefined : onCancel}
                aria-label="Close crop photo"
            />
            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
                <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Crop photo</h3>
                        <p className="mt-1 text-sm text-slate-500">Drag to move and use the slider to zoom.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                    >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="relative h-80 bg-slate-900">
                    <Cropper
                        image={imageSrc}
                        crop={crop}
                        zoom={zoom}
                        aspect={1}
                        cropShape="round"
                        showGrid={false}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onCropComplete={onCropComplete}
                    />
                </div>

                <div className="space-y-4 px-6 py-4">
                    <label className="block">
                        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Zoom</span>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.05}
                            value={zoom}
                            onChange={(event) => setZoom(Number(event.target.value))}
                            className="w-full accent-violet-700"
                        />
                    </label>
                    {error ? <p className="text-sm text-red-600">{error}</p> : null}
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => handleConfirm()}
                        disabled={saving || !croppedAreaPixels}
                        className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                        {saving ? 'Applying…' : 'Use photo'}
                    </button>
                </div>
            </div>
        </div>
    );
}
