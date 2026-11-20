import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import { LoadingState } from '@/components/LoadingState';
import { API_BASE_URL } from '@/config/api';
import { showToast } from '@/components/Toast';
import { parseAnimalQrPayload } from '@/utils/animalQr';

// Diri ang scanner sa QR sa hayop.
export default function QrAnimalScanner({
  token,
  onAnimalResolved,
  onCancel,
}: {
  token: string | null;
  onAnimalResolved: (animalId: number) => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanLocked, setScanLocked] = useState(false);
  const [loading, setLoading] = useState(false);

  // Diri i-reset ang scanner para mo-scan balik.
  const resetScanner = useCallback(() => {
    setScanLocked(false);
    setLoading(false);
  }, []);

  // Diri i-verify ang hayop gikan sa QR.
  const verifyAnimal = async (animalId: number) => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/animals/${animalId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.success && response.data.pet) {
        const pet = response.data.pet;
        if (!['registered', 'exempt'].includes(pet.registration_status)) {
          showToast({
            type: 'error',
            message: 'This animal must be registered or exempt before walk-in services.',
          });
          resetScanner();
          return;
        }
        onAnimalResolved(animalId);
      } else {
        showToast({ type: 'error', message: response.data?.error || 'Animal not found.' });
        resetScanner();
      }
    } catch (error: any) {
      showToast({
        type: 'error',
        message: error?.response?.data?.error || 'Failed to load scanned animal.',
      });
      resetScanner();
    } finally {
      setLoading(false);
    }
  };

  // Diri dawaton ang na-scan nga QR code.
  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanLocked || loading) return;

    const payload = parseAnimalQrPayload(data);
    if (!payload?.id) {
      showToast({ type: 'error', message: 'This QR code is not a valid Pet Harmony animal code.' });
      return;
    }

    setScanLocked(true);
    verifyAnimal(Number(payload.id));
  };

  if (!permission) {
    return (
      <View className="rounded-3xl bg-slate-100 dark:bg-slate-800 mb-4">
        <LoadingState label="Opening camera" icon="qr-code-scanner" compact />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-6 items-center mb-4">
        <MaterialIcons name="photo-camera" size={48} color="#94a3b8" />
        <Text className="text-base font-semibold text-slate-800 dark:text-white mt-4 text-center">
          Camera access is required
        </Text>
        <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center">
          Allow camera permission to scan the animal QR code.
        </Text>
        <TouchableOpacity onPress={requestPermission} className="bg-teal rounded-xl px-6 py-3 mt-5">
          <Text className="text-white font-semibold">Allow Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel} className="mt-3">
          <Text className="text-slate-500">Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View className="rounded-2xl bg-slate-100 dark:bg-slate-800 p-6 items-center mb-4">
        <MaterialIcons name="qr-code-scanner" size={48} color="#94a3b8" />
        <Text className="text-base font-semibold text-slate-800 dark:text-white mt-4 text-center">
          QR scanning works on mobile devices
        </Text>
        <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center">
          Open the app on Android or iOS to scan animal QR codes.
        </Text>
        <TouchableOpacity onPress={onCancel} className="mt-4">
          <Text className="text-teal-700 font-semibold">Use manual entry instead</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="rounded-2xl overflow-hidden mb-4 border border-slate-200 dark:border-slate-700" style={{ height: 320 }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
      />
      {/* Overlay must be a sibling — CameraView does not support children */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, justifyContent: 'space-between' }}
      >
        <View className="flex-row items-center justify-between px-4 pt-4">
          <Text className="text-white text-lg font-bold">Scan Animal QR</Text>
          <TouchableOpacity onPress={onCancel} className="bg-black/40 rounded-full p-2">
            <MaterialIcons name="close" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <View className="items-center">
          <View
            className="w-48 h-48 rounded-3xl border-2 border-white/80"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}
          />
          {loading ? (
            <View className="absolute items-center justify-center">
              <ActivityIndicator size="large" color="#ffffff" />
              <Text className="text-white mt-3 font-medium">Loading pet details...</Text>
            </View>
          ) : null}
        </View>

        <View className="px-4 pb-4">
          <Text className="text-white/90 text-xs text-center">
            Align the animal QR code inside the frame to auto-fill owner and pet details.
          </Text>
        </View>
      </View>
    </View>
  );
}
