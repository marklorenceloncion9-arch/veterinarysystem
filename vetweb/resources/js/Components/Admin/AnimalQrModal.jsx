import { QRCodeSVG } from 'qrcode.react';
import { buildAnimalQrPayload } from '@/utils/animalQr';

// Diri ang modal nga nagpakita sa QR code sa hayop.
export default function AnimalQrModal({ open, animal, ownerId, onClose }) {
    if (!open || !animal) return null;

    const qrValue = buildAnimalQrPayload(animal, ownerId);
    const speciesLabel = animal.species?.species_name || animal.species_name || '-';
    const breedLabel = animal.breed?.breed_name || animal.breed_name || '-';

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <button
                type="button"
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                onClick={onClose}
                aria-label="Close QR modal"
            />
            <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900">Animal QR Code</h3>
                        <p className="text-sm text-slate-500 mt-1 font-medium">{animal.pet_name}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="px-6 py-6 flex flex-col items-center">
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                        <QRCodeSVG value={qrValue} size={220} level="M" includeMargin />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-600 text-center">
                        {animal.identification_number
                            ? animal.identification_number
                            : animal.registration_status === 'exempt'
                                ? 'No ID needed'
                                : `ID #${animal.id}`} · {speciesLabel} · {breedLabel}
                    </p>
                    <p className="mt-2 text-xs text-slate-400 text-center">
                        Scan to view this animal&apos;s registration details.
                    </p>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 bg-violet-600 text-white text-sm font-semibold rounded-xl hover:bg-violet-700 transition-colors"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
