import { router } from '@inertiajs/react';
import { useState, useEffect, useMemo } from 'react';
import {
    ModalShell,
    SectionTitle,
    SpeciesSelector,
    calculateVhcAmount,
    DEFAULT_VHC_ISSUED_AT,
    DEFAULT_VHC_ORIGIN,
    formatCurrency,
    formatVhcError,
    inputClass,
    normalizeVhcContactNumber,
    readOnlyClass,
} from '@/Components/Admin/vhcUi';
import Tabs from '@/Components/Ui/Tabs';

// Diri himuon ang initial form data sa VHC gikan sa client.
const buildFormData = (client = null) => ({
    vhc_client_id: client?.id ?? '',
    name: client?.name ?? '',
    age: '',
    color: '',
    contact_number: client?.contact_number ?? '',
    purpose: '',
    origin: DEFAULT_VHC_ORIGIN,
    animals_origin: '',
    destination: '',
    slh: '',
    issued_on: '',
    valid_till: '',
    or_number: '',
    amount_paid: '',
    issued_at: DEFAULT_VHC_ISSUED_AT,
    inspected_by: '',
    livestock: [],
});

// Diri ang form field nga naay label ug error.
const Field = ({ label, required, error, children }) => (
    <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">
            {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {children}
        {error && <p className="text-xs text-rose-500">{formatVhcError(error)}</p>}
    </div>
);

// Diri ang modal sa paghimo ug bag-ong VHC.
export default function VhcModal({ isOpen, onClose, species = [], vhcFees = {}, client = null }) {
    const isExistingClient = Boolean(client?.id);
    const [formData, setFormData] = useState(() => buildFormData(client));
    const [errors, setErrors] = useState({});
    const [activeTab, setActiveTab] = useState('certificate');
    const [amountManuallyEdited, setAmountManuallyEdited] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setFormData(buildFormData(client));
            setErrors({});
            setActiveTab('certificate');
            setAmountManuallyEdited(false);
        }
    }, [isOpen, client]);

    const suggestedAmount = useMemo(
        () => calculateVhcAmount(formData.livestock, species, vhcFees, formData.issued_on),
        [formData.livestock, formData.issued_on, species, vhcFees]
    );

    useEffect(() => {
        if (!amountManuallyEdited) {
            setFormData((prev) => ({
                ...prev,
                amount_paid: suggestedAmount > 0 ? String(suggestedAmount) : '',
            }));
        }
    }, [suggestedAmount, amountManuallyEdited]);

    // Diri i-add o tangtangon ang species sa livestock list.
    const handleSpeciesToggle = (speciesId) => {
        setFormData((prev) => {
            const exists = prev.livestock.find((l) => l.species_id === speciesId);
            if (exists) {
                return {
                    ...prev,
                    livestock: prev.livestock.filter((l) => l.species_id !== speciesId),
                };
            }
            return {
                ...prev,
                livestock: [...prev.livestock, { species_id: speciesId, male_count: '', female_count: '' }],
            };
        });
    };

    // Diri usbon ang male o female count sa species.
    const handleLivestockChange = (speciesId, field, value) => {
        setFormData((prev) => ({
            ...prev,
            livestock: prev.livestock.map((l) =>
                l.species_id === speciesId ? { ...l, [field]: value } : l
            ),
        }));
    };

    // Diri i-update ang form field nga gi-type.
    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name === 'amount_paid') {
            setAmountManuallyEdited(true);
        }
        if (name === 'contact_number') {
            setFormData((prev) => ({ ...prev, contact_number: normalizeVhcContactNumber(value) }));
            return;
        }
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    // Diri i-submit ang VHC form sa server.
    const handleSubmit = (e) => {
        e.preventDefault();
        router.post('/admin/vhc', formData, {
            onError: (err) => setErrors(err),
            onSuccess: () => {
                onClose();
                setFormData(buildFormData(client));
                setErrors({});
                setActiveTab('certificate');
                setAmountManuallyEdited(false);
            },
        });
    };

    // Diri isira ang modal ug limpyohan ang errors.
    const handleClose = () => {
        onClose();
        setErrors({});
    };

    if (!isOpen) return null;

    const tabs = [
        { id: 'certificate', label: 'Certificate Info' },
        { id: 'animals', label: 'Livestock, Poultry & Payment' },
    ];

    return (
        <ModalShell
            title={isExistingClient ? 'Add Certificate' : 'New Client Folder'}
            subtitle={
                isExistingClient
                    ? `Add another veterinary health certificate for ${client.name}`
                    : 'Create a client folder with their first veterinary health certificate'
            }
            onClose={handleClose}
            footer={
                <div className="flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700"
                    >
                        {isExistingClient ? 'Save Certificate' : 'Create Folder & Certificate'}
                    </button>
                </div>
            }
        >
            <div className="px-6 pt-2">
                <Tabs
                    value={activeTab}
                    onChange={setActiveTab}
                    fullWidth
                    items={tabs}
                />
            </div>

            <form onSubmit={handleSubmit} className="p-6">
                {activeTab === 'certificate' && (
                    <div className="space-y-6">
                        <section>
                            <SectionTitle>Owner & Animal Details</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                {isExistingClient ? (
                                    <>
                                        <Field label="Client Name">
                                            <div className={readOnlyClass}>{formData.name}</div>
                                            <input type="hidden" name="vhc_client_id" value={formData.vhc_client_id} />
                                            <input type="hidden" name="name" value={formData.name} />
                                        </Field>
                                        <Field label="Contact Number">
                                            <div className={readOnlyClass}>{formData.contact_number || '—'}</div>
                                            <input type="hidden" name="contact_number" value={formData.contact_number} />
                                        </Field>
                                    </>
                                ) : (
                                    <>
                                        <Field label="Name" required error={errors.name}>
                                            <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Enter owner / client name" className={inputClass} />
                                        </Field>
                                        <Field label="Contact Number" error={errors.contact_number}>
                                            <input type="tel" name="contact_number" value={formData.contact_number} onChange={handleChange} placeholder="09XXXXXXXXX" maxLength={11} inputMode="numeric" className={inputClass} />
                                            <p className="text-xs text-slate-500">Must start with 09 and be 11 digits</p>
                                        </Field>
                                    </>
                                )}
                                <Field label="Age" error={errors.age}>
                                    <input type="text" name="age" value={formData.age} onChange={handleChange} placeholder="e.g., 2 years" className={inputClass} />
                                </Field>
                                <Field label="Color" error={errors.color}>
                                    <input type="text" name="color" value={formData.color} onChange={handleChange} placeholder="Enter animal color" className={inputClass} />
                                </Field>
                            </div>
                        </section>

                        <section>
                            <SectionTitle accent="emerald">Movement & Purpose</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <Field label="Purpose" required error={errors.purpose}>
                                    <input type="text" name="purpose" value={formData.purpose} onChange={handleChange} placeholder="e.g., Slaughter, Breeding, Sale" className={inputClass} />
                                </Field>
                                <Field label="Destination" required error={errors.destination}>
                                    <input type="text" name="destination" value={formData.destination} onChange={handleChange} placeholder="Enter destination" className={inputClass} />
                                </Field>
                                <Field label="Origin (Address)" required error={errors.origin}>
                                    <div className="rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600">
                                        Cogon Public Market, El Salvador City
                                    </div>
                                    <input type="hidden" name="origin" value={formData.origin} />
                                </Field>
                                <Field label="Animals Origin" error={errors.animals_origin}>
                                    <input type="text" name="animals_origin" value={formData.animals_origin} onChange={handleChange} placeholder="Enter animals origin" className={inputClass} />
                                </Field>
                            </div>
                        </section>

                        <section>
                            <SectionTitle accent="blue">Issuance Details</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <Field label="SLH" error={errors.slh}>
                                    <input type="text" name="slh" value={formData.slh} onChange={handleChange} placeholder="Enter SLH" className={inputClass} />
                                </Field>
                                <Field label="Issued At" error={errors.issued_at}>
                                    <input type="text" name="issued_at" value={formData.issued_at} onChange={handleChange} placeholder="Place of issuance" className={inputClass} />
                                </Field>
                                <Field label="Issued On" error={errors.issued_on}>
                                    <input type="date" name="issued_on" value={formData.issued_on} onChange={handleChange} className={inputClass} />
                                </Field>
                                <Field label="Valid Till" error={errors.valid_till}>
                                    <input type="date" name="valid_till" value={formData.valid_till} onChange={handleChange} className={inputClass} />
                                </Field>
                                <Field label="O.R Number" error={errors.or_number}>
                                    <input type="text" name="or_number" value={formData.or_number} onChange={handleChange} placeholder="Enter O.R number" className={inputClass} />
                                </Field>
                                <Field label="Inspected By" error={errors.inspected_by}>
                                    <input type="text" name="inspected_by" value={formData.inspected_by} onChange={handleChange} placeholder="Inspector name" className={inputClass} />
                                </Field>
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'animals' && (
                    <div className="space-y-6">
                        <section>
                            <SectionTitle accent="emerald">Livestock & Poultry Details</SectionTitle>
                            <p className="mb-4 text-sm text-slate-500">
                                Select one or more species and enter male and female counts for each.
                            </p>
                            <SpeciesSelector
                                species={species}
                                selected={formData.livestock}
                                onToggle={handleSpeciesToggle}
                                onChange={handleLivestockChange}
                                vhcFees={vhcFees}
                            />
                            {errors.livestock && <p className="mt-3 text-xs text-rose-500">{formatVhcError(errors.livestock)}</p>}
                        </section>

                        <section>
                            <SectionTitle accent="blue">Payment</SectionTitle>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <Field label="Amount Paid" error={errors.amount_paid}>
                                    <input type="number" name="amount_paid" value={formData.amount_paid} onChange={handleChange} placeholder="0.00" min="0" step="0.01" className={inputClass} />
                                    {!amountManuallyEdited && suggestedAmount > 0 && (
                                        <p className="mt-1 text-xs text-emerald-600">
                                            Auto-calculated: {formatCurrency(suggestedAmount)} (certificate + livestock/poultry heads)
                                        </p>
                                    )}
                                </Field>
                            </div>
                        </section>
                    </div>
                )}
            </form>
        </ModalShell>
    );
}
