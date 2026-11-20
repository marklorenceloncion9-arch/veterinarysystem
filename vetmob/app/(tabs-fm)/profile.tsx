import { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Text,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import { API_BASE_URL } from '@/config/api';
import { showToast } from '@/components/Toast';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import { AppScreenHeader } from '@/components/AppScreenHeader';
import { FIELDMAN_THEME } from '@/components/fieldman/fieldmanTheme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 4,
  elevation: 2,
} as const;

const NO_BOUNCE_SCROLL = {
  bounces: false,
  overScrollMode: 'never' as const,
};

const INPUT_CLASS =
  'bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3 text-slate-800 dark:text-slate-200';

const imageMediaTypes: any = (ImagePicker as any).MediaType?.Images
  ? [(ImagePicker as any).MediaType.Images]
  : (ImagePicker as any).MediaTypeOptions.Images;

// Diri i-format ang petsa para ipakita.
const formatDate = (value?: string) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return value;
  }
};

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
  if (raw.startsWith('/')) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
};

// Diri ang profile screen sa fieldman.
export default function FieldmanProfileScreen() {
  const { user, logout, token, refreshUser } = useAuth();
  const router = useRouter();
  const layout = useResponsiveLayout();
  const colorScheme = useColorScheme();
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [photoError, setPhotoError] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [editName, setEditName] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editMiddleName, setEditMiddleName] = useState('');
  const [editAge, setEditAge] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editFacebook, setEditFacebook] = useState('');
  const [editBarangay, setEditBarangay] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editProfilePhotoUrl, setEditProfilePhotoUrl] = useState('');
  const [barangays, setBarangays] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);

  // Diri i-set ang profile data sa state.
  const applyProfile = useCallback((nextProfile: any) => {
    setProfile(nextProfile);
    setPhotoError(false);
  }, []);

  // Diri kuhaon ang profile sa fieldman.
  const fetchProfile = useCallback(async () => {
    if (!token) {
      setProfileLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/user`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.data?.success) {
        applyProfile(response.data.user);
      }
    } catch (error) {
      console.error('Fieldman profile fetch error:', error);
    } finally {
      setProfileLoading(false);
    }
  }, [applyProfile, token]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useFocusEffect(
    useCallback(() => {
      refreshUser().then((freshUser) => {
        if (freshUser) applyProfile(freshUser);
      });
    }, [applyProfile, refreshUser])
  );

  useEffect(() => {
    // Diri kuhaon ang lista sa barangay ug zone.
    const loadLookups = async () => {
      try {
        const [barangayRes, zoneRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/mobile/barangays`),
          axios.get(`${API_BASE_URL}/api/mobile/zones`),
        ]);
        if (barangayRes.data?.success) setBarangays(barangayRes.data.barangays || []);
        if (zoneRes.data?.success) setZones(zoneRes.data.zones || []);
      } catch (error) {
        console.error('Failed to load address lookups:', error);
      }
    };
    loadLookups();
  }, []);

  const displayName =
    profile?.name ||
    [profile?.firstname, profile?.middlename, profile?.lastname].filter(Boolean).join(' ') ||
    user?.name ||
    'Fieldman';

  const barangayName =
    barangays.find((item) => String(item.id) === String(profile?.barangay_id || profile?.barangay?.id))?.name ||
    (typeof profile?.barangay === 'string' ? profile.barangay : profile?.barangay?.name) ||
    (user as any)?.barangay ||
    '';
  const photoUrl = normalizePhotoUrl(profile?.profile_photo_url || (user as any)?.profile_photo_url || '');
  const hasPhoto = !!photoUrl && !photoError;
  const phoneDisplay = profile?.phone_number || (user as any)?.phone_number || '';
  const emailDisplay = profile?.email || user?.email || '';
  const memberSince = formatDate(profile?.created_at);
  const locationDisplay = [barangayName, profile?.zone].filter(Boolean).join(' • ');
  const photoSize = layout.isCompact ? 80 : 96;

  // Diri pun-on ang edit form sa profile data.
  const fillEditForm = (source: any) => {
    setEditName(source?.name || '');
    setEditFirstName(source?.firstname || '');
    setEditLastName(source?.lastname || '');
    setEditMiddleName(source?.middlename || '');
    setEditAge(source?.age != null ? String(source.age) : '');
    setEditPhone(source?.phone_number || '');
    setEditFacebook(source?.facebook || '');
    setEditBarangay(String(source?.barangay_id || source?.barangay?.id || ''));
    setEditZone(source?.zone || '');
    setEditProfilePhotoUrl(normalizePhotoUrl(source?.profile_photo_url || ''));
  };

  // Diri ablihan ang edit profile.
  const handleOpenEdit = () => {
    if (!profile) {
      showToast({ type: 'error', message: 'Profile is still loading.' });
      return;
    }
    fillEditForm(profile);
    setShowEditModal(true);
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

  // Diri i-save ang gi-edit nga profile.
  const handleSaveProfile = async () => {
    const firstName = editFirstName.trim();
    const lastName = editLastName.trim();
    const nextName = editName.trim() || [firstName, lastName].filter(Boolean).join(' ');

    if (!nextName) {
      showToast({ type: 'error', message: 'Name is required.' });
      return;
    }

    setEditLoading(true);
    try {
      const updateData: any = {
        name: nextName,
        firstname: firstName,
        lastname: lastName,
        middlename: editMiddleName.trim(),
        phone_number: editPhone.trim(),
        facebook: editFacebook.trim(),
        zone: editZone,
        profile_photo_url: editProfilePhotoUrl || null,
      };

      if (editAge) updateData.age = parseInt(editAge, 10);
      if (editBarangay) updateData.barangay_id = editBarangay;

      const response = await axios.put(`${API_BASE_URL}/api/mobile/user`, updateData, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.data?.success) {
        showToast({ type: 'error', message: response.data?.error || 'Failed to update profile.' });
        return;
      }

      applyProfile(response.data.user);
      await refreshUser();
      setShowEditModal(false);
      showToast({ type: 'success', message: 'Profile updated successfully.' });
    } catch (error) {
      console.error('Fieldman profile update error:', error);
      showToast({ type: 'error', message: 'Failed to update profile. Please try again.' });
    } finally {
      setEditLoading(false);
    }
  };

  // Diri mo-logout human sa confirm.
  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          try {
            await logout();
            router.replace('/(auth)/login');
            showToast({ type: 'success', message: 'Signed out successfully.' });
          } catch {
            showToast({ type: 'error', message: 'Failed to logout. Please try again.' });
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 + layout.tabBarSpace }}
        {...NO_BOUNCE_SCROLL}
      >
        <AppScreenHeader extraPaddingBottom={24} showFieldmanAccent>
          <View className="flex-row items-center justify-between mb-5">
            <View className="flex-1 pr-3">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-muted">Field staff</Text>
              <Text className="mt-1 text-lg font-extrabold text-navy">Profile</Text>
            </View>
            <TouchableOpacity
              onPress={handleOpenEdit}
              activeOpacity={0.85}
              className="h-10 px-3 rounded-full flex-row items-center bg-navy"
            >
              <MaterialIcons name="edit" size={16} color="#ffffff" />
              <Text className="text-white text-xs font-semibold ml-1.5">Edit</Text>
            </TouchableOpacity>
          </View>

          <View className="flex-row items-center">
            <View className="relative">
              <View
                className="bg-white rounded-full items-center justify-center overflow-hidden border-2 border-white/40"
                style={[{ width: photoSize, height: photoSize }, CARD_SHADOW]}
              >
                {hasPhoto ? (
                  <Image
                    source={{ uri: photoUrl }}
                    style={{ width: photoSize, height: photoSize, borderRadius: photoSize / 2 }}
                    resizeMode="cover"
                    onError={() => setPhotoError(true)}
                  />
                ) : (
                  <MaterialIcons name="person" size={layout.isCompact ? 36 : 48} color={FIELDMAN_THEME.primary} />
                )}
              </View>
              <TouchableOpacity
                onPress={handleOpenEdit}
                className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full items-center justify-center bg-white"
                style={CARD_SHADOW}
              >
                <MaterialIcons name={hasPhoto ? 'photo-camera' : 'add'} size={16} color={FIELDMAN_THEME.primary} />
              </TouchableOpacity>
            </View>

            <View className="flex-1 ml-4">
              {profileLoading ? (
                <ActivityIndicator color={FIELDMAN_THEME.primary} />
              ) : (
                <>
                  <Text className={`${layout.titleClass} font-bold text-navy`} numberOfLines={2}>
                    {displayName}
                  </Text>
                  <View className="mt-2 self-start rounded-full bg-emerald-100 px-2.5 py-1">
                    <Text className="text-[11px] font-bold text-emerald-800">Fieldman</Text>
                  </View>
                  {emailDisplay ? (
                    <Text className="mt-1.5 text-sm text-muted" numberOfLines={1}>
                      {emailDisplay}
                    </Text>
                  ) : null}
                  {(phoneDisplay || locationDisplay) ? (
                    <View className="mt-2.5 flex-row flex-wrap gap-2">
                      {phoneDisplay ? (
                        <View className="flex-row items-center rounded-full border border-slate-200 bg-white px-2 py-1">
                          <MaterialIcons name="phone" size={12} color="#6B7280" />
                          <Text className="ml-1 text-[11px] font-medium text-navy">{phoneDisplay}</Text>
                        </View>
                      ) : null}
                      {locationDisplay ? (
                        <View className="flex-row items-center rounded-full border border-slate-200 bg-white px-2 py-1">
                          <MaterialIcons name="location-on" size={12} color="#6B7280" />
                          <Text className="ml-1 text-[11px] font-medium text-navy" numberOfLines={1}>
                            {locationDisplay}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </View>
          </View>
        </AppScreenHeader>

        <View className="mt-4 pb-8" style={layout.contentStyle}>
          <Animated.View entering={FadeInDown.delay(40).duration(250)} className="mb-4">
            <View
              className="bg-white dark:bg-slate-800 rounded-3xl p-4 border border-slate-100 dark:border-slate-700"
              style={CARD_SHADOW}
            >
              <SectionTitle icon="badge" title="Personal Info" />
              <View className="flex-row gap-3 mb-3">
                <InfoTile label="First Name" value={profile?.firstname || '—'} />
                <InfoTile label="Last Name" value={profile?.lastname || '—'} />
              </View>
              <View className="flex-row gap-3">
                <InfoTile label="Middle Name" value={profile?.middlename || '—'} />
                <InfoTile label="Age" value={profile?.age ? String(profile.age) : '—'} />
              </View>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(250)} className="mb-4">
            <View
              className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-700"
              style={CARD_SHADOW}
            >
              <View className="px-4 pt-4 pb-1">
                <SectionTitle icon="call" title="Contact" />
              </View>
              <ProfileRow icon="phone" label="Phone" value={phoneDisplay || '—'} />
              <ProfileRow icon="facebook" label="Facebook" value={profile?.facebook || '—'} />
              <ProfileRow icon="email" label="Email" value={emailDisplay || '—'} last />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(250)} className="mb-4">
            <View
              className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-700"
              style={CARD_SHADOW}
            >
              <View className="px-4 pt-4 pb-1">
                <SectionTitle icon="place" title="Address" />
              </View>
              <ProfileRow icon="map" label="Barangay" value={barangayName || '—'} />
              <ProfileRow icon="location-on" label="Zone" value={profile?.zone || '—'} last />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(250)} className="mb-4">
            <View
              className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-700"
              style={CARD_SHADOW}
            >
              <View className="px-4 pt-4 pb-1">
                <SectionTitle icon="manage-accounts" title="Account" />
              </View>
              <ProfileRow icon="work" label="Role" value="Fieldman" />
              <ProfileRow icon="event" label="Member Since" value={memberSince || '—'} last />
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(200).duration(250)}>
            <TouchableOpacity
              onPress={handleLogout}
              disabled={loggingOut}
              activeOpacity={0.85}
              className="bg-white dark:bg-slate-800 rounded-3xl py-4 px-4 flex-row items-center justify-center border border-slate-100 dark:border-slate-700"
              style={CARD_SHADOW}
            >
              {loggingOut ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <MaterialIcons name="logout" size={20} color="#ef4444" />
              )}
              <Text className="ml-2 text-red-500 font-semibold">
                {loggingOut ? 'Logging out...' : 'Sign Out'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ScrollView>

      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            className="flex-1 justify-end"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
          >
            <View
              className="overflow-hidden rounded-t-3xl bg-white dark:bg-slate-800"
              style={{ height: layout.sheetMaxHeight }}
            >
              <View className="border-b border-slate-100 bg-white px-5 pb-4 pt-5">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-4">
                    <Text className="text-xl font-bold text-navy">Edit Profile</Text>
                    <Text className="mt-1 text-sm text-muted">Update your field staff details</Text>
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
                className="flex-1 px-5 pt-4"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 16 }}
                {...NO_BOUNCE_SCROLL}
              >
                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Profile Photo
                </Text>
                <TouchableOpacity
                  onPress={handlePickProfilePhoto}
                  disabled={uploadingProfilePhoto}
                  activeOpacity={0.85}
                  className="bg-slate-50 dark:bg-slate-900/40 rounded-2xl px-4 py-4 mb-4 border border-slate-100 dark:border-slate-700 items-center"
                >
                  <View className="relative mb-2">
                    {editProfilePhotoUrl ? (
                      <Image source={{ uri: editProfilePhotoUrl }} className="w-20 h-20 rounded-full" resizeMode="cover" />
                    ) : (
                      <View className="w-20 h-20 rounded-full bg-slate-200 dark:bg-slate-600 items-center justify-center">
                        <MaterialIcons name="person" size={36} color="#64748b" />
                      </View>
                    )}
                    <View className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-teal border-2 border-white items-center justify-center">
                      <MaterialIcons name={editProfilePhotoUrl ? 'photo-camera' : 'add'} size={14} color="#fff" />
                    </View>
                  </View>
                  {uploadingProfilePhoto ? (
                    <View className="flex-row items-center">
                      <ActivityIndicator color={FIELDMAN_THEME.primary} />
                      <Text className="ml-2 font-medium" style={{ color: FIELDMAN_THEME.primary }}>
                        Uploading...
                      </Text>
                    </View>
                  ) : (
                    <Text className="font-medium" style={{ color: FIELDMAN_THEME.primary }}>
                      {editProfilePhotoUrl ? 'Tap to replace photo' : 'Tap to add photo'}
                    </Text>
                  )}
                </TouchableOpacity>

                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
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

                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-1">
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

                <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 mt-1">
                  Address
                </Text>

                <FormField label="Barangay">
                  <View className="bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden">
                    <Picker
                      selectedValue={editBarangay}
                      onValueChange={(itemValue: string) => {
                        if (String(itemValue) !== String(editBarangay)) {
                          setEditZone('');
                        }
                        setEditBarangay(itemValue);
                      }}
                      style={{
                        color: colorScheme === 'dark' ? '#e2e8f0' : '#1e293b',
                        backgroundColor: 'transparent',
                      }}
                    >
                      <Picker.Item label="Select Barangay" value="" />
                      {barangays.map((barangay) => (
                        <Picker.Item key={barangay.id} label={barangay.name} value={String(barangay.id)} />
                      ))}
                    </Picker>
                  </View>
                </FormField>

                <FormField label="Zone" className="mb-2">
                  <View className="bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden">
                    <Picker
                      selectedValue={editZone}
                      onValueChange={(itemValue: string) => setEditZone(itemValue)}
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
              </ScrollView>

              <View
                className="border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 pt-3"
                style={{ paddingBottom: Math.max(layout.bottomInset, 12) + 8 }}
              >
                <TouchableOpacity
                  onPress={handleSaveProfile}
                  className="rounded-full bg-navy py-3.5"
                  style={{ opacity: editLoading ? 0.7 : 1 }}
                  disabled={editLoading || uploadingProfilePhoto}
                >
                  <Text className="text-white font-semibold text-center">
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowEditModal(false)}
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl py-3.5 mt-2"
                  disabled={editLoading}
                >
                  <Text className="text-slate-700 dark:text-slate-200 font-semibold text-center">Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ThemedView>
  );
}

// Diri ang titulo sa section nga naay icon.
function SectionTitle({
  icon,
  title,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
}) {
  return (
    <View className="flex-row items-center mb-3">
      <View className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-navy/20 items-center justify-center mr-2.5">
        <MaterialIcons name={icon} size={18} color={FIELDMAN_THEME.primary} />
      </View>
      <Text className="text-sm font-bold text-slate-800 dark:text-white">{title}</Text>
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

// Diri ang tile nga nagpakita og info.
function InfoTile({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900/40 rounded-xl px-3.5 py-3.5 border border-slate-100 dark:border-slate-700">
      <Text className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{label}</Text>
      <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1.5" numberOfLines={3}>
        {value || '—'}
      </Text>
    </View>
  );
}

// Diri ang usa ka row sa profile info.
function ProfileRow({
  icon,
  label,
  value,
  last = false,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View className={`px-4 py-4 flex-row items-center ${last ? '' : 'border-b border-slate-100 dark:border-slate-700'}`}>
      <View className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-navy/20 items-center justify-center mr-3">
        <MaterialIcons name={icon} size={18} color={FIELDMAN_THEME.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-xs font-semibold text-slate-400 uppercase">{label}</Text>
        <Text className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">{value}</Text>
      </View>
    </View>
  );
}
