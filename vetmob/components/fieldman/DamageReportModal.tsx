import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import axios from 'axios';
import { LoadingState } from '@/components/LoadingState';
import { API_BASE_URL } from '@/config/api';
import { showToast } from '@/components/Toast';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import { FIELDMAN_THEME } from '@/components/fieldman/fieldmanTheme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

const DEFAULT_DAMAGE_REASONS = [
  'Broken / cracked packaging',
  'Contaminated or spoiled',
  'Dropped / physically damaged',
  'Leaking container',
  'Other field damage — needs review',
] as const;

const DEFAULT_DAMAGE_REASON = DEFAULT_DAMAGE_REASONS[0];
const MAX_EVIDENCE_PHOTOS = 3;

interface InventoryBatch {
  id: number;
  medicine_id?: number;
  quantity: number | string;
  quantity_display?: number | string | null;
  is_vial?: boolean;
  is_expired?: boolean;
  is_usable?: boolean;
  medicine?: {
    id?: number;
    name?: string;
  } | null;
  unit?: {
    id?: number;
    name?: string;
  } | null;
}

interface MedicineOption {
  id: number;
  name: string;
  quantity: number;
  quantity_display: number;
  is_vial: boolean;
  unit_name: string;
}

interface EvidencePhoto {
  id: string;
  uri: string;
  url: string | null;
}

interface DamageReportModalProps {
  visible: boolean;
  token: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

// Diri susihon kung vial ang batch.
function isVialBatch(batch: InventoryBatch | null | undefined) {
  if (!batch) return false;
  if (batch.is_vial) return true;
  return /\bvial/i.test(String(batch.unit?.name || ''));
}

// Diri kwentahon ang gidaghanon sa vial nga ipakita.
function vialCountDisplay(quantity: number | string | null | undefined) {
  const qty = Number(quantity || 0);
  if (qty <= 0) return 0;
  return Math.ceil(qty - 0.0000001);
}

// Diri ang modal para mag-report og nadaot nga tambal.
export default function DamageReportModal({
  visible,
  token,
  onClose,
  onSubmitted,
}: DamageReportModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [medicines, setMedicines] = useState<MedicineOption[]>([]);
  const [medicineId, setMedicineId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState(DEFAULT_DAMAGE_REASON);
  const [evidencePhotos, setEvidencePhotos] = useState<EvidencePhoto[]>([]);
  const layout = useResponsiveLayout();

  // Diri i-reset ang damage report form.
  const resetForm = useCallback(() => {
    setMedicineId('');
    setQuantity('');
    setReason(DEFAULT_DAMAGE_REASON);
    setEvidencePhotos([]);
  }, []);

  // Diri kuhaon ang inventory para sa report.
  const fetchInventory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/fieldman/inventory`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to load inventory');
      }

      const items = (response.data.inventory || []) as InventoryBatch[];
      const byMedicine = new Map<number, MedicineOption>();

      items.forEach((item) => {
        const mid = Number(item.medicine_id || item.medicine?.id || 0);
        const name = item.medicine?.name || 'Unknown medicine';
        if (!mid || Number(item.quantity) <= 0 || item.is_expired) return;

        const vial = isVialBatch(item);
        if (!byMedicine.has(mid)) {
          byMedicine.set(mid, {
            id: mid,
            name,
            quantity: 0,
            quantity_display: 0,
            is_vial: vial,
            unit_name: vial ? 'vials' : item.unit?.name || 'units',
          });
        }

        const medicine = byMedicine.get(mid)!;
        medicine.quantity += Number(item.quantity || 0);
        medicine.quantity_display += vial
          ? vialCountDisplay(item.quantity_display ?? item.quantity)
          : Number(item.quantity || 0);
        if (vial) {
          medicine.is_vial = true;
          medicine.unit_name = 'vials';
        }
      });

      const options = Array.from(byMedicine.values()).sort((a, b) => a.name.localeCompare(b.name));
      setMedicines(options);
    } catch (error) {
      console.error('Failed to load inventory for damage report:', error);
      showToast({ type: 'error', message: 'Failed to load inventory items.' });
      setMedicines([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!visible) return;
    resetForm();
    fetchInventory();
  }, [visible, fetchInventory, resetForm]);

  const selectedMedicine = useMemo(
    () => medicines.find((item) => item.id === medicineId) || null,
    [medicines, medicineId]
  );

  const selectedIsVial = Boolean(selectedMedicine?.is_vial);
  const availableVials = selectedIsVial ? selectedMedicine?.quantity_display ?? 0 : null;
  const availableExact = Number(selectedMedicine?.quantity || 0);
  const remainingPhotoSlots = MAX_EVIDENCE_PHOTOS - evidencePhotos.length;

  // Diri mokuha og litrato nga ebidensya.
  const pickEvidence = async (useCamera: boolean) => {
    if (remainingPhotoSlots <= 0) {
      showToast({ type: 'error', message: `You can attach up to ${MAX_EVIDENCE_PHOTOS} photos.` });
      return;
    }

    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        showToast({
          type: 'error',
          message: useCamera ? 'Camera permission is required.' : 'Photo library permission is required.',
        });
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsEditing: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsMultipleSelection: true,
            selectionLimit: remainingPhotoSlots,
          });

      if (result.canceled || !result.assets?.length) return;

      const nextPhotos = result.assets
        .slice(0, remainingPhotoSlots)
        .filter((asset) => asset.uri)
        .map((asset) => ({
          id: `${Date.now()}-${asset.uri}`,
          uri: asset.uri,
          url: null,
        }));

      if (!nextPhotos.length) return;

      setEvidencePhotos((prev) => [...prev, ...nextPhotos]);
      setUploading(true);
      try {
        const uploaded = await Promise.all(
          nextPhotos.map(async (photo) => ({
            ...photo,
            url: await uploadImageToCloudinary(photo.uri),
          }))
        );
        setEvidencePhotos((prev) =>
          prev.map((photo) => uploaded.find((item) => item.id === photo.id) || photo)
        );
      } catch (error: any) {
        setEvidencePhotos((prev) => prev.filter((photo) => !nextPhotos.some((item) => item.id === photo.id)));
        showToast({ type: 'error', message: error?.message || 'Failed to upload photo.' });
      } finally {
        setUploading(false);
      }
    } catch (error) {
      console.error('Evidence picker failed:', error);
      showToast({ type: 'error', message: 'Could not open the camera or gallery.' });
    }
  };

  // Diri tangtangon ang litrato sa ebidensya.
  const removeEvidence = (id: string) => {
    setEvidencePhotos((prev) => prev.filter((photo) => photo.id !== id));
  };

  // Diri i-submit ang damage report.
  const handleSubmit = async () => {
    if (!token) {
      showToast({ type: 'error', message: 'Please sign in again.' });
      return;
    }
    if (!medicineId || !quantity.trim() || !reason.trim()) {
      showToast({
        type: 'error',
        message: 'Select medicine, enter quantity, and describe the damage.',
      });
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast({ type: 'error', message: 'Enter a valid damaged quantity.' });
      return;
    }

    if (selectedIsVial) {
      if (!Number.isInteger(qty)) {
        showToast({ type: 'error', message: 'Enter damaged quantity in whole vials.' });
        return;
      }
      if (qty > availableExact) {
        Alert.alert(
          'Insufficient stock',
          `Damaged quantity cannot exceed current stock (${availableVials} ${
            availableVials === 1 ? 'vial' : 'vials'
          }).`
        );
        return;
      }
    } else if (qty > availableExact) {
      Alert.alert(
        'Insufficient stock',
        `Damaged quantity cannot exceed current stock (${availableExact} ${
          selectedMedicine?.unit_name || 'units'
        }).`
      );
      return;
    }

    const evidenceUrls = evidencePhotos.map((photo) => photo.url).filter((url): url is string => Boolean(url));

    setSubmitting(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/mobile/fieldman/damage-reports`,
        {
          medicine_id: medicineId,
          quantity: qty,
          reason: reason.trim(),
          evidence_image_url: evidenceUrls[0] || null,
          evidence_image_urls: evidenceUrls,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        }
      );

      if (!response.data?.success) {
        throw new Error(response.data?.message || 'Failed to submit damage report');
      }

      showToast({
        type: 'success',
        message: 'Damage report submitted for review. Inventory was not deducted.',
      });
      resetForm();
      onSubmitted?.();
      onClose();
    } catch (error: any) {
      const message =
        error?.response?.data?.message || error?.message || 'Failed to submit damage report.';
      if (error?.response?.data?.code === 'insufficient_stock') {
        Alert.alert('Insufficient stock', message);
      } else {
        showToast({ type: 'error', message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-canvas">
        <View
          className="border-b border-slate-200 bg-white pb-4"
          style={{
            paddingTop: layout.headerPaddingTop,
            paddingHorizontal: layout.headerGutter,
          }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-muted">Inventory</Text>
              <Text className={`mt-1 ${layout.titleClass} font-bold text-navy`}>New damage report</Text>
              <Text className="mt-1 text-sm text-muted">
                Submit for budget review. Stock is deducted from the oldest batch first when approved.
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
            >
              <MaterialIcons name="close" size={22} color="#16324F" />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <LoadingState label="Loading inventory" icon="inventory-2" style={{ flex: 1 }} />
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerStyle={[layout.scrollContent, { paddingTop: 16 }]}
            keyboardShouldPersistTaps="handled"
          >
            <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Medicine / item</Text>
              <View className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <Picker
                  selectedValue={medicineId}
                  onValueChange={(value) => {
                    setMedicineId(value);
                    setQuantity('');
                  }}
                >
                  <Picker.Item label="Select medicine" value="" />
                  {medicines.map((medicine) => (
                    <Picker.Item key={medicine.id} label={medicine.name} value={medicine.id} />
                  ))}
                </Picker>
              </View>
            </View>

            <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                {selectedIsVial ? 'Damaged quantity (vials)' : 'Damaged quantity'}
              </Text>
              <TextInput
                value={quantity}
                onChangeText={(text) => {
                  if (selectedIsVial) {
                    setQuantity(text.replace(/[^\d]/g, ''));
                    return;
                  }
                  setQuantity(text);
                }}
                keyboardType={selectedIsVial ? 'number-pad' : 'decimal-pad'}
                placeholder={
                  selectedMedicine
                    ? selectedIsVial
                      ? `Available: ${availableVials} ${availableVials === 1 ? 'vial' : 'vials'}`
                      : `Available: ${selectedMedicine.quantity} ${selectedMedicine.unit_name}`
                    : selectedIsVial
                      ? 'Enter number of vials'
                      : 'Enter quantity'
                }
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900"
                placeholderTextColor="#94a3b8"
              />
              <Text className="mt-2 text-xs text-slate-500">
                {selectedIsVial
                  ? 'Enter how many whole vials were damaged. Approval deducts from the oldest batch first.'
                  : 'Approval deducts from the oldest batch first, same as budget officer stock use.'}
              </Text>
            </View>

            <View className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Reason / description
              </Text>
              <View className="mb-3 flex-row flex-wrap gap-2">
                {DEFAULT_DAMAGE_REASONS.map((preset) => {
                  const selected = reason === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      onPress={() => setReason(preset)}
                      className={`rounded-full px-3 py-2 ${
                        selected ? 'bg-navy' : 'border border-teal-200 bg-teal-50'
                      }`}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          selected ? 'text-white' : 'text-teal-700'
                        }`}
                      >
                        {preset}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholder="Tap a reason above or type your own"
                className="min-h-[110px] rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
              <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                Evidence photos ({evidencePhotos.length}/{MAX_EVIDENCE_PHOTOS})
              </Text>
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => pickEvidence(true)}
                  disabled={uploading || remainingPhotoSlots <= 0}
                  className="flex-1 flex-row items-center justify-center rounded-xl bg-navy px-3 py-3"
                >
                  <MaterialIcons name="photo-camera" size={18} color="#fff" />
                  <Text className="ml-1.5 text-sm font-bold text-white">Take photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => pickEvidence(false)}
                  disabled={uploading || remainingPhotoSlots <= 0}
                  className="flex-1 flex-row items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-3 py-3"
                >
                  <MaterialIcons name="photo-library" size={18} color={FIELDMAN_THEME.primary} />
                  <Text className="ml-1.5 text-sm font-bold text-teal-700">Gallery</Text>
                </TouchableOpacity>
              </View>
              {uploading ? (
                <View className="mt-4 flex-row items-center">
                  <ActivityIndicator size="small" color={FIELDMAN_THEME.primary} />
                  <Text className="ml-2 text-sm text-slate-500">Uploading evidence…</Text>
                </View>
              ) : null}
              {evidencePhotos.length ? (
                <View className="mt-4 flex-row gap-3">
                  {evidencePhotos.map((photo) => (
                    <View key={photo.id} className="relative flex-1">
                      <Image source={{ uri: photo.uri }} className="h-24 w-full rounded-xl" resizeMode="cover" />
                      <TouchableOpacity
                        onPress={() => removeEvidence(photo.id)}
                        className="absolute -right-1 -top-1 h-6 w-6 items-center justify-center rounded-full bg-slate-900"
                      >
                        <MaterialIcons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {Array.from({ length: Math.max(0, MAX_EVIDENCE_PHOTOS - evidencePhotos.length) }).map((_, index) => (
                    <View key={`empty-${index}`} className="flex-1" />
                  ))}
                </View>
              ) : (
                <Text className="mt-3 text-xs text-slate-500">You can attach up to 3 photos.</Text>
              )}
            </View>
          </ScrollView>
        )}

        <View
          className="border-t border-slate-200 bg-white py-4"
          style={{
            paddingHorizontal: layout.gutter,
            paddingBottom: 16 + layout.bottomInset,
          }}
        >
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting || uploading || loading}
            className={`items-center rounded-2xl py-3.5 ${
              submitting || uploading || loading ? 'bg-teal-400' : 'bg-navy'
            }`}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-bold text-white">Submit damage report</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
