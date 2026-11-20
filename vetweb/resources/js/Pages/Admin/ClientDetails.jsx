import { Link, router, usePage } from '@inertiajs/react';
import { useState, useEffect } from 'react';
import axios from 'axios';
import Sidebar from '@/Components/Admin/Sidebar';
import AnimalQrModal from '@/Components/Admin/AnimalQrModal';
import ElSalvadorStreetField from '@/Components/Admin/ElSalvadorStreetField';

// Diri ang row sa info nga naay icon.
function InfoRow({ icon, label, value }) {
    return (
        <div className="flex items-start gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-100">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-0.5 break-words text-sm font-semibold text-gray-900">{value || 'N/A'}</p>
            </div>
        </div>
    );
}

// Diri ang gamay nga stat card.
function MiniStat({ label, value, icon, alert = false }) {
    return (
        <div className={`rounded-xl border p-4 shadow-sm ${alert ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-white'}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className={`text-2xl font-bold tracking-tight tabular-nums ${alert ? 'text-danger' : 'text-gray-900'}`}>{value}</p>
                    <p className={`mt-0.5 text-xs font-medium ${alert ? 'text-red-700' : 'text-gray-500'}`}>{label}</p>
                </div>
                {icon && (
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-sm ${alert ? 'bg-danger shadow-red-200' : 'bg-violet-600 shadow-violet-200'}`}>
                        {icon}
                    </div>
                )}
            </div>
        </div>
    );
}

// Diri ang header sa section.
function SectionHeader({ title, subtitle, compact = false }) {
    return (
        <div className={`flex items-start gap-3 ${compact ? 'mb-4' : 'mb-5'}`}>
            <div className={`mt-0.5 w-1 shrink-0 rounded-full bg-violet-600 ${compact ? 'h-8' : 'h-10'}`} />
            <div>
                <h3 className={`font-bold text-gray-900 ${compact ? 'text-sm' : 'text-lg'}`}>{title}</h3>
                {subtitle && <p className={`mt-0.5 text-gray-500 ${compact ? 'text-xs' : 'text-sm'}`}>{subtitle}</p>}
            </div>
        </div>
    );
}

// Diri ang field sa edit form.
function EditFormField({ label, error, required, hint, children }) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {label}{required && <span className="text-red-500"> *</span>}
            </label>
            {children}
            {hint && !error && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
            {error && (
                <p className="mt-1.5 flex items-start gap-1 text-xs text-red-600">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                    <span>{error}</span>
                </p>
            )}
        </div>
    );
}

// Diri ang class sa edit input depende sa error.
const editFieldClass = (hasError) =>
    `block w-full rounded-xl border bg-gray-50 px-4 py-2.5 text-sm text-gray-700 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 ${
        hasError ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-violet-300'
    }`;

const hiddenScrollbarClass = '[&::-webkit-scrollbar]:hidden';
const hiddenScrollbarStyle = { scrollbarWidth: 'none', msOverflowStyle: 'none' };

const ANIMAL_COLUMNS = [
    { key: 'name', label: 'Animal Name', width: '20%', align: 'left' },
    { key: 'id', label: 'ID No.', width: '14%', align: 'left' },
    { key: 'photo', label: 'Photo', width: '80px', align: 'center' },
    { key: 'species', label: 'Species', width: '16%', align: 'left' },
    { key: 'breed', label: 'Breed', width: '16%', align: 'left' },
    { key: 'status', label: 'Status', width: '130px', align: 'left' },
    { key: 'actions', label: 'Action', width: '80px', align: 'center' },
];

const tableAlignClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
};

// Diri i-check kung valid ang email.
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

// Diri ang pill button sa option.
function OptionPill({ active, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition-all ${
                active
                    ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-violet-200 hover:bg-violet-50/40'
            }`}
        >
            {children}
        </button>
    );
}

// Diri ang row sa pili nga Yes o No.
function YesNoRow({ label, value, onChange }) {
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <div className="flex gap-2">
                <OptionPill active={value === 'yes'} onClick={() => onChange('yes')}>Yes</OptionPill>
                <OptionPill active={value === 'no'} onClick={() => onChange('no')}>No</OptionPill>
            </div>
        </div>
    );
}

// Diri ang page sa detalye sa client.
export default function ClientDetails({ client, species = [], breeds = [], barangays = [], zones = [] }) {
    const [showEditModal, setShowEditModal] = useState(false);
    const [showPetModal, setShowPetModal] = useState(false);
    const [showViewPetModal, setShowViewPetModal] = useState(false);
    const [showQrModal, setShowQrModal] = useState(false);
    const [selectedPet, setSelectedPet] = useState(null);
    const [modalPetStatus, setModalPetStatus] = useState(null);
    const [photoPreview, setPhotoPreview] = useState({ open: false, url: '', label: '' });

    // Helper function to check if animal is livestock or poultry (exempt from registration)
    // Diri i-check kung exempt sa registration ang hayop.
    const isExemptFromRegistration = (pet) => {
        const typeName = pet.species?.animalType?.type_name;
        return typeName === 'Livestock' || typeName === 'Poultry';
    };
    const [isEditingPet, setIsEditingPet] = useState(false);
    const [editPetFormData, setEditPetFormData] = useState({
        pet_name: '',
        species_id: '',
        breed_id: '',
        sex: '',
        color: '',
        weight: '',
        birthdate: '',
        registration_status: '',
    });
    const [editPetAvailableBreeds, setEditPetAvailableBreeds] = useState([]);
    const [formData, setFormData] = useState({
        firstname: client.firstname || '',
        middlename: client.middlename || '',
        lastname: client.lastname || '',
        age: client.age || '',
        email: client.email || '',
        phone_number: client.phone_number || '',
        barangay_id: client.barangay_id || '',
        zone: client.zone || '',
        street: client.street || '',
        facebook: client.facebook || '',
    });
    const [petFormData, setPetFormData] = useState({
        pet_name: '',
        species_id: '',
        breed_id: '',
        sex: 'male',
        color: '',
        weight: '',
        birthdate: '',
        // Reproductive Status
        reproductive_status: '', // 'pregnant', 'nursing', 'not_pregnant'
        weeks_months: '',
        // Diet
        diet: '', // 'commercial_food', 'table_food', 'both', 'others'
        diet_other: '',
        // Deworming History
        dewormed: '',
        last_deworming_date: '',
        dewormer_name: '',
        // Vaccination History
        rabies_vaccine: '',
        rabies_last_vaccination: '',
        dhppl_vaccine: '',
        dhppl_last_vaccination: '',
        other_vaccine_name: '',
        other_vaccine_last_vaccination: '',
    });
    const [errors, setErrors] = useState({});
    const [petErrors, setPetErrors] = useState({});
    const [availableBreeds, setAvailableBreeds] = useState([]);
    const [flashMessage, setFlashMessage] = useState(null);
    const [showCreateAccount, setShowCreateAccount] = useState(false);
    const [accountForm, setAccountForm] = useState({
        email: '',
        password: '',
        password_confirmation: ''
    });
    const [credentialsForm, setCredentialsForm] = useState({
        email: '',
        password: '',
        password_confirmation: '',
    });
    const [editSaving, setEditSaving] = useState(false);
    const [editSaveSuccess, setEditSaveSuccess] = useState('');
    const [petSaving, setPetSaving] = useState(false);
    const [petSaveSuccess, setPetSaveSuccess] = useState('');
    // Diri limpyohan ang URL sa litrato.
    const normalizeMediaUrl = (url) => {
        if (!url) return '';
        const value = String(url).trim();
        if (!value || value === 'null' || value === 'undefined') return '';
        if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image')) return value;
        return value.startsWith('/') ? value : `/${value}`;
    };
    // Diri ablihan ang preview sa litrato.
    const openPhotoPreview = (url, label) => {
        const normalized = normalizeMediaUrl(url);
        if (!normalized) return;
        setPhotoPreview({ open: true, url: normalized, label: label || 'Photo Preview' });
    };

    // Diri adto sa profile history sa hayop.
    const openPetProfile = (pet) => {
        router.visit(animalHistoryHref(pet.id));
    };

    // Handle flash messages from Inertia
    const page = usePage();
    const mapboxToken = page.props.mapboxToken;
    const { flash, csrf_token: csrfToken } = page.props;
    const listQuery = new URLSearchParams((page.url || '').split('?')[1] || '');
    const fromClients = listQuery.get('from') === 'clients';
    const clientsListHref = (() => {
        const params = new URLSearchParams(listQuery);
        const list = params.get('list');
        params.delete('from');
        params.delete('list');
        params.set('view', 'clients');
        const base = list === 'pending'
            ? '/admin/barangay-animals/pending'
            : list === 'rejected'
              ? '/admin/barangay-animals/rejected'
              : '/admin/barangay-animals';
        return `${base}?${params.toString()}`;
    })();
    const backHref = fromClients ? clientsListHref : '/admin/barangay-animals';
    const animalHistoryHref = (petId) => {
        const qs = (page.url || '').split('?')[1] || '';
        const base = `/admin/clients/${client.id}/animals/${petId}/history`;
        return qs ? `${base}?${qs}` : base;
    };
    useEffect(() => {
        if (flash?.success) {
            setFlashMessage({ type: 'success', text: flash.success });
            const timer = setTimeout(() => setFlashMessage(null), 3000);
            return () => clearTimeout(timer);
        }
        if (flash?.error) {
            setFlashMessage({ type: 'error', text: flash.error });
            const timer = setTimeout(() => setFlashMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [flash]);

    // Diri ablihan ang edit modal sa client.
    const handleEditClient = () => {
        setShowEditModal(true);
        setErrors({});
        setEditSaveSuccess('');
        setShowCreateAccount(false);
        setCredentialsForm({
            email: isPlaceholderEmail(client.email) ? '' : (client.email || ''),
            password: '',
            password_confirmation: '',
        });
        setAccountForm({ email: '', password: '', password_confirmation: '' });
    };

    // Diri i-map ang mga error sa account.
    const mapAccountErrors = (serverErrors) => ({
        ...(serverErrors.email ? { account_email: Array.isArray(serverErrors.email) ? serverErrors.email[0] : serverErrors.email } : {}),
        ...(serverErrors.password ? { account_password: Array.isArray(serverErrors.password) ? serverErrors.password[0] : serverErrors.password } : {}),
        ...(serverErrors.password_confirmation ? { account_password_confirmation: Array.isArray(serverErrors.password_confirmation) ? serverErrors.password_confirmation[0] : serverErrors.password_confirmation } : {}),
    });

    // Diri i-validate ang email ug password.
    const validateCredentials = (email, password, passwordConfirmation, { requirePassword = false, prefix = '' } = {}) => {
        const fieldErrors = {};
        const emailKey = prefix ? `${prefix}email` : 'email';
        const passwordKey = prefix ? `${prefix}password` : 'password';
        const confirmKey = prefix ? `${prefix}password_confirmation` : 'password_confirmation';

        if (!email?.trim()) {
            fieldErrors[emailKey] = 'Email address is required.';
        } else if (!isValidEmail(email)) {
            fieldErrors[emailKey] = 'Please enter a valid email address.';
        }

        if (requirePassword || password || passwordConfirmation) {
            if (!password) {
                fieldErrors[passwordKey] = 'Password is required.';
            } else if (password.length < 8) {
                fieldErrors[passwordKey] = 'Password must be at least 8 characters.';
            }

            if (!passwordConfirmation) {
                fieldErrors[confirmKey] = 'Please confirm the password.';
            } else if (password !== passwordConfirmation) {
                fieldErrors[confirmKey] = 'Password confirmation does not match.';
            }
        }

        return fieldErrors;
    };

    // Diri himuon ang account sa client.
    const handleCreateAccount = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const credentialErrors = validateCredentials(
            accountForm.email,
            accountForm.password,
            accountForm.password_confirmation,
            { requirePassword: true, prefix: 'account_' }
        );

        if (Object.keys(credentialErrors).length > 0) {
            setErrors(credentialErrors);
            return;
        }

        router.post(`/admin/clients/${client.id}/create-account`, {
            email: accountForm.email,
            password: accountForm.password,
            password_confirmation: accountForm.password_confirmation
        }, {
            onSuccess: () => {
                setShowCreateAccount(false);
                setAccountForm({ email: '', password: '', password_confirmation: '' });
                setErrors({});
                router.reload();
            },
            onError: (serverErrors) => {
                setErrors(mapAccountErrors(serverErrors));
            }
        });
    };

    // Diri i-check kung placeholder ra ang email.
    const isPlaceholderEmail = (email) => {
        return email && email.endsWith('@vetcare.local');
    };

    // Diri i-update ang edit form ug i-check ang phone.
    const handleInputChange = (e) => {
        const { name, value } = e.target;

        if (name === 'phone_number') {
            let phoneValue = value.replace(/\D/g, '');

            if (phoneValue.length > 0 && !phoneValue.startsWith('09')) {
                phoneValue = '09' + phoneValue.replace(/^0+/, '');
            }

            phoneValue = phoneValue.substring(0, 11);

            setFormData(prev => ({
                ...prev,
                [name]: phoneValue
            }));
        } else if (name === 'barangay_id') {
            // Zones belong to a barangay, so switching barangay resets the zone
            setFormData(prev => ({
                ...prev,
                barangay_id: value,
                zone: '',
                street: ''
            }));
        } else if (name === 'zone') {
            setFormData(prev => ({
                ...prev,
                zone: value,
                street: value === prev.zone ? prev.street : ''
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: value
            }));
        }

        if (errors[name]) {
            setErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }
    };

    // Diri i-update ang credentials form.
    const handleCredentialsChange = (e) => {
        const { name, value } = e.target;
        setCredentialsForm(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    // Diri i-update ang account form.
    const handleAccountFormChange = (e) => {
        const { name, value } = e.target;
        setAccountForm(prev => ({ ...prev, [name]: value }));
        const errorKey = name === 'email'
            ? 'account_email'
            : name === 'password'
              ? 'account_password'
              : 'account_password_confirmation';
        if (errors[errorKey]) {
            setErrors(prev => ({ ...prev, [errorKey]: '' }));
        }
    };

    const axiosConfig = {
        headers: {
            'X-CSRF-TOKEN': csrfToken,
            Accept: 'application/json',
        },
    };

    // Diri ipakita ang success message kadiyot.
    const showSuccessMessage = (text) => {
        setFlashMessage({ type: 'success', text });
        setTimeout(() => setFlashMessage(null), 3000);
    };

    // Diri i-normalize ang mga error gikan sa server.
    const normalizeServerErrors = (serverErrors) => Object.fromEntries(
        Object.entries(serverErrors).map(([key, value]) => [
            key,
            Array.isArray(value) ? value[0] : value,
        ])
    );

    // Diri i-save ang pag-edit sa client.
    const handleSubmit = async (e) => {
        e.preventDefault();

        const newErrors = {};
        if (!formData.firstname?.trim()) newErrors.firstname = 'First name is required.';
        if (!formData.lastname?.trim()) newErrors.lastname = 'Last name is required.';
        if (!formData.age) newErrors.age = 'Age is required.';
        if (!formData.barangay_id) newErrors.barangay_id = 'Barangay is required.';
        if (!formData.zone?.trim()) newErrors.zone = 'Zone is required.';
        if (!formData.street?.trim()) newErrors.street = 'Select a street or landmark in El Salvador City.';
        if (formData.phone_number && !/^09\d{9}$/.test(formData.phone_number)) {
            newErrors.phone_number = 'Phone must start with 09 and be 11 digits.';
        }

        if (!isPlaceholderEmail(client.email)) {
            Object.assign(
                newErrors,
                validateCredentials(
                    credentialsForm.email,
                    credentialsForm.password,
                    credentialsForm.password_confirmation
                )
            );
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const payload = {
            ...formData,
            email: isPlaceholderEmail(client.email) ? formData.email : credentialsForm.email,
        };

        if (!isPlaceholderEmail(client.email) && credentialsForm.password) {
            payload.password = credentialsForm.password;
            payload.password_confirmation = credentialsForm.password_confirmation;
        }

        setEditSaving(true);
        setEditSaveSuccess('');

        try {
            const { data } = await axios.put(`/admin/clients/${client.id}`, payload, axiosConfig);
            const message = data?.message || 'Client information updated successfully!';
            setErrors({});
            setEditSaveSuccess(message);
            showSuccessMessage(message);
            setTimeout(() => {
                setShowEditModal(false);
                setEditSaveSuccess('');
                router.reload({ only: ['client'], preserveScroll: true });
            }, 2000);
        } catch (error) {
            if (error.response?.status === 422 && error.response.data?.errors) {
                setErrors(normalizeServerErrors(error.response.data.errors));
            }
        } finally {
            setEditSaving(false);
        }
    };

    // Diri i-update ang form sa hayop.
    const handlePetInputChange = (e) => {
        const { name, value } = e.target;

        setPetFormData(prev => {
            const next = { ...prev, [name]: value };
            if (name === 'other_vaccine_name' && !value.trim()) {
                next.other_vaccine_last_vaccination = '';
            }
            return next;
        });
        
        if (petErrors[name]) {
            setPetErrors(prev => ({
                ...prev,
                [name]: ''
            }));
        }

        if (name === 'other_vaccine_name' && !value.trim() && petErrors.other_vaccine_last_vaccination) {
            setPetErrors(prev => ({
                ...prev,
                other_vaccine_last_vaccination: ''
            }));
        }

        // Update available breeds when species changes
        if (name === 'species_id') {
            const selectedSpecies = species.find(s => s.id === parseInt(value));
            if (selectedSpecies) {
                // Filter breeds for this species
                const breedsForSpecies = breeds.filter(b => b.species_id === parseInt(value));
                setAvailableBreeds(breedsForSpecies);
            } else {
                setAvailableBreeds([]);
            }
            setPetFormData(prev => ({ ...prev, breed_id: '' }));
        }
    };

    // Diri i-reset ang form sa hayop.
    const resetPetForm = () => {
        setPetFormData({
            pet_name: '',
            species_id: '',
            breed_id: '',
            sex: 'male',
            color: '',
            weight: '',
            birthdate: '',
            reproductive_status: '',
            weeks_months: '',
            diet: '',
            diet_other: '',
            dewormed: '',
            last_deworming_date: '',
            dewormer_name: '',
            rabies_vaccine: '',
            rabies_last_vaccination: '',
            dhppl_vaccine: '',
            dhppl_last_vaccination: '',
            other_vaccine_name: '',
            other_vaccine_last_vaccination: '',
        });
        setAvailableBreeds([]);
    };

    // Diri ablihan ang modal sa pag-add og hayop.
    const openPetModal = () => {
        setPetSaveSuccess('');
        setPetErrors({});
        resetPetForm();
        setShowPetModal(true);
    };

    // Diri i-submit ang bag-ong hayop.
    const handlePetSubmit = async (e) => {
        e.preventDefault();

        setPetSaving(true);
        setPetSaveSuccess('');

        try {
            const { data } = await axios.post(`/admin/clients/${client.id}/animals`, petFormData, axiosConfig);
            const message = data?.message || 'Animal added successfully!';
            setPetErrors({});
            setPetSaveSuccess(message);
            showSuccessMessage(message);
            setTimeout(() => {
                setShowPetModal(false);
                setPetSaveSuccess('');
                resetPetForm();
                router.reload({ only: ['client'], preserveScroll: true });
            }, 2000);
        } catch (error) {
            if (error.response?.status === 422 && error.response.data?.errors) {
                setPetErrors(normalizeServerErrors(error.response.data.errors));
            }
        } finally {
            setPetSaving(false);
        }
    };

    // Diri i-set ang field sa hayop.
    const setPetField = (name, value) => {
        setPetFormData((prev) => {
            const next = { ...prev, [name]: value };
            if (name === 'dewormed' && value !== 'yes') {
                next.last_deworming_date = '';
                next.dewormer_name = '';
            }
            if (name === 'rabies_vaccine' && value !== 'yes') {
                next.rabies_last_vaccination = '';
            }
            if (name === 'dhppl_vaccine' && value !== 'yes') {
                next.dhppl_last_vaccination = '';
            }
            if (name === 'reproductive_status' && value !== 'pregnant' && value !== 'nursing') {
                next.weeks_months = '';
            }
            if (name === 'other_vaccine_name' && !String(value || '').trim()) {
                next.other_vaccine_last_vaccination = '';
            }
            return next;
        });
        if (petErrors[name]) {
            setPetErrors((prev) => ({ ...prev, [name]: '' }));
        }
    };

    // Diri i-toggle ang reproductive status sa hayop.
    const toggleReproductiveStatus = (status) => {
        setPetFormData((prev) => ({
            ...prev,
            reproductive_status: prev.reproductive_status === status ? '' : status,
            weeks_months:
                prev.reproductive_status === status || (status !== 'pregnant' && status !== 'nursing')
                    ? ''
                    : prev.weeks_months,
        }));
    };

    // Diri i-toggle ang diet sa hayop.
    const toggleDiet = (diet) => {
        setPetFormData(prev => ({
            ...prev,
            diet: prev.diet === diet ? '' : diet,
            diet_other: diet === 'others' ? prev.diet_other : '',
        }));
    };

    const animals = [...(client.animals || [])].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    const animalCount = animals.length;
    const registeredCount = animals.filter((pet) => pet.registration_status === 'registered').length;
    const pendingCount = animals.filter((pet) => !pet.registration_status || pet.registration_status === 'unregistered').length;
    const fullName = [client.firstname, client.middlename, client.lastname].filter(Boolean).join(' ');
    const hasAccount = !isPlaceholderEmail(client.email);

    return (
        <div className="flex min-h-screen bg-canvas">
            <Sidebar />

            <div className="staff-main flex flex-1 flex-col">
                <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-white/90 px-8 py-5 backdrop-blur-md">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <Link
                                href={backHref}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                                title="Back to Clients"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"/>
                                </svg>
                            </Link>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-gray-900">Client Details</h1>
                                <p className="text-sm text-gray-500">View and manage client information</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleEditClient}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 hover:shadow-md"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                            </svg>
                            Edit Client
                        </button>
                    </div>
                </header>

                <main
                    className="flex-1 overflow-y-auto p-8 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {flashMessage && (
                        <div className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
                            flashMessage.type === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-red-200 bg-red-50 text-red-800'
                        }`}>
                            <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {flashMessage.type === 'success' ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                )}
                            </svg>
                            {flashMessage.text}
                        </div>
                    )}

                    <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                        <div className="border-b border-gray-100 bg-gradient-to-br from-violet-50/70 via-white to-white px-6 py-6 sm:px-8">
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                    {normalizeMediaUrl(client.profile_photo_url) ? (
                                        <img
                                            src={normalizeMediaUrl(client.profile_photo_url)}
                                            alt={fullName || 'Owner photo'}
                                            className="h-24 w-24 shrink-0 rounded-2xl border border-gray-200 object-cover shadow-sm ring-2 ring-white"
                                        />
                                    ) : (
                                        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-600 text-3xl font-bold text-white shadow-sm ring-2 ring-white">
                                            {(client.firstname || client.lastname || '?').charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <div className="mb-2 flex flex-wrap items-center gap-2">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                                                hasAccount
                                                    ? 'bg-violet-100 text-violet-700 ring-violet-200'
                                                    : 'bg-gray-100 text-gray-600 ring-gray-200'
                                            }`}>
                                                {hasAccount ? 'Portal Account' : 'Walk-in Client'}
                                            </span>
                                            {client.approval_status === 'pending' && (
                                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                                                    Under Review
                                                </span>
                                            )}
                                            {client.approval_status === 'rejected' && (
                                                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                                                    Rejected
                                                </span>
                                            )}
                                            {client.zone && (
                                                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
                                                    {client.zone}
                                                </span>
                                            )}
                                            {client.barangay?.name && (
                                                <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 ring-1 ring-violet-100">
                                                    {client.barangay.name}
                                                </span>
                                            )}
                                        </div>
                                        <h2 className="text-2xl font-bold tracking-tight text-gray-900">{fullName}</h2>
                                        <p className="mt-1 text-sm text-gray-600">
                                            {hasAccount ? client.email : 'No portal account yet'}
                                            {client.age ? ` ? ${client.age} years old` : ''}
                                        </p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-3 sm:min-w-[300px]">
                                    <MiniStat
                                        label="Animals"
                                        value={animalCount}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                                            </svg>
                                        }
                                    />
                                    <MiniStat
                                        label="Registered"
                                        value={registeredCount}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                            </svg>
                                        }
                                    />
                                    <MiniStat
                                        label="Pending"
                                        value={pendingCount}
                                        alert={pendingCount > 0}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                                            </svg>
                                        }
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {client.approval_status === 'pending' && (
                        <div className="mb-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
                            <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <h3 className="text-base font-semibold text-amber-900">Registration Under Review</h3>
                                    <p className="mt-1 text-sm text-amber-800">
                                        This client registered via the mobile app. Their owner name is marked Under Review until approved. They can add animals and book appointments while waiting.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => router.post(`/admin/clients/${client.id}/approval`, { action: 'reject' })}
                                        className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                                    >
                                        Reject
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => router.post(`/admin/clients/${client.id}/approval`, { action: 'approve' })}
                                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                                    >
                                        Approve Account
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {client.approval_status === 'rejected' && (
                        <div className="mb-6 overflow-hidden rounded-2xl border border-red-200 bg-red-50 shadow-sm">
                            <div className="px-6 py-5">
                                <h3 className="text-base font-semibold text-red-900">Registration Rejected</h3>
                                <p className="mt-1 text-sm text-red-800">
                                    The account details did not match the photo provided. The client was notified by email and may register again in the VetMob app with matching information.
                                </p>
                            </div>
                        </div>
                    )}

                    {client.id_document_url && (
                        <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                            <SectionHeader title="Verification Document" subtitle="Barangay residence proof, National ID, or Voter's ID" />
                            <a href={normalizeMediaUrl(client.id_document_url)} target="_blank" rel="noopener noreferrer">
                                <img
                                    src={normalizeMediaUrl(client.id_document_url)}
                                    alt="Client verification document"
                                    className="max-h-80 rounded-xl border border-gray-200 object-contain"
                                />
                            </a>
                        </div>
                    )}

                    <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                            <SectionHeader title="Personal Information" subtitle="Contact details and profile data" />
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <InfoRow
                                    label="Full Name"
                                    value={fullName}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Age"
                                    value={client.age ? `${client.age} years` : null}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Email"
                                    value={hasAccount ? client.email : 'Not set'}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Phone"
                                    value={client.phone_number}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                                        </svg>
                                    }
                                />
                                <div className="sm:col-span-2">
                                    <InfoRow
                                        label="Facebook"
                                        value={client.facebook}
                                        icon={
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/>
                                            </svg>
                                        }
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                            <SectionHeader title="Location" subtitle="Barangay, zone, and street or landmark" />
                            <div className="grid grid-cols-1 gap-3">
                                <InfoRow
                                    label="Barangay"
                                    value={client.barangay?.name}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Street or landmark"
                                    value={client.street}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                                        </svg>
                                    }
                                />
                                <InfoRow
                                    label="Zone"
                                    value={client.zone}
                                    icon={
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/>
                                        </svg>
                                    }
                                />
                            </div>
                        </div>
                    </div>

                    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                        <div className="flex flex-col gap-4 border-b border-gray-100 bg-gray-50/50 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                                    </svg>
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-bold text-gray-900">Animals</h3>
                                        {pendingCount > 0 && (
                                            <span className="rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold tabular-nums text-white">
                                                {pendingCount}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-sm text-gray-500">
                                        {animalCount > 0
                                            ? `${animalCount} animal${animalCount === 1 ? '' : 's'} registered under this client`
                                            : 'No animals registered yet'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={openPetModal}
                                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 hover:shadow-md"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
                                </svg>
                                Add Animal
                            </button>
                        </div>

                        <div className="p-6">
                            {animalCount > 0 ? (
                                <>
                                    <div className="space-y-4 lg:hidden">
                                        {animals.map((pet) => (
                                            <div
                                                key={pet.id}
                                                className="rounded-xl border border-gray-100 p-5 transition-colors hover:bg-violet-50/50"
                                            >
                                                <div className="flex flex-col gap-4">
                                                    <div>
                                                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Animal Name</p>
                                                        <p className="font-semibold text-gray-900">{pet.pet_name}</p>
                                                        <p className="mt-0.5 text-xs text-gray-500">
                                                            {pet.species?.species_name || '-'} � {pet.breed?.breed_name || '-'}
                                                        </p>
                                                        {pet.identification_number && (
                                                            <p className="mt-1 text-xs font-semibold text-violet-700">
                                                                ID: {pet.identification_number}
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div>
                                                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Photo</p>
                                                        {normalizeMediaUrl(pet.pet_photo_url) ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openPetProfile(pet)}
                                                                className="rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
                                                                title="View animal profile"
                                                            >
                                                                <img
                                                                    src={normalizeMediaUrl(pet.pet_photo_url)}
                                                                    alt={`${pet.pet_name || 'Pet'} photo`}
                                                                    className="h-12 w-12 cursor-pointer rounded-xl border border-gray-200 object-cover shadow-sm"
                                                                />
                                                            </button>
                                                        ) : (
                                                            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-violet-50 text-sm font-bold text-violet-600">
                                                                {(pet.pet_name || 'P').charAt(0).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div>
                                                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Status</p>
                                                        {pet.registration_status === 'exempt' ? (
                                                            <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                                                                Exempt
                                                            </span>
                                                        ) : (
                                                            <div className="relative inline-flex items-center">
                                                                <select
                                                                    value={pet.registration_status || 'unregistered'}
                                                                    onChange={(e) => {
                                                                        const nextStatus = e.target.value;
                                                                        router.post(
                                                                            `/admin/clients/${client.id}/animals/${pet.id}/status`,
                                                                            { registration_status: nextStatus },
                                                                            {
                                                                                preserveState: true,
                                                                                preserveScroll: true,
                                                                                onSuccess: () => router.reload({ only: ['client'] }),
                                                                            }
                                                                        );
                                                                    }}
                                                                    className={`cursor-pointer appearance-none rounded-full border py-1.5 pl-3 pr-8 text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                                                                        pet.registration_status === 'registered'
                                                                            ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                                                                            : pet.registration_status === 'declined'
                                                                              ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                                                              : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                                    }`}
                                                                    title="Change registration status"
                                                                >
                                                                    <option value="registered">Registered</option>
                                                                    <option value="unregistered">Pending</option>
                                                                    <option value="declined">Declined</option>
                                                                </select>
                                                                <svg className="pointer-events-none absolute right-2 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Action</p>
                                                        <Link
                                                            href={animalHistoryHref(pet.id)}
                                                            className="relative inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-100"
                                                            title="View Animal (Info + History)"
                                                        >
                                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                                            </svg>
                                                            View
                                                            {(!pet.registration_status || pet.registration_status === 'unregistered') && (
                                                                <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                                                                    1
                                                                </span>
                                                            )}
                                                        </Link>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="hidden overflow-hidden rounded-xl border border-gray-100 lg:block">
                                        <table className="w-full table-fixed border-separate border-spacing-0">
                                            <colgroup>
                                                {ANIMAL_COLUMNS.map(({ key, width }) => (
                                                    <col key={key} style={{ width }} />
                                                ))}
                                            </colgroup>
                                            <thead>
                                                <tr>
                                                    {ANIMAL_COLUMNS.map(({ key, label, align }) => (
                                                        <th
                                                            key={key}
                                                            scope="col"
                                                            className={`border-b border-gray-100 bg-gray-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-gray-500 ${tableAlignClass[align]}`}
                                                        >
                                                            {label}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white">
                                                {animals.map((pet) => (
                                                    <tr key={pet.id} className="transition-colors hover:bg-violet-50/50">
                                                        <td className="border-b border-gray-100 px-4 py-4 text-left">
                                                            <p className="truncate font-semibold text-gray-900">{pet.pet_name}</p>
                                                        </td>
                                                        <td className="border-b border-gray-100 px-4 py-4 text-left">
                                                            {pet.identification_number ? (
                                                                <span className="inline-flex rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-100">
                                                                    {pet.identification_number}
                                                                </span>
                                                            ) : pet.registration_status === 'exempt' ? (
                                                                <span className="text-xs text-gray-400">No ID needed</span>
                                                            ) : (
                                                                <span className="text-xs text-gray-400">—</span>
                                                            )}
                                                        </td>
                                                        <td className="border-b border-gray-100 px-4 py-4 text-center">
                                                            {normalizeMediaUrl(pet.pet_photo_url) ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openPetProfile(pet)}
                                                                    className="mx-auto rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300"
                                                                    title="View animal profile"
                                                                >
                                                                    <img
                                                                        src={normalizeMediaUrl(pet.pet_photo_url)}
                                                                        alt={`${pet.pet_name || 'Pet'} photo`}
                                                                        className="mx-auto h-12 w-12 cursor-pointer rounded-xl border border-gray-200 object-cover shadow-sm"
                                                                    />
                                                                </button>
                                                            ) : (
                                                                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-gray-200 bg-violet-50 text-sm font-bold text-violet-600">
                                                                    {(pet.pet_name || 'P').charAt(0).toUpperCase()}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="border-b border-gray-100 px-4 py-4 text-left">
                                                            <div className="truncate text-sm text-gray-600">{pet.species?.species_name || '-'}</div>
                                                        </td>
                                                        <td className="border-b border-gray-100 px-4 py-4 text-left">
                                                            <div className="truncate text-sm text-gray-600">{pet.breed?.breed_name || '-'}</div>
                                                        </td>
                                                        <td className="border-b border-gray-100 px-4 py-4 text-left">
                                                            {pet.registration_status === 'exempt' ? (
                                                                <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700">
                                                                    Exempt
                                                                </span>
                                                            ) : (
                                                                <div className="relative inline-flex items-center">
                                                                    <select
                                                                        value={pet.registration_status || 'unregistered'}
                                                                        onChange={(e) => {
                                                                            const nextStatus = e.target.value;
                                                                            router.post(
                                                                                `/admin/clients/${client.id}/animals/${pet.id}/status`,
                                                                                { registration_status: nextStatus },
                                                                                {
                                                                                    preserveState: true,
                                                                                    preserveScroll: true,
                                                                                    onSuccess: () => router.reload({ only: ['client'] }),
                                                                                }
                                                                            );
                                                                        }}
                                                                        className={`cursor-pointer appearance-none rounded-full border py-1.5 pl-3 pr-8 text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                                                                            pet.registration_status === 'registered'
                                                                                ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                                                                                : pet.registration_status === 'declined'
                                                                                  ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                                                                                  : 'border-gray-200 bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                                        }`}
                                                                        title="Change registration status"
                                                                    >
                                                                        <option value="registered">Registered</option>
                                                                        <option value="unregistered">Pending</option>
                                                                        <option value="declined">Declined</option>
                                                                    </select>
                                                                    <svg className="pointer-events-none absolute right-2 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                                                    </svg>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="border-b border-gray-100 px-4 py-4 text-center">
                                                            <Link
                                                                href={animalHistoryHref(pet.id)}
                                                                className="relative inline-flex items-center justify-center rounded-lg bg-violet-50 p-2 text-violet-600 transition-colors hover:bg-violet-100 hover:text-violet-700"
                                                                title="View Animal (Info + History)"
                                                            >
                                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                                                </svg>
                                                                {(!pet.registration_status || pet.registration_status === 'unregistered') && (
                                                                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold tabular-nums text-white ring-2 ring-white">
                                                                        1
                                                                    </span>
                                                                )}
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/70 px-6 py-14 text-center">
                                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900">No animals registered</h3>
                                    <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                                        Add an animal to start tracking medical records, vaccinations, and appointments for this client.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={openPetModal}
                                        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700"
                                    >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/>
                                        </svg>
                                        Add First Animal
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </main>
            </div>

            {/* Add Animal Modal */}
            {showPetModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setShowPetModal(false)}>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />

                    <div
                        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
                            <div className="px-6 py-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Add Animal</h3>
                                            <p className="text-sm text-gray-500">Register a new animal for {fullName}</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowPetModal(false)}
                                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                    >
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            {petSaveSuccess && (
                                <div className="mx-6 mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                                    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {petSaveSuccess}
                                </div>
                            )}
                        </div>

                        <form onSubmit={handlePetSubmit} className="flex flex-1 flex-col overflow-hidden">
                            <div className={`flex-1 space-y-5 overflow-y-auto px-6 py-5 ${hiddenScrollbarClass}`} style={hiddenScrollbarStyle}>
                                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <SectionHeader compact title="Animal Profile" subtitle="Basic identification details" />
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <div className="md:col-span-2">
                                            <EditFormField label="Animal Name" required error={petErrors.pet_name}>
                                                <input type="text" name="pet_name" value={petFormData.pet_name} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.pet_name)} placeholder="Enter animal name" />
                                            </EditFormField>
                                        </div>
                                        <EditFormField label="Species" required error={petErrors.species_id}>
                                            <select name="species_id" value={petFormData.species_id} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.species_id)}>
                                                <option value="">Select Species</option>
                                                {species.map((s) => (
                                                    <option key={s.id} value={s.id}>{s.species_name}</option>
                                                ))}
                                            </select>
                                        </EditFormField>
                                        <EditFormField label="Breed" required error={petErrors.breed_id}>
                                            <select name="breed_id" value={petFormData.breed_id} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.breed_id)} disabled={!petFormData.species_id}>
                                                <option value="">Select Breed</option>
                                                {availableBreeds.map((b) => (
                                                    <option key={b.id} value={b.id}>{b.breed_name}</option>
                                                ))}
                                            </select>
                                        </EditFormField>
                                        <EditFormField label="Sex" required error={petErrors.sex}>
                                            <select name="sex" value={petFormData.sex} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.sex)}>
                                                <option value="male">Male</option>
                                                <option value="female">Female</option>
                                            </select>
                                        </EditFormField>
                                        <EditFormField label="Birthdate" error={petErrors.birthdate}>
                                            <input type="date" name="birthdate" value={petFormData.birthdate} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.birthdate)} />
                                        </EditFormField>
                                        <EditFormField label="Color" error={petErrors.color}>
                                            <input type="text" name="color" value={petFormData.color} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.color)} placeholder="e.g. Brown, Black" />
                                        </EditFormField>
                                        <EditFormField label="Weight (kg)" error={petErrors.weight}>
                                            <input type="number" name="weight" value={petFormData.weight} onChange={handlePetInputChange} step="0.01" min="0" className={editFieldClass(!!petErrors.weight)} placeholder="0.00" />
                                        </EditFormField>
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <SectionHeader compact title="Reproductive Status" subtitle="Optional breeding information" />
                                    <div className="flex flex-wrap gap-2">
                                        <OptionPill active={petFormData.reproductive_status === 'pregnant'} onClick={() => toggleReproductiveStatus('pregnant')}>Pregnant</OptionPill>
                                        <OptionPill active={petFormData.reproductive_status === 'nursing'} onClick={() => toggleReproductiveStatus('nursing')}>Nursing</OptionPill>
                                        <OptionPill active={petFormData.reproductive_status === 'not_pregnant'} onClick={() => toggleReproductiveStatus('not_pregnant')}>Not Pregnant</OptionPill>
                                    </div>
                                    {(petFormData.reproductive_status === 'pregnant' || petFormData.reproductive_status === 'nursing') && (
                                        <div className="mt-4">
                                            <EditFormField label="Duration" error={petErrors.weeks_months} hint="e.g. 4 weeks">
                                                <input type="text" name="weeks_months" value={petFormData.weeks_months} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.weeks_months)} placeholder="Weeks or months" />
                                            </EditFormField>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <SectionHeader compact title="Diet" subtitle="Feeding preferences" />
                                    <div className="flex flex-wrap gap-2">
                                        <OptionPill active={petFormData.diet === 'commercial_food'} onClick={() => toggleDiet('commercial_food')}>Commercial Food</OptionPill>
                                        <OptionPill active={petFormData.diet === 'table_food'} onClick={() => toggleDiet('table_food')}>Table Food</OptionPill>
                                        <OptionPill active={petFormData.diet === 'both'} onClick={() => toggleDiet('both')}>Both</OptionPill>
                                        <OptionPill active={petFormData.diet === 'others'} onClick={() => toggleDiet('others')}>Others</OptionPill>
                                    </div>
                                    {petFormData.diet === 'others' && (
                                        <div className="mt-4">
                                            <EditFormField label="Specify Diet" error={petErrors.diet_other}>
                                                <input type="text" name="diet_other" value={petFormData.diet_other} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.diet_other)} placeholder="Describe the diet" />
                                            </EditFormField>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <SectionHeader compact title="Deworming History" subtitle="Past deworming records" />
                                    <div className="space-y-4">
                                        <YesNoRow label="Has been dewormed?" value={petFormData.dewormed} onChange={(val) => setPetField('dewormed', val)} />
                                        {petFormData.dewormed === 'yes' && (
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <EditFormField label="Last Deworming Date" error={petErrors.last_deworming_date}>
                                                    <input type="date" name="last_deworming_date" value={petFormData.last_deworming_date} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.last_deworming_date)} />
                                                </EditFormField>
                                                <EditFormField label="Dewormer Name" error={petErrors.dewormer_name}>
                                                    <input type="text" name="dewormer_name" value={petFormData.dewormer_name} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.dewormer_name)} placeholder="Name of dewormer" />
                                                </EditFormField>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <SectionHeader compact title="Vaccination History" subtitle="Vaccination records" />
                                    <div className="space-y-4">
                                        <YesNoRow label="Rabies vaccine" value={petFormData.rabies_vaccine} onChange={(val) => setPetField('rabies_vaccine', val)} />
                                        {petFormData.rabies_vaccine === 'yes' && (
                                            <EditFormField label="Last Rabies Vaccination" error={petErrors.rabies_last_vaccination}>
                                                <input type="date" name="rabies_last_vaccination" value={petFormData.rabies_last_vaccination} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.rabies_last_vaccination)} />
                                            </EditFormField>
                                        )}

                                        <YesNoRow label="DHPPL vaccine" value={petFormData.dhppl_vaccine} onChange={(val) => setPetField('dhppl_vaccine', val)} />
                                        {petFormData.dhppl_vaccine === 'yes' && (
                                            <EditFormField label="Last DHPPL Vaccination" error={petErrors.dhppl_last_vaccination}>
                                                <input type="date" name="dhppl_last_vaccination" value={petFormData.dhppl_last_vaccination} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.dhppl_last_vaccination)} />
                                            </EditFormField>
                                        )}

                                        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3.5">
                                            <p className="mb-3 text-sm font-medium text-gray-700">Other vaccine</p>
                                            <EditFormField label="Vaccine Name" error={petErrors.other_vaccine_name} hint="Leave empty if none">
                                                <input type="text" name="other_vaccine_name" value={petFormData.other_vaccine_name} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.other_vaccine_name)} placeholder="Name of vaccine" />
                                            </EditFormField>
                                            {petFormData.other_vaccine_name.trim() ? (
                                                <div className="mt-4">
                                                    <EditFormField label="Last Vaccination Date" error={petErrors.other_vaccine_last_vaccination}>
                                                        <input type="date" name="other_vaccine_last_vaccination" value={petFormData.other_vaccine_last_vaccination} onChange={handlePetInputChange} className={editFieldClass(!!petErrors.other_vaccine_last_vaccination)} />
                                                    </EditFormField>
                                                </div>
                                            ) : (
                                                <p className="mt-2 text-xs text-gray-500">None</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4">
                                <button
                                    type="button"
                                    onClick={() => setShowPetModal(false)}
                                    className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={petSaving || !!petSaveSuccess}
                                    className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:opacity-50 ${
                                        petSaveSuccess
                                            ? 'bg-emerald-600 text-white shadow-emerald-200'
                                            : 'bg-violet-600 text-white shadow-violet-200 hover:bg-violet-700'
                                    }`}
                                >
                                    {petSaveSuccess ? (
                                        <>
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                            Added!
                                        </>
                                    ) : petSaving ? (
                                        <>
                                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Saving...
                                        </>
                                    ) : (
                                        'Add Animal'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Client Modal */}
            {showEditModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />

                    <div
                        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
                            <div className="px-6 py-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                            </svg>
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">Edit Client</h3>
                                            <p className="text-sm text-gray-500">Update profile, credentials, and location</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowEditModal(false)}
                                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white hover:text-gray-600"
                                    >
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            {editSaveSuccess && (
                                <div className="mx-6 mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                                    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {editSaveSuccess}
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
                            <div className={`flex-1 space-y-5 overflow-y-auto px-6 py-5 ${hiddenScrollbarClass}`} style={hiddenScrollbarStyle}>
                                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <SectionHeader compact title="Personal Information" subtitle="Basic client profile details" />
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <EditFormField label="First Name" required error={errors.firstname}>
                                            <input type="text" name="firstname" value={formData.firstname} onChange={handleInputChange} className={editFieldClass(!!errors.firstname)} />
                                        </EditFormField>
                                        <EditFormField label="Middle Name" error={errors.middlename}>
                                            <input type="text" name="middlename" value={formData.middlename} onChange={handleInputChange} className={editFieldClass(!!errors.middlename)} />
                                        </EditFormField>
                                        <EditFormField label="Last Name" required error={errors.lastname}>
                                            <input type="text" name="lastname" value={formData.lastname} onChange={handleInputChange} className={editFieldClass(!!errors.lastname)} />
                                        </EditFormField>
                                        <EditFormField label="Age" required error={errors.age}>
                                            <input type="number" name="age" value={formData.age} onChange={handleInputChange} min="1" max="120" className={editFieldClass(!!errors.age)} />
                                        </EditFormField>
                                        <EditFormField label="Phone Number" error={errors.phone_number} hint="Must start with 09 and be 11 digits">
                                            <input type="tel" name="phone_number" value={formData.phone_number} onChange={handleInputChange} placeholder="09XXXXXXXXX" maxLength={11} inputMode="numeric" className={editFieldClass(!!errors.phone_number)} />
                                        </EditFormField>
                                        <div className="md:col-span-2">
                                            <EditFormField label="Facebook" error={errors.facebook}>
                                                <input type="text" name="facebook" value={formData.facebook} onChange={handleInputChange} className={editFieldClass(!!errors.facebook)} placeholder="Profile URL or username" />
                                            </EditFormField>
                                        </div>
                                    </div>
                                </div>

                                {!isPlaceholderEmail(client.email) ? (
                                    <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                        <SectionHeader compact title="Account Credentials" subtitle="Login email and optional password update" />
                                        <div className="space-y-4">
                                            <EditFormField label="Email Address" required error={errors.email}>
                                                <input type="email" name="email" value={credentialsForm.email} onChange={handleCredentialsChange} className={editFieldClass(!!errors.email)} placeholder="client@example.com" />
                                            </EditFormField>
                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <EditFormField label="New Password" error={errors.password} hint="Leave blank to keep current password">
                                                    <input type="password" name="password" value={credentialsForm.password} onChange={handleCredentialsChange} className={editFieldClass(!!errors.password)} placeholder="Minimum 8 characters" />
                                                </EditFormField>
                                                <EditFormField label="Confirm Password" error={errors.password_confirmation}>
                                                    <input type="password" name="password_confirmation" value={credentialsForm.password_confirmation} onChange={handleCredentialsChange} className={editFieldClass(!!errors.password_confirmation)} placeholder="Re-enter new password" />
                                                </EditFormField>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="rounded-xl border border-gray-100 bg-violet-50/40 p-5 shadow-sm">
                                        {!showCreateAccount ? (
                                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-bold text-gray-900">No Portal Account</h4>
                                                        <p className="mt-0.5 text-sm text-gray-500">This walk-in client cannot log in yet. Create credentials below.</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setAccountForm({ email: '', password: '', password_confirmation: '' });
                                                        setShowCreateAccount(true);
                                                        setErrors({});
                                                    }}
                                                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700"
                                                >
                                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/>
                                                    </svg>
                                                    Create Account
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <SectionHeader compact title="Create Login Account" subtitle="Set valid credentials for portal access" />
                                                <div className="space-y-4">
                                                    <EditFormField label="Email Address" required error={errors.account_email}>
                                                        <input type="email" name="email" value={accountForm.email} onChange={handleAccountFormChange} className={editFieldClass(!!errors.account_email)} placeholder="client@example.com" />
                                                    </EditFormField>
                                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                        <EditFormField label="Password" required error={errors.account_password} hint="Minimum 8 characters">
                                                            <input type="password" name="password" value={accountForm.password} onChange={handleAccountFormChange} className={editFieldClass(!!errors.account_password)} placeholder="Enter password" />
                                                        </EditFormField>
                                                        <EditFormField label="Confirm Password" required error={errors.account_password_confirmation}>
                                                            <input type="password" name="password_confirmation" value={accountForm.password_confirmation} onChange={handleAccountFormChange} className={editFieldClass(!!errors.account_password_confirmation)} placeholder="Confirm password" />
                                                        </EditFormField>
                                                    </div>
                                                    <div className="flex gap-3 border-t border-gray-100 pt-4">
                                                        <button type="button" onClick={() => setShowCreateAccount(false)} className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                                                            Cancel
                                                        </button>
                                                        <button type="button" onClick={handleCreateAccount} className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700">
                                                            Create Account
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                                    <SectionHeader compact title="Location" subtitle="Barangay, zone, and street or landmark" />
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                        <EditFormField label="Barangay" required error={errors.barangay_id}>
                                            <select name="barangay_id" value={formData.barangay_id} onChange={handleInputChange} className={editFieldClass(!!errors.barangay_id)}>
                                                <option value="">Select Barangay</option>
                                                {barangays.map((barangay) => (
                                                    <option key={barangay.id} value={barangay.id}>{barangay.name}</option>
                                                ))}
                                            </select>
                                        </EditFormField>
                                        <EditFormField label="Zone" required error={errors.zone}>
                                            <select
                                                name="zone"
                                                value={formData.zone}
                                                onChange={handleInputChange}
                                                disabled={!formData.barangay_id}
                                                className={editFieldClass(!!errors.zone) + ' disabled:cursor-not-allowed disabled:opacity-60'}
                                            >
                                                <option value="">
                                                    {formData.barangay_id ? 'Select Zone' : 'Select a barangay first'}
                                                </option>
                                                {zones
                                                    .filter((zone) => String(zone.barangay_id) === String(formData.barangay_id))
                                                    .map((zone) => (
                                                        <option key={zone.id} value={zone.name}>{zone.name}</option>
                                                    ))}
                                                {formData.zone &&
                                                    !zones.some(
                                                        (zone) =>
                                                            zone.name === formData.zone &&
                                                            String(zone.barangay_id) === String(formData.barangay_id)
                                                    ) && (
                                                        <option value={formData.zone}>{formData.zone}</option>
                                                    )}
                                            </select>
                                        </EditFormField>
                                        <div className="md:col-span-2">
                                            <EditFormField label="Street or landmark" required error={errors.street} hint="Only places in the selected barangay and zone">
                                                <ElSalvadorStreetField
                                                    value={formData.street}
                                                    barangay={barangays.find((item) => String(item.id) === String(formData.barangay_id))?.name || ''}
                                                    zone={formData.zone}
                                                    token={mapboxToken}
                                                    inputClass={editFieldClass(!!errors.street)}
                                                    onChange={(street) => {
                                                        setFormData((prev) => ({ ...prev, street }));
                                                        setErrors((prev) => {
                                                            const { street: _street, ...rest } = prev;
                                                            return rest;
                                                        });
                                                    }}
                                                />
                                            </EditFormField>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50/80 px-6 py-4">
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-white"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={editSaving || !!editSaveSuccess}
                                    className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-all disabled:opacity-50 ${
                                        editSaveSuccess
                                            ? 'bg-emerald-600 text-white shadow-emerald-200'
                                            : 'bg-violet-600 text-white shadow-violet-200 hover:bg-violet-700'
                                    }`}
                                >
                                    {editSaveSuccess ? (
                                        <>
                                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                            Saved!
                                        </>
                                    ) : editSaving ? (
                                        <>
                                            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Changes'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View/Edit Animal Modal */}
            {showViewPetModal && selectedPet && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setShowViewPetModal(false)}>
                    {/* Backdrop */}
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" />
                    
                    {/* Modal Panel */}
                    <div className={`relative max-h-[90vh] w-full max-w-lg transform overflow-y-auto rounded-2xl bg-white shadow-2xl mx-4 ${hiddenScrollbarClass}`} style={hiddenScrollbarStyle} onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-6 py-5 backdrop-blur-sm rounded-t-2xl">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">{isEditingPet ? 'Edit Animal' : 'Animal Details'}</h3>
                                        <p className="text-sm text-gray-500">{selectedPet.pet_name}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowViewPetModal(false);
                                        setIsEditingPet(false);
                                    }}
                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                >
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Animal Info / Edit Form */}
                        <div className="p-6 space-y-4">
                            {/* Animal Avatar */}
                            <div className="flex items-center justify-center mb-6">
                                {normalizeMediaUrl(selectedPet.pet_photo_url) ? (
                                    <button
                                        type="button"
                                        onClick={() => openPhotoPreview(selectedPet.pet_photo_url, `${selectedPet.pet_name || 'Pet'} photo`)}
                                        className="focus:outline-none focus:ring-2 focus:ring-violet-400 rounded-2xl"
                                        title="Click to enlarge photo"
                                    >
                                        <img
                                            src={normalizeMediaUrl(selectedPet.pet_photo_url)}
                                            alt={`${selectedPet.pet_name || 'Pet'} photo`}
                                            className="w-20 h-20 rounded-2xl object-cover border border-gray-200 shadow-lg cursor-zoom-in"
                                        />
                                    </button>
                                ) : (
                                    <div className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-700 text-3xl font-bold text-white shadow-lg`}>
                                        {selectedPet.pet_name.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            {isEditingPet ? (
                                /* Edit Mode Form */
                                <div className="space-y-4">
                                    {/* Pet Name */}
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Pet Name</label>
                                        <input
                                            type="text"
                                            value={editPetFormData.pet_name}
                                            onChange={(e) => setEditPetFormData({ ...editPetFormData, pet_name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                        />
                                    </div>

                                    {/* Species & Breed */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Species</label>
                                            <select
                                                value={editPetFormData.species_id}
                                                onChange={(e) => {
                                                    const newSpeciesId = e.target.value;
                                                    const breedsForSpecies = breeds.filter(b => b.species_id === parseInt(newSpeciesId));
                                                    setEditPetAvailableBreeds(breedsForSpecies);
                                                    setEditPetFormData({ ...editPetFormData, species_id: newSpeciesId, breed_id: '' });
                                                }}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white"
                                            >
                                                <option value="">Select</option>
                                                {species.map((s) => (
                                                    <option key={s.id} value={s.id}>{s.species_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Breed</label>
                                            <select
                                                value={editPetFormData.breed_id}
                                                onChange={(e) => setEditPetFormData({ ...editPetFormData, breed_id: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white"
                                                disabled={!editPetFormData.species_id}
                                            >
                                                <option value="">Select</option>
                                                {editPetAvailableBreeds.map((b) => (
                                                    <option key={b.id} value={b.id}>{b.breed_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Sex & Status */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Sex</label>
                                            <select
                                                value={editPetFormData.sex}
                                                onChange={(e) => setEditPetFormData({ ...editPetFormData, sex: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white"
                                            >
                                                <option value="male">? Male</option>
                                                <option value="female">? Female</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Status</label>
                                            {selectedPet.registration_status === 'exempt' ? (
                                                <div className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm bg-gray-100 text-gray-600">
                                                    Exempt (No registration required)
                                                </div>
                                            ) : (
                                                <select
                                                    value={editPetFormData.registration_status}
                                                    onChange={(e) => {
                                                        setEditPetFormData({ ...editPetFormData, registration_status: e.target.value });
                                                        setModalPetStatus(e.target.value);
                                                    }}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white"
                                                >
                                                    <option value="pending">? Pending</option>
                                                    <option value="registered">? Registered</option>
                                                    <option value="declined">? Declined</option>
                                                </select>
                                            )}
                                        </div>
                                    </div>

                                    {/* Color & Weight */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Color</label>
                                            <input
                                                type="text"
                                                value={editPetFormData.color}
                                                onChange={(e) => setEditPetFormData({ ...editPetFormData, color: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                                placeholder="e.g. Brown"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Weight (kg)</label>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={editPetFormData.weight}
                                                onChange={(e) => setEditPetFormData({ ...editPetFormData, weight: e.target.value })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                                placeholder="0.0"
                                            />
                                        </div>
                                    </div>

                                    {/* Birthdate */}
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Birthdate</label>
                                        <input
                                            type="date"
                                            value={editPetFormData.birthdate}
                                            onChange={(e) => setEditPetFormData({ ...editPetFormData, birthdate: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                                        />
                                    </div>
                                </div>
                            ) : (
                                /* View Mode */
                                <>
                                    {/* Animal Name */}
                                    <div className="text-center mb-6">
                                        <h4 className="text-2xl font-bold text-gray-900">{selectedPet.pet_name}</h4>
                                        {selectedPet.identification_number ? (
                                            <span className="mt-1 inline-flex rounded-md bg-violet-50 px-2.5 py-1 text-sm font-semibold text-violet-700 ring-1 ring-violet-100">
                                                {selectedPet.identification_number}
                                            </span>
                                        ) : selectedPet.registration_status === 'exempt' ? (
                                            <span className="mt-1 text-sm text-gray-400">No ID needed</span>
                                        ) : null}
                                        <div className="flex items-center justify-center gap-2 mt-2">
                                            <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700">
                                                {selectedPet.sex === 'male' ? 'Male' : 'Female'}
                                            </span>
                                            {selectedPet.registration_status === 'exempt' ? (
                                                <span className="px-3 py-1 text-sm font-semibold rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                                                    Exempt
                                                </span>
                                            ) : (
                                                <span className={`px-3 py-1 text-sm font-semibold rounded-full border ${
                                                    modalPetStatus === 'registered' ? 'bg-violet-100 text-violet-800 border-violet-200' :
                                                    modalPetStatus === 'declined' ? 'bg-violet-50 text-violet-500 border-violet-100' :
                                                    'bg-violet-50 text-violet-600 border-violet-100'
                                                }`}>
                                                    {modalPetStatus === 'registered' ? 'Registered' : modalPetStatus}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Animal Photos */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                                        <button
                                            type="button"
                                            onClick={() => openPhotoPreview(selectedPet.pet_photo_url, `${selectedPet.pet_name || 'Pet'} photo`)}
                                            className="rounded-xl border border-violet-100 bg-violet-50/60 p-3 text-left transition-colors hover:bg-violet-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                            disabled={!normalizeMediaUrl(selectedPet.pet_photo_url)}
                                        >
                                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Animal Photo</div>
                                            {normalizeMediaUrl(selectedPet.pet_photo_url) ? (
                                                <img
                                                    src={normalizeMediaUrl(selectedPet.pet_photo_url)}
                                                    alt={`${selectedPet.pet_name || 'Pet'} profile`}
                                                    className="w-full h-32 rounded-lg object-cover cursor-zoom-in"
                                                />
                                            ) : (
                                                <div className="w-full h-32 rounded-lg bg-white border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500">
                                                    No photo uploaded
                                                </div>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => openPhotoPreview(selectedPet.markings_photo_url, `${selectedPet.pet_name || 'Pet'} markings`)}
                                            className="rounded-xl border border-violet-100 bg-violet-50/60 p-3 text-left transition-colors hover:bg-violet-50 disabled:opacity-60 disabled:cursor-not-allowed"
                                            disabled={!normalizeMediaUrl(selectedPet.markings_photo_url)}
                                        >
                                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-2">Unique Markings Photo</div>
                                            {normalizeMediaUrl(selectedPet.markings_photo_url) ? (
                                                <img
                                                    src={normalizeMediaUrl(selectedPet.markings_photo_url)}
                                                    alt={`${selectedPet.pet_name || 'Pet'} unique markings`}
                                                    className="w-full h-32 rounded-lg object-cover cursor-zoom-in"
                                                />
                                            ) : (
                                                <div className="w-full h-32 rounded-lg bg-white border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-500">
                                                    No markings photo uploaded
                                                </div>
                                            )}
                                        </button>
                                    </div>

                                    {/* Details Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Species</div>
                                            <div className="font-semibold text-gray-900">{selectedPet.species?.species_name || '-'}</div>
                                        </div>
                                        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Breed</div>
                                            <div className="font-semibold text-gray-900">{selectedPet.breed?.breed_name || '-'}</div>
                                        </div>
                                        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Color</div>
                                            <div className="font-semibold text-gray-900">{selectedPet.color || '-'}</div>
                                        </div>
                                        <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Weight</div>
                                            <div className="font-semibold text-gray-900">{selectedPet.weight ? `${selectedPet.weight} kg` : '-'}</div>
                                        </div>
                                        <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Birthdate</div>
                                            <div className="font-semibold text-gray-900">
                                                {selectedPet.birthdate 
                                                    ? new Date(selectedPet.birthdate).toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})
                                                    : '-'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Medical Profile Section */}
                                    <div className="mt-6 pt-6 border-t border-gray-200">
                                        <h4 className="text-sm font-semibold text-gray-900 mb-4">Medical Profile</h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Reproductive Status */}
                                            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Reproductive Status</div>
                                                <div className="font-semibold text-gray-900">
                                                    {selectedPet.reproductive_status 
                                                        ? selectedPet.reproductive_status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                                                        : '-'}
                                                </div>
                                                {selectedPet.weeks_months && (
                                                    <div className="text-sm text-gray-600 mt-1">{selectedPet.weeks_months}</div>
                                                )}
                                            </div>
                                            {/* Diet */}
                                            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Diet</div>
                                                <div className="font-semibold text-gray-900">
                                                    {selectedPet.diet 
                                                        ? selectedPet.diet.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
                                                        : '-'}
                                                </div>
                                                {selectedPet.diet_other && (
                                                    <div className="text-sm text-gray-600 mt-1">{selectedPet.diet_other}</div>
                                                )}
                                            </div>
                                            {/* Deworming */}
                                            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Deworming</div>
                                                <div className="font-semibold text-gray-900">
                                                    {selectedPet.dewormed === 'yes' ? 'Yes' : selectedPet.dewormed === 'no' ? 'No' : '-'}
                                                </div>
                                                {selectedPet.dewormed === 'yes' && (
                                                    <div className="text-sm text-gray-600 mt-1">
                                                        {selectedPet.dewormer_name || 'Unknown dewormer'}
                                                        {selectedPet.last_deworming_date && (
                                                            <span className="block text-xs text-gray-500">
                                                                {new Date(selectedPet.last_deworming_date).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Rabies Vaccine */}
                                            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Rabies Vaccine</div>
                                                <div className="font-semibold text-gray-900">
                                                    {selectedPet.rabies_vaccine === 'yes' ? 'Yes' : selectedPet.rabies_vaccine === 'no' ? 'No' : '-'}
                                                </div>
                                                {selectedPet.rabies_vaccine === 'yes' && selectedPet.rabies_last_vaccination && (
                                                    <div className="text-sm text-gray-600 mt-1">
                                                        {new Date(selectedPet.rabies_last_vaccination).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}
                                                        <span className="block text-xs text-gray-500">
                                                            {(selectedPet.rabies_dose_type === 'booster' ? 'Booster · 3 years' : 'First vaccination · 1 year')}
                                                            {selectedPet.rabies_valid_until ? ` · valid until ${new Date(selectedPet.rabies_valid_until).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}` : ''}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                            {/* DHPPL Vaccine */}
                                            <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                                                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">DHPPL Vaccine</div>
                                                <div className="font-semibold text-gray-900">
                                                    {selectedPet.dhppl_vaccine === 'yes' ? 'Yes' : selectedPet.dhppl_vaccine === 'no' ? 'No' : '-'}
                                                </div>
                                                {selectedPet.dhppl_vaccine === 'yes' && selectedPet.dhppl_last_vaccination && (
                                                    <div className="text-sm text-gray-600 mt-1">
                                                        {new Date(selectedPet.dhppl_last_vaccination).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}
                                                    </div>
                                                )}
                                            </div>
                                            {/* Other Vaccine */}
                                            {(selectedPet.other_vaccine_name || selectedPet.other_vaccine_last_vaccination) && (
                                                <div className="bg-gray-50 rounded-xl p-4 col-span-2">
                                                    <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Other Vaccine</div>
                                                    <div className="font-semibold text-gray-900">{selectedPet.other_vaccine_name}</div>
                                                    {selectedPet.other_vaccine_last_vaccination && (
                                                        <div className="text-sm text-gray-600 mt-1">
                                                            {new Date(selectedPet.other_vaccine_last_vaccination).toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl flex justify-between items-center">
                            {isEditingPet ? (
                                /* Edit Mode Footer */
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setIsEditingPet(false)}
                                        className="px-5 py-2.5 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-100 transition-colors shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            router.post(`/admin/clients/${client.id}/animals/${selectedPet.id}`, editPetFormData, {
                                                preserveState: true,
                                                preserveScroll: true,
                                                onSuccess: () => {
                                                    setIsEditingPet(false);
                                                    router.reload({ only: ['client'] });
                                                },
                                            });
                                        }}
                                        className="px-5 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-sm flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                                        </svg>
                                        Save Changes
                                    </button>
                                </>
                            ) : (
                                /* View Mode Footer */
                                <>
                                    <button
                                        type="button"
                                        onClick={() => setShowViewPetModal(false)}
                                        className="px-5 py-2.5 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-100 transition-colors shadow-sm"
                                    >
                                        Close
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowQrModal(true)}
                                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7h2v2H3V7zm0 4h2v2H3v-2zm4-4h2v2H7V7zm0 4h2v2H7v-2zm4-4h2v2h-2V7zm0 4h2v2h-2v-2zm4-4h2v2h-2V7zm0 4h2v2h-2v-2zM3 11h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2zM3 15h2v2H3v-2zm4 0h2v2H7v-2zm4 0h2v2h-2v-2zm4 0h2v2h-2v-2z"/>
                                            </svg>
                                            Generate QR
                                        </button>
                                        {/* Approve/Decline buttons for unregistered animals */}
                                        {modalPetStatus === 'unregistered' && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        router.post(`/admin/clients/${client.id}/animals/${selectedPet.id}/status`, {
                                                            registration_status: 'registered'
                                                        }, {
                                                            preserveState: true,
                                                            preserveScroll: true,
                                                            onSuccess: () => {
                                                                setModalPetStatus('registered');
                                                                router.reload({ only: ['client'] });
                                                            },
                                                        });
                                                    }}
                                                    className="px-4 py-2.5 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-colors shadow-sm flex items-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/>
                                                    </svg>
                                                    Approve
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        router.post(`/admin/clients/${client.id}/animals/${selectedPet.id}/status`, {
                                                            registration_status: 'declined'
                                                        }, {
                                                            preserveState: true,
                                                            preserveScroll: true,
                                                            onSuccess: () => {
                                                                setModalPetStatus('declined');
                                                                router.reload({ only: ['client'] });
                                                            },
                                                        });
                                                    }}
                                                    className="px-4 py-2.5 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 transition-colors shadow-sm flex items-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                                    </svg>
                                                    Decline
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setIsEditingPet(true)}
                                            className="p-2.5 border border-violet-300 rounded-xl text-violet-700 bg-violet-50 hover:bg-violet-100 transition-colors shadow-sm"
                                            title="Edit Pet"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                            </svg>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Photo Preview Modal */}
            {photoPreview.open && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" onClick={() => setPhotoPreview({ open: false, url: '', label: '' })}>
                    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" />
                    <div className="relative max-w-4xl w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={photoPreview.url}
                            alt={photoPreview.label}
                            className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl"
                        />
                        <p className="mt-3 text-white text-sm">{photoPreview.label}</p>
                        <button
                            type="button"
                            onClick={() => setPhotoPreview({ open: false, url: '', label: '' })}
                            className="mt-3 px-4 py-2 bg-white/90 text-gray-900 rounded-lg text-sm font-medium hover:bg-white"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            <AnimalQrModal
                open={showQrModal}
                animal={selectedPet}
                ownerId={client?.id}
                onClose={() => setShowQrModal(false)}
            />
        </div>
    );
}

