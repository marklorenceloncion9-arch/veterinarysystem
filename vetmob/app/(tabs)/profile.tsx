import { View, ScrollView, TouchableOpacity, Alert, Modal, TextInput, Linking, Image, ActivityIndicator, Platform, Text, KeyboardAvoidingView } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LoadingState } from '@/components/LoadingState';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState, useEffect, useCallback } from 'react';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { showToast } from '@/components/Toast';
import axios from 'axios';
import { API_BASE_URL } from '@/config/api';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import ElSalvadorPlaceField from '@/components/ElSalvadorPlaceField';
import { isAccountUnderReview } from '@/utils/ownerStatus';
import { AppScreenHeader } from '@/components/AppScreenHeader';
import { HeaderTitle } from '@/components/AppHeaderBits';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

const imageMediaTypes: any = (ImagePicker as any).MediaType?.Images
  ? [(ImagePicker as any).MediaType.Images]
  : (ImagePicker as any).MediaTypeOptions.Images;

const MENU_ITEMS = [
  { icon: 'person', label: 'Edit Profile', color: '#1F7A8C', action: 'edit' },
  { icon: 'pets', label: 'My Animals', color: '#16324F', action: 'animals' },
  { icon: 'history', label: 'Visit History', color: '#3C91E6', action: 'history' },
  { icon: 'payment', label: 'Payment Methods', color: '#186272', action: 'payment' },
];

const SUPPORT_ITEMS = [
  { icon: 'chat', label: 'Contact Us', color: '#64748b', action: 'contact' },
];

const NO_BOUNCE_SCROLL = {
  bounces: false,
  overScrollMode: 'never' as const,
};

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
  elevation: 2,
} as const;

const INPUT_CLASS =
  'bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200';

function savedStreetCoordinate(profile: any): { latitude: number; longitude: number } | null {
  const latitude = Number(profile?.street_latitude);
  const longitude = Number(profile?.street_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

// Diri ang tile nga nagpakita og info.
function InfoTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-xl px-3.5 py-3 border border-slate-100 dark:border-slate-700">
      <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{label}</Text>
      <Text className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 mt-1">
        {value || '—'}
      </Text>
    </View>
  );
}

// Diri ang wrapper sa form field nga naay label.
function FormField({
  label,
  children,
  className = 'mb-4',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View className={className}>
      <Text className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">{label}</Text>
      {children}
    </View>
  );
}

// Diri ang profile screen sa pet owner.
export default function ProfileScreen() {
  const { user, logout, token, refreshUser } = useAuth();
  const router = useRouter();
  const layout = useResponsiveLayout();
  const colorScheme = useColorScheme();
  const [totalAnimals, setTotalAnimals] = useState(0);
  const [totalVisits, setTotalVisits] = useState(0);
  const [upcomingVisits, setUpcomingVisits] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showProfileDetail, setShowProfileDetail] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editFacebook, setEditFacebook] = useState('');
  const [editBarangay, setEditBarangay] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editStreet, setEditStreet] = useState('');
  const [editStreetCoordinate, setEditStreetCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [editMapKey, setEditMapKey] = useState(0);
  const [editLocationLoading, setEditLocationLoading] = useState(false);
  const [addressPickersReady, setAddressPickersReady] = useState(false);
  const [editPassword, setEditPassword] = useState('');
  const [editProfilePhotoUrl, setEditProfilePhotoUrl] = useState('');
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [barangays, setBarangays] = useState<any[]>([]);
  const [barangaysLoading, setBarangaysLoading] = useState(false);
  const [zones, setZones] = useState<any[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [fullProfileData, setFullProfileData] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileImageError, setProfileImageError] = useState(false);
  // Diri limpyohan ang URL sa litrato.
  const normalizePhotoUrl = (value: any) => {
    const raw = String(value ?? '').trim();
    if (!raw || raw === 'null' || raw === 'undefined') return '';
    if (
      raw.startsWith('http://') ||
      raw.startsWith('https://') ||
      raw.startsWith('data:image') ||
      raw.startsWith('file://')
    ) {
      return raw;
    }
    if (raw.startsWith('/')) {
      return `${API_BASE_URL}${raw}`;
    }
    return `${API_BASE_URL}/${raw}`;
  };
  const profilePhotoUrl = normalizePhotoUrl(fullProfileData?.profile_photo_url || (user as any)?.profile_photo_url || '');
  const hasProfilePhoto = !!profilePhotoUrl && !profileImageError;

  // Fetch barangays
  useEffect(() => {
    // Diri kuhaon ang lista sa barangay.
    const fetchBarangays = async () => {
      try {
        setBarangaysLoading(true);
        const barangayUrl = `${API_BASE_URL}/api/mobile/barangays`;
        const response = await axios.get(barangayUrl);
        if (response.data.success) {
          setBarangays(response.data.barangays || []);
        }
      } catch (error) {
        const err = error as { config?: { url?: string }; response?: { status?: number; data?: unknown } };
        console.error('Failed to fetch barangays:', err.config?.url, err.response?.status);
      } finally {
        setBarangaysLoading(false);
      }
    };
    fetchBarangays();
  }, []);

  // Fetch zones
  useEffect(() => {
    // Diri kuhaon ang lista sa zone.
    const fetchZones = async () => {
      try {
        setZonesLoading(true);
        const zoneUrl = `${API_BASE_URL}/api/mobile/zones`;
        const response = await axios.get(zoneUrl);
        if (response.data.success) {
          setZones(response.data.zones || []);
        }
      } catch (error) {
        const err = error as { config?: { url?: string }; response?: { status?: number; data?: unknown } };
        console.error('Failed to fetch zones:', err.config?.url, err.response?.status);
      } finally {
        setZonesLoading(false);
      }
    };
    fetchZones();
  }, []);

  // The Android pickers fire onValueChange while the modal opens. Ignore that until the lists have settled.
  useEffect(() => {
    if (!showEditModal || barangaysLoading || zonesLoading) {
      setAddressPickersReady(false);
      return undefined;
    }
    const timer = setTimeout(() => setAddressPickersReady(true), 700);
    return () => clearTimeout(timer);
  }, [showEditModal, barangaysLoading, zonesLoading, editMapKey]);

  // Prefetch full profile once logged in so photo/details are ready on first open.
  useEffect(() => {
    // Diri kuhaon daan ang full profile.
    const prefetchProfile = async () => {
      if (!token) return;
      try {
        const freshUser = await refreshUser();
        if (freshUser) {
          setFullProfileData(freshUser);
        }
      } catch (error) {
        console.error('Profile prefetch error:', error);
      }
    };
    prefetchProfile();
  }, [token, user?.id, refreshUser]);

  useFocusEffect(
    useCallback(() => {
      refreshUser().then((freshUser) => {
        if (freshUser) {
          setFullProfileData(freshUser);
        }
      });
    }, [refreshUser])
  );
  useEffect(() => {
    setProfileImageError(false);
  }, [profilePhotoUrl]);

  // Fetch user statistics
  useEffect(() => {
    // Diri kuhaon ang stats sa user.
    const fetchStatistics = async () => {
      if (!user || !token) return;
      
      try {
        const [animalsRes, appointmentsRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/mobile/animals`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/api/mobile/appointments`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        // Set animal count
        if (animalsRes.data.success) {
          setTotalAnimals(animalsRes.data.pets?.length || 0);
        } else {
          console.log('Animals API response:', animalsRes.data);
          showToast({
            type: 'error',
            message: 'Failed to load animals data'
          });
        }

        // Set visit statistics
        if (appointmentsRes.data.success) {
          const appointments = appointmentsRes.data.appointments || [];
          setTotalVisits(appointments.length);
          
          // Count upcoming appointments (approved or pending)
          const upcomingCount = appointments.filter((apt: any) => 
            apt.status === 'approved' || apt.status === 'pending'
          ).length;
          setUpcomingVisits(upcomingCount);
        } else {
          console.log('Appointments API response:', appointmentsRes.data);
          showToast({
            type: 'error',
            message: 'Failed to load appointments data'
          });
        }
      } catch (error: any) {
        console.error('Failed to fetch statistics:', error);
      } finally {
        setStatsLoading(false);
      }
    };

    fetchStatistics();
  }, [user?.id, token]);

  // Diri moadto sa screen base sa menu nga gi-pindot.
  const handleMenuPress = (action: string) => {
    switch (action) {
      case 'animals':
        router.push('/animals');
        break;
      case 'edit':
        handleQuickEditProfile();
        break;
      case 'history':
        router.push('/servicesmob');
        break;
      case 'payment':
        setShowPaymentModal(true);
        break;
      case 'contact':
        setShowContactModal(true);
        break;
      default:
        break;
    }
  };

  // Diri i-save ang gi-edit nga profile.
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      showToast({ type: 'error', message: 'Name is required' });
      return;
    }
    if (!editStreet.trim()) {
      showToast({ type: 'error', message: 'Select a location in El Salvador City' });
      return;
    }

    const savedCoordinate = savedStreetCoordinate(fullProfileData);
    const streetUnchanged = editStreet.trim() === String(fullProfileData?.street || '').trim();
    const coordinateToSave = editStreetCoordinate ?? (streetUnchanged ? savedCoordinate : null);
    const latitude = Number(coordinateToSave?.latitude);
    const longitude = Number(coordinateToSave?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
      showToast({ type: 'error', message: 'Pin your location on the map before saving.' });
      return;
    }

    setEditLoading(true);
    try {
      const updateData: any = {
        name: editName.trim(),
        firstname: editFirstName.trim(),
        lastname: editLastName.trim(),
        middlename: editMiddleName.trim(),
        phone_number: editPhone.trim(),
        facebook: editFacebook.trim(),
        zone: editZone,
        street: editStreet,
        street_latitude: latitude,
        street_longitude: longitude,
        profile_photo_url: editProfilePhotoUrl || null,
      };

      if (editAge) {
        updateData.age = parseInt(editAge);
      }
      if (editBarangay) {
        updateData.barangay_id = editBarangay;
      }

      const response = await axios.put(`${API_BASE_URL}/api/mobile/user`, updateData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setFullProfileData(response.data.user);
        showToast({ type: 'success', message: 'Profile updated successfully' });
        setShowEditModal(false);
      } else {
        showToast({ type: 'error', message: response.data.error || 'Failed to update profile' });
      }
    } catch (error: any) {
      console.error('Profile update error:', error);
      showToast({ type: 'error', message: 'Failed to update profile. Please try again.' });
    } finally {
      setEditLoading(false);
    }
  };

  // Diri ablihan ug kuhaon ang full profile.
  const fetchFullProfile = async () => {
    // Open immediately so current profile data/photo is visible without waiting for network.
    setShowProfileDetail(true);
    setProfileLoading(true);
    try {
      const freshUser = await refreshUser();
      if (freshUser) {
        setFullProfileData(freshUser);
      } else {
        showToast({ type: 'error', message: 'Failed to load profile data' });
      }
    } catch (error: any) {
      console.error('Profile fetch error:', error);
      showToast({ type: 'error', message: 'Failed to load profile data' });
    } finally {
      setProfileLoading(false);
    }
  };

  // Diri ablihan ang Facebook link.
  const handleOpenFacebook = () => {
    const facebookUrl = 'https://www.facebook.com/mark.lorence.loncion.2024';
    Linking.openURL(facebookUrl).catch((err) => {
      console.error('Failed to open Facebook:', err);
      showToast({ type: 'error', message: 'Unable to open Facebook' });
    });
    setShowContactModal(false);
  };

  // Diri ablihan ang Instagram link.
  const handleOpenInstagram = () => {
    const instagramUrl = 'https://www.instagram.com/shan.onlyme/?hl=en';
    Linking.openURL(instagramUrl).catch((err) => {
      console.error('Failed to open Instagram:', err);
      showToast({ type: 'error', message: 'Unable to open Instagram' });
    });
    setShowContactModal(false);
  };

  // Diri ablihan ang edit profile modal sa eksaktong na-save nga pin.
  const openEditModal = (profile: any) => {
    setEditName(profile?.name || '');
    setEditFirstName(profile?.firstname || '');
    setEditLastName(profile?.lastname || '');
    setEditMiddleName(profile?.middlename || '');
    setEditAge(profile?.age?.toString() || '');
    setEditPhone(profile?.phone_number || '');
    setEditFacebook(profile?.facebook || '');
    setEditBarangay(profile?.barangay_id || '');
    setEditZone(profile?.zone || '');
    setEditStreet(profile?.street || '');
    setEditStreetCoordinate(savedStreetCoordinate(profile));
    setEditProfilePhotoUrl(profile?.profile_photo_url || '');
    setEditPassword('');
    setAddressPickersReady(false);
    setEditMapKey((key) => key + 1);
    setShowEditModal(true);
  };

  // Diri moadto sa edit gikan sa profile detail.
  const handleEditFromProfileDetail = () => {
    setShowProfileDetail(false);
    // Let close animation finish before opening edit modal.
    setTimeout(() => {
      handleQuickEditProfile();
    }, 180);
  };

  // Diri dali nga ablihan ang edit profile gikan sa na-save nga coordinates.
  const handleQuickEditProfile = async () => {
    if (!token) {
      showToast({ type: 'error', message: 'Please login again.' });
      return;
    }

    setEditLocationLoading(true);
    setShowEditModal(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/user`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.data.success) {
        setShowEditModal(false);
        showToast({ type: 'error', message: 'Failed to load profile data' });
        return;
      }

      const profile = response.data.user || {};
      setFullProfileData(profile);
      openEditModal(profile);
    } catch (error) {
      setShowEditModal(false);
      showToast({ type: 'error', message: 'Failed to load profile data' });
    } finally {
      setEditLocationLoading(false);
    }
  };

  // Diri pilion ug i-upload ang profile photo.
  const handlePickProfilePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
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

      setUploadingProfilePhoto(true);
      const uploadedUrl = await uploadImageToCloudinary(result.assets[0].uri);
      setEditProfilePhotoUrl(uploadedUrl);
      showToast({ type: 'success', message: 'Profile photo uploaded.' });
    } catch (error: any) {
      console.error('Profile photo upload error:', error);
      showToast({ type: 'error', message: error?.message || 'Failed to upload profile photo.' });
    } finally {
      setUploadingProfilePhoto(false);
    }
  };

  // Diri mo-logout human sa confirm.
  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              await logout();
              showToast({ type: 'success', message: 'Logged out successfully' });
            } catch (error) {
              showToast({ type: 'error', message: 'Failed to logout. Please try again.' });
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  // Diri ang usa ka item sa menu.
  const MenuItem = ({ icon, label, color, onPress }: any) => (
    <TouchableOpacity
      className="flex-row items-center px-4 py-3.5 active:bg-slate-50 dark:active:bg-slate-700/50"
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: color + '20' }}>
        <MaterialIcons name={icon} size={20} color={color} />
      </View>
      <ThemedText className="flex-1 ml-3 text-slate-700 dark:text-slate-300 font-medium">
        {label}
      </ThemedText>
      <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
    </TouchableOpacity>
  );

  // Diri ang titulo sa matag section.
  const SectionHeader = ({ title }: { title: string }) => (
    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 mt-6 px-1">
      {title}
    </Text>
  );

  const resolvedBarangay =
    barangays.find((b) => String(b.id) === String(fullProfileData?.barangay_id || (user as any)?.barangay_id))?.name ||
    fullProfileData?.barangay ||
    (user as any)?.barangay ||
    '';
  const phoneDisplay = fullProfileData?.phone_number || (user as any)?.phone_number || '';
  const locationDisplay = [fullProfileData?.street || (user as any)?.street, resolvedBarangay, fullProfileData?.zone || (user as any)?.zone].filter(Boolean).join(' • ');
  const barangayName = resolvedBarangay || '-';

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 + layout.tabBarSpace }}
        {...NO_BOUNCE_SCROLL}
      >
        <AppScreenHeader>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <HeaderTitle eyebrow="Account" title="Profile" compact={layout.isCompact} />
            </View>
            <TouchableOpacity
              onPress={handleQuickEditProfile}
              activeOpacity={0.85}
              className="h-11 px-4 rounded-full flex-row items-center bg-navy"
            >
              <MaterialIcons name="edit" size={16} color="#ffffff" />
              <Text className="text-white text-[13px] font-bold ml-1.5">Edit</Text>
            </TouchableOpacity>
          </View>
        </AppScreenHeader>

        <View style={layout.contentStyle}>
          <View className="bg-white dark:bg-slate-800 rounded-3xl border border-line dark:border-slate-700 p-4 flex-row items-center">
            <View className="relative">
              <TouchableOpacity
                onPress={fetchFullProfile}
                className="w-20 h-20 rounded-full items-center justify-center overflow-hidden"
                style={{ backgroundColor: '#EEF6F8' }}
              >
                {hasProfilePhoto ? (
                  <Image
                    source={{ uri: profilePhotoUrl }}
                    className="w-20 h-20 rounded-full"
                    resizeMode="cover"
                    onError={() => setProfileImageError(true)}
                  />
                ) : (
                  <MaterialIcons name="person" size={40} color="#1F7A8C" />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleQuickEditProfile}
                className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full items-center justify-center bg-white border border-line"
              >
                <MaterialIcons name={profilePhotoUrl ? 'photo-camera' : 'add'} size={15} color="#1F7A8C" />
              </TouchableOpacity>
            </View>

            <View className="flex-1 ml-4">
              <Text className="text-[17px] font-extrabold text-navy dark:text-white" numberOfLines={2}>
                {user?.name || 'User'}
              </Text>
              <Text className="text-muted mt-0.5 text-[13px]" numberOfLines={1}>
                {user?.email || ''}
              </Text>
              {isAccountUnderReview(user) ? (
                <View className="mt-2 self-start rounded-full bg-amber-100 px-2.5 py-1">
                  <Text className="text-[11px] font-bold text-amber-800">Under Review</Text>
                </View>
              ) : user?.approval_status === 'approved' ? (
                <View className="mt-2 self-start rounded-full bg-emerald-100 px-2.5 py-1">
                  <Text className="text-[11px] font-bold text-emerald-800">Approved</Text>
                </View>
              ) : null}
              {(phoneDisplay || locationDisplay) ? (
                <View className="flex-row flex-wrap gap-1.5 mt-2">
                  {phoneDisplay ? (
                    <View className="flex-row items-center rounded-full bg-canvas px-2.5 py-1">
                      <MaterialIcons name="phone" size={12} color="#6B7280" />
                      <Text className="text-ink text-[11px] font-semibold ml-1">{phoneDisplay}</Text>
                    </View>
                  ) : null}
                  {locationDisplay ? (
                    <View className="flex-row items-center rounded-full bg-canvas px-2.5 py-1">
                      <MaterialIcons name="location-on" size={12} color="#6B7280" />
                      <Text className="text-ink text-[11px] font-semibold ml-1" numberOfLines={1}>
                        {locationDisplay}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View className="mt-4 pb-8" style={layout.contentStyle}>
          <View
            className="bg-white dark:bg-slate-800 rounded-3xl flex-row items-stretch border border-slate-100 dark:border-slate-700 mb-2"
            style={CARD_SHADOW}
          >
            <View className="flex-1 items-center py-3.5">
              <Text className="text-xl font-bold" style={{ color: '#1F7A8C' }}>
                {statsLoading ? '...' : totalAnimals}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">Animals</Text>
            </View>
            <View className="w-px my-3 bg-slate-100 dark:bg-slate-700" />
            <View className="flex-1 items-center py-3.5">
              <Text className="text-xl font-bold" style={{ color: '#1F7A8C' }}>
                {statsLoading ? '...' : totalVisits}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">Visits</Text>
            </View>
            <View className="w-px my-3 bg-slate-100 dark:bg-slate-700" />
            <View className="flex-1 items-center py-3.5">
              <Text className="text-xl font-bold" style={{ color: '#1F7A8C' }}>
                {statsLoading ? '...' : upcomingVisits}
              </Text>
              <Text className="text-slate-400 text-xs mt-0.5">Upcoming</Text>
            </View>
          </View>

          <Animated.View entering={FadeInDown.delay(40).duration(250)}>
            <SectionHeader title="Account" />
            <View
              className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-700"
              style={CARD_SHADOW}
            >
              {MENU_ITEMS.map((item, index) => (
                <View key={item.action}>
                  <MenuItem {...item} onPress={() => handleMenuPress(item.action)} />
                  {index < MENU_ITEMS.length - 1 && (
                    <View className="h-px bg-slate-100 dark:bg-slate-700 ml-14" />
                  )}
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(250)}>
            <SectionHeader title="Support" />
            <View
              className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-700"
              style={CARD_SHADOW}
            >
              {SUPPORT_ITEMS.map((item, index) => (
                <View key={item.label}>
                  <MenuItem {...item} onPress={() => handleMenuPress(item.action)} />
                  {index < SUPPORT_ITEMS.length - 1 && (
                    <View className="h-px bg-slate-100 dark:bg-slate-700 ml-14" />
                  )}
                </View>
              ))}
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(250)}>
            <TouchableOpacity
              onPress={handleLogout}
              disabled={loggingOut}
              activeOpacity={0.85}
              className="mt-6 bg-white dark:bg-slate-800 rounded-3xl p-4 flex-row items-center justify-center border border-slate-100 dark:border-slate-700"
              style={CARD_SHADOW}
            >
              {loggingOut ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <MaterialIcons name="logout" size={20} color="#ef4444" />
              )}
              <Text className="text-red-500 font-semibold ml-2">
                {loggingOut ? 'Logging out...' : 'Sign Out'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <View className="items-center mt-8">
            <Text className="text-slate-400 text-sm">ALAGANG ELSALVET v1.0.0</Text>
            <Text className="text-slate-300 text-xs mt-1">Made for pet owners</Text>
          </View>
        </View>
      </ScrollView>

      {/* Payment Modal */}
      <Modal
        visible={showPaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', paddingBottom: layout.bottomInset }}>
          <View className="bg-white dark:bg-slate-800 rounded-t-3xl overflow-hidden">
            <View className="border-b border-slate-100 bg-white px-6 pb-5 pt-6">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xl font-bold text-navy">Payment Methods</Text>
                  <Text className="mt-1 text-sm text-muted">How clinic payments work</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowPaymentModal(false)}
                  className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                >
                  <MaterialIcons name="close" size={22} color="#16324F" />
                </TouchableOpacity>
              </View>
            </View>
            <View className="px-6 py-5">
              <View
                className="w-12 h-12 rounded-2xl items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(4, 120, 87, 0.12)' }}
              >
                <MaterialIcons name="payments" size={24} color="#1F7A8C" />
              </View>
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Cash at clinic
              </Text>
              <Text className="text-base text-slate-700 dark:text-slate-300 leading-6 mb-6">
                You pay with cash for animal registration when you visit the vet clinic. This keeps things simple and safe so our team can focus on caring for your pets.
              </Text>
              <TouchableOpacity
                onPress={() => setShowPaymentModal(false)}
                className="mb-4 rounded-full bg-navy py-3.5"
              >
                <Text className="text-white font-semibold text-center">Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Profile Detail Modal */}
      <Modal
        visible={showProfileDetail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowProfileDetail(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', paddingBottom: layout.bottomInset }}>
          <View
            className="overflow-hidden rounded-t-3xl bg-white dark:bg-slate-800"
            style={{ height: layout.sheetMaxHeight }}
          >
            <View className="border-b border-slate-100 bg-white px-6 pb-5 pt-6">
              <View className="flex-row items-start justify-between">
                <View className="flex-row items-center flex-1 pr-4">
                  {hasProfilePhoto ? (
                    <Image
                      source={{ uri: profilePhotoUrl }}
                      className="w-14 h-14 rounded-2xl"
                      resizeMode="cover"
                      onError={() => setProfileImageError(true)}
                    />
                  ) : (
                    <View className="h-14 w-14 items-center justify-center rounded-2xl bg-teal-50">
                      <MaterialIcons name="person" size={28} color="#1F7A8C" />
                    </View>
                  )}
                  <View className="ml-3 flex-1">
                    <Text className="text-xl font-bold text-navy">
                      {fullProfileData?.name || user?.name || 'My Profile'}
                    </Text>
                    <Text className="mt-1 text-sm text-muted">
                      {fullProfileData?.email || user?.email || ''}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setShowProfileDetail(false)}
                  className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                >
                  <MaterialIcons name="close" size={22} color="#16324F" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              className="flex-1 px-6"
              contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
              {...NO_BOUNCE_SCROLL}
            >
              {profileLoading ? (
                <LoadingState label="Loading your profile" icon="person" />
              ) : (
                <>
                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Personal Info
                  </Text>
                  <View className="flex-row gap-3 mb-3">
                    <InfoTile label="First Name" value={fullProfileData?.firstname || '—'} />
                    <InfoTile label="Last Name" value={fullProfileData?.lastname || '—'} />
                  </View>
                  <View className="flex-row gap-3 mb-6">
                    <InfoTile label="Middle Name" value={fullProfileData?.middlename || '—'} />
                    <InfoTile label="Age" value={fullProfileData?.age || '—'} />
                  </View>

                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Contact
                  </Text>
                  <View className="flex-row gap-3 mb-3">
                    <InfoTile label="Phone" value={fullProfileData?.phone_number || '—'} />
                    <InfoTile label="Facebook" value={fullProfileData?.facebook || '—'} />
                  </View>
                  <View className="flex-row gap-3 mb-6">
                    <InfoTile label="Email" value={fullProfileData?.email || '—'} />
                  </View>

                  <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                    Address
                  </Text>
                  <View className="flex-row gap-3 mb-3">
                    <InfoTile label="Barangay" value={barangayName} />
                    <InfoTile label="Zone" value={fullProfileData?.zone || '—'} />
                  </View>
                  <View className="mb-6">
                    <InfoTile label="Location" value={fullProfileData?.street || '—'} />
                  </View>

                  <TouchableOpacity
                    onPress={handleEditFromProfileDetail}
                    className="mt-1 flex-row items-center justify-center rounded-full bg-navy py-3.5"
                  >
                    <MaterialIcons name="edit" size={18} color="#ffffff" />
                    <Text className="text-white font-semibold ml-2">Edit Profile</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShowProfileDetail(false)}
                    className="bg-slate-100 dark:bg-slate-700 rounded-xl py-3.5 mt-3 mb-8"
                  >
                    <Text className="text-slate-700 dark:text-slate-200 font-semibold text-center">Close</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!editLoading) setShowEditModal(false);
        }}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}>
          <View
            className="overflow-hidden rounded-t-3xl bg-white dark:bg-slate-800"
            style={{ height: layout.sheetMaxHeight }}
          >
            <View className="border-b border-slate-100 bg-white px-6 pb-5 pt-6">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xl font-bold text-navy">Edit Profile</Text>
                  <Text className="mt-1 text-sm text-muted">Update your account details</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowEditModal(false)}
                  disabled={editLoading}
                  className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                >
                  <MaterialIcons name="close" size={22} color="#16324F" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              className="flex-1 px-6"
              contentContainerStyle={{ paddingTop: 20, paddingBottom: 16 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              {...NO_BOUNCE_SCROLL}
            >
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Profile Photo
              </Text>
              <TouchableOpacity
                onPress={handlePickProfilePhoto}
                disabled={uploadingProfilePhoto}
                activeOpacity={0.85}
                className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl px-4 py-5 mb-5 border border-slate-100 dark:border-slate-700 items-center"
              >
                <View className="relative mb-3">
                  {editProfilePhotoUrl ? (
                    <Image source={{ uri: editProfilePhotoUrl }} className="w-24 h-24 rounded-full" resizeMode="cover" />
                  ) : (
                    <View className="w-24 h-24 rounded-full bg-slate-200 dark:bg-slate-600 items-center justify-center">
                      <MaterialIcons name="person" size={44} color="#64748b" />
                    </View>
                  )}
                  <View className="absolute -right-1 -bottom-1 h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-navy">
                    <MaterialIcons name={editProfilePhotoUrl ? 'photo-camera' : 'add'} size={16} color="#fff" />
                  </View>
                </View>
                {uploadingProfilePhoto ? (
                  <View className="flex-row items-center">
                    <ActivityIndicator color="#1F7A8C" />
                    <Text className="ml-2 text-blue-600 font-medium">Uploading...</Text>
                  </View>
                ) : (
                  <Text className="text-blue-600 font-medium">
                    {editProfilePhotoUrl ? 'Tap to replace photo' : 'Tap to add photo'}
                  </Text>
                )}
              </TouchableOpacity>

              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Personal Info
              </Text>

              <FormField label="Display Name">
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  className={INPUT_CLASS}
                  placeholder="Enter your name"
                  placeholderTextColor="#94a3b8"
                />
              </FormField>

              <View className="flex-row gap-3 mb-4">
                <FormField label="First Name" className="flex-1">
                  <TextInput
                    value={editFirstName}
                    onChangeText={setEditFirstName}
                    className={INPUT_CLASS}
                    placeholder="First name"
                    placeholderTextColor="#94a3b8"
                  />
                </FormField>
                <FormField label="Last Name" className="flex-1">
                  <TextInput
                    value={editLastName}
                    onChangeText={setEditLastName}
                    className={INPUT_CLASS}
                    placeholder="Last name"
                    placeholderTextColor="#94a3b8"
                  />
                </FormField>
              </View>

              <View className="flex-row gap-3 mb-4">
                <FormField label="Middle Name" className="flex-1">
                  <TextInput
                    value={editMiddleName}
                    onChangeText={setEditMiddleName}
                    className={INPUT_CLASS}
                    placeholder="Optional"
                    placeholderTextColor="#94a3b8"
                  />
                </FormField>
                <FormField label="Age" className="flex-1">
                  <TextInput
                    value={editAge}
                    onChangeText={setEditAge}
                    className={INPUT_CLASS}
                    placeholder="Age"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                  />
                </FormField>
              </View>

              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 mt-1">
                Contact
              </Text>

              <FormField label="Phone Number">
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  className={INPUT_CLASS}
                  placeholder="Enter phone number"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                />
              </FormField>

              <FormField label="Facebook">
                <TextInput
                  value={editFacebook}
                  onChangeText={setEditFacebook}
                  className={INPUT_CLASS}
                  placeholder="Enter Facebook name"
                  placeholderTextColor="#94a3b8"
                />
              </FormField>

              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 mt-1">
                Address
              </Text>

              <FormField label="Barangay">
                <View className="bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden">
                  <Picker
                    selectedValue={editBarangay}
                    onValueChange={(itemValue: string) => {
                      // The picker can report a blank value while it mounts. That is not a user change.
                      if (!addressPickersReady) return;
                      if (!itemValue || String(itemValue) === String(editBarangay)) return;
                      setEditZone('');
                      setEditBarangay(itemValue);
                    }}
                    style={{
                      color: colorScheme === 'dark' ? '#e2e8f0' : '#1e293b',
                      backgroundColor: 'transparent',
                    }}
                  >
                    <Picker.Item label="Select Barangay" value="" />
                    {barangays.map((barangay) => (
                      <Picker.Item key={barangay.id} label={barangay.name} value={barangay.id} />
                    ))}
                  </Picker>
                </View>
              </FormField>

              <FormField label="Zone">
                <View
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden"
                  style={{ opacity: editBarangay ? 1 : 0.55 }}
                  pointerEvents={editBarangay ? 'auto' : 'none'}
                >
                  <Picker
                    enabled={!!editBarangay}
                    selectedValue={editZone}
                    onValueChange={(itemValue: string) => {
                      if (!addressPickersReady) return;
                      if (!itemValue || itemValue === editZone) return;
                      setEditZone(itemValue);
                    }}
                    style={{
                      color: colorScheme === 'dark' ? '#e2e8f0' : '#1e293b',
                      backgroundColor: 'transparent',
                    }}
                  >
                    <Picker.Item label={editBarangay ? 'Select Zone' : 'Select a barangay first'} value="" />
                    {zones
                      .filter((zoneOption) => String(zoneOption.barangay_id) === String(editBarangay))
                      .map((zoneOption) => (
                        <Picker.Item key={zoneOption.id} label={zoneOption.name} value={zoneOption.name} />
                      ))}
                    {!!editZone &&
                      !zones.some(
                        (zoneOption) =>
                          zoneOption.name === editZone &&
                          String(zoneOption.barangay_id) === String(editBarangay)
                      ) && <Picker.Item label={editZone} value={editZone} />}
                  </Picker>
                </View>
              </FormField>

              <FormField label="Location" className="mb-6">
                <ElSalvadorPlaceField
                  key={editMapKey}
                  value={editStreet}
                  barangay={barangays.find((item) => String(item.id) === String(editBarangay))?.name || ''}
                  zone={editZone}
                  showMap
                  pinnedCoordinate={editStreetCoordinate}
                  locatingSaved={editLocationLoading}
                  onChange={(place) => {
                    setEditStreet(place);
                    if (!place) setEditStreetCoordinate(null);
                  }}
                  onResolvedPlace={(place) => {
                    if (!place) {
                      setEditStreetCoordinate(null);
                      return;
                    }
                    setEditStreet(place.label);
                    setEditStreetCoordinate(place.coordinate);
                  }}
                />
              </FormField>
            </ScrollView>

            <View
              className="border-t border-slate-100 bg-white px-6 pt-3 dark:border-slate-700 dark:bg-slate-800"
              style={{ paddingBottom: Math.max(layout.bottomInset, 12) }}
            >
              <TouchableOpacity
                onPress={handleSaveProfile}
                className="flex-row items-center justify-center rounded-full bg-navy py-3.5"
                disabled={editLoading}
                style={{ opacity: editLoading ? 0.85 : 1 }}
              >
                {editLoading ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                <Text className={`text-center font-semibold text-white ${editLoading ? 'ml-2' : ''}`}>
                  {editLoading ? 'Saving...' : 'Save Changes'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowEditModal(false)}
                className="mt-2 rounded-full bg-slate-100 py-3.5 dark:bg-slate-700"
                disabled={editLoading}
              >
                <Text className="text-center font-semibold text-slate-700 dark:text-slate-200">Cancel</Text>
              </TouchableOpacity>
            </View>
            {editLoading ? (
              <View
                className="absolute inset-0 items-center justify-center"
                style={{ backgroundColor: colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.92)' }}
              >
                <ActivityIndicator size="large" color={colorScheme === 'dark' ? '#ffffff' : '#16324F'} />
                <Text className={`mt-3 text-base font-semibold ${colorScheme === 'dark' ? 'text-white' : 'text-navy'}`}>
                  Saving profile...
                </Text>
                <Text className={`mt-1 text-sm ${colorScheme === 'dark' ? 'text-slate-300' : 'text-slate-500'}`}>
                  Please wait
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Contact Modal */}
      <Modal
        visible={showContactModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowContactModal(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', paddingBottom: layout.bottomInset }}>
          <View className="bg-white dark:bg-slate-800 rounded-t-3xl overflow-hidden">
            <View className="border-b border-slate-100 bg-white px-6 pb-5 pt-6">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xl font-bold text-navy">Contact Us</Text>
                  <Text className="mt-1 text-sm text-muted">Reach us on social media</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowContactModal(false)}
                  className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                >
                  <MaterialIcons name="close" size={22} color="#16324F" />
                </TouchableOpacity>
              </View>
            </View>
            <View className="px-6 py-5">
              <Text className="text-sm text-slate-600 dark:text-slate-300 leading-6 mb-5">
                Follow our social accounts for updates and support.
              </Text>

              <TouchableOpacity
                onPress={handleOpenFacebook}
                activeOpacity={0.85}
                className="flex-row items-center bg-white dark:bg-slate-900/40 rounded-3xl p-4 mb-3 border border-slate-100 dark:border-slate-700"
                style={CARD_SHADOW}
              >
                <View className="w-10 h-10 rounded-xl items-center justify-center bg-blue-50 dark:bg-blue-900/20">
                  <MaterialIcons name="facebook" size={22} color="#1F7A8C" />
                </View>
                <Text className="text-slate-800 dark:text-white font-semibold ml-3 flex-1">Facebook</Text>
                <MaterialIcons name="open-in-new" size={18} color="#94a3b8" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleOpenInstagram}
                activeOpacity={0.85}
                className="flex-row items-center bg-white dark:bg-slate-900/40 rounded-3xl p-4 mb-5 border border-slate-100 dark:border-slate-700"
                style={CARD_SHADOW}
              >
                <View className="w-10 h-10 rounded-xl items-center justify-center bg-slate-100 dark:bg-slate-700">
                  <MaterialIcons name="photo-camera" size={22} color="#475569" />
                </View>
                <Text className="text-slate-800 dark:text-white font-semibold ml-3 flex-1">Instagram</Text>
                <MaterialIcons name="open-in-new" size={18} color="#94a3b8" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setShowContactModal(false)}
                className="bg-slate-100 dark:bg-slate-700 rounded-xl py-3.5 mb-4"
              >
                <Text className="text-slate-700 dark:text-slate-200 font-semibold text-center">Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}
