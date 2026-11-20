import { useState, useEffect, useMemo } from 'react';
import { Link } from '@inertiajs/react';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import InventoryFormMessage from '@/Components/Budget/InventoryFormMessage';
import { getMedicineOnHand, isMedicineOutOfStock } from '@/utils/inventoryStock';
import Tabs from '@/Components/Ui/Tabs';

const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100';

const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500';

// Diri ang section box sa form nga naay title ug hint.
function FormSection({ title, hint, children }) {
    return (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="mb-4 border-b border-slate-100 pb-3">
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                {hint && <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>}
            </div>
            {children}
        </section>
    );
}

// Diri ipakita ang error message sa field.
function FieldError({ message }) {
    if (!message) return null;
    return <p className="mt-1.5 text-xs text-red-600">{message}</p>;
}

// Diri kuhaon ang petsa ugma sa ISO format.
function tomorrowIso() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}

// Diri ang page sa pag-add og inventory.
export default function AddInventory() {
    const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
    const [medicines, setMedicines] = useState([]);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState('new'); // new | restock
    const [selectedMedicineId, setSelectedMedicineId] = useState('');
    const [medicineSearch, setMedicineSearch] = useState('');
    const [formData, setFormData] = useState({
        medicine_name: '',
        category_id: '',
        quantity: '',
        unit_id: '',
        expiration_date: '',
        volume_ml: '',
        items_per_box: '',
    });
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const [message, setMessage] = useState({ type: '', text: '' });
    const [lastAddedId, setLastAddedId] = useState(null);
    const [restockPrefillApplied, setRestockPrefillApplied] = useState(false);

    useEffect(() => {
        fetchCategories();
        fetchUnits();
        fetchMedicines();
    }, []);

    // Diri kuhaon ang mga category gikan sa API.
    const fetchCategories = async () => {
        try {
            const response = await fetch('/api/budget/categories');
            const data = await response.json();
            if (data.success) setCategories(data.categories);
        } catch (error) {
            console.error('Failed to fetch categories:', error);
        }
    };

    // Diri kuhaon ang mga unit gikan sa API.
    const fetchUnits = async () => {
        try {
            const response = await fetch('/api/budget/units');
            const data = await response.json();
            if (data.success) setUnits(data.units);
        } catch (error) {
            console.error('Failed to fetch units:', error);
        }
    };

    // Diri kuhaon ang listahan sa mga tambal.
    const fetchMedicines = async () => {
        try {
            const response = await fetch('/api/budget/medicines');
            const data = await response.json();
            if (data.success) setMedicines(data.medicines || []);
        } catch (error) {
            console.error('Failed to fetch medicines:', error);
        }
    };

    const filteredMedicines = useMemo(() => {
        const q = medicineSearch.trim().toLowerCase();
        if (!q) return medicines;
        return medicines.filter(
            (m) =>
                m.name.toLowerCase().includes(q) ||
                (m.category || '').toLowerCase().includes(q)
        );
    }, [medicines, medicineSearch]);

    const selectedExisting = useMemo(
        () => medicines.find((m) => String(m.id) === String(selectedMedicineId)),
        [medicines, selectedMedicineId]
    );

    const isVial =
        Boolean(selectedUnit?.is_liquid) ||
        ['vial', 'vials'].includes(String(selectedUnit?.name || '').toLowerCase());
    const isBox = ['box', 'boxes'].includes(String(selectedUnit?.name || '').toLowerCase());

    const boxTotalItems =
        isBox && Number(formData.quantity) > 0 && Number(formData.items_per_box) > 0
            ? Number(formData.quantity) * Number(formData.items_per_box)
            : null;

    const vialTotalMl =
        isVial && Number(formData.quantity) > 0 && Number(formData.volume_ml) > 0
            ? Number(formData.quantity) * Number(formData.volume_ml)
            : null;

    const showPreview = Boolean(formData.medicine_name || formData.quantity || formData.unit_id);

    // Diri i-fill ang form gamit ang napiling tambal nga naa na.
    const applyExistingMedicine = (medicine) => {
        if (!medicine) return;
        setSelectedMedicineId(String(medicine.id));
        setMedicineSearch(medicine.name);
        setFormData((prev) => ({
            ...prev,
            medicine_name: medicine.name,
            category_id: String(medicine.category_id || ''),
            unit_id: medicine.unit_id ? String(medicine.unit_id) : prev.unit_id,
            volume_ml: medicine.volume_ml ? String(medicine.volume_ml) : '',
            items_per_box: medicine.items_per_box ? String(medicine.items_per_box) : '',
        }));
        if (medicine.unit_id) {
            const unit = units.find((u) => u.id === medicine.unit_id);
            setSelectedUnit(unit || null);
        }
        setFieldErrors({});
        setMessage({ type: '', text: '' });
    };

    useEffect(() => {
        if (restockPrefillApplied || medicines.length === 0 || units.length === 0) return;

        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') !== 'restock') return;

        setMode('restock');

        const medicineId = params.get('medicine_id');
        const medicineName = (params.get('medicine_name') || '').trim();

        let medicine = null;
        if (medicineId) {
            medicine = medicines.find((m) => String(m.id) === String(medicineId));
        }
        if (!medicine && medicineName) {
            medicine = medicines.find((m) => m.name.toLowerCase() === medicineName.toLowerCase());
        }

        if (medicine) {
            applyExistingMedicine(medicine);
        } else if (medicineName) {
            setMedicineSearch(medicineName);
            setFormData((prev) => ({ ...prev, medicine_name: medicineName }));
        }

        setRestockPrefillApplied(true);
    }, [medicines, units, restockPrefillApplied]);

    // Diri ilisan ang mode (bag-o o restock) ug i-reset ang pili.
    const switchMode = (nextMode) => {
        setMode(nextMode);
        setSelectedMedicineId('');
        setMedicineSearch('');
        setSelectedUnit(null);
        setFieldErrors({});
        setMessage({ type: '', text: '' });
        setLastAddedId(null);
        setFormData({
            medicine_name: '',
            category_id: '',
            quantity: '',
            unit_id: '',
            expiration_date: '',
            volume_ml: '',
            items_per_box: '',
        });
    };

    // Diri i-handle ang pag-ilis sa unit.
    const handleUnitChange = (e) => {
        const unitId = e.target.value;
        const unit = units.find((u) => u.id === parseInt(unitId, 10));
        setSelectedUnit(unit);
        setFormData((prev) => ({
            ...prev,
            unit_id: unitId,
            volume_ml: '',
            items_per_box: '',
        }));
        setFieldErrors((prev) => {
            const next = { ...prev };
            delete next.unit_id;
            delete next.volume_ml;
            delete next.items_per_box;
            return next;
        });
    };

    // Diri i-update ang form kung mag-type sa input.
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (fieldErrors[name]) {
            setFieldErrors((prev) => {
                const next = { ...prev };
                delete next[name];
                return next;
            });
        }
    };

    // Diri i-check kung kompleto ug sakto ang form.
    const validate = () => {
        const errors = {};
        if (!formData.medicine_name.trim()) errors.medicine_name = 'Item name is required.';
        if (!formData.category_id) errors.category_id = 'Category is required.';
        if (!formData.quantity || Number(formData.quantity) < 1) errors.quantity = 'Quantity must be at least 1.';
        if (!formData.unit_id) errors.unit_id = 'Unit is required.';
        if (!formData.expiration_date) {
            errors.expiration_date = 'Expiration date is required.';
        } else if (formData.expiration_date <= new Date().toISOString().slice(0, 10)) {
            errors.expiration_date = 'Expiration date must be after today.';
        }
        if (isVial && (!formData.volume_ml || Number(formData.volume_ml) <= 0)) {
            errors.volume_ml = 'Volume per vial is required.';
        }
        if (isBox && (!formData.items_per_box || Number(formData.items_per_box) < 1)) {
            errors.items_per_box = 'Items per box is required.';
        }
        if (mode === 'restock' && !selectedMedicineId) {
            errors.medicine_name = 'Select an existing medicine to restock.';
        }
        return errors;
    };

    // Diri i-reset ang form pero pabilin ang mode.
    const resetFormKeepMode = () => {
        setFormData({
            medicine_name: mode === 'restock' && selectedExisting ? selectedExisting.name : '',
            category_id: mode === 'restock' && selectedExisting ? String(selectedExisting.category_id || '') : '',
            quantity: '',
            unit_id: mode === 'restock' && selectedExisting?.unit_id ? String(selectedExisting.unit_id) : '',
            expiration_date: '',
            volume_ml:
                mode === 'restock' && selectedExisting?.volume_ml ? String(selectedExisting.volume_ml) : '',
            items_per_box:
                mode === 'restock' && selectedExisting?.items_per_box
                    ? String(selectedExisting.items_per_box)
                    : '',
        });
        if (mode === 'restock' && selectedExisting?.unit_id) {
            setSelectedUnit(units.find((u) => u.id === selectedExisting.unit_id) || null);
        } else if (mode === 'new') {
            setSelectedUnit(null);
            setSelectedMedicineId('');
        }
    };

    // Diri i-submit ang bag-ong inventory.
    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });
        setLastAddedId(null);

        const errors = validate();
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            setMessage({ type: 'error', text: 'Please fix the highlighted fields.' });
            return;
        }

        setFieldErrors({});
        setLoading(true);

        try {
            const response = await fetch('/api/budget/inventory', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify({
                    ...formData,
                    medicine_name: formData.medicine_name.trim(),
                }),
            });

            const data = await response.json();

            if (data.success) {
                const itemName =
                    formData.medicine_name.trim() ||
                    data.inventory?.medicine?.name ||
                    selectedExisting?.name ||
                    'Medicine';

                setMessage({
                    type: 'success',
                    text:
                        data.message ||
                        (data.is_restock
                            ? `${itemName} restocked successfully. A new batch was added.`
                            : `${itemName} added to inventory successfully.`),
                });
                setLastAddedId(data.inventory?.id || data.inventory_id || null);
                resetFormKeepMode();
                fetchMedicines();
            } else {
                setMessage({ type: 'error', text: data.message || 'Failed to add medicine' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Failed to add medicine. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />

            <main className="relative staff-main flex min-h-0 flex-1 flex-col">
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-canvas"
                    aria-hidden="true"
                />

                <div className="relative flex min-h-0 flex-1 flex-col px-6 py-6 lg:px-8">
                    {/* Header */}
                    <div className="mb-5 shrink-0">
                        <Link
                            href="/budget/inventory"
                            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
                        >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                            </svg>
                            Back to inventory
                        </Link>

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                                    Stock control
                                </p>
                                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                                    Add inventory
                                </h1>
                                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500">
                                    Register a new item or add a restock batch. Oldest batches are used first.
                                </p>
                            </div>

                            <Tabs
                                variant="segmented"
                                value={mode}
                                onChange={switchMode}
                                items={[
                                    { id: 'new', label: 'New item' },
                                    { id: 'restock', label: 'Restock existing' },
                                ]}
                            />
                        </div>
                    </div>

                    <form
                        id="inventory-form"
                        onSubmit={handleSubmit}
                        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                    >
                        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5 lg:p-6">
                            {mode === 'restock' && (
                                <FormSection
                                    title="Select medicine to restock"
                                    hint="Creates a new batch. Treatments will use the oldest batch first."
                                >
                                    <div className="relative mb-3">
                                        <svg
                                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth="2"
                                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                            />
                                        </svg>
                                        <input
                                            type="text"
                                            value={medicineSearch}
                                            onChange={(e) => setMedicineSearch(e.target.value)}
                                            placeholder="Search medicines…"
                                            className={`${inputClass} pl-9`}
                                        />
                                    </div>

                                    <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 p-1.5">
                                        {filteredMedicines.length === 0 ? (
                                            <p className="px-3 py-8 text-center text-sm text-slate-500">
                                                No medicines found. Switch to New item to add one.
                                            </p>
                                        ) : (
                                            filteredMedicines.map((medicine) => {
                                                const active = String(medicine.id) === String(selectedMedicineId);
                                                const outOfStock = isMedicineOutOfStock(medicine);
                                                const onHand = getMedicineOnHand(medicine);
                                                return (
                                                    <button
                                                        key={medicine.id}
                                                        type="button"
                                                        onClick={() => applyExistingMedicine(medicine)}
                                                        className={`flex w-full items-center justify-between rounded-md px-3.5 py-2.5 text-left transition ${
                                                            active
                                                                ? 'bg-white shadow-sm ring-1 ring-violet-300'
                                                                : 'hover:bg-white'
                                                        }`}
                                                    >
                                                        <div className="min-w-0 pr-3">
                                                            <p className="truncate text-sm font-medium text-slate-900">
                                                                {medicine.name}
                                                            </p>
                                                            <p className="mt-0.5 text-xs text-slate-500">
                                                                {medicine.category || 'Uncategorized'}
                                                                {medicine.unit_name ? ` · ${medicine.unit_name}` : ''}
                                                            </p>
                                                        </div>
                                                        <div className="shrink-0 text-right">
                                                            {outOfStock ? (
                                                                <>
                                                                    <p className="text-sm font-semibold text-red-600">No stock</p>
                                                                    <p className="text-[11px] text-slate-400">
                                                                        {medicine.batches} batch
                                                                        {medicine.batches === 1 ? '' : 'es'} on hand
                                                                    </p>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <p className="text-sm font-semibold tabular-nums text-slate-900">
                                                                        {onHand.toLocaleString()}{' '}
                                                                        <span className="text-xs font-medium text-violet-700">
                                                                            {medicine.unit_name || 'units'}
                                                                        </span>
                                                                    </p>
                                                                    <p className="text-[11px] text-slate-400">
                                                                        on hand · {medicine.batches} batch
                                                                        {medicine.batches === 1 ? '' : 'es'}
                                                                    </p>
                                                                </>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>

                                    {selectedExisting && (
                                        <div className="mt-3 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-3 text-sm text-sky-900">
                                            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                                            <p>
                                                Restocking <span className="font-semibold">{selectedExisting.name}</span>.
                                                Current stock:{' '}
                                                {isMedicineOutOfStock(selectedExisting) ? (
                                                    <span className="font-semibold text-red-700">No stock</span>
                                                ) : (
                                                    <>
                                                        {getMedicineOnHand(selectedExisting).toLocaleString()}{' '}
                                                        {selectedExisting.unit_name || 'units'}
                                                    </>
                                                )}
                                                .
                                            </p>
                                        </div>
                                    )}
                                </FormSection>
                            )}

                            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
                                <div className="space-y-4">
                                    <FormSection title="Item details">
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div>
                                                <label className={labelClass}>
                                                    Item name <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    name="medicine_name"
                                                    value={formData.medicine_name}
                                                    onChange={handleInputChange}
                                                    placeholder="Enter item name"
                                                    className={`${inputClass} ${
                                                        fieldErrors.medicine_name ? 'border-red-300' : ''
                                                    } ${mode === 'restock' ? 'bg-slate-50 text-slate-600' : ''}`}
                                                    required
                                                    readOnly={mode === 'restock'}
                                                />
                                                <FieldError message={fieldErrors.medicine_name} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>
                                                    Category <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    name="category_id"
                                                    value={formData.category_id}
                                                    onChange={handleInputChange}
                                                    className={`${inputClass} ${
                                                        fieldErrors.category_id ? 'border-red-300' : ''
                                                    }`}
                                                    required
                                                >
                                                    <option value="">Select category</option>
                                                    {categories.map((category) => (
                                                        <option key={category.id} value={category.id}>
                                                            {category.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <FieldError message={fieldErrors.category_id} />
                                            </div>
                                        </div>
                                    </FormSection>

                                    <FormSection title="Stock details">
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div>
                                                <label className={labelClass}>
                                                    Quantity <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    name="quantity"
                                                    value={formData.quantity}
                                                    onChange={handleInputChange}
                                                    placeholder="Enter quantity"
                                                    min="1"
                                                    className={`${inputClass} ${
                                                        fieldErrors.quantity ? 'border-red-300' : ''
                                                    }`}
                                                    required
                                                />
                                                <FieldError message={fieldErrors.quantity} />
                                            </div>
                                            <div>
                                                <label className={labelClass}>
                                                    Unit <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    name="unit_id"
                                                    value={formData.unit_id}
                                                    onChange={handleUnitChange}
                                                    className={`${inputClass} ${
                                                        fieldErrors.unit_id ? 'border-red-300' : ''
                                                    }`}
                                                    required
                                                >
                                                    <option value="">Select unit</option>
                                                    {units.map((unit) => (
                                                        <option key={unit.id} value={unit.id}>
                                                            {unit.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                <FieldError message={fieldErrors.unit_id} />
                                            </div>
                                        </div>

                                        {isVial && (
                                            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/70 p-4">
                                                <label className={labelClass}>
                                                    Volume per vial (ml) <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    name="volume_ml"
                                                    value={formData.volume_ml}
                                                    onChange={handleInputChange}
                                                    placeholder="e.g. 10"
                                                    min="0.1"
                                                    step="0.1"
                                                    className={`${inputClass} ${
                                                        fieldErrors.volume_ml ? 'border-red-300' : 'border-sky-200'
                                                    }`}
                                                    required={isVial}
                                                />
                                                <p className="mt-1.5 text-xs text-sky-700">
                                                    Dosage reference: 1 kg pet weight = 0.10 ml
                                                </p>
                                                <FieldError message={fieldErrors.volume_ml} />
                                                {vialTotalMl !== null && (
                                                    <p className="mt-2 text-sm font-medium tabular-nums text-sky-900">
                                                        Total volume: {vialTotalMl.toLocaleString()} ml (
                                                        {formData.quantity} vials × {formData.volume_ml} ml)
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {isBox && (
                                            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
                                                <label className={labelClass}>
                                                    Items per box <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="number"
                                                    name="items_per_box"
                                                    value={formData.items_per_box}
                                                    onChange={handleInputChange}
                                                    placeholder="e.g. 30"
                                                    min="1"
                                                    className={`${inputClass} ${
                                                        fieldErrors.items_per_box
                                                            ? 'border-red-300'
                                                            : 'border-emerald-200'
                                                    }`}
                                                    required={isBox}
                                                />
                                                <p className="mt-1.5 text-xs text-emerald-700">
                                                    Treatments deduct items from boxes, oldest batch first
                                                </p>
                                                <FieldError message={fieldErrors.items_per_box} />
                                                {boxTotalItems !== null && (
                                                    <p className="mt-2 text-sm font-medium tabular-nums text-emerald-900">
                                                        Total items: {boxTotalItems.toLocaleString()} (
                                                        {formData.quantity} boxes × {formData.items_per_box} items)
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </FormSection>

                                    <FormSection title="Expiry">
                                        <div className="md:max-w-xs">
                                            <label className={labelClass}>
                                                Expiration date <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="date"
                                                name="expiration_date"
                                                value={formData.expiration_date}
                                                onChange={handleInputChange}
                                                min={tomorrowIso()}
                                                className={`${inputClass} ${
                                                    fieldErrors.expiration_date ? 'border-red-300' : ''
                                                }`}
                                                required
                                            />
                                            <FieldError message={fieldErrors.expiration_date} />
                                        </div>
                                    </FormSection>
                                </div>

                                {/* Preview column */}
                                <aside className="xl:sticky xl:top-0 xl:self-start">
                                    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                            Batch preview
                                        </p>
                                        <p className="mt-1 text-sm text-slate-500">
                                            Review before saving this stock-in.
                                        </p>

                                        {showPreview ? (
                                            <dl className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <dt className="text-xs text-slate-500">Type</dt>
                                                    <dd className="text-right text-sm font-medium text-slate-900">
                                                        {mode === 'restock' ? 'Restock batch' : 'New item'}
                                                    </dd>
                                                </div>
                                                <div className="flex items-start justify-between gap-3">
                                                    <dt className="text-xs text-slate-500">Item</dt>
                                                    <dd className="text-right text-sm font-medium text-slate-900">
                                                        {formData.medicine_name || '—'}
                                                    </dd>
                                                </div>
                                                <div className="flex items-start justify-between gap-3">
                                                    <dt className="text-xs text-slate-500">Quantity in</dt>
                                                    <dd className="text-right text-sm font-semibold tabular-nums text-emerald-700">
                                                        {formData.quantity
                                                            ? `+${formData.quantity} ${selectedUnit?.name || 'units'}`
                                                            : '—'}
                                                    </dd>
                                                </div>
                                                {vialTotalMl !== null && (
                                                    <div className="flex items-start justify-between gap-3">
                                                        <dt className="text-xs text-slate-500">Total ml</dt>
                                                        <dd className="text-right text-sm font-medium tabular-nums text-sky-700">
                                                            {vialTotalMl.toLocaleString()} ml
                                                        </dd>
                                                    </div>
                                                )}
                                                {boxTotalItems !== null && (
                                                    <div className="flex items-start justify-between gap-3">
                                                        <dt className="text-xs text-slate-500">Total items</dt>
                                                        <dd className="text-right text-sm font-medium tabular-nums text-emerald-700">
                                                            {boxTotalItems.toLocaleString()}
                                                        </dd>
                                                    </div>
                                                )}
                                                <div className="flex items-start justify-between gap-3">
                                                    <dt className="text-xs text-slate-500">Expires</dt>
                                                    <dd className="text-right text-sm font-medium text-slate-900">
                                                        {formData.expiration_date || '—'}
                                                    </dd>
                                                </div>
                                            </dl>
                                        ) : (
                                            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                                                <p className="text-sm text-slate-500">
                                                    Fill in the form to preview this batch.
                                                </p>
                                            </div>
                                        )}

                                        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-400">
                                            Saving creates a new batch. When used in treatments, the oldest batch is
                                            deducted first.
                                        </p>
                                    </div>
                                </aside>
                            </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-200 bg-white px-5 py-4">
                            {message.type === 'error' && message.text && (
                                <InventoryFormMessage message={message} />
                            )}

                            <div className="flex items-center justify-between gap-3">
                            <Link
                                href="/budget/inventory"
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                            >
                                Cancel
                            </Link>
                            <button
                                type="submit"
                                disabled={loading || (mode === 'restock' && !selectedMedicineId)}
                                className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                                {loading
                                    ? 'Saving…'
                                    : mode === 'restock'
                                      ? 'Add batch'
                                      : 'Add to inventory'}
                            </button>
                            </div>
                        </div>
                    </form>
                </div>
            </main>

            {message.type === 'success' && message.text && (
                <InventoryFormMessage
                    message={message}
                    lastAddedId={lastAddedId}
                    viewHref={lastAddedId ? `/budget/inventory/${lastAddedId}` : null}
                    onClose={() => setMessage({ type: '', text: '' })}
                />
            )}
        </div>
    );
}
