import { useState, useEffect, useRef } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator, Platform, RefreshControl, Text, Image } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { LoadingState } from '@/components/LoadingState';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import { useAuth } from '@/contexts/auth-context';
import { API_BASE_URL } from '@/config/api';
import { showToast } from '@/components/Toast';
import * as ImagePicker from 'expo-image-picker';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import { AnimalQrModal } from '@/components/AnimalQrModal';
import AnimalMedicalHistoryTimeline from '@/components/AnimalMedicalHistoryTimeline';
import { getPetIdentificationDisplay } from '@/utils/petIdentification';
import { AppScreenHeader } from '@/components/AppScreenHeader';
import { FilterChip, HeaderIconButton, HeaderSearch, HeaderTitle } from '@/components/AppHeaderBits';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { vaccineCoverageLabel } from '@/utils/vaccinationSchedule';

const VACCINE_DOSE_FIELDS = {
  rabies_last_vaccination: 'rabies_dose_type',
  dhppl_last_vaccination: 'dhppl_dose_type',
  other_vaccine_last_vaccination: 'other_vaccine_dose_type',
};

function VaccineDoseChooser({ dose, onChange }) {
  return (
    <View className="mt-2">
      <View className="flex-row gap-2">
        {[
          { key: 'first', label: 'First · 1 year' },
          { key: 'booster', label: 'Booster · 3 years' },
        ].map((option) => {
          const selected = (dose || 'first') === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              onPress={() => onChange(option.key)}
              className={`flex-1 rounded-xl px-3 py-2 ${selected ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
            >
              <Text className={`text-center text-xs font-semibold ${selected ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <ThemedText className="mt-1 text-xs text-slate-400">
        The first vaccination lasts 1 year. The next booster lasts 3 years.
      </ThemedText>
    </View>
  );
}
const DateTimePicker = Platform.OS !== 'web' ? require('@react-native-community/datetimepicker').default : null;
const imageMediaTypes = ['images'];

// Diri ang fade-in animation sa matag resulta.
const getResultEntering = (index) => {
  const delay = Math.min(index * 55, 350);
  return FadeInDown.delay(delay).duration(250);
};

const NO_BOUNCE_SCROLL = {
  bounces: false,
  overScrollMode: 'never',
};

// Diri limpyohan ang petsa ngadto sa YYYY-MM-DD.
const normalizeDateField = (value) => {
  if (!value) return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(value);
};

// Diri kuhaon ang ngalan sa species sa hayop.
const getSpeciesLabel = (animal) => {
  if (!animal) return '-';
  if (typeof animal.species === 'string') return animal.species || '-';
  return animal.species?.species_name || animal.species?.name || animal.species_name || '-';
};

// Diri kuhaon ang ngalan sa breed sa hayop.
const getBreedLabel = (animal) => {
  if (!animal) return '-';
  if (typeof animal.breed === 'string') return animal.breed || '-';
  return animal.breed?.breed_name || animal.breed?.name || animal.breed_name || '-';
};

// Diri ang screen sa lista sa mga hayop.
export default function AnimalsScreen() {
  const { token, user } = useAuth();
  const layout = useResponsiveLayout();
  const [activeAnimals, setActiveAnimals] = useState([]);
  const [archivedAnimals, setArchivedAnimals] = useState([]);
  const [activeLoading, setActiveLoading] = useState(true);
  const [archivedLoading, setArchivedLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [species, setSpecies] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const animals = showArchived ? archivedAnimals : activeAnimals;
  const loading = showArchived ? archivedLoading : activeLoading;
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDewormingDatePicker, setShowDewormingDatePicker] = useState(false);
  const [showRabiesDatePicker, setShowRabiesDatePicker] = useState(false);
  const [showDhpplDatePicker, setShowDhpplDatePicker] = useState(false);
  const [showOtherVaccineDatePicker, setShowOtherVaccineDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [uploadingPetPhoto, setUploadingPetPhoto] = useState(false);
  const [uploadingMarkingsPhoto, setUploadingMarkingsPhoto] = useState(false);
  const isWeb = Platform.OS === 'web';

  // Diri mangayo og petsa sa web gamit ang prompt.
  const applyVaccineDate = (field, value) => {
    setNewAnimal((prev) => {
      const next = { ...prev, [field]: value };
      const doseField = VACCINE_DOSE_FIELDS[field];
      if (!doseField) return next;
      const saved = savedVaccineDates.current[field];
      if (saved && value && value !== saved) next[doseField] = 'booster';
      else if (!next[doseField]) next[doseField] = 'first';
      return next;
    });
  };

  const promptDate = (field) => {
    if (isWeb && typeof prompt === 'function') {
      const value = prompt('Enter date in YYYY-MM-DD format', newAnimal[field] || '');
      if (value) {
        applyVaccineDate(field, value);
      }
    }
  };
  
  // Form state - matching admin fields
  const [newAnimal, setNewAnimal] = useState({
    pet_name: '',
    species_id: '',
    breed_id: '',
    sex: 'male',
    color: '',
    markings: '',
    markings_photo_url: '',
    pet_photo_url: '',
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
    rabies_dose_type: 'first',
    dhppl_vaccine: '',
    dhppl_last_vaccination: '',
    dhppl_dose_type: 'first',
    other_vaccine_name: '',
    other_vaccine_last_vaccination: '',
    other_vaccine_dose_type: 'first',
  });
  const savedVaccineDates = useRef({
    rabies_last_vaccination: '',
    dhppl_last_vaccination: '',
    other_vaccine_last_vaccination: '',
  });
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const [visitHistory, setVisitHistory] = useState([]);
  const [visitHistoryCount, setVisitHistoryCount] = useState(0);
  const [lastVisit, setLastVisit] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch animals on mount and when archive toggle changes (if not already cached)
  useEffect(() => {
    if (showArchived && archivedAnimals.length === 0 && archivedLoading) {
      fetchAnimals(true);
    } else if (!showArchived && activeAnimals.length === 0 && activeLoading) {
      fetchAnimals(false);
    }
    fetchSpecies();
  }, [showArchived]);

  // Pull to refresh - force refetch current tab
  // Diri i-refresh ang lista sa hayop.
  const onRefresh = async () => {
    setRefreshing(true);
    if (showArchived) {
      setArchivedLoading(true);
      await fetchAnimals(true);
    } else {
      setActiveLoading(true);
      await fetchAnimals(false);
    }
    setRefreshing(false);
  };

  // Fetch breeds when species changes
  useEffect(() => {
    if (newAnimal.species_id) {
      fetchBreeds(newAnimal.species_id);
    } else {
      setBreeds([]);
    }
  }, [newAnimal.species_id]);

  // Diri kuhaon ang mga hayop, active o archived.
  const fetchAnimals = async (archived) => {
    try {
      // Check if token exists before making request
      if (!token) {
        console.log('No authentication token available');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/api/mobile/animals?archived=${archived}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        if (archived) {
          setArchivedAnimals(response.data.animals || response.data.pets || []);
        } else {
          setActiveAnimals(response.data.animals || response.data.pets || []);
        }
      }
    } catch (error) {
      console.error('Error fetching animals:', error);
    } finally {
      if (archived) {
        setArchivedLoading(false);
      } else {
        setActiveLoading(false);
      }
    }
  };

  // Diri i-archive ang hayop human sa confirm.
  const archiveAnimal = async (id, name) => {
    Alert.alert(
      'Archive Animal',
      `Archive ${name}? (You can restore it later)`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Archive', 
          style: 'default', 
          onPress: async () => {
            try {
              await axios.post(`${API_BASE_URL}/api/mobile/animals/${id}/archive`, {}, {
                headers: { Authorization: `Bearer ${token}` }
              });
              // Move animal from active to archived locally
              const movedAnimal = activeAnimals.find(a => a.id === id);
              if (movedAnimal) {
                setActiveAnimals(activeAnimals.filter(a => a.id !== id));
                setArchivedAnimals([
                  { ...movedAnimal, archived_at: movedAnimal.archived_at || new Date().toISOString() },
                  ...archivedAnimals,
                ]);
              }
              showToast({ type: 'success', message: 'Animal archived successfully' });
            } catch (error) {
              console.error('Archive error:', error.response?.data || error.message);
              showToast({ type: 'error', message: error.response?.data?.error || error.response?.data?.message || 'Failed to archive animal' });
            }
          }
        }
      ]
    );
  };

  // Diri i-restore ang na-archive nga hayop.
  const unarchiveAnimal = async (id, name) => {
    Alert.alert(
      'Restore Animal',
      `Restore ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Restore', 
          style: 'default', 
          onPress: async () => {
            try {
              await axios.post(`${API_BASE_URL}/api/mobile/animals/${id}/unarchive`, {}, {
                headers: { Authorization: `Bearer ${token}` }
              });
              // Move animal from archived to active locally
              const movedAnimal = archivedAnimals.find(a => a.id === id);
              if (movedAnimal) {
                setArchivedAnimals(archivedAnimals.filter(a => a.id !== id));
                const restoredStatus =
                  movedAnimal.registration_status === 'archived' ? 'pending' : movedAnimal.registration_status;
                setActiveAnimals([
                  { ...movedAnimal, archived_at: null, registration_status: restoredStatus },
                  ...activeAnimals,
                ]);
              }
              showToast({ type: 'success', message: 'Animal restored successfully' });
            } catch (error) {
              console.error('Unarchive error:', error.response?.data || error.message);
              showToast({ type: 'error', message: error.response?.data?.error || error.response?.data?.message || 'Failed to restore animal' });
            }
          }
        }
      ]
    );
  };

  // Diri i-save ang petsa nga napili sa date picker.
  const onDateChange = (field) => (event, date) => {
    // Close all date pickers
    setShowDatePicker(false);
    setShowDewormingDatePicker(false);
    setShowRabiesDatePicker(false);
    setShowDhpplDatePicker(false);
    setShowOtherVaccineDatePicker(false);
    
    if (date) {
      setSelectedDate(date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      applyVaccineDate(field, `${year}-${month}-${day}`);
    }
  };

  // Diri kuhaon ang lista sa species.
  const fetchSpecies = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/species`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setSpecies(response.data.species);
      }
    } catch (error) {
      console.error('Error fetching species:', error);
    }
  };

  // Diri kuhaon ang mga breed sa napili nga species.
  const fetchBreeds = async (speciesId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/species/${speciesId}/breeds`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setBreeds(response.data.breeds);
      }
    } catch (error) {
      console.error('Error fetching breeds:', error);
    }
  };

  const emptyAnimalForm = {
    pet_name: '',
    species_id: '',
    breed_id: '',
    sex: 'male',
    color: '',
    markings: '',
    markings_photo_url: '',
    pet_photo_url: '',
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
  };

  // Diri i-reset ang animal form.
  const resetAnimalForm = () => setNewAnimal(emptyAnimalForm);

  // Diri pangitaon ang species ID sa hayop.
  const resolveSpeciesId = (animal) => {
    if (!animal) return '';
    if (animal.species_id) return String(animal.species_id);
    if (animal.species?.id) return String(animal.species.id);
    const label = getSpeciesLabel(animal);
    const match = species.find((item) => item.name === label || item.species_name === label);
    return match ? String(match.id) : '';
  };

  // Diri pangitaon ang breed ID sa hayop.
  const resolveBreedId = (animal, breedsList = breeds) => {
    if (!animal) return '';
    if (animal.breed_id) return String(animal.breed_id);
    if (animal.breed?.id) return String(animal.breed.id);
    const label = getBreedLabel(animal);
    const match = breedsList.find((item) => item.name === label || item.breed_name === label);
    return match ? String(match.id) : '';
  };

  // Diri i-convert ang hayop ngadto sa form data.
  const animalToFormData = (animal, breedsList = breeds) => {
    savedVaccineDates.current = {
      rabies_last_vaccination: normalizeDateField(animal?.rabies_last_vaccination),
      dhppl_last_vaccination: normalizeDateField(animal?.dhppl_last_vaccination),
      other_vaccine_last_vaccination: normalizeDateField(animal?.other_vaccine_last_vaccination),
    };
    return {
    pet_name: animal?.pet_name || '',
    species_id: resolveSpeciesId(animal),
    breed_id: resolveBreedId(animal, breedsList),
    sex: animal?.sex || 'male',
    color: animal?.color || '',
    markings: animal?.markings || '',
    markings_photo_url: animal?.markings_photo_url || '',
    pet_photo_url: animal?.pet_photo_url || '',
    weight: animal?.weight != null && animal?.weight !== '' ? String(animal.weight) : '',
    birthdate: normalizeDateField(animal?.birthdate),
    reproductive_status: animal?.reproductive_status || '',
    weeks_months: animal?.weeks_months || '',
    diet: animal?.diet || '',
    diet_other: animal?.diet_other || '',
    dewormed: animal?.dewormed || '',
    last_deworming_date: normalizeDateField(animal?.last_deworming_date),
    dewormer_name: animal?.dewormer_name || '',
    rabies_vaccine: animal?.rabies_vaccine || '',
    rabies_last_vaccination: normalizeDateField(animal?.rabies_last_vaccination),
    rabies_dose_type: animal?.rabies_dose_type === 'booster' ? 'booster' : 'first',
    dhppl_vaccine: animal?.dhppl_vaccine || '',
    dhppl_last_vaccination: normalizeDateField(animal?.dhppl_last_vaccination),
    dhppl_dose_type: animal?.dhppl_dose_type === 'booster' ? 'booster' : 'first',
    other_vaccine_name: animal?.other_vaccine_name || '',
    other_vaccine_last_vaccination: normalizeDateField(animal?.other_vaccine_last_vaccination),
    other_vaccine_dose_type: animal?.other_vaccine_dose_type === 'booster' ? 'booster' : 'first',
  };
  };

  // Diri pun-on ang edit form sa detalye sa hayop.
  const populateEditForm = async (animal) => {
    if (!animal) return;

    const speciesId = resolveSpeciesId(animal);
    let breedsList = breeds;

    if (speciesId) {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/mobile/species/${speciesId}/breeds`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          breedsList = response.data.breeds || [];
          setBreeds(breedsList);
        }
      } catch (error) {
        console.error('Error fetching breeds for edit:', error);
      }
    }

    setNewAnimal(animalToFormData(animal, breedsList));
  };

  useEffect(() => {
    if (modalVisible && isEditMode && selectedAnimal) {
      populateEditForm(selectedAnimal);
    }
  }, [modalVisible, isEditMode, selectedAnimal?.id, species.length]);

  // Diri ablihan ang form para mag-add og hayop.
  const openAddAnimalForm = () => {
    savedVaccineDates.current = {
      rabies_last_vaccination: '',
      dhppl_last_vaccination: '',
      other_vaccine_last_vaccination: '',
    };
    resetAnimalForm();
    setIsEditMode(false);
    setSelectedAnimal(null);
    setModalVisible(true);
  };

  // Diri isira ang animal form.
  const closeAnimalForm = () => {
    const reopenDetail = isEditMode && selectedAnimal;
    setModalVisible(false);
    setIsEditMode(false);
    resetAnimalForm();
    if (reopenDetail) {
      setShowDetailModal(true);
    }
  };

  // Diri buhaton ang payload nga i-save sa hayop.
  const buildSavePayload = (form) => {
    const payload = {
      pet_name: form.pet_name?.trim(),
      species_id: form.species_id,
      breed_id: form.breed_id,
      sex: form.sex || 'male',
    };

    const optionalFields = [
      'color',
      'markings',
      'markings_photo_url',
      'pet_photo_url',
      'weight',
      'birthdate',
      'reproductive_status',
      'weeks_months',
      'diet',
      'diet_other',
      'dewormed',
      'last_deworming_date',
      'dewormer_name',
      'rabies_vaccine',
      'rabies_last_vaccination',
      'rabies_dose_type',
      'dhppl_vaccine',
      'dhppl_last_vaccination',
      'dhppl_dose_type',
      'other_vaccine_name',
      'other_vaccine_last_vaccination',
      'other_vaccine_dose_type',
    ];

    optionalFields.forEach((field) => {
      const value = form[field];
      payload[field] = value === '' || value === undefined ? null : value;
    });

    if (payload.weight != null) {
      payload.weight = String(payload.weight).trim() === '' ? null : Number(payload.weight);
    }

    if (payload.dewormed !== 'yes') {
      payload.last_deworming_date = null;
      payload.dewormer_name = null;
    }
    if (payload.rabies_vaccine !== 'yes') {
      payload.rabies_last_vaccination = null;
      payload.rabies_dose_type = null;
    } else if (payload.rabies_last_vaccination && !payload.rabies_dose_type) {
      payload.rabies_dose_type = 'first';
    }
    if (payload.dhppl_vaccine !== 'yes') {
      payload.dhppl_last_vaccination = null;
      payload.dhppl_dose_type = null;
    } else if (payload.dhppl_last_vaccination && !payload.dhppl_dose_type) {
      payload.dhppl_dose_type = 'first';
    }
    if (payload.reproductive_status !== 'pregnant' && payload.reproductive_status !== 'nursing') {
      payload.weeks_months = null;
    }
    if (payload.diet !== 'others') {
      payload.diet_other = null;
    }
    if (!payload.other_vaccine_name) {
      payload.other_vaccine_last_vaccination = null;
      payload.other_vaccine_dose_type = null;
    } else if (payload.other_vaccine_last_vaccination && !payload.other_vaccine_dose_type) {
      payload.other_vaccine_dose_type = 'first';
    }

    return payload;
  };

  // Diri kuhaon ang error message gikan sa API.
  const getApiErrorMessage = (error, fallback = 'Failed to save animal') => {
    const data = error?.response?.data;
    if (!data) return error?.message || fallback;
    if (data.messages) {
      const first = Object.values(data.messages)[0];
      return Array.isArray(first) ? first[0] : String(first);
    }
    return data.error || fallback;
  };

  // Diri i-save ang bag-o o gi-edit nga hayop.
  const addAnimal = async () => {
    if (!newAnimal.pet_name?.trim() || !newAnimal.species_id || !newAnimal.breed_id) {
      Alert.alert('Error', 'Please fill in animal name, species, and breed');
      return;
    }

    if (!newAnimal.markings_photo_url?.trim()) {
      Alert.alert('Required', 'Please upload a markings photo before saving.');
      return;
    }

    if (!newAnimal.markings?.trim()) {
      Alert.alert('Required', 'Please describe the pet markings before saving.');
      return;
    }

    if (isEditMode && !selectedAnimal?.id) {
      Alert.alert('Error', 'Unable to update this animal. Please close and try again.');
      return;
    }

    const payload = buildSavePayload(newAnimal);

    setAdding(true);
    try {
      let response;
      const wasEditMode = isEditMode;

      if (wasEditMode && selectedAnimal?.id) {
        response = await axios.put(`${API_BASE_URL}/api/mobile/animals/${selectedAnimal.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        response = await axios.post(`${API_BASE_URL}/api/mobile/animals`, payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      
      if (response.data.success) {
        const savedAnimal = response.data.pet || response.data.animal || response.data.updated_animal || response.data.data;

        if (wasEditMode) {
          if (savedAnimal?.id) {
            updateLocalAnimal(savedAnimal);
            setSelectedAnimal(savedAnimal);
            fetchAnimalHistory(savedAnimal.id);
          }
          showToast({ type: 'success', message: 'Animal updated successfully!' });
          setModalVisible(false);
          setIsEditMode(false);
          resetAnimalForm();
          setShowDetailModal(true);
        } else {
          if (savedAnimal?.id) {
            setActiveAnimals([savedAnimal, ...activeAnimals]);
            setSelectedAnimal(savedAnimal);
            setShowDetailModal(true);
          }
          showToast({ type: 'success', message: 'Animal added successfully!' });
          setModalVisible(false);
          setIsEditMode(false);
          resetAnimalForm();
        }
      } else {
        showToast({ type: 'error', message: response.data.error || 'Failed to save animal' });
      }
    } catch (error) {
      console.error('Save animal error:', error.response?.data || error.message);
      showToast({ type: 'error', message: getApiErrorMessage(error) });
    } finally {
      setAdding(false);
    }
  };

  // Diri i-update ang hayop sa local nga lista.
  const updateLocalAnimal = (updatedAnimal) => {
    setActiveAnimals((prev) => prev.map((animal) => animal.id === updatedAnimal.id ? updatedAnimal : animal));
    setArchivedAnimals((prev) => prev.map((animal) => animal.id === updatedAnimal.id ? updatedAnimal : animal));
  };

  // Diri kuhaon ang medical history sa hayop.
  const fetchAnimalHistory = async (animalId) => {
    if (!token || !animalId) return;
    setHistoryLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/animals/${animalId}/medical-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.success) {
        setVisitHistory(response.data.history || []);
        setVisitHistoryCount(response.data.history_count || 0);
        setLastVisit(response.data.last_service || null);
      } else {
        setVisitHistory([]);
        setVisitHistoryCount(0);
        setLastVisit(null);
      }
    } catch (error) {
      if (error?.response?.status !== 404) {
        console.error('Failed to fetch animal history:', error);
      }
      setVisitHistory([]);
      setVisitHistoryCount(0);
      setLastVisit(null);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Diri ablihan ang detalye sa hayop.
  const openAnimalDetail = (animal) => {
    setSelectedAnimal(animal);
    setExpandedPhoto(null);
    setDetailTab('overview');
    setVisitHistory([]);
    setVisitHistoryCount(0);
    setLastVisit(null);
    setShowDetailModal(true);
    fetchAnimalHistory(animal.id);
  };

  // Diri isira ang detalye sa hayop.
  const closeAnimalDetail = () => {
    setShowDetailModal(false);
    setExpandedPhoto(null);
    setDetailTab('overview');
    setVisitHistory([]);
    setVisitHistoryCount(0);
    setLastVisit(null);
    setHistoryLoading(false);
  };

  // Diri susihon kung na-archive ba ang hayop.
  const isAnimalArchived = (animal) =>
    !!animal?.archived_at || archivedAnimals.some((item) => item.id === animal?.id);

  // Diri i-restore ang hayop gikan sa detail modal.
  const handleRestoreFromDetail = () => {
    if (!selectedAnimal) return;
    setShowDetailModal(false);
    unarchiveAnimal(selectedAnimal.id, selectedAnimal.pet_name);
  };

  // Diri ablihan ang edit form sa napili nga hayop.
  const handleEditAnimal = () => {
    if (!selectedAnimal) return;

    setNewAnimal(animalToFormData(selectedAnimal));
    setIsEditMode(true);
    setShowDetailModal(false);
    setShowQrModal(false);
    setExpandedPhoto(null);
    setModalVisible(true);
    populateEditForm(selectedAnimal);
  };

  // Diri ipakita ang dako nga litrato.
  const openPhotoPreview = (uri, label) => {
    if (uri) setExpandedPhoto({ uri, label });
  };

  // Diri isira ang photo preview.
  const closePhotoPreview = () => setExpandedPhoto(null);

  const filteredAnimals = animals.filter((animal) => {
    const query = searchQuery.toLowerCase();
    return (
      animal.pet_name?.toLowerCase().includes(query) ||
      animal.identification_number?.toLowerCase().includes(query) ||
      getSpeciesLabel(animal).toLowerCase().includes(query) ||
      getBreedLabel(animal).toLowerCase().includes(query)
    );
  });
  const isSearching = searchQuery.trim().length > 0;

  // Diri susihon kung "yes" ang tubag.
  const isYesAnswer = (value) => String(value || '').trim().toLowerCase() === 'yes';

  // Diri i-set ang clinical nga tubag sa form.
  const setClinicalFlag = (field, value) => {
    setNewAnimal((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'dewormed' && value !== 'yes') {
        next.last_deworming_date = '';
        next.dewormer_name = '';
      }
      if (field === 'rabies_vaccine' && value !== 'yes') {
        next.rabies_last_vaccination = '';
        next.rabies_dose_type = 'first';
      }
      if (field === 'dhppl_vaccine' && value !== 'yes') {
        next.dhppl_last_vaccination = '';
        next.dhppl_dose_type = 'first';
      }
      if (field === 'reproductive_status' && value !== 'pregnant' && value !== 'nursing') {
        next.weeks_months = '';
      }
      if (field === 'diet' && value !== 'others') {
        next.diet_other = '';
      }
      return next;
    });
  };

  // Diri i-format ang petsa para ipakita.
  const formatDate = (value) => {
    if (!value) return '';
    const str = String(value).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      }
    }
    const date = new Date(str);
    if (Number.isNaN(date.getTime())) return str;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Diri kuhaon ang text sa petsa para sa button.
  const getDateDisplayValue = (value) => {
    if (!value) return 'Select date';
    const formatted = formatDate(value);
    return formatted === '-' ? 'Select date' : formatted;
  };

  // Diri himuon nga nindot basahon ang label.
  const formatDetailLabel = (value) => {
    if (!value || value === '-') return '-';
    return String(value)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const dietLabels = {
    commercial_food: 'Commercial Food',
    table_food: 'Table Food',
    both: 'Both',
    others: 'Others',
  };

  const reproductiveLabels = {
    pregnant: 'Pregnant',
    nursing: 'Nursing',
    not_pregnant: 'Not Pregnant',
  };

  // Diri ang usa ka row sa detalye.
  const DetailRow = ({ label, value, last = false }) => (
    <View className={`mb-3 pb-3 ${last ? 'mb-0 pb-0' : 'border-b border-slate-100 dark:border-slate-700'}`}>
      <Text className="text-[11px] font-semibold text-slate-400 uppercase mb-1">{label}</Text>
      <Text className="text-sm text-slate-800 dark:text-slate-200 leading-5">{value ?? '-'}</Text>
    </View>
  );

  // Diri ang section card sa info sa hayop.
  const InfoSection = ({ title, icon, children, className = '' }) => (
    <View className={`rounded-3xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 mb-4 ${className}`}>
      <View className="flex-row items-center mb-3">
        <View className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 items-center justify-center mr-2.5">
          <MaterialIcons name={icon} size={18} color="#1F7A8C" />
        </View>
        <Text className="text-sm font-bold text-slate-800 dark:text-white">{title}</Text>
      </View>
      {children}
    </View>
  );

  // Diri ang gamay nga card sa quick fact.
  const QuickFact = ({ icon, label, value }) => (
    <View className="min-w-[46%] flex-1 rounded-xl border border-slate-200 bg-canvas px-3 py-2.5">
      <View className="flex-row items-center">
        <MaterialIcons name={icon} size={14} color="#6B7280" />
        <Text className="ml-1.5 text-[10px] font-semibold uppercase text-slate-400">{label}</Text>
      </View>
      <Text className="mt-1 text-sm font-semibold text-navy">{value}</Text>
    </View>
  );

  // Diri pilion ang kolor sa status sa hayop.
  const getStatusStyle = (status) => {
    switch (status) {
      case 'registered':
        return {
          badgeBg: 'bg-green-100 dark:bg-green-900/30',
          badgeText: 'text-green-700 dark:text-green-400',
          avatarBg: 'bg-green-50 dark:bg-green-900/20',
          icon: '#16a34a',
          label: 'Registered',
        };
      case 'declined':
        return {
          badgeBg: 'bg-red-100 dark:bg-red-900/30',
          badgeText: 'text-red-700 dark:text-red-400',
          avatarBg: 'bg-red-50 dark:bg-red-900/20',
          icon: '#dc2626',
          label: 'Declined',
        };
      case 'exempt':
        return {
          badgeBg: 'bg-blue-100 dark:bg-blue-900/30',
          badgeText: 'text-blue-700 dark:text-blue-400',
          avatarBg: 'bg-blue-50 dark:bg-blue-900/20',
          icon: '#1F7A8C',
          label: 'Exempt',
        };
      case 'pending':
      case 'unregistered':
        return {
          badgeBg: 'bg-amber-100 dark:bg-amber-900/30',
          badgeText: 'text-amber-700 dark:text-amber-400',
          avatarBg: 'bg-amber-50 dark:bg-amber-900/20',
          icon: '#ca8a04',
          label: status === 'unregistered' ? 'Unregistered' : 'Pending',
        };
      default:
        return {
          badgeBg: 'bg-slate-100 dark:bg-slate-700',
          badgeText: 'text-slate-600 dark:text-slate-300',
          avatarBg: 'bg-slate-100 dark:bg-slate-700',
          icon: '#64748b',
          label: status || 'Unknown',
        };
    }
  };

  // Diri pilion ug i-upload ang litrato sa hayop.
  const handlePickPetPhoto = async () => {
    try {
      if (!isWeb) {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          showToast({ type: 'error', message: 'Photo permission is required.' });
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: imageMediaTypes,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingPetPhoto(true);
      const uploadedUrl = await uploadImageToCloudinary(result.assets[0].uri);
      setNewAnimal((prev) => ({ ...prev, pet_photo_url: uploadedUrl }));
      showToast({ type: 'success', message: 'Pet photo uploaded.' });
    } catch (error) {
      console.error('Pet photo upload error:', error);
      showToast({ type: 'error', message: error?.message || 'Failed to upload pet photo.' });
    } finally {
      setUploadingPetPhoto(false);
    }
  };

  // Diri pilion ug i-upload ang litrato sa marka sa hayop.
  const handlePickMarkingsPhoto = async () => {
    try {
      if (!isWeb) {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          showToast({ type: 'error', message: 'Photo permission is required.' });
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: imageMediaTypes,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingMarkingsPhoto(true);
      const uploadedUrl = await uploadImageToCloudinary(result.assets[0].uri);
      setNewAnimal((prev) => ({ ...prev, markings_photo_url: uploadedUrl }));
      showToast({ type: 'success', message: 'Markings photo uploaded.' });
    } catch (error) {
      console.error('Markings photo upload error:', error);
      showToast({ type: 'error', message: error?.message || 'Failed to upload markings photo.' });
    } finally {
      setUploadingMarkingsPhoto(false);
    }
  };

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      {/* Header */}
      <AppScreenHeader>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <HeaderTitle
              eyebrow="Your pets"
              title="My Animals"
              subtitle="Records, photos, and medical history."
              compact={layout.isCompact}
            />
          </View>
          <HeaderIconButton icon="add" onPress={openAddAnimalForm} accessibilityLabel="Add animal" />
        </View>

        <HeaderSearch
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search animals..."
          style={{ marginTop: 16 }}
        />

        <View className="flex-row gap-2 mt-3">
          <FilterChip
            label="My Animals"
            icon="pets"
            count={activeAnimals.length}
            selected={!showArchived}
            onPress={() => setShowArchived(false)}
          />
          <FilterChip
            label="Archived"
            icon="archive"
            count={archivedAnimals.length}
            selected={showArchived}
            onPress={() => setShowArchived(true)}
          />
        </View>
      </AppScreenHeader>

      <ScrollView 
        className="flex-1" 
        contentContainerStyle={[layout.scrollContent, { paddingTop: 12 }]}
        showsVerticalScrollIndicator={false}
        {...NO_BOUNCE_SCROLL}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1F7A8C']} tintColor="#1F7A8C" />}
      >
        {loading ? (
          <LoadingState label="Rounding up your animals" icon="pets" />
        ) : filteredAnimals.length === 0 ? (
          <Animated.View
            entering={FadeInDown.duration(250)}
            className="bg-white dark:bg-slate-800 rounded-3xl p-8 items-center border border-slate-100 dark:border-slate-700 mb-6"
          >
            <MaterialIcons 
              name={showArchived ? 'inventory' : isSearching ? 'search-off' : 'pets'} 
              size={56} 
              color={showArchived ? '#fbbf24' : '#cbd5e1'} 
            />
            <Text className={`mt-4 text-center text-base font-semibold ${showArchived ? 'text-amber-700 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>
              {isSearching ? 'No matching animals' : showArchived ? 'No Archived Animals' : 'No animals found'}
            </Text>
            <Text className="text-slate-400 mt-2 text-center text-sm">
              {isSearching
                ? 'Try a different name, species, or breed'
                : showArchived 
                ? 'Archived animals will appear here' 
                : "Add your first animal by tapping the '+' button"}
            </Text>
          </Animated.View>
        ) : (
          <>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {filteredAnimals.length} {showArchived ? 'archived' : 'active'}{' '}
              {filteredAnimals.length === 1 ? 'animal' : 'animals'}
            </Text>
          {filteredAnimals.map((animal, index) => {
            const statusStyle = getStatusStyle(animal.registration_status);
            const isArchived = isAnimalArchived(animal);
            const identification = getPetIdentificationDisplay(animal);
            return (
            <Animated.View
              key={`${animal.id}-${searchQuery.trim().toLowerCase()}-${showArchived}`}
              entering={getResultEntering(index)}
              exiting={FadeOut.duration(120)}
            >
            <TouchableOpacity
              onPress={() => openAnimalDetail(animal)}
              activeOpacity={0.85}
              className="rounded-3xl p-4 mb-3 border bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700"
              style={{ 
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2
              }}
            >
              {isArchived && (
                <View className="absolute top-3 right-3 flex-row items-center bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded-full border border-amber-200 dark:border-amber-700">
                  <MaterialIcons name="archive" size={12} color="#d97706" />
                  <Text className="ml-1 text-xs font-semibold text-amber-700 dark:text-amber-400">ARCHIVED</Text>
                </View>
              )}
              
              <View className="flex-row items-center">
                {animal.pet_photo_url ? (
                  <Image
                    source={{ uri: animal.pet_photo_url }}
                    className="w-16 h-16 rounded-2xl"
                    resizeMode="cover"
                  />
                ) : (
                  <View className={`w-16 h-16 rounded-2xl items-center justify-center ${statusStyle.avatarBg}`}>
                    <MaterialIcons
                      name="pets"
                      size={32}
                      color={statusStyle.icon}
                    />
                  </View>
                )}

                {/* Animal Info */}
                <View className="flex-1 ml-4">
                  <View className="flex-row items-center flex-wrap">
                    <Text className="text-lg font-bold text-slate-800 dark:text-white">
                      {animal.pet_name}
                    </Text>
                    <View className={`ml-2 px-2 py-0.5 rounded-full ${statusStyle.badgeBg}`}>
                      <Text className={`text-xs capitalize font-medium ${statusStyle.badgeText}`}>
                        {statusStyle.label}
                      </Text>
                    </View>
                  </View>
                  <Text className="text-sm text-slate-500 dark:text-slate-400">
                    {getSpeciesLabel(animal)} • {getBreedLabel(animal)}
                  </Text>
                  {identification ? (
                    <Text className={`text-xs mt-1 font-semibold ${
                      identification.tone === 'id' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                    }`}>
                      {identification.text}
                    </Text>
                  ) : null}
                  <View className="flex-row items-center mt-1 flex-wrap">
                    {animal.birthdate && (
                      <>
                        <MaterialIcons name="calendar-today" size={12} color="#94a3b8" />
                        <Text className="text-xs ml-1 text-slate-400">{formatDate(animal.birthdate)}</Text>
                        <View className="w-1 h-1 rounded-full mx-2 bg-slate-300 dark:bg-slate-600" />
                      </>
                    )}
                    {animal.weight && (
                      <>
                        <MaterialIcons name="scale" size={12} color="#94a3b8" />
                        <Text className="text-xs ml-1 text-slate-400">{animal.weight} kg</Text>
                        <View className="w-1 h-1 rounded-full mx-2 bg-slate-300 dark:bg-slate-600" />
                      </>
                    )}
                    <MaterialIcons name={animal.sex === 'male' ? 'male' : 'female'} size={12} color="#94a3b8" />
                    <Text className="text-xs ml-1 capitalize text-slate-400">{animal.sex}</Text>
                  </View>
                </View>

                {/* Actions */}
                {isArchived ? (
                  <TouchableOpacity 
                    onPress={(event) => {
                      event?.stopPropagation?.();
                      unarchiveAnimal(animal.id, animal.pet_name);
                    }}
                    className="flex-row items-center bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-700"
                  >
                    <MaterialIcons name="restore" size={16} color="#1F7A8C" />
                    <Text className="ml-1.5 text-sm font-medium text-blue-700 dark:text-blue-400">Restore</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    onPress={(event) => {
                      event?.stopPropagation?.();
                      archiveAnimal(animal.id, animal.pet_name);
                    }}
                    className="p-2 rounded-xl bg-slate-50 dark:bg-slate-700"
                  >
                    <MaterialIcons name="archive" size={20} color="#64748b" />
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
            </Animated.View>
            );
          })}
          </>
        )}
        
        <View className="h-6" />
      </ScrollView>

      {/* Animal Info Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showDetailModal}
        onRequestClose={closeAnimalDetail}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingBottom: layout.bottomInset }}>
          <View
            className="overflow-hidden rounded-t-3xl bg-white dark:bg-slate-800"
            style={{ height: layout.sheetMaxHeight }}
          >
            {selectedAnimal ? (() => {
              const detailStatusStyle = getStatusStyle(selectedAnimal.registration_status);
              const viewingArchived = isAnimalArchived(selectedAnimal);
              const identification = getPetIdentificationDisplay(selectedAnimal);
              return (
                <>
                  <View className="border-b border-slate-100 bg-white px-6 pb-5 pt-6">
                    <View className="mb-4 flex-row items-start justify-between">
                      <Text className="text-xl font-bold text-navy">Animal Info</Text>
                      <TouchableOpacity
                        onPress={closeAnimalDetail}
                        className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                      >
                        <MaterialIcons name="close" size={22} color="#16324F" />
                      </TouchableOpacity>
                    </View>

                    <View className="flex-row items-center">
                      {selectedAnimal.pet_photo_url ? (
                        <TouchableOpacity
                          onPress={() => openPhotoPreview(selectedAnimal.pet_photo_url, 'Pet Photo')}
                          activeOpacity={0.85}
                        >
                          <Image
                            source={{ uri: selectedAnimal.pet_photo_url }}
                            className="w-16 h-16 rounded-2xl"
                            resizeMode="cover"
                          />
                        </TouchableOpacity>
                      ) : (
                        <View className={`w-16 h-16 rounded-2xl items-center justify-center ${detailStatusStyle.avatarBg}`}>
                          <MaterialIcons name="pets" size={32} color={detailStatusStyle.icon} />
                        </View>
                      )}
                      <View className="flex-1 ml-4">
                        <Text className="text-xl font-bold text-navy">{selectedAnimal.pet_name}</Text>
                        <Text className="mt-1 text-sm text-muted">
                          {getSpeciesLabel(selectedAnimal)} • {getBreedLabel(selectedAnimal)}
                        </Text>
                        {identification ? (
                          <Text className="mt-1 text-xs font-semibold text-navy">
                            {identification.text}
                          </Text>
                        ) : null}
                        <View className="mt-2 flex-row flex-wrap gap-2">
                          {viewingArchived && (
                            <View className="rounded-full bg-amber-100 px-2 py-0.5">
                              <Text className="text-xs font-medium text-amber-800">Archived</Text>
                            </View>
                          )}
                          {selectedAnimal.registration_status && (
                            <View className="rounded-full bg-teal-50 px-2 py-0.5">
                              <Text className="text-xs font-medium text-teal-800">
                                {detailStatusStyle.label}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    <View className="flex-row flex-wrap gap-2 mt-4">
                      <QuickFact
                        icon={selectedAnimal.sex === 'male' ? 'male' : 'female'}
                        label="Sex"
                        value={formatDetailLabel(selectedAnimal.sex)}
                      />
                      <QuickFact
                        icon="scale"
                        label="Weight"
                        value={selectedAnimal.weight ? `${selectedAnimal.weight} kg` : '—'}
                      />
                      <QuickFact
                        icon="cake"
                        label="Birthdate"
                        value={formatDate(selectedAnimal.birthdate)}
                      />
                      <QuickFact
                        icon="history"
                        label="Last Visit"
                        value={
                          lastVisit?.service_type
                            ? `${lastVisit.service_type}${lastVisit.date ? ` • ${formatDate(lastVisit.date)}` : ''}`
                            : visitHistoryCount > 0
                              ? `${visitHistoryCount} recorded`
                              : 'No visits yet'
                        }
                      />
                    </View>
                  </View>

                  <View className="px-6 pt-4">
                    <View className="flex-row bg-slate-100 dark:bg-slate-700 rounded-xl p-1 mb-4">
                      {[
                        { id: 'overview', label: 'Overview', icon: 'info' },
                        { id: 'history', label: 'Visit History', icon: 'history' },
                      ].map((tab) => {
                        const active = detailTab === tab.id;
                        return (
                          <TouchableOpacity
                            key={tab.id}
                            onPress={() => setDetailTab(tab.id)}
                            className={`flex-1 flex-row items-center justify-center py-2.5 rounded-lg ${active ? 'bg-white dark:bg-slate-800' : ''}`}
                          >
                            <MaterialIcons
                              name={tab.icon}
                              size={16}
                              color={active ? '#1F7A8C' : '#64748b'}
                            />
                            <Text
                              className={`ml-1.5 text-sm font-semibold ${
                                active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              {tab.label}
                            </Text>
                            {tab.id === 'history' && visitHistoryCount > 0 ? (
                              <View className={`ml-1.5 px-1.5 py-0.5 rounded-full ${active ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-slate-200 dark:bg-slate-600'}`}>
                                <Text className={`text-[10px] font-bold ${active ? 'text-blue-700 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300'}`}>
                                  {visitHistoryCount}
                                </Text>
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <ScrollView
                    className="flex-1 px-6"
                    contentContainerStyle={{ paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                    {...NO_BOUNCE_SCROLL}
                  >
                    {detailTab === 'overview' ? (
                      <>
                        {viewingArchived ? (
                          <InfoSection title="Archive Details" icon="archive">
                            <DetailRow label="Archived On" value={formatDate(selectedAnimal.archived_at)} last />
                          </InfoSection>
                        ) : null}

                        <InfoSection title="Photos" icon="photo-library">
                          <View className="flex-row gap-3">
                            <View className="flex-1">
                              <Text className="text-[11px] text-slate-500 mb-1.5">Pet Photo</Text>
                              {selectedAnimal.pet_photo_url ? (
                                <TouchableOpacity
                                  onPress={() => openPhotoPreview(selectedAnimal.pet_photo_url, 'Pet Photo')}
                                  activeOpacity={0.85}
                                  className="relative"
                                >
                                  <Image
                                    source={{ uri: selectedAnimal.pet_photo_url }}
                                    className="w-full h-28 rounded-xl bg-slate-100 dark:bg-slate-700"
                                    resizeMode="cover"
                                  />
                                  <View className="absolute right-2 bottom-2 bg-black/55 px-2 py-1 rounded-lg flex-row items-center">
                                    <MaterialIcons name="zoom-in" size={12} color="#ffffff" />
                                    <Text className="text-[10px] text-white ml-1 font-semibold">View</Text>
                                  </View>
                                </TouchableOpacity>
                              ) : (
                                <View className="w-full h-28 rounded-xl bg-slate-100 dark:bg-slate-700 items-center justify-center">
                                  <MaterialIcons name="pets" size={22} color="#94a3b8" />
                                </View>
                              )}
                            </View>
                            <View className="flex-1">
                              <Text className="text-[11px] text-slate-500 mb-1.5">Markings Photo</Text>
                              {selectedAnimal.markings_photo_url ? (
                                <TouchableOpacity
                                  onPress={() => openPhotoPreview(selectedAnimal.markings_photo_url, 'Markings Photo')}
                                  activeOpacity={0.85}
                                  className="relative"
                                >
                                  <Image
                                    source={{ uri: selectedAnimal.markings_photo_url }}
                                    className="w-full h-28 rounded-xl bg-slate-100 dark:bg-slate-700"
                                    resizeMode="cover"
                                  />
                                  <View className="absolute right-2 bottom-2 bg-black/55 px-2 py-1 rounded-lg flex-row items-center">
                                    <MaterialIcons name="zoom-in" size={12} color="#ffffff" />
                                    <Text className="text-[10px] text-white ml-1 font-semibold">View</Text>
                                  </View>
                                </TouchableOpacity>
                              ) : (
                                <View className="w-full h-28 rounded-xl bg-slate-100 dark:bg-slate-700 items-center justify-center">
                                  <MaterialIcons name="photo-library" size={22} color="#94a3b8" />
                                </View>
                              )}
                            </View>
                          </View>
                        </InfoSection>

                        <InfoSection title="Profile" icon="pets">
                          <DetailRow label="Name" value={selectedAnimal.pet_name} />
                          {identification ? (
                            <DetailRow label="Identification No." value={identification.text} />
                          ) : null}
                          <DetailRow label="Species" value={getSpeciesLabel(selectedAnimal)} />
                          <DetailRow label="Breed" value={getBreedLabel(selectedAnimal)} />
                          <DetailRow label="Color" value={selectedAnimal.color || '-'} />
                          <DetailRow label="Pet Markings" value={selectedAnimal.markings || '-'} />
                          <DetailRow
                            label="Reproductive Status"
                            value={
                              reproductiveLabels[selectedAnimal.reproductive_status]
                                || formatDetailLabel(selectedAnimal.reproductive_status)
                            }
                            last={!selectedAnimal.weeks_months || (selectedAnimal.reproductive_status !== 'pregnant' && selectedAnimal.reproductive_status !== 'nursing')}
                          />
                          {(selectedAnimal.reproductive_status === 'pregnant' || selectedAnimal.reproductive_status === 'nursing') && selectedAnimal.weeks_months ? (
                            <DetailRow label="Weeks/Months" value={selectedAnimal.weeks_months} last />
                          ) : null}
                        </InfoSection>

                        <InfoSection title="Diet & Health" icon="favorite">
                          <DetailRow
                            label="Diet"
                            value={dietLabels[selectedAnimal.diet] || formatDetailLabel(selectedAnimal.diet)}
                          />
                          {selectedAnimal.diet === 'others' && selectedAnimal.diet_other ? (
                            <DetailRow label="Diet Details" value={selectedAnimal.diet_other} />
                          ) : null}
                          <DetailRow
                            label="Dewormed"
                            value={formatDetailLabel(selectedAnimal.dewormed)}
                            last={!isYesAnswer(selectedAnimal.dewormed)}
                          />
                          {isYesAnswer(selectedAnimal.dewormed) && formatDate(selectedAnimal.last_deworming_date) ? (
                            <DetailRow label="Last Deworming" value={formatDate(selectedAnimal.last_deworming_date)} />
                          ) : null}
                          {isYesAnswer(selectedAnimal.dewormed) && selectedAnimal.dewormer_name ? (
                            <DetailRow label="Dewormer Name" value={selectedAnimal.dewormer_name} last />
                          ) : null}
                        </InfoSection>

                        <InfoSection title="Vaccinations" icon="vaccines">
                          <DetailRow label="Rabies Vaccine" value={formatDetailLabel(selectedAnimal.rabies_vaccine)} />
                          {isYesAnswer(selectedAnimal.rabies_vaccine) && formatDate(selectedAnimal.rabies_last_vaccination) ? (
                            <DetailRow
                              label="Rabies Last Vaccination"
                              value={`${formatDate(selectedAnimal.rabies_last_vaccination)} · ${vaccineCoverageLabel(selectedAnimal.rabies_last_vaccination, selectedAnimal.rabies_dose_type)}`}
                            />
                          ) : null}
                          <DetailRow
                            label="DHPPL Vaccine"
                            value={formatDetailLabel(selectedAnimal.dhppl_vaccine)}
                            last={!isYesAnswer(selectedAnimal.dhppl_vaccine) && !selectedAnimal.other_vaccine_name}
                          />
                          {isYesAnswer(selectedAnimal.dhppl_vaccine) && formatDate(selectedAnimal.dhppl_last_vaccination) ? (
                            <DetailRow
                              label="DHPPL Last Vaccination"
                              value={`${formatDate(selectedAnimal.dhppl_last_vaccination)} · ${vaccineCoverageLabel(selectedAnimal.dhppl_last_vaccination, selectedAnimal.dhppl_dose_type)}`}
                            />
                          ) : null}
                          {selectedAnimal.other_vaccine_name ? (
                            <DetailRow
                              label="Other Vaccine"
                              value={`${selectedAnimal.other_vaccine_name}${
                                selectedAnimal.other_vaccine_last_vaccination
                                  ? ` • ${formatDate(selectedAnimal.other_vaccine_last_vaccination)} · ${vaccineCoverageLabel(selectedAnimal.other_vaccine_last_vaccination, selectedAnimal.other_vaccine_dose_type)}`
                                  : ''
                              }`}
                              last
                            />
                          ) : null}
                        </InfoSection>
                      </>
                    ) : (
                      <AnimalMedicalHistoryTimeline
                        history={visitHistory}
                        loading={historyLoading}
                        count={visitHistoryCount}
                      />
                    )}

                    <View className="mt-6 gap-3 pb-8">
                      <View className="flex-row gap-3">
                        <TouchableOpacity
                          onPress={() => setShowQrModal(true)}
                          className="flex-1 bg-teal rounded-xl py-3 px-3 flex-row items-center justify-center"
                        >
                          <MaterialIcons name="qr-code-2" size={18} color="#ffffff" />
                          <Text className="text-white text-center font-semibold ml-2">QR Code</Text>
                        </TouchableOpacity>
                        {viewingArchived ? (
                          <TouchableOpacity
                            onPress={handleRestoreFromDetail}
                            className="flex-1 bg-navy rounded-xl py-3 px-3 flex-row items-center justify-center"
                          >
                            <MaterialIcons name="restore" size={18} color="#ffffff" />
                            <Text className="text-white text-center font-semibold ml-2">Restore</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={handleEditAnimal}
                            className="flex-1 bg-navy rounded-xl py-3 px-3 flex-row items-center justify-center"
                          >
                            <MaterialIcons name="edit" size={18} color="#ffffff" />
                            <Text className="text-white text-center font-semibold ml-2">Edit Animal</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={closeAnimalDetail}
                        className="bg-slate-100 dark:bg-slate-700 rounded-xl py-3 px-4"
                      >
                        <Text className="text-slate-700 dark:text-slate-200 text-center font-semibold">Close</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </>
              );
            })() : null}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeAnimalForm}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingBottom: layout.bottomInset }}>
          <View
            style={{ height: layout.sheetMaxHeight, maxHeight: '92%' }}
            className="w-full flex-col overflow-hidden rounded-t-3xl bg-white dark:bg-slate-800"
          >
            <View className="flex-shrink-0 flex-row items-center justify-between border-b border-slate-100 px-6 pb-4 pt-6 dark:border-slate-700">
              <View>
                <ThemedText className="text-xl font-bold text-navy">
                  {isEditMode ? 'Edit Animal' : 'Add New Animal'}
                </ThemedText>
                <Text className="text-xs text-slate-500 mt-1">
                  {isEditMode ? 'Update your animal details below' : 'Fill in the details to register an animal'}
                </Text>
              </View>
              <TouchableOpacity onPress={closeAnimalForm} className="p-2 rounded-full bg-slate-100 dark:bg-slate-700">
                <MaterialIcons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              className="px-6 pt-4"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 16 }}
              {...NO_BOUNCE_SCROLL}
            >
              {/* Animal Name */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Animal Name *</ThemedText>
                <View className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3">
                  <MaterialIcons name="pets" size={20} color="#64748b" />
                  <TextInput
                    className="flex-1 ml-3 text-base text-slate-800 dark:text-white"
                    placeholder="Enter animal name"
                    placeholderTextColor="#94a3b8"
                    value={newAnimal.pet_name}
                    onChangeText={(text) => setNewAnimal({ ...newAnimal, pet_name: text })}
                  />
                </View>
              </View>

              {/* Pet Photo */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Pet Photo</ThemedText>
                <TouchableOpacity
                  onPress={handlePickPetPhoto}
                  disabled={uploadingPetPhoto}
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl p-4 border border-dashed border-slate-300 dark:border-slate-600"
                >
                  {newAnimal.pet_photo_url ? (
                    <Image source={{ uri: newAnimal.pet_photo_url }} className="w-full h-44 rounded-lg mb-3" resizeMode="cover" />
                  ) : (
                    <View className="items-center py-5">
                      <MaterialIcons name="add-a-photo" size={30} color="#64748b" />
                      <Text className="text-slate-500 dark:text-slate-300 mt-2">Tap to choose photo</Text>
                    </View>
                  )}
                  {uploadingPetPhoto ? (
                    <View className="flex-row items-center justify-center">
                      <ActivityIndicator color="#1F7A8C" />
                      <Text className="ml-2 text-blue-600 font-medium">Uploading...</Text>
                    </View>
                  ) : (
                    <Text className="text-center text-blue-600 font-medium">
                      {newAnimal.pet_photo_url ? 'Change Photo' : 'Upload Photo'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Species Dropdown */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Species *</ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" {...NO_BOUNCE_SCROLL}>
                  <View className="flex-row gap-2">
                    {species.map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        onPress={() => setNewAnimal({ ...newAnimal, species_id: String(s.id), breed_id: '' })}
                        className={`px-4 py-2 rounded-xl ${newAnimal.species_id === String(s.id) ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
                      >
                        <Text className={`${newAnimal.species_id === String(s.id) ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Breed Dropdown */}
              {newAnimal.species_id && breeds.length > 0 && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Breed *</ThemedText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row" {...NO_BOUNCE_SCROLL}>
                    <View className="flex-row gap-2">
                      {breeds.map((b) => (
                        <TouchableOpacity
                          key={b.id}
                          onPress={() => setNewAnimal({ ...newAnimal, breed_id: String(b.id) })}
                          className={`px-4 py-2 rounded-xl ${newAnimal.breed_id === String(b.id) ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
                        >
                          <Text className={`${newAnimal.breed_id === String(b.id) ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                            {b.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* Sex */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Sex *</ThemedText>
                <View className="flex-row gap-2">
                  {['male', 'female'].map((sex) => (
                    <TouchableOpacity
                      key={sex}
                      onPress={() => setNewAnimal({ ...newAnimal, sex })}
                      className={`px-4 py-2 rounded-xl ${newAnimal.sex === sex ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
                    >
                      <Text className={`capitalize ${newAnimal.sex === sex ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {sex}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Color & Weight Row */}
              <View className="flex-row gap-3 mb-4">
                <View className="flex-1">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Color</ThemedText>
                  <View className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3">
                    <MaterialIcons name="palette" size={20} color="#64748b" />
                    <TextInput
                      className="flex-1 ml-3 text-base text-slate-800 dark:text-white"
                      placeholder="e.g. Brown"
                      placeholderTextColor="#94a3b8"
                      value={newAnimal.color}
                      onChangeText={(text) => setNewAnimal({ ...newAnimal, color: text })}
                    />
                  </View>
                </View>
                <View className="flex-1">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Weight (kg)</ThemedText>
                  <View className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3">
                    <MaterialIcons name="scale" size={20} color="#64748b" />
                    <TextInput
                      className="flex-1 ml-3 text-base text-slate-800 dark:text-white"
                      placeholder="e.g. 5"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={newAnimal.weight}
                      onChangeText={(text) => setNewAnimal({ ...newAnimal, weight: text })}
                    />
                  </View>
                </View>
              </View>

              {/* Pet Markings */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Pet Markings <Text className="text-red-500">*</Text>
                </ThemedText>
                <View
                  className={`flex-row items-start rounded-xl px-4 py-3 border ${
                    newAnimal.markings?.trim()
                      ? 'bg-slate-100 dark:bg-slate-700 border-transparent'
                      : 'bg-slate-100 dark:bg-slate-700 border-red-300 dark:border-red-700'
                  }`}
                >
                  <MaterialIcons name="fingerprint" size={20} color="#64748b" style={{ marginTop: 2 }} />
                  <TextInput
                    className="flex-1 ml-3 text-base text-slate-800 dark:text-white"
                    placeholder="e.g. White stripe on forehead, scar on left ear"
                    placeholderTextColor="#94a3b8"
                    value={newAnimal.markings}
                    onChangeText={(text) => setNewAnimal({ ...newAnimal, markings: text })}
                    multiline
                  />
                </View>
                {!newAnimal.markings?.trim() ? (
                  <Text className="text-xs text-red-600 mt-1.5">
                    Describe the pet's unique markings (spots, scars, stripes, etc.).
                  </Text>
                ) : null}
              </View>

              {/* Markings Photo */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Markings Photo <Text className="text-red-500">*</Text>
                </ThemedText>
                <TouchableOpacity
                  onPress={handlePickMarkingsPhoto}
                  disabled={uploadingMarkingsPhoto}
                  className={`bg-slate-100 dark:bg-slate-700 rounded-xl p-4 border border-dashed ${
                    newAnimal.markings_photo_url
                      ? 'border-slate-300 dark:border-slate-600'
                      : 'border-red-300 dark:border-red-700'
                  }`}
                >
                  {newAnimal.markings_photo_url ? (
                    <Image source={{ uri: newAnimal.markings_photo_url }} className="w-full h-44 rounded-lg mb-3" resizeMode="cover" />
                  ) : (
                    <View className="items-center py-5">
                      <MaterialIcons name="photo-library" size={30} color="#64748b" />
                      <Text className="text-slate-500 dark:text-slate-300 mt-2">Tap to upload markings photo (required)</Text>
                    </View>
                  )}
                  {uploadingMarkingsPhoto ? (
                    <View className="flex-row items-center justify-center">
                      <ActivityIndicator color="#1F7A8C" />
                      <Text className="ml-2 text-blue-600 font-medium">Uploading...</Text>
                    </View>
                  ) : (
                    <Text className="text-center text-blue-600 font-medium">
                      {newAnimal.markings_photo_url ? 'Change Markings Photo' : 'Upload Markings Photo *'}
                    </Text>
                  )}
                </TouchableOpacity>
                {!newAnimal.markings_photo_url ? (
                  <Text className="text-xs text-red-600 mt-1.5">
                    A markings photo is required to register or update an animal.
                  </Text>
                ) : null}
              </View>

              {/* Birthdate with Calendar Picker */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Birthdate</ThemedText>
                <TouchableOpacity
                  onPress={() => isWeb ? promptDate('birthdate') : setShowDatePicker(true)}
                  className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3"
                >
                  <MaterialIcons name="calendar-today" size={20} color="#64748b" />
                  <ThemedText className={`flex-1 ml-3 text-base ${newAnimal.birthdate ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                    {getDateDisplayValue(newAnimal.birthdate)}
                  </ThemedText>
                  <MaterialIcons name="chevron-right" size={20} color="#64748b" />
                </TouchableOpacity>
                
                {!isWeb && showDatePicker && (
                  <DateTimePicker
                    value={selectedDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={onDateChange('birthdate')}
                    maximumDate={new Date()}
                  />
                )}
              </View>

              {/* Reproductive Status */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Reproductive Status</ThemedText>
                <View className="flex-row gap-2 flex-wrap">
                  {[
                    { key: 'pregnant', label: 'Pregnant' },
                    { key: 'nursing', label: 'Nursing' },
                    { key: 'not_pregnant', label: 'Not Pregnant' },
                  ].map((status) => (
                    <TouchableOpacity
                      key={status.key}
                      onPress={() => setClinicalFlag('reproductive_status', status.key)}
                      className={`px-4 py-2 rounded-xl ${newAnimal.reproductive_status === status.key ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
                    >
                      <Text className={`${newAnimal.reproductive_status === status.key ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {status.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Weeks/Months */}
              {newAnimal.reproductive_status && newAnimal.reproductive_status !== 'not_pregnant' && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Weeks/Months</ThemedText>
                  <View className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3">
                    <MaterialIcons name="schedule" size={20} color="#64748b" />
                    <TextInput
                      className="flex-1 ml-3 text-base text-slate-800 dark:text-white"
                      placeholder="e.g. 8 weeks, 2 months"
                      placeholderTextColor="#94a3b8"
                      value={newAnimal.weeks_months}
                      onChangeText={(text) => setNewAnimal({ ...newAnimal, weeks_months: text })}
                    />
                  </View>
                </View>
              )}

              {/* Diet */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Diet</ThemedText>
                <View className="flex-row gap-2 flex-wrap">
                  {[
                    { key: 'commercial_food', label: 'Commercial Food' },
                    { key: 'table_food', label: 'Table Food' },
                    { key: 'both', label: 'Both' },
                    { key: 'others', label: 'Others' },
                  ].map((diet) => (
                    <TouchableOpacity
                      key={diet.key}
                      onPress={() => setClinicalFlag('diet', diet.key)}
                      className={`px-4 py-2 rounded-xl ${newAnimal.diet === diet.key ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
                    >
                      <Text className={`${newAnimal.diet === diet.key ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {diet.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Diet Other (if others selected) */}
              {newAnimal.diet === 'others' && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Specify Diet</ThemedText>
                  <View className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3">
                    <MaterialIcons name="restaurant" size={20} color="#64748b" />
                    <TextInput
                      className="flex-1 ml-3 text-base text-slate-800 dark:text-white"
                      placeholder="e.g. Raw diet, Homemade food"
                      placeholderTextColor="#94a3b8"
                      value={newAnimal.diet_other}
                      onChangeText={(text) => setNewAnimal({ ...newAnimal, diet_other: text })}
                    />
                  </View>
                </View>
              )}

              {/* Dewormed? */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Dewormed?</ThemedText>
                <View className="flex-row gap-2">
                  {[
                    { key: 'yes', label: 'Yes' },
                    { key: 'no', label: 'No' },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      onPress={() => setClinicalFlag('dewormed', option.key)}
                      className={`px-4 py-2 rounded-xl ${newAnimal.dewormed === option.key ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
                    >
                      <Text className={`${newAnimal.dewormed === option.key ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Last Deworming Date */}
              {newAnimal.dewormed === 'yes' && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Last Deworming Date</ThemedText>
                  <TouchableOpacity
                    onPress={() => isWeb ? promptDate('last_deworming_date') : setShowDewormingDatePicker(true)}
                    className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3"
                  >
                    <MaterialIcons name="event" size={20} color="#64748b" />
                    <ThemedText className={`flex-1 ml-3 text-base ${newAnimal.last_deworming_date ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                      {getDateDisplayValue(newAnimal.last_deworming_date)}
                    </ThemedText>
                    <MaterialIcons name="chevron-right" size={20} color="#64748b" />
                  </TouchableOpacity>
                  
                  {!isWeb && showDewormingDatePicker && (
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onDateChange('last_deworming_date')}
                      maximumDate={new Date()}
                    />
                  )}
                </View>
              )}

              {/* Dewormer Name */}
              {newAnimal.dewormed === 'yes' && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Dewormer Name</ThemedText>
                  <View className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3">
                    <MaterialIcons name="medication" size={20} color="#64748b" />
                    <TextInput
                      className="flex-1 ml-3 text-base text-slate-800 dark:text-white"
                      placeholder="e.g. Drontal, Panacur"
                      placeholderTextColor="#94a3b8"
                      value={newAnimal.dewormer_name}
                      onChangeText={(text) => setNewAnimal({ ...newAnimal, dewormer_name: text })}
                    />
                  </View>
                </View>
              )}

              {/* Rabies Vaccine */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Rabies Vaccine</ThemedText>
                <View className="flex-row gap-2">
                  {[
                    { key: 'yes', label: 'Yes' },
                    { key: 'no', label: 'No' },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      onPress={() => setClinicalFlag('rabies_vaccine', option.key)}
                      className={`px-4 py-2 rounded-xl ${newAnimal.rabies_vaccine === option.key ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
                    >
                      <Text className={`${newAnimal.rabies_vaccine === option.key ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Rabies Last Vaccination */}
              {newAnimal.rabies_vaccine === 'yes' && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Rabies Last Vaccination Date</ThemedText>
                  <TouchableOpacity
                    onPress={() => isWeb ? promptDate('rabies_last_vaccination') : setShowRabiesDatePicker(true)}
                    className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3"
                  >
                    <MaterialIcons name="event" size={20} color="#64748b" />
                    <ThemedText className={`flex-1 ml-3 text-base ${newAnimal.rabies_last_vaccination ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                      {getDateDisplayValue(newAnimal.rabies_last_vaccination)}
                    </ThemedText>
                    <MaterialIcons name="chevron-right" size={20} color="#64748b" />
                  </TouchableOpacity>
                  
                  {!isWeb && showRabiesDatePicker && (
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onDateChange('rabies_last_vaccination')}
                      maximumDate={new Date()}
                    />
                  )}
                  <VaccineDoseChooser
                    dose={newAnimal.rabies_dose_type}
                    onChange={(dose) => setNewAnimal({ ...newAnimal, rabies_dose_type: dose })}
                  />
                  {newAnimal.rabies_last_vaccination ? (
                    <ThemedText className="mt-2 text-xs text-slate-500">
                      {vaccineCoverageLabel(newAnimal.rabies_last_vaccination, newAnimal.rabies_dose_type)}
                    </ThemedText>
                  ) : null}
                </View>
              )}

              {/* DHPPL Vaccine */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">DHPPL Vaccine</ThemedText>
                <View className="flex-row gap-2">
                  {[
                    { key: 'yes', label: 'Yes' },
                    { key: 'no', label: 'No' },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      onPress={() => setClinicalFlag('dhppl_vaccine', option.key)}
                      className={`px-4 py-2 rounded-xl ${newAnimal.dhppl_vaccine === option.key ? 'bg-navy' : 'bg-slate-100 dark:bg-slate-700'}`}
                    >
                      <Text className={`${newAnimal.dhppl_vaccine === option.key ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* DHPPL Last Vaccination */}
              {newAnimal.dhppl_vaccine === 'yes' && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">DHPPL Last Vaccination Date</ThemedText>
                  <TouchableOpacity
                    onPress={() => isWeb ? promptDate('dhppl_last_vaccination') : setShowDhpplDatePicker(true)}
                    className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3"
                  >
                    <MaterialIcons name="event" size={20} color="#64748b" />
                    <ThemedText className={`flex-1 ml-3 text-base ${newAnimal.dhppl_last_vaccination ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                      {getDateDisplayValue(newAnimal.dhppl_last_vaccination)}
                    </ThemedText>
                    <MaterialIcons name="chevron-right" size={20} color="#64748b" />
                  </TouchableOpacity>
                  
                  {!isWeb && showDhpplDatePicker && (
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onDateChange('dhppl_last_vaccination')}
                      maximumDate={new Date()}
                    />
                  )}
                  <VaccineDoseChooser
                    dose={newAnimal.dhppl_dose_type}
                    onChange={(dose) => setNewAnimal({ ...newAnimal, dhppl_dose_type: dose })}
                  />
                  {newAnimal.dhppl_last_vaccination ? (
                    <ThemedText className="mt-2 text-xs text-slate-500">
                      {vaccineCoverageLabel(newAnimal.dhppl_last_vaccination, newAnimal.dhppl_dose_type)}
                    </ThemedText>
                  ) : null}
                </View>
              )}

              {/* Other Vaccine */}
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Other Vaccine Name</ThemedText>
                <View className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3">
                  <MaterialIcons name="vaccines" size={20} color="#64748b" />
                  <TextInput
                    className="flex-1 ml-3 text-base text-slate-800 dark:text-white"
                    placeholder="e.g. Bordetella, Leptospirosis"
                    placeholderTextColor="#94a3b8"
                    value={newAnimal.other_vaccine_name}
                    onChangeText={(text) => setNewAnimal({
                      ...newAnimal,
                      other_vaccine_name: text,
                      other_vaccine_last_vaccination: text.trim() ? newAnimal.other_vaccine_last_vaccination : '',
                      other_vaccine_dose_type: text.trim() ? newAnimal.other_vaccine_dose_type : 'first',
                    })}
                  />
                </View>
              </View>

              {/* Other Vaccine Last Vaccination */}
              {newAnimal.other_vaccine_name && (
                <View className="mb-6">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Other Vaccine Last Date</ThemedText>
                  <TouchableOpacity
                    onPress={() => isWeb ? promptDate('other_vaccine_last_vaccination') : setShowOtherVaccineDatePicker(true)}
                    className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3"
                  >
                    <MaterialIcons name="event" size={20} color="#64748b" />
                    <ThemedText className={`flex-1 ml-3 text-base ${newAnimal.other_vaccine_last_vaccination ? 'text-slate-800 dark:text-white' : 'text-slate-400'}`}>
                      {getDateDisplayValue(newAnimal.other_vaccine_last_vaccination)}
                    </ThemedText>
                    <MaterialIcons name="chevron-right" size={20} color="#64748b" />
                  </TouchableOpacity>
                  
                  {!isWeb && showOtherVaccineDatePicker && (
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={onDateChange('other_vaccine_last_vaccination')}
                      maximumDate={new Date()}
                    />
                  )}
                  <VaccineDoseChooser
                    dose={newAnimal.other_vaccine_dose_type}
                    onChange={(dose) => setNewAnimal({ ...newAnimal, other_vaccine_dose_type: dose })}
                  />
                  {newAnimal.other_vaccine_last_vaccination ? (
                    <ThemedText className="mt-2 text-xs text-slate-500">
                      {vaccineCoverageLabel(newAnimal.other_vaccine_last_vaccination, newAnimal.other_vaccine_dose_type)}
                    </ThemedText>
                  ) : null}
                </View>
              )}

            </ScrollView>

            <View className="flex-shrink-0 flex-row gap-3 border-t border-slate-100 bg-white px-6 py-4 pb-8 dark:border-slate-700 dark:bg-slate-800">
              <TouchableOpacity
                onPress={closeAnimalForm}
                disabled={adding}
                className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-xl py-3.5 px-4"
              >
                <Text className="text-slate-700 dark:text-slate-200 text-center font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addAnimal}
                disabled={adding}
                className="flex-1 bg-navy rounded-xl py-3.5 px-4 flex-row items-center justify-center"
              >
                {adding ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <MaterialIcons name={isEditMode ? 'save' : 'add'} size={18} color="#ffffff" />
                    <Text className="text-white font-semibold text-base ml-2">
                      {isEditMode ? 'Save Changes' : 'Add Animal'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AnimalQrModal
        visible={showQrModal}
        animal={selectedAnimal}
        ownerId={user?.id}
        onClose={() => setShowQrModal(false)}
      />

      <Modal
        visible={!!expandedPhoto}
        transparent
        animationType="fade"
        onRequestClose={closePhotoPreview}
      >
        <View className="flex-1 bg-black/95">
          <View className="flex-row items-center justify-between px-6 pb-4" style={{ paddingTop: layout.headerPaddingTop }}>
            <Text className="text-base font-semibold text-white">{expandedPhoto?.label || 'Photo'}</Text>
            <TouchableOpacity onPress={closePhotoPreview} className="p-2 rounded-full bg-white/10">
              <MaterialIcons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            activeOpacity={1}
            onPress={closePhotoPreview}
            className="flex-1 items-center justify-center px-6 pb-10"
          >
            <Image
              source={{ uri: expandedPhoto?.uri }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>
      </Modal>
    </ThemedView>
  );
}
