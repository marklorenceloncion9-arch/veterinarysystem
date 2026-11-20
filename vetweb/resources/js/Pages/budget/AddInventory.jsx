import { useState, useEffect, useMemo } from 'react';
import { Link } from '@inertiajs/react';
import Sidebar from '@/Components/Budget/BudgetSidebar';
import BudgetNotificationBell from '@/Components/Budget/BudgetNotificationBell';
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

// Diri ang page sa pag-add og inventory sa budget.
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
    const [receivingLines, setReceivingLines] = useState([]);
    const [receiveModalOpen, setReceiveModalOpen] = useState(false);
    const [receiveLineErrors, setReceiveLineErrors] = useState({});
    const [receiveError, setReceiveError] = useState('');
    const [receivingSummary, setReceivingSummary] = useState(null);

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
    const currentLineReady =
        mode === 'restock' && Boolean(selectedMedicineId && formData.quantity && formData.expiration_date);
    const receiveCount = receivingLines.length + (currentLineReady ? 1 : 0);

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
        setReceivingLines([]);
        setReceiveModalOpen(false);
        setReceiveLineErrors({});
        setReceiveError('');
        setReceivingSummary(null);
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
            errors.medicine_name = 'Select an existing medicine to receive.';
        }
        return errors;
    };

    const emptyReceivingDraft = {
        medicine_name: '',
        category_id: '',
        quantity: '',
        unit_id: '',
        expiration_date: '',
        volume_ml: '',
        items_per_box: '',
    };

    const unitById = (unitId) => units.find((unit) => String(unit.id) === String(unitId)) || null;

    const unitKind = (unit) => {
        const name = String(unit?.name || '').toLowerCase();
        if (unit?.is_liquid || name === 'vial' || name === 'vials') return 'vial';
        if (name === 'box' || name === 'boxes') return 'box';
        return 'other';
    };

    const currentReceivingLine = () => {
        const unit = selectedUnit || unitById(formData.unit_id);
        const kind = unitKind(unit);
        const category = categories.find((item) => String(item.id) === String(formData.category_id));

        return {
            key: `${selectedMedicineId}-${Date.now()}`,
            medicine_id: selectedMedicineId,
            medicine_name: formData.medicine_name.trim(),
            category_id: formData.category_id,
            category_name: category?.name || selectedExisting?.category || 'Uncategorized',
            quantity: formData.quantity,
            unit_id: formData.unit_id,
            unit_name: unit?.name || 'units',
            expiration_date: formData.expiration_date,
            volume_ml: kind === 'vial' ? formData.volume_ml : '',
            items_per_box: kind === 'box' ? formData.items_per_box : '',
        };
    };

    const clearReceivingDraft = () => {
        setSelectedMedicineId('');
        setMedicineSearch('');
        setSelectedUnit(null);
        setFieldErrors({});
        setFormData(emptyReceivingDraft);
    };

    // Diri idugang ang napili nga tambal sa receiving list.
    const addReceivingLine = () => {
        const errors = validate();
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors);
            setMessage({ type: 'error', text: 'Please fix the highlighted fields before adding it.' });
            return false;
        }

        setReceivingLines((lines) => [...lines, currentReceivingLine()]);
        setMessage({ type: '', text: '' });
        clearReceivingDraft();
        return true;
    };

    const clearReceiveLineError = (key) => {
        setReceiveLineErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const updateReceivingLine = (key, field, value) => {
        setReceivingLines((lines) =>
            lines.map((line) => (line.key === key ? { ...line, [field]: value } : line))
        );
        clearReceiveLineError(key);
    };

    const updateReceivingCategory = (key, categoryId) => {
        const category = categories.find((item) => String(item.id) === String(categoryId));
        setReceivingLines((lines) =>
            lines.map((line) =>
                line.key === key
                    ? { ...line, category_id: categoryId, category_name: category?.name || 'Uncategorized' }
                    : line
            )
        );
        clearReceiveLineError(key);
    };

    const updateReceivingUnit = (key, unitId) => {
        const unit = unitById(unitId);
        const kind = unitKind(unit);
        setReceivingLines((lines) =>
            lines.map((line) =>
                line.key === key
                    ? {
                          ...line,
                          unit_id: unitId,
                          unit_name: unit?.name || 'units',
                          volume_ml: kind === 'vial' ? line.volume_ml : '',
                          items_per_box: kind === 'box' ? line.items_per_box : '',
                      }
                    : line
            )
        );
        clearReceiveLineError(key);
    };

    const validateReceivingLines = (lines) => {
        const today = new Date().toISOString().slice(0, 10);
        const errors = {};
        lines.forEach((line) => {
            const row = {};
            const kind = unitKind(unitById(line.unit_id));
            if (!line.category_id) row.category_id = 'Required.';
            if (!line.unit_id) row.unit_id = 'Required.';
            if (!line.quantity || Number(line.quantity) < 1) row.quantity = 'At least 1.';
            if (!line.expiration_date) row.expiration_date = 'Required.';
            else if (line.expiration_date <= today) row.expiration_date = 'Must be after today.';
            if (kind === 'vial' && (!line.volume_ml || Number(line.volume_ml) <= 0)) {
                row.volume_ml = 'Volume per vial is required.';
            }
            if (kind === 'box' && (!line.items_per_box || Number(line.items_per_box) < 1)) {
                row.items_per_box = 'Items per box is required.';
            }
            if (Object.keys(row).length > 0) errors[line.key] = row;
        });
        return errors;
    };

    // Diri ablihan ang listahan sa receiving aron ma-edit una.
    const openReceiveModal = () => {
        const currentStarted = Boolean(selectedMedicineId || formData.quantity || formData.expiration_date);
        let lines = receivingLines;

        if (currentStarted) {
            const errors = validate();
            if (Object.keys(errors).length > 0) {
                setFieldErrors(errors);
                setMessage({ type: 'error', text: 'Finish this item before viewing the receiving.' });
                return;
            }
            lines = [...receivingLines, currentReceivingLine()];
            setReceivingLines(lines);
            clearReceivingDraft();
        }

        if (lines.length === 0) {
            setMessage({ type: 'error', text: 'Add at least one item to receive.' });
            return;
        }

        setMessage({ type: '', text: '' });
        setReceiveError('');
        setReceiveLineErrors({});
        setReceiveModalOpen(true);
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

    // Diri i-submit ang bag-ong inventory. Sa receiving, Enter magdugang sa listahan.
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (mode === 'restock') {
            if (selectedMedicineId || formData.quantity || formData.expiration_date) {
                addReceivingLine();
            }
            return;
        }

        setMessage({ type: '', text: '' });
        setLastAddedId(null);
        setReceivingSummary(null);

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
                    'Medicine';

                setMessage({
                    type: 'success',
                    text: data.message || `${itemName} added to inventory successfully.`,
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

    // Diri i-save ang receiving human ma-mark nga nadawat.
    const markAsReceived = async () => {
        const errors = validateReceivingLines(receivingLines);
        if (Object.keys(errors).length > 0) {
            setReceiveLineErrors(errors);
            setReceiveError('Fix the highlighted items before marking this as received.');
            return;
        }

        if (receivingLines.length === 0) {
            setReceiveError('Add at least one item to receive.');
            return;
        }

        setReceiveError('');
        setLoading(true);

        try {
            const response = await fetch('/api/budget/inventory/receiving', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content'),
                },
                body: JSON.stringify({
                    items: receivingLines.map((line) => ({
                        medicine_id: line.medicine_id,
                        category_id: line.category_id || null,
                        unit_id: line.unit_id,
                        quantity: line.quantity,
                        expiration_date: line.expiration_date,
                        volume_ml: line.volume_ml || null,
                        items_per_box: line.items_per_box || null,
                    })),
                }),
            });

            const data = await response.json();

            if (data.success) {
                setReceivingSummary(receivingLines.map((line) => ({ ...line })));
                setMessage({
                    type: 'success',
                    text:
                        receivingLines.length === 1
                            ? '1 item was marked as received.'
                            : `${receivingLines.length} items were marked as received.`,
                });
                setReceiveModalOpen(false);
                setReceivingLines([]);
                setReceiveLineErrors({});
                clearReceivingDraft();
                fetchMedicines();
            } else {
                setReceiveError(data.message || 'Failed to mark this receiving.');
            }
        } catch {
            setReceiveError('Failed to mark this receiving. Please try again.');
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
                            className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
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
                                    Register a new item or receive several restocks at once. Oldest batches are used first.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <BudgetNotificationBell />
                                <Link
                                    href="/budget/inventory/history?from=add"
                                    className="inline-flex h-11 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                                >
                                    History
                                </Link>
                                <Tabs
                                    variant="segmented"
                                    value={mode}
                                    onChange={switchMode}
                                    items={[
                                        { id: 'new', label: 'New item' },
                                        { id: 'restock', label: 'Receiving' },
                                    ]}
                                />
                            </div>
                        </div>
                    </div>

                    <form
                        id="inventory-form"
                        onSubmit={handleSubmit}
                        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-slate-50/50 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
                    >
                        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5 lg:p-6">
                            {mode === 'restock' && (
                                <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
                                <FormSection
                                    title="Medicines"
                                    hint="Choose an item, set the quantity and expiration, then add it. Open View receive to review the full list."
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

                                    <div className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 p-1.5">
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

                                </FormSection>

                                <FormSection
                                    title="This item"
                                    hint={
                                        receivingLines.length > 0
                                            ? `${receivingLines.length} item${receivingLines.length === 1 ? '' : 's'} ready to review.`
                                            : 'Set the category, unit, quantity, and expiration. The unit can differ from the last batch.'
                                    }
                                >
                                    {!selectedExisting ? (
                                        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                                            <p className="text-sm text-slate-500">Select a medicine to add it to this receiving.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-3">
                                                <p className="text-sm font-semibold text-sky-950">{selectedExisting.name}</p>
                                                <p className="mt-0.5 text-xs text-sky-800">
                                                    {isMedicineOutOfStock(selectedExisting)
                                                        ? 'No stock'
                                                        : `${getMedicineOnHand(selectedExisting).toLocaleString()} ${selectedExisting.unit_name || 'units'} on hand`}
                                                </p>
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
                                                    className={`${inputClass} ${fieldErrors.category_id ? 'border-red-300' : ''}`}
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

                                            <div>
                                                <label className={labelClass}>
                                                    Unit <span className="text-red-500">*</span>
                                                </label>
                                                <select
                                                    name="unit_id"
                                                    value={formData.unit_id}
                                                    onChange={handleUnitChange}
                                                    className={`${inputClass} ${fieldErrors.unit_id ? 'border-red-300' : ''}`}
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
                                                    className={`${inputClass} ${fieldErrors.quantity ? 'border-red-300' : ''}`}
                                                />
                                                <FieldError message={fieldErrors.quantity} />
                                            </div>

                                            <div>
                                                <label className={labelClass}>
                                                    Expiration date <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="date"
                                                    name="expiration_date"
                                                    value={formData.expiration_date}
                                                    onChange={handleInputChange}
                                                    min={tomorrowIso()}
                                                    className={`${inputClass} ${fieldErrors.expiration_date ? 'border-red-300' : ''}`}
                                                />
                                                <FieldError message={fieldErrors.expiration_date} />
                                            </div>

                                            {isVial && (
                                                <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4">
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
                                                        className={`${inputClass} ${fieldErrors.volume_ml ? 'border-red-300' : 'border-sky-200'}`}
                                                    />
                                                    <FieldError message={fieldErrors.volume_ml} />
                                                </div>
                                            )}

                                            {isBox && (
                                                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
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
                                                        className={`${inputClass} ${fieldErrors.items_per_box ? 'border-red-300' : 'border-emerald-200'}`}
                                                    />
                                                    <FieldError message={fieldErrors.items_per_box} />
                                                </div>
                                            )}

                                            <button
                                                type="button"
                                                onClick={addReceivingLine}
                                                disabled={!selectedMedicineId}
                                                className="w-full rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Add to receiving
                                            </button>
                                        </div>
                                    )}
                                </FormSection>
                                </div>
                            )}

                            {mode === 'new' && (
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
                                            Review before saving this item.
                                        </p>

                                        {showPreview ? (
                                            <dl className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                                                <div className="flex items-start justify-between gap-3">
                                                    <dt className="text-xs text-slate-500">Type</dt>
                                                    <dd className="text-right text-sm font-medium text-slate-900">
                                                        {mode === 'restock' ? 'Receiving' : 'New item'}
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
                            )}
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
                            <div className="flex items-center gap-2">
                                {mode === 'restock' ? (
                                    <button
                                        type="button"
                                        onClick={openReceiveModal}
                                        disabled={loading || receiveCount === 0}
                                        className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                        </svg>
                                        {`View receive${receiveCount ? ` (${receiveCount})` : ''}`}
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                        </svg>
                                        {loading ? 'Saving…' : 'Add to inventory'}
                                    </button>
                                )}
                            </div>
                            </div>
                        </div>
                    </form>
                </div>
            </main>

            {receiveModalOpen && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
                    onClick={() => !loading && setReceiveModalOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="receiving-review-title"
                        className="flex max-h-[min(40rem,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="border-b border-slate-100 px-6 py-5">
                            <h2 id="receiving-review-title" className="text-lg font-semibold text-slate-900">
                                Receiving
                            </h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Edit the category, unit, quantity, or expiration, then mark this list as received.
                            </p>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
                            {receiveError && (
                                <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                    {receiveError}
                                </p>
                            )}
                            {receivingLines.length === 0 ? (
                                <p className="py-10 text-center text-sm text-slate-500">No items in this receiving.</p>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {receivingLines.map((line) => {
                                        const lineKind = unitKind(unitById(line.unit_id));
                                        return (
                                        <li key={line.key} className="space-y-3 py-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="truncate text-sm font-semibold text-slate-900">{line.medicine_name}</p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setReceivingLines((lines) => lines.filter((item) => item.key !== line.key))
                                                    }
                                                    className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <div>
                                                    <label className={labelClass}>Category</label>
                                                    <select
                                                        value={line.category_id || ''}
                                                        onChange={(event) => updateReceivingCategory(line.key, event.target.value)}
                                                        className={`${inputClass} ${receiveLineErrors[line.key]?.category_id ? 'border-red-300' : ''}`}
                                                    >
                                                        <option value="">Select category</option>
                                                        {categories.map((category) => (
                                                            <option key={category.id} value={category.id}>
                                                                {category.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <FieldError message={receiveLineErrors[line.key]?.category_id} />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Unit</label>
                                                    <select
                                                        value={line.unit_id || ''}
                                                        onChange={(event) => updateReceivingUnit(line.key, event.target.value)}
                                                        className={`${inputClass} ${receiveLineErrors[line.key]?.unit_id ? 'border-red-300' : ''}`}
                                                    >
                                                        <option value="">Select unit</option>
                                                        {units.map((unit) => (
                                                            <option key={unit.id} value={unit.id}>
                                                                {unit.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <FieldError message={receiveLineErrors[line.key]?.unit_id} />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Quantity</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={line.quantity}
                                                        onChange={(event) => updateReceivingLine(line.key, 'quantity', event.target.value)}
                                                        className={`${inputClass} ${receiveLineErrors[line.key]?.quantity ? 'border-red-300' : ''}`}
                                                    />
                                                    <FieldError message={receiveLineErrors[line.key]?.quantity} />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Expires</label>
                                                    <input
                                                        type="date"
                                                        min={tomorrowIso()}
                                                        value={line.expiration_date}
                                                        onChange={(event) => updateReceivingLine(line.key, 'expiration_date', event.target.value)}
                                                        className={`${inputClass} ${receiveLineErrors[line.key]?.expiration_date ? 'border-red-300' : ''}`}
                                                    />
                                                    <FieldError message={receiveLineErrors[line.key]?.expiration_date} />
                                                </div>
                                            </div>
                                            {lineKind === 'vial' && (
                                                <div>
                                                    <label className={labelClass}>Volume per vial (ml)</label>
                                                    <input
                                                        type="number"
                                                        min="0.1"
                                                        step="0.1"
                                                        value={line.volume_ml}
                                                        onChange={(event) => updateReceivingLine(line.key, 'volume_ml', event.target.value)}
                                                        className={`${inputClass} ${receiveLineErrors[line.key]?.volume_ml ? 'border-red-300' : ''}`}
                                                    />
                                                    <FieldError message={receiveLineErrors[line.key]?.volume_ml} />
                                                </div>
                                            )}
                                            {lineKind === 'box' && (
                                                <div>
                                                    <label className={labelClass}>Items per box</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={line.items_per_box}
                                                        onChange={(event) => updateReceivingLine(line.key, 'items_per_box', event.target.value)}
                                                        className={`${inputClass} ${receiveLineErrors[line.key]?.items_per_box ? 'border-red-300' : ''}`}
                                                    />
                                                    <FieldError message={receiveLineErrors[line.key]?.items_per_box} />
                                                </div>
                                            )}
                                        </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => setReceiveModalOpen(false)}
                                disabled={loading}
                                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={markAsReceived}
                                disabled={loading || receivingLines.length === 0}
                                className="rounded-lg bg-violet-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {loading ? 'Saving…' : 'Mark as received'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {message.type === 'success' && message.text && (
                <InventoryFormMessage
                    message={message}
                    summary={receivingSummary}
                    lastAddedId={receivingSummary ? null : lastAddedId}
                    viewHref={!receivingSummary && lastAddedId ? `/budget/inventory/${lastAddedId}` : null}
                    onClose={() => {
                        setMessage({ type: '', text: '' });
                        setReceivingSummary(null);
                    }}
                />
            )}
        </div>
    );
}
