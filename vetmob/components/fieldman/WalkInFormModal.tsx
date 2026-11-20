import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Switch,
  Image,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import { API_BASE_URL } from '@/config/api';
import { showToast } from '@/components/Toast';
import { useAuth } from '@/contexts/auth-context';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import QrAnimalScanner from '@/components/fieldman/QrAnimalScanner';
import PetOwnerMedicalPanel, {
  type PetMedicalData,
  type PetOwnerDetails,
} from '@/components/fieldman/PetOwnerMedicalPanel';
import { filterGroupedInventoryByServices, getInventoryCategoriesForServices } from '@/utils/serviceInventoryCategories';
import OutsideClinicReceiptModal, {
  completedOutsideClinicItems,
  createOutsideClinicLine,
  type OutsideClinicLine,
} from '@/components/fieldman/OutsideClinicReceiptModal';
import { Picker } from '@react-native-picker/picker';

type EntryMode = 'scan' | 'manual';
type WizardStep = 1 | 2 | 3;

interface ServiceOption {
  id: number;
  type_name: string;
  description?: string | null;
}

interface ClientOption {
  id: number;
  name: string;
  email?: string;
  phone_number?: string;
  barangay?: string | null;
  zone?: string | null;
}

interface AnimalOption {
  id: number;
  pet_name: string;
  species_name?: string;
  breed_name?: string;
  registration_status?: string;
  identification_number?: string | null;
  pet_photo_url?: string | null;
  markings_photo_url?: string | null;
}

interface MatchedAnimalOption extends AnimalOption {
  owner: ClientOption;
}

interface SymptomOption {
  id: number;
  name: string;
}

interface TimeSlot {
  time: string;
  label: string;
  available: boolean;
  occupied?: boolean;
  remaining?: number | null;
  fully_booked?: boolean;
}

interface SelectedSymptom extends SymptomOption {
  days_count?: string;
}

interface InventoryItem {
  id: number;
  medicine_id?: number;
  created_at?: string;
  quantity: number | string;
  total_items?: number | string | null;
  available_total?: number;
  display_quantity?: string;
  is_vial?: boolean;
  is_box?: boolean;
  volume_ml?: number | string | null;
  medicine?: {
    id?: number;
    name?: string;
    category?: { id?: number; name?: string } | null;
  } | null;
  unit?: { id?: number; name?: string } | null;
}

interface SelectedInventoryItem extends InventoryItem {
  quantity: number;
}

const SERVICE_DURATIONS: Record<string, number> = {
  'vitamin supplement': 10,
  vitamin: 10,
  vaccination: 10,
  deworming: 10,
  treatment: 10,
  castration: 40,
  spay: 60,
};

const STEPS = [
  { step: 1 as WizardStep, label: 'Schedule' },
  { step: 2 as WizardStep, label: 'Inventory' },
  { step: 3 as WizardStep, label: 'Review' },
];

// Diri i-format ang Date ngadto sa YYYY-MM-DD.
const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Diri kuhaon ang gidugayon base sa ngalan sa serbisyo.
const getDurationForServiceName = (typeName?: string) => {
  const key = (typeName || '').toLowerCase().trim();
  if (!key) return 10;

  const entries = Object.entries(SERVICE_DURATIONS).sort(([a], [b]) => b.length - a.length);
  for (const [name, minutes] of entries) {
    if (key === name || key.includes(name)) return minutes;
  }
  return 10;
};

// Diri kwentahon ang gidugayon sa napili nga serbisyo.
const getSelectedServicesDuration = (serviceIds: number[], services: ServiceOption[]) => {
  if (!serviceIds.length) return 10;
  const total = serviceIds.reduce((sum, id) => {
    const service = services.find((entry) => entry.id === id);
    return sum + getDurationForServiceName(service?.type_name);
  }, 0);
  return total > 0 ? total : 10;
};

// Diri i-format ang gidugayon sa minutos o oras.
const formatDuration = (minutes: number) => {
  const value = minutes > 0 ? minutes : 10;
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
};

// Diri i-format ang oras ngadto sa AM/PM.
const formatTimeLabel = (time: string) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

// Diri susihon kung sakto ang ihap sa adlaw sa sintomas.
const isSymptomDaysValid = (daysCount?: string) => {
  if (!daysCount?.trim()) return false;
  const days = parseInt(daysCount, 10);
  return !Number.isNaN(days) && days > 0;
};

// Diri himuon ang range sa oras sugod hangtod human.
const formatTimeRange = (time: string, durationMinutes: number) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const start = formatTimeLabel(time);
  const endDate = new Date();
  endDate.setHours(h, m + (durationMinutes > 0 ? durationMinutes : 10), 0, 0);
  const end = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${start} – ${end}`;
};

// Diri kwentahon ang dosage sa vial base sa timbang.
const calculateVialDosage = (weight: string | number) => {
  const value = Number(weight);
  if (!value || Number.isNaN(value)) return 0;
  return value * 0.1;
};

// Diri i-round ang dosage sa vial.
const getVialDosageQuantity = (weight: string | number) =>
  Number(calculateVialDosage(weight).toFixed(2));

// Diri susihon kung valid ang dosage sa vial.
const isVialDosageValid = (weight: string | number) => getVialDosageQuantity(weight) >= 0.01;

// Diri i-format ang numero para ipakita.
const formatDisplayNumber = (value: number | string | null | undefined) => {
  const num = Number(value);
  if (Number.isNaN(num)) return String(value ?? '0');
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, '');
};

// Diri pilion ang pinakadaan nga batch sa matag tambal.
const pickOldestBatchPerMedicine = (items: InventoryItem[]) => {
  const byMedicine = new Map<number, InventoryItem>();

  items.forEach((item) => {
    const medicineId = item.medicine_id ?? item.medicine?.id;
    if (!medicineId) return;

    const existing = byMedicine.get(medicineId);
    if (!existing || new Date(item.created_at || 0) < new Date(existing.created_at || 0)) {
      byMedicine.set(medicineId, item);
    }
  });

  return Array.from(byMedicine.values());
};

// Diri kwentahon ang total stock sa tambal.
const getMedicineStockTotal = (medicineId: number | undefined, inventory: InventoryItem[]) => {
  if (!medicineId) return 0;
  return inventory
    .filter((item) => (item.medicine_id ?? item.medicine?.id) === medicineId)
    .reduce((sum, item) => {
      if (item.is_box) return sum + Number(item.total_items ?? 0);
      return sum + Number(item.quantity ?? 0);
    }, 0);
};

// Diri i-grupo ang inventory base sa category.
const groupInventoryByCategory = (items: InventoryItem[]) => {
  const grouped = new Map<string, InventoryItem[]>();

  items.forEach((item) => {
    const categoryName = item.medicine?.category?.name || 'Others';
    if (!grouped.has(categoryName)) grouped.set(categoryName, []);
    grouped.get(categoryName)!.push(item);
  });

  return Array.from(grouped.entries()).sort(([a], [b]) => {
    if (a === 'Others') return 1;
    if (b === 'Others') return -1;
    return a.localeCompare(b);
  });
};

// Diri ang card sa matag section.
function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-slate-700">
      <Text className="text-sm font-bold text-slate-800 dark:text-white">{title}</Text>
      {subtitle ? (
        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">{subtitle}</Text>
      ) : (
        <View className="mb-3" />
      )}
      {children}
    </View>
  );
}

export type ContinueBookingKind = 'walk_in' | 'appointment';

export interface WalkInResumeBooking {
  id: number;
  kind?: ContinueBookingKind;
  user: ClientOption;
  animalId: number;
  services: string[];
  date: string;
  time: string;
  notes?: string | null;
  administered_by?: string | null;
  petWeight?: string | number | null;
  complaint?: {
    is_bitten?: boolean;
    bite_details?: string | null;
    symptoms?: { name: string; days_count?: number; notes?: string }[];
  };
}

// Diri ang form modal sa walk-in.
export default function WalkInFormModal({
  visible,
  token,
  onClose,
  onSuccess,
  resumeBooking = null,
}: {
  visible: boolean;
  token: string | null;
  onClose: () => void;
  onSuccess: () => void;
  resumeBooking?: WalkInResumeBooking | null;
}) {
  const { user } = useAuth();
  const layout = useResponsiveLayout();
  const today = useMemo(() => formatLocalDate(new Date()), []);
  const defaultAdministeredBy = useMemo(() => {
    const fullName = [user?.firstname, user?.lastname].filter(Boolean).join(' ').trim();
    return fullName || user?.name || '';
  }, [user]);

  const [entryMode, setEntryMode] = useState<EntryMode>('scan');
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [matchedAnimals, setMatchedAnimals] = useState<MatchedAnimalOption[]>([]);
  const [animals, setAnimals] = useState<AnimalOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [symptoms, setSymptoms] = useState<SymptomOption[]>([]);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [selectedAnimalId, setSelectedAnimalId] = useState<number | null>(null);
  const [petDetails, setPetDetails] = useState<PetOwnerDetails | null>(null);
  const [medicalData, setMedicalData] = useState<PetMedicalData | null>(null);
  const [loadingPetContext, setLoadingPetContext] = useState(false);

  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<SelectedSymptom[]>([]);
  const [bookingDate, setBookingDate] = useState(today);
  const [bookingTime, setBookingTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isBitten, setIsBitten] = useState(false);
  const [biteDetails, setBiteDetails] = useState('');

  const [selectedInventoryItems, setSelectedInventoryItems] = useState<SelectedInventoryItem[]>([]);
  const [outsideLines, setOutsideLines] = useState<OutsideClinicLine[]>([createOutsideClinicLine()]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedInventoryCategory, setSelectedInventoryCategory] = useState('');
  const [petWeight, setPetWeight] = useState('');
  const [administeredBy, setAdministeredBy] = useState('');

  const [loadingClients, setLoadingClients] = useState(false);
  const [loadingAnimals, setLoadingAnimals] = useState(false);
  const [animalMeta, setAnimalMeta] = useState({ total: 0, ineligible: 0 });
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resumeMode, setResumeMode] = useState(false);
  const [resumeAppointmentId, setResumeAppointmentId] = useState<number | null>(null);
  const hydratedResumeIdRef = useRef<number | null>(null);

  // Diri limpyohan ang napili nga pet ra.
  const clearPetOnly = useCallback(() => {
    setSelectedAnimalId(null);
    setPetDetails(null);
    setMedicalData(null);
    setSelectedServiceIds([]);
    setSelectedSymptoms([]);
    setBookingTime('');
    setSelectedInventoryItems([]);
    setOutsideLines([createOutsideClinicLine()]);
    setReceiptOpen(false);
    setSelectedInventoryCategory('');
    setPetWeight('');
    setCurrentStep(1);
  }, []);

  // Diri limpyohan ang napili nga client ug pet.
  const clearPetSelection = useCallback(() => {
    setSelectedClient(null);
    clearPetOnly();
    setAnimals([]);
    setAnimalMeta({ total: 0, ineligible: 0 });
  }, [clearPetOnly]);

  // Diri i-reset ang tibuok walk-in form.
  const resetForm = useCallback(() => {
    setEntryMode('scan');
    setClientSearch('');
    clearPetSelection();
    setBookingDate(today);
    setNotes('');
    setIsBitten(false);
    setBiteDetails('');
    setTimeSlots([]);
    setInventory([]);
    setAdministeredBy(defaultAdministeredBy);
    setCurrentStep(1);
    setResumeMode(false);
    setResumeAppointmentId(null);
    hydratedResumeIdRef.current = null;
  }, [clearPetSelection, today, defaultAdministeredBy]);

  // Diri kuhaon ang detalye ug medical sa pet.
  const loadPetContext = useCallback(
    async (animalId: number, clientOverride?: ClientOption | null): Promise<boolean> => {
      if (!token) return false;
      setLoadingPetContext(true);
      try {
        const petRes = await axios.get(`${API_BASE_URL}/api/mobile/animals/${animalId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!petRes.data?.success || !petRes.data.pet) {
          showToast({ type: 'error', message: petRes.data?.error || 'Animal not found.' });
          clearPetSelection();
          return false;
        }

        const pet = petRes.data.pet as PetOwnerDetails;
        if (!['registered', 'exempt'].includes(pet.registration_status || '')) {
          showToast({
            type: 'error',
            message: 'Only registered or exempt animals can receive walk-in services.',
          });
          clearPetSelection();
          return false;
        }

        let medicalPayload: PetMedicalData | null = null;
        try {
          const medicalRes = await axios.get(
            `${API_BASE_URL}/api/mobile/fieldman/animals/${animalId}/medical-summary`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (medicalRes.data?.success) {
            medicalPayload = medicalRes.data;
          }
        } catch (medicalError) {
          console.warn('Medical summary unavailable, using pet profile fields:', medicalError);
        }

        const owner = pet.owner;
        const resolvedClient: ClientOption =
          clientOverride ||
          ({
            id: owner?.id || 0,
            name:
              owner?.name ||
              [owner?.firstname, owner?.lastname].filter(Boolean).join(' ') ||
              'Unknown',
            email: owner?.email,
            phone_number: owner?.phone_number,
            barangay: owner?.barangay,
          } as ClientOption);

        setSelectedClient(resolvedClient);
        setSelectedAnimalId(animalId);
        setPetDetails(pet);
        setMedicalData(medicalPayload);
        setPetWeight(pet.weight ? String(pet.weight) : '');
        setCurrentStep(1);
        return true;
      } catch (error: any) {
        showToast({
          type: 'error',
          message: error?.response?.data?.error || 'Failed to load pet details and medical history.',
        });
        clearPetSelection();
        return false;
      } finally {
        setLoadingPetContext(false);
      }
    },
    [token, clearPetSelection]
  );

  useEffect(() => {
    if (!visible) return;
    setAdministeredBy(defaultAdministeredBy);

    // Diri kuhaon ang serbisyo ug sintomas.
    const fetchReferenceData = async () => {
      try {
        const [servicesRes, symptomsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/mobile/services`),
          axios.get(`${API_BASE_URL}/api/mobile/symptoms`),
        ]);

        if (servicesRes.data?.success) setServices(servicesRes.data.services || []);
        if (symptomsRes.data?.success) setSymptoms(symptomsRes.data.symptoms || []);
      } catch (error) {
        console.error('Failed to load walk-in reference data:', error);
      }
    };

    fetchReferenceData();
  }, [visible, defaultAdministeredBy]);

  // Diri pangitaon ang mga client.
  const fetchClients = async (search: string) => {
    if (!token) return;
    const trimmed = search.trim();
    if (!trimmed) {
      setClients([]);
      setMatchedAnimals([]);
      return;
    }

    setLoadingClients(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/fieldman/clients`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { search: trimmed },
      });
      if (response.data?.success) {
        setClients(response.data.clients || []);
        setMatchedAnimals(response.data.matched_animals || []);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
      setClients([]);
      setMatchedAnimals([]);
    } finally {
      setLoadingClients(false);
    }
  };

  // Diri kuhaon ang mga hayop sa client.
  const fetchAnimals = async (clientId: number) => {
    if (!token) return;
    setLoadingAnimals(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/fieldman/clients/${clientId}/animals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.success) {
        setAnimals(response.data.animals || []);
        setAnimalMeta({
          total: response.data.total_animals ?? response.data.animals?.length ?? 0,
          ineligible: response.data.ineligible_count ?? 0,
        });
      }
    } catch (error) {
      console.error('Failed to fetch animals:', error);
      setAnimals([]);
      setAnimalMeta({ total: 0, ineligible: 0 });
    } finally {
      setLoadingAnimals(false);
    }
  };

  // Diri kuhaon ang available nga oras.
  const fetchTimeSlots = useCallback(async () => {
    if (!bookingDate || (selectedServiceIds.length === 0 && !isBitten)) {
      setTimeSlots([]);
      return;
    }

    setLoadingSlots(true);
    try {
      const duration =
        selectedServiceIds.length > 0
          ? getSelectedServicesDuration(selectedServiceIds, services)
          : 10;
      const response = await axios.get(`${API_BASE_URL}/api/mobile/available-time-slots`, {
        params: { date: bookingDate, duration_minutes: duration },
      });
      if (response.data?.success) {
        setTimeSlots((response.data.slots || []).filter((slot: TimeSlot) => Number(String(slot.time || '').split(':')[1] || 0) === 0));
      } else {
        setTimeSlots([]);
      }
    } catch (error) {
      console.error('Failed to fetch time slots:', error);
      setTimeSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [bookingDate, selectedServiceIds, services, isBitten]);

  // Diri kuhaon ang inventory sa tambal.
  const fetchInventory = useCallback(async () => {
    if (!token) return;
    setLoadingInventory(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/fieldman/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.success) {
        const items = (response.data.inventory || []) as InventoryItem[];
        const inStock = items.filter((item) => {
          if (item.is_box) return Number(item.total_items) > 0;
          return Number(item.quantity) > 0;
        });
        setInventory(inStock);
      } else {
        setInventory([]);
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
      setInventory([]);
      showToast({ type: 'error', message: 'Failed to load inventory items.' });
    } finally {
      setLoadingInventory(false);
    }
  }, [token]);

  useEffect(() => {
    if (!visible || !resumeBooking || !token || services.length === 0) return;
    if (hydratedResumeIdRef.current === resumeBooking.id) return;

    // Diri pun-on ang form gikan sa gipadayon nga booking.
    const hydrateResumeBooking = async () => {
      hydratedResumeIdRef.current = resumeBooking.id;
      setResumeMode(true);
      setResumeAppointmentId(resumeBooking.id);
      setEntryMode('manual');
      setSelectedClient(resumeBooking.user);
      setSelectedAnimalId(resumeBooking.animalId);
      setBookingDate(resumeBooking.date);
      setBookingTime(resumeBooking.time);
      setNotes(resumeBooking.notes?.trim() || '');
      setIsBitten(!!resumeBooking.complaint?.is_bitten);
      setBiteDetails(resumeBooking.complaint?.bite_details?.trim() || '');
      setAdministeredBy(resumeBooking.administered_by?.trim() || defaultAdministeredBy);
      setPetWeight(
        resumeBooking.petWeight !== null && resumeBooking.petWeight !== undefined
          ? String(resumeBooking.petWeight)
          : ''
      );

      const matchedServiceIds = resumeBooking.services
        .map((serviceName) =>
          services.find((service) => service.type_name.toLowerCase() === serviceName.toLowerCase())?.id
        )
        .filter((id): id is number => typeof id === 'number');
      setSelectedServiceIds(matchedServiceIds);

      const matchedSymptoms = (resumeBooking.complaint?.symptoms || [])
        .map((symptom) => {
          const match = symptoms.find((entry) => entry.name.toLowerCase() === symptom.name.toLowerCase());
          if (!match) return null;
          return {
            ...match,
            days_count: symptom.days_count ? String(symptom.days_count) : '',
          } satisfies SelectedSymptom;
        })
        .filter((entry) => entry !== null);
      setSelectedSymptoms(matchedSymptoms);

      const loaded = await loadPetContext(resumeBooking.animalId, resumeBooking.user);
      if (!loaded) {
        setResumeMode(false);
        setResumeAppointmentId(null);
        hydratedResumeIdRef.current = null;
        return;
      }
      setCurrentStep(2);
      fetchInventory();
    };

    hydrateResumeBooking();
  }, [
    visible,
    resumeBooking,
    token,
    services,
    symptoms,
    defaultAdministeredBy,
    loadPetContext,
    fetchInventory,
  ]);

  useEffect(() => {
    if (!visible) return;
    fetchTimeSlots();
  }, [visible, fetchTimeSlots]);

  useEffect(() => {
    if (!visible || entryMode !== 'manual') return;
    const trimmed = clientSearch.trim();
    if (!trimmed) {
      setClients([]);
      setMatchedAnimals([]);
      setLoadingClients(false);
      return;
    }
    const timer = setTimeout(() => {
      fetchClients(trimmed);
    }, 300);
    return () => clearTimeout(timer);
  }, [clientSearch, visible, entryMode]);

  const hasTreatmentService = selectedServiceIds.some((id) => {
    const service = services.find((entry) => entry.id === id);
    return service?.type_name?.toLowerCase() === 'treatment';
  });

  const petReady = !!selectedClient && !!selectedAnimalId && !!petDetails;

  useEffect(() => {
    if (!visible || !petReady || currentStep < 2) return;
    if (inventory.length === 0 && !loadingInventory) {
      fetchInventory();
    }
  }, [visible, petReady, currentStep, inventory.length, loadingInventory, fetchInventory]);

  const treatmentSymptomsReady =
    !hasTreatmentService ||
    (selectedSymptoms.length > 0 &&
      selectedSymptoms.every((symptom) => isSymptomDaysValid(symptom.days_count)));

  const scheduleReady =
    petReady &&
    (selectedServiceIds.length > 0 || isBitten) &&
    !!bookingDate &&
    !!bookingTime &&
    treatmentSymptomsReady;

  const hasVialItem = selectedInventoryItems.some((item) => item.is_vial);
  const outsideReadyItems = completedOutsideClinicItems(outsideLines);
  const inventoryReady =
    (selectedInventoryItems.length > 0 || outsideReadyItems.length > 0) &&
    administeredBy.trim().length >= 2 &&
    (!hasVialItem ||
      (Number(petWeight) > 0 && !Number.isNaN(Number(petWeight)) && isVialDosageValid(petWeight)));

  const selectedServiceNames = useMemo(
    () =>
      selectedServiceIds
        .map((id) => services.find((service) => service.id === id)?.type_name)
        .filter(Boolean) as string[],
    [selectedServiceIds, services]
  );

  const groupedInventory = useMemo(() => {
    const representatives = pickOldestBatchPerMedicine(inventory).map((item) => {
      const medicineId = item.medicine_id ?? item.medicine?.id;
      const total = getMedicineStockTotal(medicineId, inventory);
      return {
        ...item,
        available_total: total,
        quantity: item.is_box ? item.quantity : total,
        total_items: item.is_box ? total : item.total_items,
      };
    });
    return filterGroupedInventoryByServices(
      groupInventoryByCategory(representatives),
      selectedServiceNames
    );
  }, [inventory, selectedServiceNames]);
  const inventoryCategories = useMemo(
    () => groupedInventory.map(([name]) => name),
    [groupedInventory]
  );
  const receiptCategories = useMemo(() => {
    const names = new Set<string>();
    inventory.forEach((item) => {
      const name = item.medicine?.category?.name;
      if (name) names.add(name);
    });
    inventoryCategories.forEach((name) => names.add(name));
    return Array.from(names);
  }, [inventory, inventoryCategories]);
  const activeInventoryCategory = inventoryCategories.length === 1
    ? inventoryCategories[0]
    : selectedInventoryCategory;
  const visibleInventoryItems = useMemo(() => {
    if (!activeInventoryCategory) return [];
    const match = groupedInventory.find(([name]) => name === activeInventoryCategory);
    return match ? match[1] : [];
  }, [groupedInventory, activeInventoryCategory]);
  const receiptDefaultCategories = useMemo(() => {
    const mapped = getInventoryCategoriesForServices(selectedServiceNames) || [];
    const allowed = new Set(receiptCategories.map((name) => name.toLowerCase()));
    const picked = mapped.filter((name) => allowed.has(name.toLowerCase()));
    if (picked.length > 0) return picked;
    return activeInventoryCategory ? [activeInventoryCategory] : [];
  }, [selectedServiceNames, receiptCategories, activeInventoryCategory]);

  useEffect(() => {
    setSelectedInventoryCategory((current) => {
      if (inventoryCategories.length === 1) {
        return inventoryCategories[0];
      }
      if (inventoryCategories.length >= 2) {
        return inventoryCategories.includes(current) ? current : '';
      }
      return '';
    });
  }, [inventoryCategories]);

  useEffect(() => {
    setSelectedInventoryItems([]);
  }, [selectedServiceIds.join('|')]);

  const selectedDurationMinutes = useMemo(
    () => getSelectedServicesDuration(selectedServiceIds, services),
    [selectedServiceIds, services]
  );

  // Diri pilion o tangtangon ang serbisyo.
  const toggleService = (serviceId: number) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
    setBookingTime('');
  };

  // Diri pilion o tangtangon ang sintomas.
  const toggleSymptom = (symptom: SymptomOption) => {
    setSelectedSymptoms((prev) => {
      const exists = prev.find((entry) => entry.id === symptom.id);
      if (exists) return prev.filter((entry) => entry.id !== symptom.id);
      return [...prev, { ...symptom, days_count: '' }];
    });
  };

  // Diri pilion o tangtangon ang item sa inventory.
  const toggleInventoryItem = (item: InventoryItem) => {
    setSelectedInventoryItems((prev) => {
      const exists = prev.some((entry) => entry.id === item.id);
      if (exists) return prev.filter((entry) => entry.id !== item.id);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  // Diri usbon ang gidaghanon sa item sa inventory.
  const updateInventoryQuantity = (itemId: number, quantityText: string) => {
    const quantity = Math.max(1, parseInt(quantityText, 10) || 1);
    setSelectedInventoryItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, quantity } : item))
    );
  };

  // Diri pilion ang client.
  const handleSelectClient = (client: ClientOption) => {
    setSelectedClient(client);
    setSelectedAnimalId(null);
    setPetDetails(null);
    setMedicalData(null);
    setAnimals([]);
    setAnimalMeta({ total: 0, ineligible: 0 });
    fetchAnimals(client.id);
  };

  // Diri pilion ang hayop sa client.
  const handleSelectAnimal = async (animal: AnimalOption) => {
    await loadPetContext(animal.id, selectedClient);
  };

  // Diri pilion ang hayop gikan sa search result.
  const handleSelectMatchedAnimal = async (animal: MatchedAnimalOption) => {
    await loadPetContext(animal.id, animal.owner);
  };

  // Diri ilisan ang napili nga pet.
  const handleChangePet = () => {
    const client = selectedClient;
    clearPetOnly();
    if (entryMode === 'manual' && client) {
      fetchAnimals(client.id);
    }
  };

  // Diri ilisan ang mode sa pagpili og pet.
  const handleModeChange = (mode: EntryMode) => {
    if (mode === entryMode) return;
    setEntryMode(mode);
    clearPetSelection();
    setClientSearch('');
    setMatchedAnimals([]);
  };

  // Diri moadto sa inventory step kung kompleto na.
  const goToInventoryStep = () => {
    if (!scheduleReady) {
      if (hasTreatmentService && !treatmentSymptomsReady) {
        showToast({
          type: 'error',
          message:
            selectedSymptoms.length === 0
              ? 'Select at least one symptom for treatment visits.'
              : 'Enter duration in days for each selected symptom.',
        });
      } else {
        showToast({ type: 'error', message: 'Complete schedule details before continuing.' });
      }
      return;
    }
    setCurrentStep(2);
    if (inventory.length === 0) fetchInventory();
  };

  // Diri moadto sa review step kung kompleto na.
  const goToReviewStep = () => {
    if (!inventoryReady) {
      if (selectedInventoryItems.length === 0 && outsideReadyItems.length === 0) {
        showToast({ type: 'error', message: 'Select a clinic medicine or add an outside clinic receipt.' });
      } else if (hasVialItem && !(Number(petWeight) > 0)) {
        showToast({ type: 'error', message: 'Enter pet weight for vial dosage calculation.' });
      } else if (hasVialItem && !isVialDosageValid(petWeight)) {
        showToast({
          type: 'error',
          message: 'Pet weight is too low for vial dosage (minimum 0.1 kg).',
        });
      } else {
        showToast({ type: 'error', message: 'Enter who will administer the treatment.' });
      }
      return;
    }
    setCurrentStep(3);
  };

  const isAppointmentContinue = resumeMode && resumeBooking?.kind === 'appointment';

  // Diri i-save ang walk-in record.
  const handleSubmit = async () => {
    if (!token || !selectedClient || !selectedAnimalId || !scheduleReady || !inventoryReady) {
      showToast({ type: 'error', message: 'Complete all required fields before saving.' });
      return;
    }

    let finalServiceIds = [...selectedServiceIds];
    if (finalServiceIds.length === 0 && isBitten) {
      const treatmentService = services.find((service) =>
        service.type_name.toLowerCase().includes('treatment')
      );
      if (treatmentService) finalServiceIds = [treatmentService.id];
    }

    setSubmitting(true);
    try {
      let appointmentId = resumeMode ? resumeAppointmentId : null;

      if (!resumeMode) {
        const createResponse = await axios.post(
          `${API_BASE_URL}/api/mobile/walk-in-appointment`,
          {
            client_id: selectedClient.id,
            animal_id: selectedAnimalId,
            service_ids: finalServiceIds,
            service_id: finalServiceIds[0] ?? null,
            booking_date: bookingDate,
            booking_time: bookingTime,
            notes: notes.trim() || undefined,
            is_bitten: isBitten,
            bite_details: isBitten ? biteDetails.trim() || undefined : undefined,
            administered_by: administeredBy.trim(),
            symptoms:
              selectedSymptoms.length > 0
                ? selectedSymptoms.map((symptom) => ({
                    name: symptom.name,
                    days_count: Number(symptom.days_count),
                  }))
                : undefined,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!createResponse.data?.success) {
          showToast({
            type: 'error',
            message: createResponse.data?.error || 'Failed to create walk-in.',
          });
          return;
        }

        appointmentId = createResponse.data?.appointment?.id ?? null;
        if (!appointmentId) {
          showToast({
            type: 'error',
            message: 'Walk-in created, but appointment id was missing for inventory handoff.',
          });
          resetForm();
          onClose();
          onSuccess();
          return;
        }
      }

      const handoffUrl = isAppointmentContinue
        ? `${API_BASE_URL}/api/mobile/appointments/${appointmentId}/mark-ongoing`
        : `${API_BASE_URL}/api/mobile/walk-in-appointment/${appointmentId}/mark-ongoing`;

      const handoffResponse = await axios.post(
        handoffUrl,
        {
          animal_id: selectedAnimalId || petDetails?.id || undefined,
          pet_weight: petWeight ? Number(petWeight) : null,
          administered_by: administeredBy.trim(),
          selected_items: selectedInventoryItems.map((item) => ({
            inventory_id: item.id,
            quantity: item.is_vial
              ? getVialDosageQuantity(petWeight)
              : Number(item.quantity || 1),
          })),
          outside_items: outsideReadyItems,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (handoffResponse.data?.success) {
        showToast({
          type: 'success',
          message: isAppointmentContinue
            ? `Appointment for ${petDetails?.pet_name || 'pet'} marked as ongoing.`
            : resumeMode
              ? `Walk-in for ${petDetails?.pet_name || 'pet'} completed and marked as ongoing.`
              : `Walk-in for ${petDetails?.pet_name || 'pet'} marked as ongoing.`,
        });
        resetForm();
        onClose();
        onSuccess();
      } else {
        showToast({
          type: 'error',
          message:
            handoffResponse.data?.error ||
            'Walk-in created, but failed to mark as ongoing. Check Vet Services.',
        });
        onSuccess();
      }
    } catch (error: any) {
      const data = error?.response?.data;
      const validationErrors = data?.errors || data?.messages;
      const message = validationErrors
        ? Object.values(validationErrors).flat().join('\n')
        : data?.error || data?.message || 'Failed to complete booking.';
      showToast({ type: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  // Diri isira ug i-reset ang walk-in form.
  const handleClose = () => {
    resetForm();
    onClose();
  };

  const stepSubtitle =
    resumeMode
      ? isAppointmentContinue
        ? currentStep === 2
          ? 'Select medicines and start this appointment'
          : 'Review and mark this appointment as ongoing'
        : currentStep === 2
          ? 'Select medicines and complete this walk-in'
          : 'Review and mark this walk-in as ongoing'
      : !petReady
        ? 'Scan a QR code or search manually to load pet and owner details'
        : currentStep === 1
          ? 'Select services and schedule for this walk-in'
          : currentStep === 2
            ? 'Choose medicines / inventory items to use'
            : 'Review details and mark this walk-in as ongoing';

  return (
    <>
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View className="flex-1 bg-canvas dark:bg-navy-dark" style={{ paddingBottom: layout.bottomInset }}>
        <View
          className="border-b border-slate-200 bg-white pb-5"
          style={{
            paddingTop: layout.headerPaddingTop,
            paddingHorizontal: layout.headerGutter,
          }}
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1">
              <Text className={`${layout.titleClass} font-bold text-navy`} numberOfLines={2}>
                {resumeMode
                  ? isAppointmentContinue
                    ? currentStep === 2
                      ? 'Continue Appointment'
                      : 'Continue Appointment — Review'
                    : currentStep === 2
                      ? 'Continue Walk-in'
                      : 'Continue Walk-in — Review'
                  : !petReady
                    ? 'Add Walk-in'
                    : currentStep === 1
                      ? 'Walk-in — Schedule'
                      : currentStep === 2
                        ? 'Walk-in — Inventory'
                        : 'Walk-in — Review'}
              </Text>
              <Text className="mt-1 text-sm text-muted">{stepSubtitle}</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
            >
              <MaterialIcons name="close" size={22} color="#16324F" />
            </TouchableOpacity>
          </View>

          {!petReady && !resumeMode ? (
            <View className="mt-4 flex-row rounded-2xl bg-slate-100 p-1">
              <TouchableOpacity
                onPress={() => handleModeChange('scan')}
                className={`flex-1 flex-row items-center justify-center rounded-xl py-2.5 ${
                  entryMode === 'scan' ? 'bg-navy' : ''
                }`}
              >
                <MaterialIcons
                  name="qr-code-scanner"
                  size={16}
                  color={entryMode === 'scan' ? '#ffffff' : '#16324F'}
                />
                <Text
                  className={`ml-1.5 text-sm font-bold ${
                    entryMode === 'scan' ? 'text-white' : 'text-navy'
                  }`}
                >
                  Scan QR
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleModeChange('manual')}
                className={`flex-1 flex-row items-center justify-center rounded-xl py-2.5 ${
                  entryMode === 'manual' ? 'bg-navy' : ''
                }`}
              >
                <MaterialIcons
                  name="person-search"
                  size={16}
                  color={entryMode === 'manual' ? '#ffffff' : '#16324F'}
                />
                <Text
                  className={`ml-1.5 text-sm font-bold ${
                    entryMode === 'manual' ? 'text-white' : 'text-navy'
                  }`}
                >
                  Manual
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="mt-5 flex-row items-center">
              {STEPS.map((item, index) => {
                const done = currentStep > item.step;
                const active = currentStep === item.step;
                const reached = currentStep >= item.step;

                return (
                  <View key={item.step} className="flex-1 flex-row items-center">
                    <View className="flex-1 items-center">
                      <View
                        className={`h-8 w-8 items-center justify-center rounded-full ${
                          done ? 'bg-teal' : active ? 'bg-navy' : 'border border-slate-200 bg-slate-100'
                        }`}
                      >
                        {done ? (
                          <MaterialIcons name="check" size={16} color="#ffffff" />
                        ) : (
                          <Text
                            className="text-xs font-bold"
                            style={{ color: active ? '#ffffff' : '#475569' }}
                          >
                            {item.step}
                          </Text>
                        )}
                      </View>
                      <Text
                        className="mt-1.5 text-[11px] font-bold"
                        numberOfLines={1}
                        style={{ color: reached ? '#16324F' : '#64748b' }}
                      >
                        {item.label}
                      </Text>
                    </View>
                    {index < STEPS.length - 1 ? (
                      <View
                        className="mx-1 mb-5 h-0.5 w-5 rounded-full"
                        style={{ backgroundColor: done ? '#1F7A8C' : '#CBD5E1' }}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
          {resumeMode && loadingPetContext ? (
            <View className="bg-white dark:bg-slate-800 rounded-2xl p-8 items-center border border-slate-200 dark:border-slate-700 mb-4">
              <ActivityIndicator color="#1F7A8C" />
              <Text className="text-sm text-slate-500 dark:text-slate-400 mt-3">Loading walk-in details...</Text>
            </View>
          ) : null}

          {!petReady && !resumeMode ? (
            entryMode === 'scan' ? (
              <SectionCard
                title="Scan Animal QR"
                subtitle="Scan the pet QR code to auto-fill owner details and medical history"
              >
                <QrAnimalScanner
                  token={token}
                  onAnimalResolved={(animalId) => loadPetContext(animalId)}
                  onCancel={() => handleModeChange('manual')}
                />
              </SectionCard>
            ) : selectedClient ? (
              <SectionCard title="Select Pet" subtitle={`Choose an animal for ${selectedClient.name}`}>
                <View className="rounded-xl px-3 py-3 mb-3 border border-teal bg-teal-50 dark:bg-navy/20">
                  <Text className="text-[10px] font-bold text-teal-700 dark:text-teal-200 uppercase tracking-wider">
                    Owner
                  </Text>
                  <Text className="font-semibold text-slate-800 dark:text-white mt-1">{selectedClient.name}</Text>
                  <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {[selectedClient.barangay, selectedClient.phone_number, selectedClient.email]
                      .filter(Boolean)
                      .join(' • ')}
                  </Text>
                </View>

                {loadingAnimals ? (
                  <ActivityIndicator color="#1F7A8C" />
                ) : animals.length === 0 ? (
                  <Text className="text-sm text-amber-700 dark:text-amber-300">
                    {animalMeta.total > 0
                      ? `This owner has ${animalMeta.total} animal(s), but none are registered or exempt yet.`
                      : 'This owner has no animals on record.'}
                  </Text>
                ) : (
                  animals.map((animal) => (
                    <TouchableOpacity
                      key={animal.id}
                      onPress={() => handleSelectAnimal(animal)}
                      className="rounded-xl px-3 py-3 mb-2 border border-slate-200 dark:border-slate-700 flex-row items-center"
                    >
                      {animal.pet_photo_url ? (
                        <Image
                          source={{ uri: animal.pet_photo_url }}
                          className="w-12 h-12 rounded-xl mr-3 bg-slate-100"
                          resizeMode="cover"
                        />
                      ) : (
                        <View className="w-12 h-12 rounded-xl mr-3 bg-slate-100 dark:bg-slate-700 items-center justify-center">
                          <MaterialIcons name="pets" size={20} color="#94a3b8" />
                        </View>
                      )}
                      <View className="flex-1">
                        <Text className="font-semibold text-slate-800 dark:text-white">{animal.pet_name}</Text>
                        {animal.identification_number ? (
                          <Text className="text-xs text-teal-700 dark:text-teal-200 mt-0.5">
                            ID: {animal.identification_number}
                          </Text>
                        ) : null}
                        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {[animal.species_name, animal.breed_name, animal.registration_status]
                            .filter(Boolean)
                            .join(' • ')}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
                    </TouchableOpacity>
                  ))
                )}
              </SectionCard>
            ) : (
              <SectionCard
                title="Find Owner or Pet"
                subtitle="Search by owner name, contact details, or pet identification number"
              >
                <TextInput
                  value={clientSearch}
                  onChangeText={setClientSearch}
                  placeholder="Owner name, email, phone, or pet ID"
                  placeholderTextColor="#94a3b8"
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-white mb-3"
                />

                {!clientSearch.trim() ? (
                  <Text className="text-sm text-slate-500 dark:text-slate-400">
                    Type to search for an owner or pet identification number.
                  </Text>
                ) : loadingClients ? (
                  <ActivityIndicator color="#1F7A8C" />
                ) : (
                  <View>
                    {matchedAnimals.length > 0 ? (
                      <View className="mb-4">
                        <Text className="text-xs font-bold text-slate-400 uppercase mb-2">Matching Pets</Text>
                        {matchedAnimals.map((animal) => (
                          <TouchableOpacity
                            key={`animal-${animal.id}`}
                            onPress={() => handleSelectMatchedAnimal(animal)}
                            className="rounded-xl px-3 py-3 mb-2 border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-navy/20 flex-row items-center"
                          >
                            {animal.pet_photo_url ? (
                              <Image
                                source={{ uri: animal.pet_photo_url }}
                                style={{ width: 48, height: 48, borderRadius: 12, marginRight: 12 }}
                                resizeMode="cover"
                              />
                            ) : (
                              <View className="w-12 h-12 rounded-xl mr-3 bg-slate-100 dark:bg-slate-700 items-center justify-center">
                                <MaterialIcons name="pets" size={20} color="#94a3b8" />
                              </View>
                            )}
                            <View className="flex-1">
                              <Text className="font-semibold text-slate-800 dark:text-white">{animal.pet_name}</Text>
                              <Text className="text-xs text-teal-700 dark:text-teal-200 mt-0.5">
                                ID: {animal.identification_number || '—'}
                              </Text>
                              <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                Owner: {animal.owner.name}
                              </Text>
                            </View>
                            <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}

                    {clients.length > 0 ? (
                      <View>
                        <Text className="text-xs font-bold text-slate-400 uppercase mb-2">Matching Owners</Text>
                        {clients.slice(0, 8).map((client) => (
                          <TouchableOpacity
                            key={client.id}
                            onPress={() => handleSelectClient(client)}
                            className="rounded-xl px-3 py-3 mb-2 border border-slate-200 dark:border-slate-700 bg-canvas dark:bg-navy-dark/40"
                          >
                            <Text className="font-semibold text-slate-800 dark:text-white">{client.name}</Text>
                            <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {[client.barangay, client.phone_number, client.email].filter(Boolean).join(' • ')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}

                    {matchedAnimals.length === 0 && clients.length === 0 ? (
                      <Text className="text-sm text-slate-500 dark:text-slate-400">No owners or pets found.</Text>
                    ) : null}
                  </View>
                )}
              </SectionCard>
            )
          ) : null}

          {loadingPetContext ? <PetOwnerMedicalPanel pet={null} medical={null} loading /> : null}

          {petReady && currentStep === 1 ? (
            <>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Loaded from {entryMode === 'scan' ? 'QR scan' : 'manual search'}
                </Text>
                <TouchableOpacity onPress={handleChangePet} className="flex-row items-center">
                  <MaterialIcons name="refresh" size={14} color="#1F7A8C" />
                  <Text className="ml-1 text-xs font-semibold text-teal-700">Change pet</Text>
                </TouchableOpacity>
              </View>
              <PetOwnerMedicalPanel pet={petDetails} medical={medicalData} />

              <SectionCard title="Services" subtitle="Select one or more services for this walk-in">
                <View className="gap-2">
                  {services.map((service) => {
                    const active = selectedServiceIds.includes(service.id);
                    const duration = getDurationForServiceName(service.type_name);
                    return (
                      <TouchableOpacity
                        key={service.id}
                        onPress={() => toggleService(service.id)}
                        className={`rounded-xl px-3 py-3 border flex-row items-center justify-between ${
                          active
                            ? 'bg-teal border-teal'
                            : 'bg-canvas dark:bg-navy-dark/40 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <View className="flex-1 pr-3">
                          <Text
                            className={`text-sm font-semibold ${
                              active ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {service.type_name}
                          </Text>
                          <Text
                            className={`text-xs mt-0.5 ${
                              active ? 'text-teal-100' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {formatDuration(duration)}
                          </Text>
                        </View>
                        {active ? <MaterialIcons name="check-circle" size={18} color="#ffffff" /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {selectedServiceIds.length > 0 ? (
                  <View className="mt-3 rounded-xl bg-teal-50 dark:bg-navy/20 px-3 py-2 border border-teal-100 dark:border-teal-800">
                    <Text className="text-xs font-semibold text-navy dark:text-teal-100">
                      {selectedServiceIds.length} service{selectedServiceIds.length === 1 ? '' : 's'} selected · Total:{' '}
                      {formatDuration(selectedDurationMinutes)}
                    </Text>
                  </View>
                ) : null}
                {selectedServiceIds.length === 0 && !isBitten ? (
                  <Text className="text-xs text-red-600 mt-3">
                    Select at least one service, or record a bite incident below.
                  </Text>
                ) : null}
              </SectionCard>

              {hasTreatmentService ? (
                <SectionCard title="Treatment Symptoms" subtitle="Select symptoms and enter how many days each has lasted">
                  {symptoms.map((symptom) => {
                    const selected = selectedSymptoms.find((entry) => entry.id === symptom.id);
                    const daysInvalid = selected && !isSymptomDaysValid(selected.days_count);
                    return (
                      <View key={symptom.id} className="mb-3">
                        <TouchableOpacity
                          onPress={() => toggleSymptom(symptom)}
                          className={`rounded-xl px-3 py-3 border ${
                            selected
                              ? 'border-teal bg-teal-50 dark:bg-navy/20'
                              : 'border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          <Text className="font-medium text-slate-800 dark:text-white">{symptom.name}</Text>
                        </TouchableOpacity>
                        {selected ? (
                          <View className="mt-2">
                            <Text className="text-xs font-bold text-slate-400 uppercase mb-1.5">
                              Duration (days) <Text className="text-red-500">*</Text>
                            </Text>
                            <TextInput
                              value={selected.days_count || ''}
                              onChangeText={(value) =>
                                setSelectedSymptoms((prev) =>
                                  prev.map((entry) =>
                                    entry.id === symptom.id ? { ...entry, days_count: value } : entry
                                  )
                                )
                              }
                              placeholder="Enter number of days"
                              placeholderTextColor="#94a3b8"
                              keyboardType="number-pad"
                              className={`bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-2.5 text-slate-800 dark:text-white border ${
                                daysInvalid ? 'border-red-400' : 'border-transparent'
                              }`}
                            />
                            {daysInvalid ? (
                              <Text className="text-xs text-red-600 mt-1.5">
                                Enter how many days this symptom has lasted.
                              </Text>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </SectionCard>
              ) : null}

              <SectionCard title="Schedule" subtitle="Use today's date and pick an hourly time slot">
                <Text className="text-xs font-bold text-slate-400 uppercase mb-2">Date</Text>
                <View className="bg-teal-50 dark:bg-navy/20 rounded-xl px-4 py-3 mb-4 border border-teal-100 dark:border-teal-800">
                  <Text className="text-sm font-semibold text-navy dark:text-teal-100">{bookingDate}</Text>
                </View>

                <Text className="text-xs font-bold text-slate-400 uppercase mb-2">Time Slot</Text>
                {selectedServiceIds.length > 0 || isBitten ? (
                  <Text className="text-xs text-teal-700 dark:text-teal-200 mb-2">
                    Showing slots for {formatDuration(selectedDurationMinutes)} of service time
                  </Text>
                ) : null}
                {selectedServiceIds.length === 0 && !isBitten ? (
                  <Text className="text-sm text-slate-500">Select a service first to load time slots.</Text>
                ) : loadingSlots ? (
                  <ActivityIndicator color="#1F7A8C" />
                ) : (() => {
                  const visibleSlots = timeSlots;
                  const hasBookableSlot = visibleSlots.some((slot) => slot.available) || Boolean(bookingTime);

                  if (!hasBookableSlot) {
                    return <Text className="text-sm text-amber-700">No available time slots for this date.</Text>;
                  }

                  return (
                  <View className="flex-row flex-wrap gap-2">
                    {visibleSlots.map((slot) => {
                      const active = bookingTime === slot.time;
                      return (
                        <TouchableOpacity
                          key={slot.time}
                          disabled={!slot.available}
                          onPress={() => setBookingTime(slot.time)}
                          className={`rounded-lg px-3 py-2 border min-w-[88px] ${
                            active
                              ? 'bg-teal border-teal'
                              : slot.fully_booked
                                ? 'bg-red-50 border-red-200'
                              : slot.available
                                ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                : 'bg-slate-100 border-transparent opacity-50'
                          }`}
                        >
                          <Text
                            className={`text-xs font-semibold text-center ${
                              active
                                ? 'text-white'
                                : slot.fully_booked
                                  ? 'text-red-700'
                                : slot.available
                                  ? 'text-slate-700 dark:text-slate-200'
                                  : 'text-slate-400'
                            }`}
                          >
                            {slot.label}
                          </Text>
                          <Text
                            className={`text-[10px] text-center mt-0.5 ${
                              active ? 'text-white/90' : slot.fully_booked ? 'text-red-600' : 'text-slate-500'
                            }`}
                          >
                            {slot.fully_booked || slot.remaining === 0
                              ? 'Fully booked'
                              : Number.isFinite(Number(slot.remaining ?? slot.capacity))
                                ? `${Number(slot.remaining ?? slot.capacity)} available`
                                : ''}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  );
                })()}
                {bookingTime ? (
                  <Text className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                    Reserved: {formatTimeRange(bookingTime, selectedDurationMinutes)} ({formatDuration(selectedDurationMinutes)})
                  </Text>
                ) : null}
              </SectionCard>

              <SectionCard title="Additional Info">
                <View className="flex-row items-center justify-between mb-3">
                  <View>
                    <Text className="text-sm font-semibold text-slate-800 dark:text-white">Bite incident</Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400">Report if this is a bite case</Text>
                  </View>
                  <Switch value={isBitten} onValueChange={setIsBitten} trackColor={{ true: '#1F7A8C' }} />
                </View>
                {isBitten ? (
                  <TextInput
                    value={biteDetails}
                    onChangeText={setBiteDetails}
                    placeholder="Describe the bite incident..."
                    placeholderTextColor="#94a3b8"
                    multiline
                    className="bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-white mb-3 min-h-[80px]"
                  />
                ) : null}
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Optional notes for this walk-in"
                  placeholderTextColor="#94a3b8"
                  multiline
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-white min-h-[80px]"
                />
              </SectionCard>
            </>
          ) : null}

          {petReady && currentStep === 2 ? (
            <>
              <SectionCard title="Administered By" subtitle="Who will give the treatment">
                <TextInput
                  value={administeredBy}
                  onChangeText={setAdministeredBy}
                  placeholder="Staff / fieldman name"
                  placeholderTextColor="#94a3b8"
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-white"
                />
              </SectionCard>

              <SectionCard
                title="Pet Weight"
                subtitle={hasVialItem ? 'Required for vial dosage (0.10 ml per kg)' : 'Optional, used for vial items'}
              >
                <TextInput
                  value={petWeight}
                  onChangeText={setPetWeight}
                  placeholder="Weight in kg"
                  placeholderTextColor="#94a3b8"
                  keyboardType="decimal-pad"
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-white"
                />
                {hasVialItem && Number(petWeight) > 0 ? (
                  <Text className="text-xs text-teal-700 dark:text-teal-200 mt-2">
                    Vial dosage: {calculateVialDosage(petWeight).toFixed(2)} ml
                  </Text>
                ) : null}
              </SectionCard>

              <SectionCard title="Inventory / Medicines" subtitle="Select items to record for this walk-in">
                {loadingInventory ? (
                  <ActivityIndicator color="#1F7A8C" />
                ) : inventoryCategories.length === 0 ? (
                  <Text className="text-sm text-amber-700">
                    No medicine is in stock for this service. Use the outside clinic receipt.
                  </Text>
                ) : (
                  <>
                    {inventoryCategories.length >= 2 ? (
                      <>
                        <Text className="text-xs font-bold text-slate-400 uppercase mb-2">Category</Text>
                        <View className="bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden mb-4">
                          <Picker
                            selectedValue={selectedInventoryCategory}
                            onValueChange={(value) => setSelectedInventoryCategory(String(value))}
                          >
                            <Picker.Item label="Select a category" value="" />
                            {inventoryCategories.map((category) => (
                              <Picker.Item key={category} label={category} value={category} />
                            ))}
                          </Picker>
                        </View>
                      </>
                    ) : (
                      <Text className="text-sm text-slate-600 dark:text-slate-300 mb-4">
                        Showing inventory for{' '}
                        <Text className="font-semibold text-slate-800 dark:text-white">
                          {inventoryCategories[0]}
                        </Text>
                      </Text>
                    )}

                    {!activeInventoryCategory ? (
                      <Text className="text-sm text-slate-500">Choose a category to view items.</Text>
                    ) : visibleInventoryItems.length === 0 ? (
                      <Text className="text-sm text-slate-500">
                        {`No medicine is in stock in ${activeInventoryCategory}. Use the outside clinic receipt.`}
                      </Text>
                    ) : (
                      visibleInventoryItems.map((item) => {
                        const selected = selectedInventoryItems.find((entry) => entry.id === item.id);
                        const stockLabel = item.is_box
                          ? `${formatDisplayNumber(item.available_total ?? item.total_items)} items`
                          : item.is_vial
                            ? `${formatDisplayNumber(item.available_total ?? item.quantity)} vials`
                            : `${formatDisplayNumber(item.available_total ?? item.quantity)} ${item.unit?.name || 'units'}`;

                        return (
                          <View
                            key={item.id}
                            className={`rounded-xl px-3 py-3 mb-2 border ${
                              selected
                                ? 'border-teal bg-teal-50 dark:bg-navy/20'
                                : 'border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <TouchableOpacity onPress={() => toggleInventoryItem(item)} className="flex-row items-start">
                              <View
                                className={`w-5 h-5 rounded border mr-3 mt-0.5 items-center justify-center ${
                                  selected ? 'bg-teal border-teal' : 'border-slate-300'
                                }`}
                              >
                                {selected ? <MaterialIcons name="check" size={14} color="#ffffff" /> : null}
                              </View>
                              <View className="flex-1">
                                <Text className="font-semibold text-slate-800 dark:text-white">
                                  {item.medicine?.name || 'Unknown medicine'}
                                </Text>
                                <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  Available: {stockLabel} · oldest batch first
                                </Text>
                                {item.is_vial && Number(petWeight) > 0 ? (
                                  <Text className="text-xs text-teal-700 dark:text-teal-200 mt-1">
                                    Dosage: {calculateVialDosage(petWeight).toFixed(2)} ml
                                  </Text>
                                ) : null}
                              </View>
                            </TouchableOpacity>

                            {selected && !item.is_vial ? (
                              <View className="mt-3 ml-8">
                                <Text className="text-xs text-slate-500 mb-1">
                                  Quantity ({item.is_box ? 'items' : item.unit?.name || 'units'})
                                </Text>
                                <TextInput
                                  value={String(selected.quantity)}
                                  onChangeText={(value) => updateInventoryQuantity(item.id, value)}
                                  keyboardType="number-pad"
                                  className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white"
                                />
                              </View>
                            ) : null}
                          </View>
                        );
                      })
                    )}
                  </>
                )}

                {selectedInventoryItems.length === 0 && outsideReadyItems.length === 0 ? (
                  <Text className="text-xs text-red-600 mt-3">
                    Select a clinic medicine or add an outside clinic receipt.
                  </Text>
                ) : null}

                <TouchableOpacity
                  onPress={() => setReceiptOpen(true)}
                  className="mt-4 rounded-xl bg-violet-600 py-3"
                >
                  <Text className="text-center text-sm font-semibold text-white">Outside clinic receipt</Text>
                </TouchableOpacity>
                {outsideReadyItems.length > 0 ? (
                  <Text className="text-xs text-violet-700 mt-2">
                    {outsideReadyItems.length} outside clinic item{outsideReadyItems.length === 1 ? '' : 's'} added
                  </Text>
                ) : null}
              </SectionCard>
            </>
          ) : null}

          {petReady && currentStep === 3 ? (
            <>
              <SectionCard title="Pet & Owner">
                <Text className="text-base font-bold text-slate-800 dark:text-white">
                  {petDetails?.pet_name}
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Owner: {selectedClient?.name}
                </Text>
                {petDetails?.identification_number ? (
                  <Text className="text-xs text-teal-700 dark:text-teal-200 mt-1">
                    ID: {petDetails.identification_number}
                  </Text>
                ) : null}
              </SectionCard>

              <SectionCard title="Schedule">
                <Text className="text-sm text-slate-700 dark:text-slate-200">
                  {bookingDate} • {formatTimeRange(bookingTime, selectedDurationMinutes)}
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Duration: {formatDuration(selectedDurationMinutes)}
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Services: {selectedServiceNames.join(', ') || 'Bite incident'}
                </Text>
                {isBitten ? (
                  <Text className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                    Bite incident recorded{biteDetails.trim() ? `: ${biteDetails.trim()}` : ''}
                  </Text>
                ) : null}
                {notes.trim() ? (
                  <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2">Notes: {notes.trim()}</Text>
                ) : null}
              </SectionCard>

              <SectionCard title="Inventory">
                <Text className="text-sm text-slate-700 dark:text-slate-200 mb-2">
                  Administered by: {administeredBy.trim()}
                </Text>
                {petWeight ? (
                  <Text className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    Pet weight: {petWeight} kg
                  </Text>
                ) : null}
                {selectedInventoryItems.map((item) => (
                  <View
                    key={item.id}
                    className="flex-row items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700"
                  >
                    <Text className="flex-1 text-sm text-slate-800 dark:text-white pr-3">
                      {item.medicine?.name || 'Unknown'}
                    </Text>
                    <Text className="text-sm font-semibold text-teal-700 dark:text-teal-200">
                      {item.is_vial
                        ? `${calculateVialDosage(petWeight).toFixed(2)} ml`
                        : `${item.quantity} ${item.is_box ? 'items' : item.unit?.name || 'units'}`}
                    </Text>
                  </View>
                ))}
                {outsideReadyItems.length > 0 ? (
                  <View className="mt-3">
                    <Text className="text-xs font-bold uppercase text-violet-700 mb-1">Outside clinic</Text>
                    {outsideReadyItems.map((item) => (
                      <Text key={`${item.name}-${item.quantity}`} className="text-sm text-slate-700 dark:text-slate-200 py-1">
                        {item.name} · {item.quantity} · {item.status}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </SectionCard>

              <View className="bg-teal-50 dark:bg-navy/20 rounded-2xl p-4 mb-4 border border-teal-100 dark:border-teal-800">
                <Text className="text-sm font-semibold text-navy dark:text-teal-100">
                  Ready to mark as ongoing
                </Text>
                <Text className="text-xs text-teal-700 dark:text-teal-200 mt-1">
                  {resumeMode
                    ? isAppointmentContinue
                      ? 'This will record selected inventory and mark the appointment as ongoing.'
                      : 'This will record selected inventory and mark the walk-in as ongoing.'
                    : 'This will create the walk-in, record selected inventory, and set status to ongoing.'}
                </Text>
              </View>
            </>
          ) : null}

          <View className="h-6" />
        </ScrollView>

        {petReady ? (
          <View className="px-4 py-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            {currentStep === 1 ? (
              <TouchableOpacity
                onPress={goToInventoryStep}
                disabled={!scheduleReady}
                className={`rounded-xl py-3.5 ${scheduleReady ? 'bg-teal' : 'bg-teal-300'}`}
              >
                <Text className="text-white text-center font-semibold">Next: Select Inventory</Text>
              </TouchableOpacity>
            ) : null}

            {currentStep === 2 ? (
              <View className="flex-row gap-3">
                {!resumeMode ? (
                  <TouchableOpacity
                    onPress={() => setCurrentStep(1)}
                    className="flex-1 rounded-xl py-3.5 bg-slate-200 dark:bg-slate-700"
                  >
                    <Text className="text-slate-700 dark:text-slate-200 text-center font-semibold">Back</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={goToReviewStep}
                  disabled={!inventoryReady}
                  className={`${resumeMode ? 'flex-1' : 'flex-[1.4]'} rounded-xl py-3.5 ${inventoryReady ? 'bg-teal' : 'bg-teal-300'}`}
                >
                  <Text className="text-white text-center font-semibold">Next: Review</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {currentStep === 3 ? (
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => setCurrentStep(2)}
                  disabled={submitting}
                  className="flex-1 rounded-xl py-3.5 bg-slate-200 dark:bg-slate-700"
                >
                  <Text className="text-slate-700 dark:text-slate-200 text-center font-semibold">Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={submitting || !inventoryReady || !scheduleReady}
                  className={`flex-[1.6] rounded-xl py-3.5 ${
                    submitting || !inventoryReady || !scheduleReady ? 'bg-teal-300' : 'bg-teal'
                  }`}
                >
                  {submitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                  <Text className="text-white text-center font-semibold">
                    {isAppointmentContinue ? 'Mark as Ongoing' : resumeMode ? 'Complete Walk-in' : 'Mark as Ongoing'}
                  </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
    <OutsideClinicReceiptModal
      visible={receiptOpen}
      lines={outsideLines.length > 0 ? outsideLines : [createOutsideClinicLine()]}
      onChange={setOutsideLines}
      categories={receiptCategories}
      defaultCategories={receiptDefaultCategories}
      details={{
        animalName: petDetails?.pet_name || '',
        patientId: petDetails?.identification_number
          || (petDetails?.registration_status === 'exempt' ? 'No ID needed' : '—'),
        ownerName: selectedClient?.name || '',
        serviceType: selectedServiceNames.join(', '),
        treatment: selectedServiceNames.some((name) => name.toLowerCase().includes('treatment'))
          ? selectedSymptoms.map((symptom) => symptom.name).filter(Boolean).join(', ')
          : '',
      }}
      onClose={() => setReceiptOpen(false)}
    />
    </>
  );
}
