import { View, ScrollView, TouchableOpacity, RefreshControl, Modal, Image, Text } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { LoadingState } from '@/components/LoadingState';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAuth } from '@/contexts/auth-context';
import { useFocusEffect, useRouter } from 'expo-router';
import axios from 'axios';
import { API_BASE_URL } from '@/config/api';
import { getStatusIcon, getStatusStyle } from '@/utils/bookingStatus';
import { normalizeAppointment, formatAppointmentTimeLabel, type BookedPetDisplay } from '@/utils/appointmentDisplay';
import { isAccountUnderReview } from '@/utils/ownerStatus';
import { MeetingPlaceMap } from '@/components/MeetingPlaceMap';
import { AppScreenHeader } from '@/components/AppScreenHeader';
import { HeaderIconButton, HeaderSearch, HeaderTitle, SectionHeading } from '@/components/AppHeaderBits';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

const UPCOMING_APPOINTMENTS = [];

interface Appointment {
  id: number;
  petName: string;
  petNames?: string[];
  bookedPets?: BookedPetDisplay[];
  service: string;
  services: string[];
  date: string;
  date_formatted: string;
  time: string;
  status: string;
  notes?: string;
  bookingType?: string;
  isDoorToDoor?: boolean;
  meetingLatitude?: number | null;
  meetingLongitude?: number | null;
  meetingPlaceLabel?: string | null;
}

interface Service {
  id: number;
  type_name: string;
  description: string;
}

const SERVICES: Service[] = [];

const NO_BOUNCE_SCROLL = {
  bounces: false,
  overScrollMode: 'never' as const,
};

// Diri himuon ang petsa karon nga YYYY-MM-DD.
function localDateKey(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Diri susihon kung home service ang appointment.
function isHomeVisit(appointment: Appointment) {
  return appointment.bookingType === 'home_service' || appointment.isDoorToDoor === true;
}

// Diri ang fade-in animation sa matag resulta.
const getResultEntering = (index: number) => {
  const delay = Math.min(index * 55, 350);
  return FadeInDown.delay(delay).duration(250);
};

// Diri susihon kung mo-match sa search ang mga value.
const matchesSearch = (query: string, ...values: (string | undefined)[]) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLowerCase().includes(normalized));
};

// Diri ang home screen sa pet owner.
export default function HomeScreen() {
  const { token, user, refreshUser } = useAuth();
  const router = useRouter();
  const layout = useResponsiveLayout();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState((user as any)?.profile_photo_url || '');

  // Animal care tips array
  const animalCareTips = [
    {
      title: "Hydration is Key",
      message: "Always provide fresh, clean water for your animals. Proper hydration helps maintain healthy organ function and overall wellbeing."
    },
    {
      title: "Regular Exercise",
      message: "Daily physical activity keeps animals physically fit and mentally stimulated. Adjust exercise intensity based on your animal's age and breed."
    },
    {
      title: "Balanced Nutrition",
      message: "Feed your animals high-quality food appropriate for their age, size, and health condition. Consult your vet for dietary recommendations."
    },
    {
      title: "Dental Health",
      message: "Brush your animal's teeth regularly and provide dental treats. Good oral health prevents serious medical issues later in life."
    },
    {
      title: "Mental Stimulation",
      message: "Provide toys and activities that challenge your animal's mind. Mental exercise prevents boredom and destructive behaviors."
    },
    {
      title: "Regular Check-ups",
      message: "Schedule routine veterinary visits even when your animal seems healthy. Prevention is always better than treatment."
    },
    {
      title: "Socialization Matters",
      message: "Proper socialization helps animals develop confidence and reduces anxiety. Introduce your animals to new experiences gradually and positively for better behavior."
    },
    {
      title: "Safe Environment",
      message: "Create a animal-safe space at home. Remove hazards and provide comfortable resting areas for your furry friends."
    }
  ];

  // Get random tip on mount/refresh
  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * animalCareTips.length);
    setCurrentTipIndex(randomIndex);
  }, []);

  // Get service description
  // Diri kuhaon ang description sa serbisyo.
  const getServiceDescription = (serviceName: string | undefined) => {
    if (!serviceName) return 'Professional veterinary service provided by our experienced team of veterinarians.';
    
    switch (serviceName.toLowerCase()) {
      case 'deworming':
        return 'Regular deworming helps keep your animals healthy, active, and free from harmful parasites. Protect your pets and livestock by giving them proper deworming on time.';
      case 'treatment':
        return 'Early treatment helps animals recover faster and live healthier lives. Bring your animals for proper veterinary care whenever they are sick or injured.';
      case 'vaccination':
        return 'Vaccination protects animals from dangerous diseases and helps keep your family and community safe. Keep your pets and livestock vaccinated regularly.';
      case 'vitamin supplement':
        return 'Vitamin supplements help animals grow strong, stay energetic, and maintain good health. Give your animals the nutrients they need for a happier and healthier life.';
      case 'spay':
        return 'Spaying helps prevent unwanted pregnancies and reduces health risks in female animals. Our veterinarians provide safe and professional spaying services.';
      case 'castration':
        return 'Castration helps control behavior and prevents unwanted breeding in male animals. Our experienced veterinarians ensure safe and humane procedures.';
      default:
        return 'Compassionate care for your beloved pets. Our experienced veterinarians are dedicated to keeping your furry friends healthy and happy with personalized attention and advanced medical treatments.';
    }
  };

  // Get service icon
  // Diri pilion ang icon sa serbisyo.
  const getServiceIcon = (serviceName: string | undefined) => {
    if (!serviceName) return 'medical-services';
    
    switch (serviceName.toLowerCase()) {
      case 'deworming':
        return 'pets';
      case 'treatment':
        return 'healing';
      case 'vaccination':
        return 'vaccines';
      case 'vitamin supplement':
        return 'medication';
      case 'spay':
        return 'medical-services';
      case 'castration':
        return 'medical-services';
      default:
        return 'medical-services';
    }
  };

  // Fetch services
  // Diri kuhaon ang lista sa serbisyo.
  const fetchServices = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/services`);
      if (response.data.success) {
        setServices(response.data.services);
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    } finally {
      setServicesLoading(false);
    }
  };

  // Fetch appointments
  useEffect(() => {
    // Diri kuhaon ang approved nga appointment sa user.
    const fetchAppointments = async () => {
      if (!token) return;
      
      try {
        const response = await axios.get(`${API_BASE_URL}/api/mobile/appointments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          // Filter only approved appointments for home display
          const approvedAppointments = response.data.appointments
            .filter((apt: Appointment) => apt.status === 'approved')
            .map((apt: Appointment) => normalizeAppointment(apt));
          setAppointments(approvedAppointments);
        }
      } catch (error) {
        console.error('Failed to fetch appointments:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchAppointments();
  }, [token]);

  useEffect(() => {
    // Diri kuhaon ang profile photo sa user.
    const fetchProfilePhoto = async () => {
      if (!token) return;
      try {
        const response = await axios.get(`${API_BASE_URL}/api/mobile/user`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.success) {
          setProfilePhotoUrl(response.data.user?.profile_photo_url || '');
        }
      } catch (error) {
        console.error('Failed to fetch profile photo:', error);
      }
    };

    fetchProfilePhoto();
  }, [token]);

  // Fetch services on mount
  useEffect(() => {
    fetchServices();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshUser();
    }, [refreshUser])
  );

  // Pull to refresh
  // Diri i-refresh ang home screen ug ilisan ang tip.
  const onRefresh = async () => {
    setRefreshing(true);
    
    // Change to a new random tip
    const newTipIndex = Math.floor(Math.random() * animalCareTips.length);
    setCurrentTipIndex(newTipIndex);
    
    // Diri kuhaon balik ang approved nga appointment inig refresh.
    const fetchAppointments = async () => {
      if (!token) return;
      
      try {
        const response = await axios.get(`${API_BASE_URL}/api/mobile/appointments`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.data.success) {
          const approvedAppointments = response.data.appointments
            .filter((apt: Appointment) => apt.status === 'approved')
            .map((apt: Appointment) => normalizeAppointment(apt));
          setAppointments(approvedAppointments);
        }
      } catch (error) {
        console.error('Failed to refresh appointments:', error);
      }
    };
    
    try {
      await Promise.all([fetchAppointments(), refreshUser()]);
    } finally {
      setRefreshing(false);
    }
  };

  const isSearching = searchQuery.trim().length > 0;
  const filteredAppointments = appointments.filter((apt) =>
    matchesSearch(
      searchQuery,
      apt.petName,
      apt.service,
      apt.date,
      apt.date_formatted,
      apt.time,
      ...(apt.services || [])
    )
  );
  const filteredServices = services.filter((service) =>
    matchesSearch(
      searchQuery,
      service.type_name,
      service.description,
      getServiceDescription(service.type_name)
    )
  );
  const todayKey = localDateKey();
  const homeVisits = useMemo(
    () => filteredAppointments.filter((appointment) => isHomeVisit(appointment)),
    [filteredAppointments]
  );
  const clinicalVisits = useMemo(
    () => filteredAppointments.filter((appointment) => !isHomeVisit(appointment)),
    [filteredAppointments]
  );
  const visibleHomeVisits = useMemo(
    () => homeVisits
      .filter((appointment) => !appointment.date || appointment.date >= todayKey)
      .sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))),
    [homeVisits, todayKey]
  );
  const hasSearchResults =
    filteredAppointments.length > 0 ||
    filteredServices.length > 0;

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      {/* Header */}
      <AppScreenHeader>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <HeaderTitle
              eyebrow="Welcome back"
              title={`Hi, ${user?.name?.split(' ')[0] || 'there'}`}
              subtitle="Book a visit or check how your pets are doing."
              compact={layout.isCompact}
            />
          </View>
          <HeaderIconButton
            onPress={() => router.push('/(tabs)/profile')}
            accessibilityLabel="Profile"
          >
            {profilePhotoUrl ? (
              <Image source={{ uri: profilePhotoUrl }} className="w-11 h-11" resizeMode="cover" />
            ) : (
              <MaterialIcons name="person" size={21} color="#16324F" />
            )}
          </HeaderIconButton>
        </View>

        <HeaderSearch
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search services, visits..."
          style={{ marginTop: 16 }}
        />
      </AppScreenHeader>

      {isAccountUnderReview(user) ? (
        <View
          className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-700 dark:bg-amber-950/60"
          style={layout.contentStyle}
        >
          <View className="flex-row items-start gap-3">
            <MaterialIcons name="hourglass-top" size={20} color="#d97706" />
            <View className="flex-1">
              <Text className="font-semibold text-amber-900 dark:text-amber-200">
                Account Under Review
              </Text>
              <Text className="mt-1 text-sm text-amber-800 dark:text-amber-300">
                You can still add pets and book visits. Your name stays Under Review until the office approves your account.
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <ScrollView 
        className="flex-1" 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 + layout.tabBarSpace }}
        {...NO_BOUNCE_SCROLL}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1F7A8C']}
            tintColor="#1F7A8C"
          />
        }
      >
        {isSearching && !hasSearchResults && !loading && !servicesLoading ? (
          <Animated.View
            entering={FadeInDown.duration(250)}
            className="mt-4 bg-white dark:bg-slate-800 rounded-3xl p-8 items-center border border-slate-100 dark:border-slate-700"
            style={layout.contentStyle}
          >
            <MaterialIcons name="search-off" size={56} color="#cbd5e1" />
            <ThemedText className="mt-4 text-center font-semibold text-slate-700 dark:text-slate-200">
              No results found
            </ThemedText>
            <ThemedText className="text-slate-400 mt-2 text-center text-sm">
              Try searching for a service or visit
            </ThemedText>
          </Animated.View>
        ) : null}

        {(!isSearching || homeVisits.length > 0 || loading) && (
        <View className="pt-4" style={layout.contentStyle}>
          <ThemedText className="text-[18px] font-extrabold text-navy mb-3">
            Home Service
          </ThemedText>

          {loading ? (
            <LoadingState label="Fetching your visits" icon="home" />
          ) : visibleHomeVisits.length === 0 ? (
            <Animated.View
              entering={FadeInDown.duration(250)}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 items-center border border-slate-100 dark:border-slate-700"
            >
              <ThemedText className="text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">
                No home service today or upcoming
              </ThemedText>
            </Animated.View>
          ) : (
            visibleHomeVisits.map((apt, index) => {
              const latitude = Number(apt.meetingLatitude);
              const longitude = Number(apt.meetingLongitude);
              const hasMap = apt.meetingLatitude != null && apt.meetingLongitude != null && Number.isFinite(latitude) && Number.isFinite(longitude);
              const whenLabel = apt.date === todayKey ? 'Today' : 'Upcoming';
              const serviceLabel = (apt.services?.length ? apt.services : [apt.service]).filter(Boolean).join(' · ');
              return (
                <Animated.View
                  key={`home-${apt.id}-${searchQuery.trim().toLowerCase()}`}
                  entering={getResultEntering(index)}
                  exiting={FadeOut.duration(120)}
                  className="mb-3"
                >
                  <TouchableOpacity
                    onPress={() => router.push({ pathname: '/(tabs)/servicesmob', params: { appointmentId: apt.id.toString() } })}
                    activeOpacity={0.85}
                    className="bg-white rounded-3xl px-4 py-3.5 border border-slate-100"
                  >
                    <View className="flex-row items-center gap-3">
                      <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: '#EEF6F8' }}>
                        <MaterialIcons name="home" size={20} color="#1F7A8C" />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <ThemedText className="flex-1 text-[15px] font-bold text-slate-800" numberOfLines={1}>
                            {apt.petName}
                          </ThemedText>
                          <View className={`rounded-full px-2.5 py-1 ${whenLabel === 'Today' ? 'bg-teal' : 'bg-navy'}`}>
                            <Text className="text-[10px] font-bold text-white">{whenLabel}</Text>
                          </View>
                        </View>
                        {serviceLabel ? (
                          <ThemedText className="text-xs font-medium text-teal mt-0.5" numberOfLines={2}>
                            {serviceLabel}
                          </ThemedText>
                        ) : null}
                        <ThemedText className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
                          {[apt.date_formatted || apt.date, formatAppointmentTimeLabel(apt.time)].filter(Boolean).join(' · ')}
                        </ThemedText>
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View className="mt-2 overflow-hidden rounded-3xl border border-slate-100 bg-white">
                    {hasMap ? (
                      <MeetingPlaceMap
                        coordinate={{ latitude, longitude }}
                        editable={false}
                        height={200}
                        showRouteLine
                        markerTitle={apt.meetingPlaceLabel || 'Meeting place'}
                      />
                    ) : (
                      <ThemedText className="px-3 py-3 text-sm text-slate-500">
                        No meeting place pin for this visit yet.
                      </ThemedText>
                    )}
                  </View>
                </Animated.View>
              );
            })
          )}
        </View>
        )}

        {/* Upcoming Clinical Visits */}
        {(!isSearching || clinicalVisits.length > 0 || loading) && (
        <View className="pt-4" style={layout.contentStyle}>
          <SectionHeading
            title={isSearching ? 'Matching Visits' : 'Upcoming Clinical Visits'}
            actionLabel={isSearching ? undefined : 'See all'}
            onAction={isSearching ? undefined : () => router.push('/(tabs)/servicesmob')}
          />

          {loading ? null : clinicalVisits.length === 0 ? (
            <Animated.View
              entering={FadeInDown.duration(250)}
              className="bg-white dark:bg-slate-800 rounded-3xl p-8 items-center border border-slate-100 dark:border-slate-700"
            >
              <MaterialIcons name="event" size={56} color="#cbd5e1" />
              <ThemedText className="text-base font-semibold text-slate-700 dark:text-slate-200 mt-4 text-center">
                {isSearching ? 'No matching visits' : 'No upcoming clinical visits'}
              </ThemedText>
              <ThemedText className="text-sm text-slate-400 mt-2 text-center">
                {isSearching ? 'Try a different search term' : 'Book a visit to see it here'}
              </ThemedText>
            </Animated.View>
          ) : (
            clinicalVisits.map((apt, index) => (
              <Animated.View
                key={`${apt.id}-${searchQuery.trim().toLowerCase()}`}
                entering={getResultEntering(index)}
                exiting={FadeOut.duration(120)}
              >
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/(tabs)/servicesmob', params: { appointmentId: apt.id.toString() } })}
                activeOpacity={0.85}
                className="bg-white rounded-3xl px-4 py-3.5 mb-2.5 border border-slate-100"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-11 h-11 rounded-2xl items-center justify-center"
                    style={{ backgroundColor: '#EEF6F8' }}
                  >
                    <MaterialIcons name="pets" size={20} color="#1F7A8C" />
                  </View>
                  <View className="flex-1">
                    <ThemedText className="text-[15px] font-bold text-slate-800" numberOfLines={1}>
                      {apt.petName}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 mt-0.5" numberOfLines={1}>
                      {[apt.date_formatted || apt.date, formatAppointmentTimeLabel(apt.time)].filter(Boolean).join(' · ')}
                    </ThemedText>
                  </View>
                  {(() => {
                    const statusStyle = getStatusStyle(apt.status);
                    return (
                      <View className={`rounded-full px-2.5 py-1 flex-row items-center ${statusStyle.badgeBg}`}>
                        <MaterialIcons name={getStatusIcon(apt.status)} size={12} color={statusStyle.icon} />
                        <ThemedText className={`text-[11px] font-bold ml-1 ${statusStyle.badgeText}`}>
                          {statusStyle.label}
                        </ThemedText>
                      </View>
                    );
                  })()}
                </View>
                {apt.service ? (
                  <View className="flex-row items-center justify-between mt-2 pt-2.5 border-t border-slate-100">
                    <ThemedText className="flex-1 text-xs font-medium text-slate-500" numberOfLines={1}>
                      {apt.service}
                    </ThemedText>
                    <MaterialIcons name="chevron-right" size={18} color="#94a3b8" />
                  </View>
                ) : null}
              </TouchableOpacity>
              </Animated.View>
            ))
          )}
        </View>
        )}

        {/* Services */}
        {(!isSearching || filteredServices.length > 0 || servicesLoading) && (
        <View className="mt-6" style={layout.contentStyle}>
          <SectionHeading title={isSearching ? 'Matching Services' : 'Our Services'} />
          {servicesLoading ? (
            <LoadingState label="Loading services" icon="medical-services" compact />
          ) : filteredServices.length === 0 ? (
            <Animated.View
              entering={FadeInDown.duration(250)}
              className="bg-white dark:bg-slate-800 rounded-3xl p-8 items-center border border-slate-100 dark:border-slate-700"
            >
              <MaterialIcons name="medical-services" size={56} color="#cbd5e1" />
              <ThemedText className="text-base font-semibold text-slate-700 dark:text-slate-200 mt-4">
                No matching services
              </ThemedText>
            </Animated.View>
          ) : (
            <View className="flex-row flex-wrap" style={{ gap: layout.gridGap }}>
              {filteredServices.map((service, index) => (
                <Animated.View
                  key={`${service.id}-${searchQuery.trim().toLowerCase()}`}
                  entering={getResultEntering(index)}
                  exiting={FadeOut.duration(120)}
                  style={{ width: layout.gridItemWidth }}
                >
                <TouchableOpacity
                  onPress={() => {
                    setSelectedService(service);
                    setModalVisible(true);
                  }}
                  activeOpacity={0.85}
                  className="bg-white rounded-3xl p-4 w-full border border-slate-100"
                >
                  <View
                    className="w-11 h-11 rounded-2xl items-center justify-center mb-3"
                    style={{ backgroundColor: '#EEF6F8' }}
                  >
                    <MaterialIcons name={getServiceIcon(service.type_name) as any} size={20} color="#1F7A8C" />
                  </View>
                  <ThemedText className="font-bold text-slate-800 dark:text-white" numberOfLines={2}>
                    {service.type_name}
                  </ThemedText>
                  <View className="flex-row items-center justify-between mt-2">
                    <ThemedText className="text-xs font-medium text-slate-400">View details</ThemedText>
                    <MaterialIcons name="chevron-right" size={16} color="#94a3b8" />
                  </View>
                </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          )}
        </View>
        )}


        {/* Service Details Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}>
            <View
              className="bg-white dark:bg-slate-800 rounded-t-3xl overflow-hidden"
              style={{ maxHeight: layout.sheetMaxHeight, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingBottom: layout.bottomInset }}
            >
              <View className="border-b border-slate-100 bg-white px-6 pb-5 pt-6">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-xl font-bold text-navy">
                      {selectedService?.type_name}
                    </Text>
                    <Text className="mt-1 text-sm text-muted">
                      Service details
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setModalVisible(false)}
                    className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                  >
                    <MaterialIcons name="close" size={22} color="#16324F" />
                  </TouchableOpacity>
                </View>
              </View>

              <View className="px-6 py-5">
                <View
                  className="w-14 h-14 rounded-2xl items-center justify-center mb-4"
                  style={{ backgroundColor: 'rgba(31, 122, 140, 0.1)' }}
                >
                  <MaterialIcons name={getServiceIcon(selectedService?.type_name) as any} size={28} color="#1F7A8C" />
                </View>
                <ThemedText className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  About
                </ThemedText>
                <ThemedText className="text-base text-slate-700 dark:text-slate-300 leading-6 mb-6">
                  {(() => {
                    const specificDesc = getServiceDescription(selectedService?.type_name);
                    if (specificDesc && !specificDesc.includes('Compassionate care')) {
                      return specificDesc;
                    }
                    return selectedService?.description || specificDesc;
                  })()}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => {
                    setModalVisible(false);
                    router.push('/(tabs)/servicesmob');
                  }}
                  className="mb-4 rounded-full bg-navy py-3.5"
                >
                  <Text className="font-semibold text-center" style={{ color: '#FFFFFF' }}>
                    Book This Service
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setModalVisible(false)}
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl py-3.5 mb-2"
                >
                  <ThemedText className="text-slate-700 dark:text-slate-200 font-semibold text-center">
                    Close
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Tips Card */}
        {!isSearching && (
        <View className="mt-6 mb-8" style={layout.contentStyle}>
          <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-700" style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
          }}>
            <View className="flex-row items-start">
              <View
                className="w-10 h-10 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: 'rgba(31, 122, 140, 0.1)' }}
              >
                <MaterialIcons name="lightbulb" size={20} color="#1F7A8C" />
              </View>
              <View className="flex-1">
                <ThemedText className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Animal Care Tip
                </ThemedText>
                <ThemedText className="text-base font-bold text-slate-800 dark:text-white mb-1">
                  {animalCareTips[currentTipIndex]?.title || 'Stay prepared'}
                </ThemedText>
                <ThemedText className="text-sm leading-5 text-slate-600 dark:text-slate-300">
                  {animalCareTips[currentTipIndex]?.message || 'Regular check-ups help prevent serious health issues. Book your animal\'s next visit today!'}
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}
