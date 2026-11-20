import { useState, useEffect } from 'react';
import { router, usePage } from '@inertiajs/react';
import Tabs from '@/Components/Ui/Tabs';

// Diri ang form field nga naay label, hint, ug error.
function FormField({ label, error, children, hint }) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
            {children}
            {hint && !error && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
            {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
        </div>
    );
}

// Diri himuon ang CSS class sa input, pula kung naay error.
const inputClass = (hasError = false) =>
    `block w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm text-gray-700 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 ${
        hasError ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-violet-300'
    }`;

// Diri ang modal sa pag-add ug species ug breed.
export default function BreedSpeciesModal({ isOpen, onClose, animalTypes }) {
    const { props } = usePage();
    const [activeTab, setActiveTab] = useState('species');
    const [speciesForm, setSpeciesForm] = useState({
        species_name: '',
        type_id: ''
    });
    const [breedForm, setBreedForm] = useState({
        breed_name: '',
        species_id: ''
    });
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (props.flash?.success) {
            setSuccessMessage(props.flash.success);
            setShowSuccess(true);

            const timer = setTimeout(() => {
                setShowSuccess(false);
            }, 3000);

            return () => clearTimeout(timer);
        }
    }, [props.flash?.success]);

    // Diri i-save ang bag-ong species.
    const handleSpeciesSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        router.post('/admin/species', speciesForm, {
            onSuccess: () => {
                setSpeciesForm({ species_name: '', type_id: '' });
                setLoading(false);
            },
            onError: (submitErrors) => {
                setErrors(submitErrors);
                setLoading(false);
            },
            preserveState: true,
        });
    };

    // Diri i-save ang bag-ong breed.
    const handleBreedSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});

        router.post('/admin/breeds', breedForm, {
            onSuccess: () => {
                setBreedForm({ breed_name: '', species_id: '' });
                setLoading(false);
            },
            onError: (submitErrors) => {
                setErrors(submitErrors);
                setLoading(false);
            },
            preserveState: true,
        });
    };

    if (!isOpen) return null;

    const tabs = [
        { id: 'species', label: 'Add Species', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
        { id: 'breeds', label: 'Add Breed', icon: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
    ];

    return (
        <>
            {showSuccess && (
                <div className="pointer-events-none fixed inset-0 z-[60] flex items-start justify-center p-6">
                    <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-medium text-emerald-800 shadow-lg">
                        <svg className="h-5 w-5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                        </svg>
                        <span>{successMessage}</span>
                        <button
                            type="button"
                            onClick={() => setShowSuccess(false)}
                            className="ml-2 rounded-lg p-1 text-emerald-600 transition-colors hover:bg-emerald-100"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                <div
                    className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {/* Header */}
                    <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-6 py-5 backdrop-blur-sm">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Species & Breeds</h3>
                                    <p className="text-sm text-gray-500">Manage animal types for registration</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="px-6">
                        <Tabs
                            value={activeTab}
                            onChange={(id) => {
                                setActiveTab(id);
                                setErrors({});
                            }}
                            fullWidth
                            items={tabs.map((tab) => ({
                                id: tab.id,
                                label: tab.label,
                                icon: (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
                                    </svg>
                                ),
                            }))}
                        />
                    </div>

                    {/* Content */}
                    <div className="px-6 py-5">
                        {activeTab === 'species' && (
                            <form onSubmit={handleSpeciesSubmit} className="space-y-5">
                                <FormField label="Animal Type" error={errors.type_id}>
                                    {animalTypes.length === 0 ? (
                                        <div className={`${inputClass()} text-gray-400`}>Loading animal types...</div>
                                    ) : (
                                        <select
                                            value={speciesForm.type_id}
                                            onChange={(e) => setSpeciesForm({ ...speciesForm, type_id: e.target.value })}
                                            className={inputClass(!!errors.type_id)}
                                            required
                                        >
                                            <option value="">Select Animal Type</option>
                                            {animalTypes.map((type) => (
                                                <option key={type.id} value={type.id}>{type.type_name}</option>
                                            ))}
                                        </select>
                                    )}
                                </FormField>

                                <FormField label="Species Name" error={errors.species_name} hint="e.g., Dog, Cat, Chicken">
                                    <input
                                        type="text"
                                        value={speciesForm.species_name}
                                        onChange={(e) => setSpeciesForm({ ...speciesForm, species_name: e.target.value })}
                                        className={inputClass(!!errors.species_name)}
                                        placeholder="Enter species name"
                                        required
                                    />
                                </FormField>

                                <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        {loading ? 'Adding...' : 'Add Species'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {activeTab === 'breeds' && (
                            <form onSubmit={handleBreedSubmit} className="space-y-5">
                                <FormField label="Species" error={errors.species_id}>
                                    {animalTypes.length === 0 ? (
                                        <div className={`${inputClass()} text-gray-400`}>Loading species...</div>
                                    ) : (
                                        <select
                                            value={breedForm.species_id}
                                            onChange={(e) => setBreedForm({ ...breedForm, species_id: e.target.value })}
                                            className={inputClass(!!errors.species_id)}
                                            required
                                        >
                                            <option value="">Select Species</option>
                                            {animalTypes.map((type) => (
                                                <optgroup key={type.id} label={type.type_name}>
                                                    {type.species.map((species) => (
                                                        <option key={species.id} value={species.id}>{species.species_name}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    )}
                                </FormField>

                                <FormField label="Breed Name" error={errors.breed_name} hint="e.g., Labrador Retriever, Persian">
                                    <input
                                        type="text"
                                        value={breedForm.breed_name}
                                        onChange={(e) => setBreedForm({ ...breedForm, breed_name: e.target.value })}
                                        className={inputClass(!!errors.breed_name)}
                                        placeholder="Enter breed name"
                                        required
                                    />
                                </FormField>

                                <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        {loading ? 'Adding...' : 'Add Breed'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
