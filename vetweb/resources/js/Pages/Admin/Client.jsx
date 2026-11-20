import { useState, useEffect } from 'react';
import { Link, router, useForm, usePage } from '@inertiajs/react';
import Sidebar from '@/Components/Admin/Sidebar';
import PetOwnersList from './PetOwnersList';
import BarangayAnimalsList from './BarangayAnimalsList';
import BreedSpeciesModal from '../../Components/Admin/BreedSpeciesModal';
import ClientStatusDropdown from '@/Components/Admin/ClientStatusDropdown';
import Tabs from '@/Components/Ui/Tabs';
import ElSalvadorStreetField from '@/Components/Admin/ElSalvadorStreetField';

const LIST_STATUS_COPY = {
    approved: {
        subtitle: 'Manage registered animal owners across all barangays',
        barangayHint: 'Browse approved clients by location folder',
    },
    pending: {
        subtitle: 'Review mobile registrations marked Under Review',
        barangayHint: 'Browse pending registrations by barangay',
    },
    rejected: {
        subtitle: 'View cancelled registrations that did not match ID or residence proof',
        barangayHint: 'Browse cancelled registrations by barangay',
    },
};

// Diri ang page sa listahan sa mga client.
export default function Client({ clients = [], animals = [], barangays, zones = [], species = [], breeds = [], listStatus = 'approved' }) {
    const { props, flash, url } = usePage();
    const [flashMessage, setFlashMessage] = useState(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [showBreedSpeciesModal, setShowBreedSpeciesModal] = useState(false);
    const [animalTypes, setAnimalTypes] = useState([]);

    // Handle flash messages
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
    
    // Initialize search term and barangay from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const listView = new URLSearchParams((url || '').split('?')[1] || '').get('view') === 'clients' ? 'clients' : 'animals';
    const [selectedBarangay, setSelectedBarangay] = useState(urlParams.get('barangay_id') || '');
    const [searchTerm, setSearchTerm] = useState(urlParams.get('search') || '');
    const [barangaySearch, setBarangaySearch] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    const totalAnimals = animals.length;
    const activeBarangayName = selectedBarangay
        ? barangays.find(b => String(b.id) === String(selectedBarangay))?.name
        : null;

    const filteredBarangays = barangays.filter(b =>
        b.name.toLowerCase().includes(barangaySearch.toLowerCase())
    );

    const statusCopy = LIST_STATUS_COPY[listStatus] ?? LIST_STATUS_COPY.approved;
    const showingAnimals = listView === 'animals';
    const pageSubtitle = showingAnimals
        ? (activeBarangayName
            ? `Pets in ${activeBarangayName}`
            : 'Pets listed in each barangay')
        : (activeBarangayName
            ? `Viewing ${listStatus === 'approved' ? 'clients' : 'registrations'} in ${activeBarangayName}`
            : statusCopy.subtitle);
    const barangayHint = showingAnimals
        ? 'Open a folder to list the pets in that barangay'
        : statusCopy.barangayHint;

    // Diri ilisan ang listahan tali sa hayop ug client.
    const handleViewChange = (nextView) => {
        const params = new URLSearchParams(window.location.search);
        let path = window.location.pathname;
        if (nextView === 'clients') {
            params.set('view', 'clients');
        } else {
            params.delete('view');
            if (listStatus === 'rejected') {
                path = '/admin/barangay-animals';
            }
        }
        const query = params.toString();
        router.get(query ? `${path}?${query}` : path, {}, {
            preserveState: true,
            preserveScroll: true,
        });
    };

    // Diri ang Cancelled para sa clients lang.
    useEffect(() => {
        if (listStatus !== 'rejected' || listView === 'clients') return;
        const params = new URLSearchParams(window.location.search);
        params.set('view', 'clients');
        router.get(`/admin/barangay-animals/rejected?${params.toString()}`, {}, {
            replace: true,
            preserveState: true,
            preserveScroll: true,
        });
    }, [listStatus, listView]);

    // Check for add parameter to auto-open the add animal modal
    useEffect(() => {
        if (urlParams.get('add') === 'true') {
            setShowAddForm(true);
            // Remove the parameter from URL to prevent reopening on refresh
            window.history.replaceState({}, '', window.location.pathname);
        }
    }, []);

    // Fetch animal types data when modal opens
    useEffect(() => {
        if (showBreedSpeciesModal) {
            fetch('/admin/animal-data', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': props.csrf_token
                },
                credentials: 'same-origin'
            })
                .then(response => {
                    console.log('Response status:', response.status);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('Animal types data:', data);
                    setAnimalTypes(data);
                })
                .catch(error => {
                    console.error('Error fetching animal data:', error);
                    // Set some default data if fetch fails
                    setAnimalTypes([
                        { id: 1, type_name: 'Pet Animals', species: [] },
                        { id: 2, type_name: 'Livestock', species: [] },
                        { id: 3, type_name: 'Poultry', species: [] }
                    ]);
                });
        }
    }, [showBreedSpeciesModal, props.csrf_token]);

    // Diri ablihan ang form sa pag-add og hayop.
    const handleAddAnimal = () => {
        setShowAddForm(true);
    };

    // Diri ilisan ang barangay filter ug i-update ang URL.
    const handleBarangayChange = (barangayId) => {
        setSelectedBarangay(barangayId);
        // Update URL with new filters
        const params = new URLSearchParams(window.location.search);
        if (barangayId) {
            params.set('barangay_id', barangayId);
        } else {
            params.delete('barangay_id');
        }
        params.delete('page'); // Reset to first page when filtering
        router.get(window.location.pathname + '?' + params.toString());
    };

    // Diri i-handle ang search sa client.
    const handleSearch = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        
        // Only search if user stops typing for 800ms
        clearTimeout(window.searchTimeout);
        window.searchTimeout = setTimeout(() => {
            // Update URL with search term
            const params = new URLSearchParams(window.location.search);
            if (value) {
                params.set('search', value);
            } else {
                params.delete('search');
            }
            params.delete('page'); // Reset to first page when searching
            router.get(window.location.pathname + '?' + params.toString());
        }, 800);
    };


    // Diri ang icon sa folder nga abli o sirado.
    const FolderIcon = ({ open = false, className = 'h-4 w-4' }) => (
        <svg className={className} fill="currentColor" viewBox="0 0 20 20">
            {open ? (
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            ) : (
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v1H4a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2V9a2 2 0 00-2-2h-1V6z" />
            )}
        </svg>
    );

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <Sidebar />

            <div className="staff-main flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Page Header */}
                <header className="shrink-0 border-b border-line bg-white px-8 py-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-navy text-white">
                                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <circle cx="11" cy="4" r="2" />
                                    <circle cx="18" cy="8" r="2" />
                                    <circle cx="20" cy="16" r="2" />
                                    <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold tracking-tight text-navy">{showingAnimals ? 'Barangay animals' : 'Clients'}</h1>
                                <p className="mt-0.5 text-sm text-slate-500">{pageSubtitle}</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="hidden items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 sm:flex">
                                <div className="text-center">
                                    <p className="text-lg font-bold tabular-nums text-slate-900">{clients.length}</p>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Clients</p>
                                </div>
                                <div className="h-8 w-px bg-slate-200" />
                                <div className="text-center">
                                    <p className="text-lg font-bold tabular-nums text-slate-900">{totalAnimals}</p>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Animals</p>
                                </div>
                                <div className="h-8 w-px bg-slate-200" />
                                <div className="text-center">
                                    <p className="text-lg font-bold tabular-nums text-slate-900">{barangays.length}</p>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Barangays</p>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setShowBreedSpeciesModal(true)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50"
                            >
                                <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                                </svg>
                                Species & Breeds
                            </button>
                            <button
                                type="button"
                                onClick={handleAddAnimal}
                                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-700"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                                </svg>
                                Add Animal
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <Tabs
                            variant="segmented"
                            value={listView}
                            onChange={handleViewChange}
                            items={[
                                { id: 'animals', label: 'Animals', count: animals.length },
                                { id: 'clients', label: 'Clients', count: clients.length },
                            ]}
                        />
                        <ClientStatusDropdown listStatus={listStatus} showCancelled={listView === 'clients'} />
                    </div>
                </header>

                <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 lg:p-8 scrollbar-hide xl:overflow-hidden">
                    {/* Flash Message */}
                    {flashMessage && (
                        <div className={`mb-6 flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
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

                    {/* Filters Bar (hidden - using barangay folder navigation instead) */}
                    <div className="hidden">
                        <div className="flex flex-col sm:flex-row gap-4">
                            {/* Barangay Dropdown */}
                            <div className="relative">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Filter by Barangay</label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="w-full md:w-64 bg-white border border-gray-300 rounded-lg shadow-sm pl-3 pr-10 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm"
                                    >
                                        <span className="block truncate">
                                            {selectedBarangay ? barangays.find(b => b.id == selectedBarangay)?.name || 'Select Barangay' : 'All Barangays'}
                                        </span>
                                        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                                            <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                            </svg>
                                        </span>
                                    </button>

                                    {/* Dropdown Menu */}
                                    {isDropdownOpen && (
                                        <div className="absolute z-30 mt-1 w-full md:w-64 bg-white shadow-lg max-h-60 rounded-lg py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                                            <div
                                                className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-violet-50 hover:text-violet-700"
                                                onClick={() => {
                                                    setSelectedBarangay('');
                                                    setIsDropdownOpen(false);
                                                    // Clear barangay filter but keep search term
                                                    const params = new URLSearchParams(window.location.search);
                                                    params.delete('barangay_id');
                                                    params.delete('page');
                                                    router.get(window.location.pathname + '?' + params.toString());
                                                }}
                                            >
                                                <span className="font-medium text-gray-900">All Barangays</span>
                                            </div>
                                            {barangays.map((barangay) => (
                                                <div
                                                    key={barangay.id}
                                                    className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-violet-50 hover:text-violet-700"
                                                    onClick={() => {
                                                        setSelectedBarangay(barangay.id);
                                                        setIsDropdownOpen(false);
                                                        const params = new URLSearchParams(window.location.search);
                                                        params.set('barangay_id', barangay.id);
                                                        params.delete('page');
                                                        router.get(window.location.pathname + '?' + params.toString());
                                                    }}
                                                >
                                                    <span className="block truncate font-normal text-gray-900">{barangay.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Search Bar */}
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Search Clients</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={handleSearch}
                                        className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 text-sm"
                                        placeholder="Search by name, email..."
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Table Section */}
                    <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-12 xl:overflow-hidden">
                        {/* Barangay Folder Sidebar */}
                        <aside className="xl:sticky xl:top-0 xl:z-10 xl:col-span-3 xl:flex xl:min-h-0 xl:flex-col xl:self-stretch">
                            <div className="flex max-h-[calc(100vh-16rem)] flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm xl:max-h-none xl:min-h-0 xl:flex-1">
                                <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-4 py-3.5">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <FolderIcon open className="h-4 w-4 shrink-0 text-teal" />
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-semibold text-navy">Barangays</h3>
                                            <p className="text-sm text-muted">{barangayHint}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0 border-b border-slate-100 bg-white px-3 py-2.5">
                                    <div className="relative">
                                        <svg className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            value={barangaySearch}
                                            onChange={(e) => setBarangaySearch(e.target.value)}
                                            placeholder="Filter folders..."
                                            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-700 placeholder-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        />
                                    </div>
                                </div>

                                <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 scrollbar-hide">
                                    <button
                                        type="button"
                                        onClick={() => handleBarangayChange('')}
                                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                                            !selectedBarangay
                                                ? 'bg-violet-50 font-medium text-violet-800 ring-1 ring-violet-100'
                                                : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <FolderIcon open={!selectedBarangay} className="h-4 w-4 shrink-0 text-violet-500" />
                                        <span className="min-w-0 flex-1 truncate">All Barangays</span>
                                    </button>

                                    {filteredBarangays.length === 0 ? (
                                        <p className="px-3 py-4 text-center text-xs text-slate-400">No folders match your filter</p>
                                    ) : (
                                        filteredBarangays.map((barangay) => {
                                            const isActive = String(selectedBarangay) === String(barangay.id);
                                            return (
                                                <button
                                                    key={barangay.id}
                                                    type="button"
                                                    onClick={() => handleBarangayChange(String(barangay.id))}
                                                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                                                        isActive
                                                            ? 'bg-violet-50 font-medium text-violet-800 ring-1 ring-violet-100'
                                                            : 'text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    <FolderIcon open={isActive} className="h-4 w-4 shrink-0 text-violet-500" />
                                                    <span className="min-w-0 flex-1 truncate">{barangay.name}</span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </aside>

                        {/* Main Content */}
                        <div className="flex min-h-0 min-w-0 flex-col gap-4 xl:col-span-9 xl:overflow-hidden">
                            {/* Search toolbar */}
                            <div className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
                                <div className="relative flex-1">
                                    <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={handleSearch}
                                        className="block w-full rounded-lg border border-slate-200 bg-slate-50/50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 transition-colors focus:border-violet-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100"
                                        placeholder={showingAnimals ? 'Search by pet, species, breed, or owner...' : 'Search by name, email, or phone...'}
                                    />
                                </div>

                                {(searchTerm || selectedBarangay) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchTerm('');
                                            setSelectedBarangay('');
                                            const params = new URLSearchParams();
                                            if (listView === 'clients') params.set('view', 'clients');
                                            const query = params.toString();
                                            router.get(query ? `${window.location.pathname}?${query}` : window.location.pathname);
                                        }}
                                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                                    >
                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                        </svg>
                                        Clear filters
                                    </button>
                                )}
                            </div>

                        {listView === 'clients' && listStatus === 'rejected' && (
                            <div className="shrink-0 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
                                Cancelled clients may register again in the VetMob app using the same name and email with a matching ID or residence document.
                            </div>
                        )}

                        {listView === 'clients' && listStatus === 'pending' && (
                            <div className="shrink-0 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                Pending clients can sign in, add animals, and book appointments while their account is under review.
                            </div>
                        )}

                        {/* Add Animal Modal */}
                        {showAddForm && (
                            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                                <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-2xl [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                    <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-6 py-5 backdrop-blur-sm">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">
                                                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <circle cx="11" cy="4" r="2" />
                                                        <circle cx="18" cy="8" r="2" />
                                                        <circle cx="20" cy="16" r="2" />
                                                        <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-bold text-gray-900">Add Animal</h3>
                                                    <p className="text-sm text-gray-500">Register an animal under an existing or new owner</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowAddForm(false)}
                                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                            >
                                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="px-6 py-5">
                                        <ClientRegistrationForm onClose={() => setShowAddForm(false)} barangays={barangays} zones={zones} species={species} breeds={breeds} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Breed & Species Modal */}
                        <BreedSpeciesModal 
                            isOpen={showBreedSpeciesModal}
                            onClose={() => setShowBreedSpeciesModal(false)}
                            animalTypes={animalTypes}
                        />

                        <div className="min-h-[24rem] flex-1 overflow-hidden xl:min-h-0">
                            {showingAnimals ? (
                                <BarangayAnimalsList
                                    animals={animals}
                                    showBarangayColumn={!selectedBarangay}
                                />
                            ) : (
                                <PetOwnersList
                                    clients={clients}
                                    showBarangayColumn={!selectedBarangay}
                                    listStatus={listStatus}
                                />
                            )}
                        </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}

// Multi-step Client Registration Form Component
// Diri ang field sa form nga naay label ug error.
function FormField({ label, error, children, hint, required }) {
    return (
        <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
                {label}{required && <span className="text-red-500"> *</span>}
            </label>
            {children}
            {hint && !error && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
            {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
        </div>
    );
}

// Diri ang button sa pagpakita o pagtago sa password.
function PasswordVisibilityToggle({ visible, onToggle }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 transition-colors hover:text-violet-600"
            tabIndex={-1}
            aria-label={visible ? 'Hide password' : 'Show password'}
        >
            {visible ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
            ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            )}
        </button>
    );
}

const DEFAULT_CLIENT_PASSWORD = 'Password123!';

const NEW_OWNER_STEPS = [
    { num: 1, label: 'Owner' },
    { num: 2, label: 'Animal' },
    { num: 3, label: 'Account' },
    { num: 4, label: 'Review' },
];

const EXISTING_OWNER_STEPS = [
    { num: 1, label: 'Owner' },
    { num: 2, label: 'Animal' },
    { num: 3, label: 'Review' },
];

const ACCOUNT_FIELDS = ['email', 'password', 'password_confirmation'];

const DIET_LABELS = {
    commercial_food: 'Commercial Food',
    table_food: 'Table Food',
    both: 'Both',
    others: 'Others',
};

const REPRODUCTIVE_LABELS = {
    pregnant: 'Pregnant',
    nursing: 'Nursing',
    not_pregnant: 'Not Pregnant',
};

// Diri ang row sa review nga naay label ug value.
function ReviewRow({ label, value }) {
    return (
        <div className="flex items-start justify-between gap-4 py-1.5">
            <span className="text-sm text-gray-500">{label}</span>
            <span className="text-right text-sm font-medium text-gray-900">{value || '—'}</span>
        </div>
    );
}

// Diri ang card sa review nga naay edit button.
function ReviewCard({ title, onEdit, children }) {
    return (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
                <button
                    type="button"
                    onClick={onEdit}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-50"
                >
                    Edit
                </button>
            </div>
            {children}
        </div>
    );
}

// Fields that live behind the collapsible "health details" panel on an animal card
const HEALTH_DETAIL_FIELDS = new Set([
    'reproductive_status',
    'weeks_months',
    'diet',
    'diet_other',
    'dewormed',
    'last_deworming_date',
    'dewormer_name',
    'rabies_vaccine',
    'rabies_last_vaccination',
    'dhppl_vaccine',
    'dhppl_last_vaccination',
    'other_vaccine_name',
    'other_vaccine_last_vaccination',
]);

// Diri himuon ang blangko nga hayop sa form.
const makeEmptyPet = () => ({
    uid: `pet-${Math.random().toString(36).slice(2)}`,
    pet_name: '',
    species_id: '',
    breed_id: '',
    sex: 'male',
    color: '',
    weight: '',
    birthdate: '',
    // Reproductive Status — new cards default to male, which is always "not pregnant"
    reproductive_status: 'not_pregnant',
    weeks_months: '',
    // Diet
    diet: '',
    diet_other: '',
    // Deworming History
    dewormed: 'no',
    last_deworming_date: '',
    dewormer_name: '',
    // Vaccination History
    rabies_vaccine: 'no',
    rabies_last_vaccination: '',
    dhppl_vaccine: 'no',
    dhppl_last_vaccination: '',
    other_vaccine_name: '',
    other_vaccine_last_vaccination: '',
});

// Diri ang pill button sa option.
function OptionPill({ active, onClick, children, disabled = false }) {
    const base = active
        ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm'
        : 'border-gray-200 bg-white text-gray-600';

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition-all ${base} ${
                disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-violet-200 hover:bg-violet-50/40'
            }`}
        >
            {children}
        </button>
    );
}

// Diri ang row sa pili nga Yes o No.
function YesNoRow({ label, value, onChange, error }) {
    return (
        <div className="rounded-xl border border-gray-100 bg-white p-3.5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-medium text-gray-700">
                    {label}<span className="text-red-500"> *</span>
                </span>
                <div className="flex gap-2">
                    <OptionPill active={value === 'yes'} onClick={() => onChange('yes')}>Yes</OptionPill>
                    <OptionPill active={value === 'no'} onClick={() => onChange('no')}>No</OptionPill>
                </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
    );
}

// Diri ang sub-section sa detalye sa hayop.
function PetSubSection({ title, subtitle, required, children }) {
    return (
        <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <div className="mb-3 flex items-start gap-2.5">
                <div className="mt-0.5 h-7 w-1 shrink-0 rounded-full bg-violet-600" />
                <div>
                    <h5 className="text-sm font-semibold text-gray-900">
                        {title}{required && <span className="text-red-500"> *</span>}
                    </h5>
                    {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
                </div>
            </div>
            {children}
        </div>
    );
}

// Diri ang form sa pag-register og client.
function ownerFullName(owner) {
    return [owner?.firstname, owner?.middlename, owner?.lastname].filter(Boolean).join(' ');
}

function ownerPhotoSrc(url) {
    if (!url) return '';
    const value = String(url).trim();
    if (!value || value === 'null' || value === 'undefined') return '';
    const src = value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image') || value.startsWith('/')
        ? value
        : `/${value}`;
    if (src.includes('res.cloudinary.com') && src.includes('/upload/') && !src.includes('/upload/w_')) {
        return src.replace('/upload/', '/upload/w_96,h_96,c_fill,f_auto,q_auto/');
    }
    return src;
}

function OwnerPhoto({ url, name, size = 'h-10 w-10' }) {
    const src = ownerPhotoSrc(url);
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    if (!src) {
        return (
            <span className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700`}>
                {initial}
            </span>
        );
    }
    return (
        <img src={src} alt="" width={40} height={40} decoding="async" className={`${size} shrink-0 rounded-full object-cover`} />
    );
}

function ClientRegistrationForm({ onClose, barangays = [], zones = [], species = [], breeds = [] }) {
    // Diri ang class sa input field depende sa error.
    const fieldClass = (hasError) =>
        `block w-full rounded-xl border bg-gray-50 px-3 py-2.5 text-sm text-gray-700 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 ${
            hasError ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-violet-300'
        }`;

    const [step, setStep] = useState(1);
    const [ownerMode, setOwnerMode] = useState('existing');
    const [ownerQuery, setOwnerQuery] = useState('');
    const [ownerResults, setOwnerResults] = useState([]);
    const [ownerSearching, setOwnerSearching] = useState(false);
    const [ownerSearchDone, setOwnerSearchDone] = useState(false);
    const [selectedOwner, setSelectedOwner] = useState(null);
    const [formData, setFormData] = useState({
        lastname: '',
        firstname: '',
        middlename: '',
        age: '',
        barangay_id: '',
        zone: '',
        facebook: '',
        street: '',
        phone_number: '',
        email: '',
        password: '',
        password_confirmation: ''
    });
    const [pets, setPets] = useState([]);
    const [expandedPets, setExpandedPets] = useState([]);
    const [petErrors, setPetErrors] = useState({});
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showPasswordConfirmation, setShowPasswordConfirmation] = useState(false);

    const { mapboxToken } = usePage().props;
    const steps = ownerMode === 'existing' ? EXISTING_OWNER_STEPS : NEW_OWNER_STEPS;
    const reviewStep = ownerMode === 'existing' ? 3 : 4;

    // Diri pangitaon ang existing nga tag-iya.
    useEffect(() => {
        if (ownerMode !== 'existing') return undefined;

        const term = ownerQuery.trim();
        if (term.length < 2) {
            setOwnerResults([]);
            setOwnerSearching(false);
            setOwnerSearchDone(false);
            return undefined;
        }

        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setOwnerSearching(true);
            try {
                const response = await fetch(`/admin/clients/search?q=${encodeURIComponent(term)}`, {
                    headers: { Accept: 'application/json' },
                    credentials: 'same-origin',
                    signal: controller.signal,
                });
                const data = response.ok ? await response.json() : [];
                if (!controller.signal.aborted) {
                    setOwnerResults(Array.isArray(data) ? data : []);
                    setOwnerSearchDone(true);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    setOwnerResults([]);
                    setOwnerSearchDone(true);
                }
            } finally {
                if (!controller.signal.aborted) setOwnerSearching(false);
            }
        }, 120);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [ownerQuery, ownerMode]);

    // Diri pilion ang existing nga tag-iya.
    const selectOwner = (owner) => {
        setSelectedOwner(owner);
        setOwnerQuery(ownerFullName(owner));
        setOwnerResults([]);
        setErrors((prev) => {
            const { owner: _owner, ...rest } = prev;
            return rest;
        });
    };

    // Diri ilisan ang existing o bag-ong tag-iya.
    const changeOwnerMode = (mode) => {
        setOwnerMode(mode);
        setErrors({});
        setStep(1);
    };

    // Diri i-update ang form ug i-check ang phone number.
    const handleInputChange = (e) => {
        const { name, value } = e.target;

        // Special handling for phone number to enforce 09 prefix and 11 digits
        if (name === 'phone_number') {
            // Only allow numbers and limit to 11 characters
            let phoneValue = value.replace(/\D/g, '');

            // Ensure it starts with 09 if user starts typing
            if (phoneValue.length > 0 && !phoneValue.startsWith('09')) {
                phoneValue = '09' + phoneValue.replace(/^0+/, '');
            }

            // Limit to 11 characters
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
                street: ''
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: value
            }));
        }
    };

    // Diri gamiton ang default nga password.
    const handleUseDefaultPassword = () => {
        setFormData(prev => ({
            ...prev,
            password: DEFAULT_CLIENT_PASSWORD,
            password_confirmation: DEFAULT_CLIENT_PASSWORD
        }));
        setErrors(prev => {
            const { password, password_confirmation, ...rest } = prev;
            return rest;
        });
    };

    // Diri mag-add og bag-ong hayop sa form.
    const addPet = () => setPets(prev => [...prev, makeEmptyPet()]);

    // Diri tangtangon ang hayop sa form.
    const removePet = (uid) => {
        setPets(prev => prev.filter(pet => pet.uid !== uid));
        setExpandedPets(prev => prev.filter(id => id !== uid));
        setPetErrors({});
    };

    // Diri i-toggle ang detalye sa hayop.
    const togglePetDetails = (uid) => {
        setExpandedPets(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    };

    // Diri i-update ang field sa hayop.
    const updatePet = (uid, field, value) => {
        setPets(prev => prev.map(pet => {
            if (pet.uid !== uid) return pet;

            const next = { ...pet, [field]: value };

            // Drop answers that no longer apply once their parent question changes
            if (field === 'species_id') next.breed_id = '';
            // Male animals are always "not pregnant"; females pick for themselves
            if (field === 'sex') {
                next.reproductive_status = value === 'male' ? 'not_pregnant' : '';
                next.weeks_months = '';
            }
            if (field === 'reproductive_status' && value !== 'pregnant' && value !== 'nursing') next.weeks_months = '';
            if (field === 'diet' && value !== 'others') next.diet_other = '';
            if (field === 'dewormed' && value === 'no') {
                next.last_deworming_date = '';
                next.dewormer_name = '';
            }
            if (field === 'rabies_vaccine' && value === 'no') next.rabies_last_vaccination = '';
            if (field === 'dhppl_vaccine' && value === 'no') next.dhppl_last_vaccination = '';
            if (field === 'other_vaccine_name' && !value.trim()) next.other_vaccine_last_vaccination = '';

            return next;
        }));
    };

    // Clicking the active pill clears the answer
    // Diri i-toggle ang option sa hayop.
    const togglePetOption = (uid, field, value) => {
        const pet = pets.find(p => p.uid === uid);
        updatePet(uid, field, pet?.[field] === value ? '' : value);
    };

    // Animals are optional, but any card that was added must be complete
    // Diri i-validate ang mga hayop sa form.
    const validatePets = () => {
        const newPetErrors = {};
        const today = new Date().toISOString().split('T')[0];

        pets.forEach((pet, index) => {
            // Diri i-set ang error sa field sa hayop.
            const fail = (field, message) => {
                if (!newPetErrors[`${index}.${field}`]) newPetErrors[`${index}.${field}`] = message;
            };

            // A date can be neither in the future nor before the animal was born
            // Diri i-check ang petsa sa hayop.
            const checkDate = (field, label) => {
                if (!pet[field]) return;
                if (pet[field] > today) fail(field, `${label} cannot be in the future`);
                else if (pet.birthdate && pet[field] < pet.birthdate) fail(field, `${label} cannot be before the birthdate`);
            };

            if (!pet.pet_name.trim()) fail('pet_name', 'Animal name is required');
            if (!pet.species_id) fail('species_id', 'Species is required');
            if (!pet.breed_id) fail('breed_id', 'Breed is required');
            if (pet.birthdate && pet.birthdate > today) fail('birthdate', 'Birthdate cannot be in the future');

            if (pet.weight !== '') {
                const weight = Number(pet.weight);
                if (Number.isNaN(weight) || weight <= 0) fail('weight', 'Weight must be greater than 0');
                else if (weight > 999.99) fail('weight', 'Weight cannot exceed 999.99 kg');
            }

            if (!pet.reproductive_status) {
                fail('reproductive_status', 'Reproductive status is required');
            } else if (pet.reproductive_status === 'pregnant' || pet.reproductive_status === 'nursing') {
                if (pet.sex === 'male') fail('reproductive_status', 'Only female animals can be pregnant or nursing');
                if (!pet.weeks_months.trim()) fail('weeks_months', 'Duration is required');
            }

            if (!pet.diet) fail('diet', 'Diet is required');
            else if (pet.diet === 'others' && !pet.diet_other.trim()) fail('diet_other', 'Please specify the diet');

            if (!pet.dewormed) fail('dewormed', 'Please answer the deworming question');
            else if (pet.dewormed === 'yes' && !pet.last_deworming_date) {
                fail('last_deworming_date', 'Last deworming date is required');
            }
            checkDate('last_deworming_date', 'Deworming date');

            if (!pet.rabies_vaccine) fail('rabies_vaccine', 'Please answer the rabies vaccine question');
            else if (pet.rabies_vaccine === 'yes' && !pet.rabies_last_vaccination) {
                fail('rabies_last_vaccination', 'Last rabies vaccination date is required');
            }
            checkDate('rabies_last_vaccination', 'Vaccination date');

            if (!pet.dhppl_vaccine) fail('dhppl_vaccine', 'Please answer the DHPPL vaccine question');
            else if (pet.dhppl_vaccine === 'yes' && !pet.dhppl_last_vaccination) {
                fail('dhppl_last_vaccination', 'Last DHPPL vaccination date is required');
            }
            checkDate('dhppl_last_vaccination', 'Vaccination date');

            // The other vaccine stays optional, but a name needs its date
            if (pet.other_vaccine_name.trim() && !pet.other_vaccine_last_vaccination) {
                fail('other_vaccine_last_vaccination', 'Last vaccination date is required');
            }
            checkDate('other_vaccine_last_vaccination', 'Vaccination date');
        });

        return newPetErrors;
    };

    // Diri adto sa sunod nga step kung valid.
    const handleNext = () => {
        if (step === 1) {
            const newErrors = {};
            if (ownerMode === 'existing') {
                if (!selectedOwner) newErrors.owner = 'Search and select an owner';
            } else {
                if (!formData.lastname) newErrors.lastname = 'Last name is required';
                if (!formData.firstname) newErrors.firstname = 'First name is required';
                if (!formData.age) newErrors.age = 'Age is required';
                if (!formData.barangay_id) newErrors.barangay_id = 'Barangay is required';
                if (!formData.zone) newErrors.zone = 'Zone is required';
                if (!formData.street) newErrors.street = 'Select a street or landmark in El Salvador City';
            }

            if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
            } else {
                setErrors({});
                if (pets.length === 0) setPets([makeEmptyPet()]);
                setStep(2);
            }
            return;
        }

        if (step === 2) {
            if (pets.length === 0) {
                setPetErrors({ form: 'Add at least one animal' });
                return;
            }

            const newPetErrors = validatePets();

            if (Object.keys(newPetErrors).length > 0) {
                setPetErrors(newPetErrors);
                // Errors hidden inside a collapsed card would otherwise go unnoticed
                setExpandedPets(prev => {
                    const needed = pets
                        .filter((pet, index) => Object.keys(newPetErrors).some(
                            key => key.startsWith(`${index}.`) && HEALTH_DETAIL_FIELDS.has(key.split('.')[1])
                        ))
                        .map(pet => pet.uid);
                    return [...new Set([...prev, ...needed])];
                });
            } else {
                setPetErrors({});
                setStep(3);
            }
            return;
        }

        if (step === 3 && ownerMode === 'new') {
            const newErrors = validateAccount();

            if (Object.keys(newErrors).length > 0) {
                setErrors(newErrors);
            } else {
                setErrors({});
                setStep(4);
            }
        }
    };

    // The form holds ids, but the review step needs the readable names
    const barangayName = barangays.find(b => String(b.id) === String(formData.barangay_id))?.name || '';
    // Diri kuhaon ang ngalan sa species.
    const speciesName = (id) => species.find(s => String(s.id) === String(id))?.species_name || '—';
    // Diri kuhaon ang ngalan sa breed.
    const breedName = (id) => breeds.find(b => String(b.id) === String(id))?.breed_name || '—';

    // Diri i-validate ang account (email ug password).
    const validateAccount = () => {
        const newErrors = {};
        if (!formData.email) newErrors.email = 'Email is required';
        if (!formData.password) newErrors.password = 'Password is required';
        if (formData.password !== formData.password_confirmation) {
            newErrors.password_confirmation = 'Passwords do not match';
        }
        return newErrors;
    };

    // Diri i-submit ang client form sa server.
    const submitForm = (destination = 'clients') => {
        setLoading(true);

        const petPayload = pets.map(({ uid, ...pet }) => pet);
        const onSuccess = () => {
            setLoading(false);
            onClose();
            if (destination === 'clients') router.reload();
        };
        const onError = (formErrors) => {
            const ownerErrors = {};
            const nextPetErrors = {};
            Object.entries(formErrors).forEach(([key, message]) => {
                const nested = key.match(/^pets\.(\d+)\.(.+)$/);
                if (nested) {
                    nextPetErrors[`${nested[1]}.${nested[2]}`] = message;
                } else {
                    ownerErrors[key] = message;
                }
            });

            setErrors(ownerErrors);
            setPetErrors(nextPetErrors);

            const ownerKeys = Object.keys(ownerErrors);
            if (ownerMode === 'existing') {
                if (Object.keys(nextPetErrors).length > 0) setStep(2);
            } else if (ownerKeys.some(key => ACCOUNT_FIELDS.includes(key))) {
                setStep(3);
            } else if (Object.keys(nextPetErrors).length > 0) {
                setStep(2);
            } else if (ownerKeys.length > 0) {
                setStep(1);
            }
            setLoading(false);
        };

        if (ownerMode === 'existing') {
            router.post(`/admin/clients/${selectedOwner.id}/animals`, {
                pets: petPayload,
                redirect_to: destination,
            }, { onSuccess, onError });
            return;
        }

        router.post('/admin/clients', {
            ...formData,
            role: 'client',
            pets: petPayload,
            redirect_to: destination
        }, { onSuccess, onError });
    };

    // Diri i-handle ang submit sa form.
    const handleSubmit = (e) => {
        e.preventDefault();
        submitForm('clients');
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Progress Indicator */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-center">
                    {steps.map(({ num, label }, index) => (
                        <div key={num} className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}>
                            <div className="flex items-center gap-2.5">
                                <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold transition-all ${
                                    step >= num
                                        ? 'bg-violet-600 text-white shadow-sm shadow-violet-200'
                                        : 'bg-white text-gray-400 ring-1 ring-gray-200'
                                }`}>
                                    {step > num ? (
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/>
                                        </svg>
                                    ) : num}
                                </div>
                                <span className={`text-sm font-medium ${step >= num ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {label}
                                </span>
                            </div>
                            {index < steps.length - 1 && (
                                <div className="mx-4 h-0.5 flex-1 rounded-full bg-gray-200">
                                    <div className={`h-full rounded-full bg-violet-600 transition-all duration-300 ${step > num ? 'w-full' : 'w-0'}`} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Step 1: Owner — search an existing owner, or enter a new one */}
            {step === 1 && (
                <div className="space-y-5">
                    <div className="rounded-xl border border-gray-100 bg-white p-5">
                        <h4 className="mb-1 text-sm font-semibold text-gray-900">Owner</h4>
                        <p className="mb-4 text-sm text-gray-500">
                            Search for an owner who is already registered. Choose New owner to enter their details.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <OptionPill active={ownerMode === 'existing'} onClick={() => changeOwnerMode('existing')}>Existing owner</OptionPill>
                            <OptionPill active={ownerMode === 'new'} onClick={() => changeOwnerMode('new')}>New owner</OptionPill>
                        </div>

                        {ownerMode === 'existing' && (
                            <div className="mt-4">
                                <FormField label="Search owner" required error={errors.owner} hint="Name, phone, or email">
                                    <input
                                        type="text"
                                        value={ownerQuery}
                                        onChange={(e) => {
                                            setOwnerQuery(e.target.value);
                                            setSelectedOwner(null);
                                        }}
                                        className={fieldClass(!!errors.owner)}
                                        placeholder="Search by name, phone, or email"
                                    />
                                </FormField>
                                {ownerSearching && <p className="mt-2 text-xs text-gray-500">Searching...</p>}
                                {!selectedOwner && ownerResults.length > 0 && (
                                    <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white">
                                        {ownerResults.map((owner) => (
                                            <button
                                                key={owner.id}
                                                type="button"
                                                onClick={() => selectOwner(owner)}
                                                className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-violet-50"
                                            >
                                                <OwnerPhoto url={owner.profile_photo_url} name={ownerFullName(owner)} />
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-medium text-gray-900">{ownerFullName(owner)}</span>
                                                    <span className="block truncate text-xs text-gray-500">
                                                        {[owner.street, owner.barangay, owner.zone, owner.phone_number].filter(Boolean).join(' · ')}
                                                    </span>
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {!selectedOwner && ownerSearchDone && !ownerSearching && ownerQuery.trim().length >= 2 && ownerResults.length === 0 && (
                                    <p className="mt-2 text-sm text-gray-500">No owner found. Switch to New owner to enter their details.</p>
                                )}
                                {selectedOwner && (
                                    <div className="mt-3 flex items-center gap-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
                                        <OwnerPhoto url={selectedOwner.profile_photo_url} name={ownerFullName(selectedOwner)} size="h-12 w-12" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900">{ownerFullName(selectedOwner)}</p>
                                            <p className="mt-0.5 text-xs text-gray-600">
                                                {[selectedOwner.street, selectedOwner.barangay, selectedOwner.zone, selectedOwner.phone_number, selectedOwner.email].filter(Boolean).join(' · ')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {ownerMode === 'new' && (
                    <>
                    <div className="rounded-xl border border-gray-100 bg-white p-5">
                        <h4 className="mb-4 text-sm font-semibold text-gray-900">Personal Information</h4>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <FormField label="Last Name" required error={errors.lastname}>
                                <input type="text" name="lastname" value={formData.lastname} onChange={handleInputChange} className={fieldClass(!!errors.lastname)} placeholder="Enter last name" />
                            </FormField>
                            <FormField label="First Name" required error={errors.firstname}>
                                <input type="text" name="firstname" value={formData.firstname} onChange={handleInputChange} className={fieldClass(!!errors.firstname)} placeholder="Enter first name" />
                            </FormField>
                            <FormField label="Middle Name">
                                <input type="text" name="middlename" value={formData.middlename} onChange={handleInputChange} className={fieldClass(false)} placeholder="Enter middle name" />
                            </FormField>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-white p-5">
                        <h4 className="mb-4 text-sm font-semibold text-gray-900">Contact & Location</h4>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField label="Age" required error={errors.age}>
                                    <input type="number" name="age" value={formData.age} onChange={handleInputChange} className={fieldClass(!!errors.age)} placeholder="Enter age" />
                                </FormField>
                                <FormField label="Phone Number" error={errors.phone_number} hint="Must start with 09 and be 11 digits">
                                    <input type="tel" name="phone_number" value={formData.phone_number} onChange={handleInputChange} className={fieldClass(!!errors.phone_number)} placeholder="09XXXXXXXXX" maxLength={11} />
                                </FormField>
                            </div>

                            <FormField label="Facebook">
                                <input type="text" name="facebook" value={formData.facebook} onChange={handleInputChange} className={fieldClass(false)} placeholder="Facebook profile URL or username" />
                            </FormField>

                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <FormField label="Barangay" required error={errors.barangay_id}>
                                    <select name="barangay_id" value={formData.barangay_id} onChange={handleInputChange} className={fieldClass(!!errors.barangay_id)}>
                                        <option value="">Select Barangay</option>
                                        {barangays.map((barangay) => (
                                            <option key={barangay.id} value={barangay.id}>{barangay.name}</option>
                                        ))}
                                    </select>
                                </FormField>
                                <FormField label="Zone" required error={errors.zone}>
                                    <select
                                        name="zone"
                                        value={formData.zone}
                                        onChange={handleInputChange}
                                        disabled={!formData.barangay_id}
                                        className={fieldClass(!!errors.zone) + ' disabled:cursor-not-allowed disabled:opacity-60'}
                                    >
                                        <option value="">
                                            {formData.barangay_id ? 'Select Zone' : 'Select a barangay first'}
                                        </option>
                                        {zones
                                            .filter((zone) => String(zone.barangay_id) === String(formData.barangay_id))
                                            .map((zone) => (
                                                <option key={zone.id} value={zone.name}>{zone.name}</option>
                                            ))}
                                    </select>
                                </FormField>
                            </div>
                            <FormField label="Street or landmark" required error={errors.street} hint="Only places in the selected barangay and zone">
                                <ElSalvadorStreetField
                                    value={formData.street}
                                    barangay={barangayName}
                                    zone={formData.zone}
                                    token={mapboxToken}
                                    inputClass={fieldClass(!!errors.street)}
                                    onChange={(street) => {
                                        setFormData((prev) => ({ ...prev, street }));
                                        setErrors((prev) => {
                                            const { street: _street, ...rest } = prev;
                                            return rest;
                                        });
                                    }}
                                />
                            </FormField>
                        </div>
                    </div>
                    </>
                    )}

                    <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700"
                        >
                            Next Step
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Animals */}
            {step === 2 && (
                <div className="space-y-5">
                    <div className="rounded-xl border border-gray-100 bg-white p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h4 className="mb-1 text-sm font-semibold text-gray-900">Animal</h4>
                                <p className="text-sm text-gray-500">
                                    Enter the animal details. You can add more than one before saving.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={addPet}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                </svg>
                                Add Animal
                            </button>
                        </div>

                        {petErrors.form && (
                            <p className="mt-3 text-sm text-red-600">{petErrors.form}</p>
                        )}

                        {pets.length === 0 ? (
                            <button
                                type="button"
                                onClick={addPet}
                                className="mt-4 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center transition-colors hover:border-violet-300 hover:bg-violet-50/40"
                            >
                                <svg className="h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="mt-2 text-sm font-medium text-gray-700">No animal added yet</span>
                                <span className="mt-0.5 text-xs text-gray-500">Click to add the first animal</span>
                            </button>
                        ) : (
                            <div className="mt-4 space-y-4">
                                {pets.map((pet, index) => (
                                    <div key={pet.uid} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                                        <div className="mb-4 flex items-center justify-between">
                                            <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
                                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-xs font-bold text-white">
                                                    {index + 1}
                                                </span>
                                                {pet.pet_name.trim() || `Animal ${index + 1}`}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => removePet(pet.uid)}
                                                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                                            >
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                Remove
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div className="md:col-span-2">
                                                <FormField label="Animal Name" required error={petErrors[`${index}.pet_name`]}>
                                                    <input
                                                        type="text"
                                                        value={pet.pet_name}
                                                        onChange={(e) => updatePet(pet.uid, 'pet_name', e.target.value)}
                                                        className={fieldClass(!!petErrors[`${index}.pet_name`])}
                                                        placeholder="Enter animal name"
                                                    />
                                                </FormField>
                                            </div>
                                            <FormField label="Species" required error={petErrors[`${index}.species_id`]}>
                                                <select
                                                    value={pet.species_id}
                                                    onChange={(e) => updatePet(pet.uid, 'species_id', e.target.value)}
                                                    className={fieldClass(!!petErrors[`${index}.species_id`])}
                                                >
                                                    <option value="">Select Species</option>
                                                    {species.map((s) => (
                                                        <option key={s.id} value={s.id}>{s.species_name}</option>
                                                    ))}
                                                </select>
                                            </FormField>
                                            <FormField label="Breed" required error={petErrors[`${index}.breed_id`]}>
                                                <select
                                                    value={pet.breed_id}
                                                    onChange={(e) => updatePet(pet.uid, 'breed_id', e.target.value)}
                                                    disabled={!pet.species_id}
                                                    className={fieldClass(!!petErrors[`${index}.breed_id`]) + ' disabled:cursor-not-allowed disabled:opacity-60'}
                                                >
                                                    <option value="">
                                                        {pet.species_id ? 'Select Breed' : 'Select a species first'}
                                                    </option>
                                                    {breeds
                                                        .filter((breed) => String(breed.species_id) === String(pet.species_id))
                                                        .map((breed) => (
                                                            <option key={breed.id} value={breed.id}>{breed.breed_name}</option>
                                                        ))}
                                                </select>
                                            </FormField>
                                            <FormField label="Sex" required error={petErrors[`${index}.sex`]}>
                                                <select
                                                    value={pet.sex}
                                                    onChange={(e) => updatePet(pet.uid, 'sex', e.target.value)}
                                                    className={fieldClass(!!petErrors[`${index}.sex`])}
                                                >
                                                    <option value="male">Male</option>
                                                    <option value="female">Female</option>
                                                </select>
                                            </FormField>
                                            <FormField label="Birthdate" error={petErrors[`${index}.birthdate`]}>
                                                <input
                                                    type="date"
                                                    value={pet.birthdate}
                                                    onChange={(e) => updatePet(pet.uid, 'birthdate', e.target.value)}
                                                    className={fieldClass(!!petErrors[`${index}.birthdate`])}
                                                />
                                            </FormField>
                                            <FormField label="Color" error={petErrors[`${index}.color`]}>
                                                <input
                                                    type="text"
                                                    value={pet.color}
                                                    onChange={(e) => updatePet(pet.uid, 'color', e.target.value)}
                                                    className={fieldClass(!!petErrors[`${index}.color`])}
                                                    placeholder="e.g. Brown, Black"
                                                />
                                            </FormField>
                                            <FormField label="Weight (kg)" error={petErrors[`${index}.weight`]}>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={pet.weight}
                                                    onChange={(e) => updatePet(pet.uid, 'weight', e.target.value)}
                                                    className={fieldClass(!!petErrors[`${index}.weight`])}
                                                    placeholder="0.00"
                                                />
                                            </FormField>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => togglePetDetails(pet.uid)}
                                            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 transition-colors hover:text-violet-900"
                                        >
                                            <svg
                                                className={`h-4 w-4 transition-transform ${expandedPets.includes(pet.uid) ? 'rotate-180' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                            {expandedPets.includes(pet.uid) ? 'Hide health details' : 'Fill in health details (required)'}
                                        </button>

                                        {expandedPets.includes(pet.uid) && (
                                            <div className="mt-4 space-y-4">
                                                <PetSubSection title="Reproductive Status" subtitle="Breeding information" required>
                                                    <div className="flex flex-wrap gap-2">
                                                        <OptionPill
                                                            active={pet.reproductive_status === 'pregnant'}
                                                            disabled={pet.sex === 'male'}
                                                            onClick={() => togglePetOption(pet.uid, 'reproductive_status', 'pregnant')}
                                                        >
                                                            Pregnant
                                                        </OptionPill>
                                                        <OptionPill
                                                            active={pet.reproductive_status === 'nursing'}
                                                            disabled={pet.sex === 'male'}
                                                            onClick={() => togglePetOption(pet.uid, 'reproductive_status', 'nursing')}
                                                        >
                                                            Nursing
                                                        </OptionPill>
                                                        <OptionPill
                                                            active={pet.reproductive_status === 'not_pregnant'}
                                                            disabled={pet.sex === 'male'}
                                                            onClick={() => togglePetOption(pet.uid, 'reproductive_status', 'not_pregnant')}
                                                        >
                                                            Not Pregnant
                                                        </OptionPill>
                                                    </div>
                                                    {pet.sex === 'male' && (
                                                        <p className="mt-2 text-xs text-gray-500">Set automatically for male animals</p>
                                                    )}
                                                    {petErrors[`${index}.reproductive_status`] && (
                                                        <p className="mt-2 text-sm text-red-600">{petErrors[`${index}.reproductive_status`]}</p>
                                                    )}
                                                    {(pet.reproductive_status === 'pregnant' || pet.reproductive_status === 'nursing') && (
                                                        <div className="mt-4">
                                                            <FormField label="Duration" error={petErrors[`${index}.weeks_months`]} hint="e.g. 4 weeks">
                                                                <input
                                                                    type="text"
                                                                    value={pet.weeks_months}
                                                                    onChange={(e) => updatePet(pet.uid, 'weeks_months', e.target.value)}
                                                                    className={fieldClass(!!petErrors[`${index}.weeks_months`])}
                                                                    placeholder="Weeks or months"
                                                                />
                                                            </FormField>
                                                        </div>
                                                    )}
                                                </PetSubSection>

                                                <PetSubSection title="Diet" subtitle="Feeding preferences" required>
                                                    <div className="flex flex-wrap gap-2">
                                                        <OptionPill active={pet.diet === 'commercial_food'} onClick={() => togglePetOption(pet.uid, 'diet', 'commercial_food')}>Commercial Food</OptionPill>
                                                        <OptionPill active={pet.diet === 'table_food'} onClick={() => togglePetOption(pet.uid, 'diet', 'table_food')}>Table Food</OptionPill>
                                                        <OptionPill active={pet.diet === 'both'} onClick={() => togglePetOption(pet.uid, 'diet', 'both')}>Both</OptionPill>
                                                        <OptionPill active={pet.diet === 'others'} onClick={() => togglePetOption(pet.uid, 'diet', 'others')}>Others</OptionPill>
                                                    </div>
                                                    {petErrors[`${index}.diet`] && (
                                                        <p className="mt-2 text-sm text-red-600">{petErrors[`${index}.diet`]}</p>
                                                    )}
                                                    {pet.diet === 'others' && (
                                                        <div className="mt-4">
                                                            <FormField label="Specify Diet" error={petErrors[`${index}.diet_other`]}>
                                                                <input
                                                                    type="text"
                                                                    value={pet.diet_other}
                                                                    onChange={(e) => updatePet(pet.uid, 'diet_other', e.target.value)}
                                                                    className={fieldClass(!!petErrors[`${index}.diet_other`])}
                                                                    placeholder="Describe the diet"
                                                                />
                                                            </FormField>
                                                        </div>
                                                    )}
                                                </PetSubSection>

                                                <PetSubSection title="Deworming History" subtitle="Past deworming records">
                                                    <div className="space-y-4">
                                                        <YesNoRow
                                                            label="Has been dewormed?"
                                                            value={pet.dewormed}
                                                            onChange={(val) => updatePet(pet.uid, 'dewormed', val)}
                                                            error={petErrors[`${index}.dewormed`]}
                                                        />
                                                        {pet.dewormed === 'yes' && (
                                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                                <FormField label="Last Deworming Date" error={petErrors[`${index}.last_deworming_date`]}>
                                                                    <input
                                                                        type="date"
                                                                        value={pet.last_deworming_date}
                                                                        onChange={(e) => updatePet(pet.uid, 'last_deworming_date', e.target.value)}
                                                                        className={fieldClass(!!petErrors[`${index}.last_deworming_date`])}
                                                                    />
                                                                </FormField>
                                                                <FormField label="Dewormer Name" error={petErrors[`${index}.dewormer_name`]}>
                                                                    <input
                                                                        type="text"
                                                                        value={pet.dewormer_name}
                                                                        onChange={(e) => updatePet(pet.uid, 'dewormer_name', e.target.value)}
                                                                        className={fieldClass(!!petErrors[`${index}.dewormer_name`])}
                                                                        placeholder="Name of dewormer"
                                                                    />
                                                                </FormField>
                                                            </div>
                                                        )}
                                                    </div>
                                                </PetSubSection>

                                                <PetSubSection title="Vaccination History" subtitle="Vaccination records">
                                                    <div className="space-y-4">
                                                        <YesNoRow
                                                            label="Rabies vaccine"
                                                            value={pet.rabies_vaccine}
                                                            onChange={(val) => updatePet(pet.uid, 'rabies_vaccine', val)}
                                                            error={petErrors[`${index}.rabies_vaccine`]}
                                                        />
                                                        {pet.rabies_vaccine === 'yes' && (
                                                            <FormField label="Last Rabies Vaccination" error={petErrors[`${index}.rabies_last_vaccination`]}>
                                                                <input
                                                                    type="date"
                                                                    value={pet.rabies_last_vaccination}
                                                                    onChange={(e) => updatePet(pet.uid, 'rabies_last_vaccination', e.target.value)}
                                                                    className={fieldClass(!!petErrors[`${index}.rabies_last_vaccination`])}
                                                                />
                                                            </FormField>
                                                        )}

                                                        <YesNoRow
                                                            label="DHPPL vaccine"
                                                            value={pet.dhppl_vaccine}
                                                            onChange={(val) => updatePet(pet.uid, 'dhppl_vaccine', val)}
                                                            error={petErrors[`${index}.dhppl_vaccine`]}
                                                        />
                                                        {pet.dhppl_vaccine === 'yes' && (
                                                            <FormField label="Last DHPPL Vaccination" error={petErrors[`${index}.dhppl_last_vaccination`]}>
                                                                <input
                                                                    type="date"
                                                                    value={pet.dhppl_last_vaccination}
                                                                    onChange={(e) => updatePet(pet.uid, 'dhppl_last_vaccination', e.target.value)}
                                                                    className={fieldClass(!!petErrors[`${index}.dhppl_last_vaccination`])}
                                                                />
                                                            </FormField>
                                                        )}

                                                        <div className="rounded-xl border border-gray-100 bg-white p-3.5">
                                                            <p className="mb-3 text-sm font-medium text-gray-700">Other vaccine</p>
                                                            <FormField label="Vaccine Name" error={petErrors[`${index}.other_vaccine_name`]} hint="Leave empty if none">
                                                                <input
                                                                    type="text"
                                                                    value={pet.other_vaccine_name}
                                                                    onChange={(e) => updatePet(pet.uid, 'other_vaccine_name', e.target.value)}
                                                                    className={fieldClass(!!petErrors[`${index}.other_vaccine_name`])}
                                                                    placeholder="Name of vaccine"
                                                                />
                                                            </FormField>
                                                            {pet.other_vaccine_name.trim() && (
                                                                <div className="mt-4">
                                                                    <FormField label="Last Vaccination Date" error={petErrors[`${index}.other_vaccine_last_vaccination`]}>
                                                                        <input
                                                                            type="date"
                                                                            value={pet.other_vaccine_last_vaccination}
                                                                            onChange={(e) => updatePet(pet.uid, 'other_vaccine_last_vaccination', e.target.value)}
                                                                            className={fieldClass(!!petErrors[`${index}.other_vaccine_last_vaccination`])}
                                                                        />
                                                                    </FormField>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </PetSubSection>
                                            </div>
                                        )}
                                    </div>
                                ))}

                                <button
                                    type="button"
                                    onClick={addPet}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:border-violet-300 hover:bg-violet-50/40 hover:text-violet-700"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Another Animal
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between gap-3 border-t border-gray-100 pt-5">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 17l-5-5m0 0l5-5m-5 5h12"/>
                            </svg>
                            Previous
                        </button>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700"
                        >
                            Next Step
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Email and Password — new owners only */}
            {step === 3 && ownerMode === 'new' && (
                <div className="space-y-5">
                    <div className="rounded-xl border border-gray-100 bg-white p-5">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h4 className="mb-1 text-sm font-semibold text-gray-900">Account Credentials</h4>
                                <p className="text-sm text-gray-500">Create login credentials for the client portal</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleUseDefaultPassword}
                                className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                            >
                                Use Default Password
                            </button>
                        </div>
                        <div className="space-y-4">
                            <FormField label="Email Address" required error={errors.email}>
                                <input type="email" name="email" value={formData.email} onChange={handleInputChange} className={fieldClass(!!errors.email)} placeholder="client@example.com" />
                            </FormField>
                            <FormField
                                label="Password"
                                required
                                error={errors.password}
                                hint={formData.password === DEFAULT_CLIENT_PASSWORD ? `Using default password: ${DEFAULT_CLIENT_PASSWORD}` : undefined}
                            >
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        name="password"
                                        value={formData.password}
                                        onChange={handleInputChange}
                                        className={fieldClass(!!errors.password) + ' pr-10'}
                                        placeholder="Enter password"
                                    />
                                    <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                                </div>
                            </FormField>
                            <FormField label="Confirm Password" required error={errors.password_confirmation}>
                                <div className="relative">
                                    <input
                                        type={showPasswordConfirmation ? 'text' : 'password'}
                                        name="password_confirmation"
                                        value={formData.password_confirmation}
                                        onChange={handleInputChange}
                                        className={fieldClass(!!errors.password_confirmation) + ' pr-10'}
                                        placeholder="Confirm password"
                                    />
                                    <PasswordVisibilityToggle visible={showPasswordConfirmation} onToggle={() => setShowPasswordConfirmation(!showPasswordConfirmation)} />
                                </div>
                            </FormField>
                        </div>
                    </div>

                    <div className="flex justify-between gap-3 border-t border-gray-100 pt-5">
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 17l-5-5m0 0l5-5m-5 5h12"/>
                            </svg>
                            Previous
                        </button>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700"
                        >
                            Next Step
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Review */}
            {step === reviewStep && (
                <div className="space-y-5">
                    <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3 text-sm text-violet-900">
                        Review the details below before saving. Use the Edit links to go back to a step.
                    </div>

                    <ReviewCard title="Owner" onEdit={() => setStep(1)}>
                        {ownerMode === 'existing' ? (
                            <div className="divide-y divide-gray-100">
                                <ReviewRow label="Name" value={ownerFullName(selectedOwner)} />
                                <ReviewRow label="Phone Number" value={selectedOwner?.phone_number} />
                                <ReviewRow label="Email" value={selectedOwner?.email} />
                                <ReviewRow label="Street or landmark" value={selectedOwner?.street} />
                                <ReviewRow label="Barangay" value={selectedOwner?.barangay} />
                                <ReviewRow label="Zone" value={selectedOwner?.zone} />
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-100">
                                <ReviewRow label="Name" value={[formData.firstname, formData.middlename, formData.lastname].filter(Boolean).join(' ')} />
                                <ReviewRow label="Age" value={formData.age} />
                                <ReviewRow label="Phone Number" value={formData.phone_number} />
                                <ReviewRow label="Facebook" value={formData.facebook} />
                                <ReviewRow label="Street or landmark" value={formData.street} />
                                <ReviewRow label="Barangay" value={barangayName} />
                                <ReviewRow label="Zone" value={formData.zone} />
                            </div>
                        )}
                    </ReviewCard>

                    <ReviewCard title={`Animals (${pets.length})`} onEdit={() => setStep(2)}>
                        {pets.length === 0 ? (
                            <p className="text-sm text-gray-500">No animal added.</p>
                        ) : (
                            <div className="space-y-3">
                                {pets.map((pet, index) => (
                                    <div key={pet.uid} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                                        <div className="mb-2 flex items-center gap-2">
                                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-xs font-bold text-white">
                                                {index + 1}
                                            </span>
                                            <span className="text-sm font-semibold text-gray-900">{pet.pet_name}</span>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            <ReviewRow label="Species / Breed" value={`${speciesName(pet.species_id)} / ${breedName(pet.breed_id)}`} />
                                            <ReviewRow label="Sex" value={pet.sex === 'male' ? 'Male' : 'Female'} />
                                            <ReviewRow label="Birthdate" value={pet.birthdate} />
                                            <ReviewRow label="Color" value={pet.color} />
                                            <ReviewRow label="Weight" value={pet.weight ? `${pet.weight} kg` : ''} />
                                            <ReviewRow
                                                label="Reproductive Status"
                                                value={[REPRODUCTIVE_LABELS[pet.reproductive_status], pet.weeks_months].filter(Boolean).join(' — ')}
                                            />
                                            <ReviewRow
                                                label="Diet"
                                                value={pet.diet === 'others' ? pet.diet_other : DIET_LABELS[pet.diet]}
                                            />
                                            <ReviewRow
                                                label="Dewormed"
                                                value={pet.dewormed === 'yes'
                                                    ? [`Yes`, pet.last_deworming_date, pet.dewormer_name].filter(Boolean).join(' — ')
                                                    : pet.dewormed === 'no' ? 'No' : ''}
                                            />
                                            <ReviewRow
                                                label="Rabies Vaccine"
                                                value={pet.rabies_vaccine === 'yes'
                                                    ? ['Yes', pet.rabies_last_vaccination].filter(Boolean).join(' — ')
                                                    : pet.rabies_vaccine === 'no' ? 'No' : ''}
                                            />
                                            <ReviewRow
                                                label="DHPPL Vaccine"
                                                value={pet.dhppl_vaccine === 'yes'
                                                    ? ['Yes', pet.dhppl_last_vaccination].filter(Boolean).join(' — ')
                                                    : pet.dhppl_vaccine === 'no' ? 'No' : ''}
                                            />
                                            {pet.other_vaccine_name.trim() && (
                                                <ReviewRow
                                                    label="Other Vaccine"
                                                    value={[pet.other_vaccine_name, pet.other_vaccine_last_vaccination].filter(Boolean).join(' — ')}
                                                />
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ReviewCard>

                    {ownerMode === 'new' && (
                        <ReviewCard title="Account Credentials" onEdit={() => setStep(3)}>
                            <div className="divide-y divide-gray-100">
                                <ReviewRow label="Email Address" value={formData.email} />
                                <ReviewRow label="Password" value={'•'.repeat(formData.password.length)} />
                            </div>
                        </ReviewCard>
                    )}

                    <div className="flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <button
                            type="button"
                            onClick={() => setStep(reviewStep - 1)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 17l-5-5m0 0l5-5m-5 5h12"/>
                            </svg>
                            Previous
                        </button>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => submitForm('clients')}
                                disabled={loading}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50"
                            >
                                {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                type="button"
                                onClick={() => submitForm('services')}
                                disabled={loading}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-violet-200 transition-all hover:bg-violet-700 disabled:opacity-50"
                            >
                                {loading ? (
                                    <>
                                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        Save and Proceed to Services
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                                        </svg>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </form>
    );
}
