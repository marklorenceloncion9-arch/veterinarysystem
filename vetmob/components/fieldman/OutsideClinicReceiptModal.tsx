import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Share,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

export const OUTSIDE_CLINIC_STATUS = 'Approved by the clinic';

export interface OutsideClinicLine {
  id: string;
  name: string;
  quantity: string;
  status: string;
}

export interface OutsideClinicReceiptDetails {
  animalName: string;
  patientId: string;
  ownerName: string;
  serviceType: string;
  treatment: string;
}

// Diri himuon ang bag-ong linya sa resibo.
export function createOutsideClinicLine(): OutsideClinicLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    quantity: '',
    status: OUTSIDE_CLINIC_STATUS,
  };
}

// Diri kuhaon ang mga linya nga kompleto na.
export function completedOutsideClinicItems(lines: OutsideClinicLine[]) {
  return lines
    .map((line) => ({
      name: line.name.trim(),
      quantity: Number(line.quantity),
      status: line.status.trim() || OUTSIDE_CLINIC_STATUS,
    }))
    .filter((line) => line.name !== '' && line.quantity > 0);
}

// Diri himuon ang text sa resibo para ma-share.
function buildReceiptMessage(
  details: OutsideClinicReceiptDetails,
  categories: string[],
  items: ReturnType<typeof completedOutsideClinicItems>,
) {
  const issuedAt = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const rows = [
    `El Salvador City Vet`,
    `Office of the City Veterinarian`,
    ``,
    `Animal name: ${details.animalName || '—'}`,
    `Owner name: ${details.ownerName || '—'}`,
    `Patient ID: ${details.patientId || '—'}`,
    `Clinic: El Salvador City Vet`,
    `Service type: ${details.serviceType || '—'}`,
  ];

  if (details.treatment) {
    rows.push(`Treatment: ${details.treatment}`);
  }
  if (categories.length > 0) {
    rows.push(`Category: ${categories.join(', ')}`);
  }
  rows.push(`Date and time: ${issuedAt}`, ``, `Outside clinic`);
  items.forEach((item, index) => {
    rows.push(
      `${index + 1}. ${item.name} · Qty ${item.quantity}`,
      `   Status: ${item.status}`,
    );
  });

  return rows.join('\n');
}

// Diri ang modal sa outside clinic receipt.
export default function OutsideClinicReceiptModal({
  visible,
  lines,
  onChange,
  categories,
  defaultCategories,
  details,
  onClose,
}: {
  visible: boolean;
  lines: OutsideClinicLine[];
  onChange: (lines: OutsideClinicLine[]) => void;
  categories: string[];
  defaultCategories: string[];
  details: OutsideClinicReceiptDetails;
  onClose: () => void;
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [error, setError] = useState('');
  const readyItems = completedOutsideClinicItems(lines);

  useEffect(() => {
    if (!visible) return;
    setError('');
    setSelectedCategories((current) => (current.length > 0 ? current : defaultCategories));
  }, [visible, defaultCategories]);

  // Diri i-toggle ang category sa resibo.
  const toggleCategory = (name: string) => {
    setSelectedCategories((current) =>
      current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name],
    );
  };

  // Diri usbon ang usa ka linya.
  const updateLine = (id: string, patch: Partial<OutsideClinicLine>) => {
    onChange(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    if (error) setError('');
  };

  // Diri i-share ang resibo ug sirado ang modal.
  const shareReceipt = async () => {
    if (readyItems.length === 0) {
      setError('Enter a medicine name and quantity before sharing.');
      return;
    }

    try {
      await Share.share({
        message: buildReceiptMessage(details, selectedCategories, readyItems),
      });
      onClose();
    } catch {
      setError('Could not open the share sheet.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/45">
        <View className="max-h-[92%] rounded-t-3xl bg-white dark:bg-slate-800">
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <Text className="text-lg font-bold text-slate-900 dark:text-white">Outside clinic</Text>
            <TouchableOpacity onPress={onClose} className="p-1">
              <MaterialIcons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView className="px-5" keyboardShouldPersistTaps="handled">
            <Text className="text-xs font-bold uppercase text-slate-400 mb-2">Category</Text>
            {categories.length === 0 ? (
              <Text className="text-sm text-slate-500 mb-4">No clinic categories are in stock.</Text>
            ) : (
              <View className="flex-row flex-wrap gap-2 mb-4">
                {categories.map((name) => {
                  const active = selectedCategories.includes(name);
                  return (
                    <TouchableOpacity
                      key={name}
                      onPress={() => toggleCategory(name)}
                      className={`rounded-full px-3 py-1.5 border ${
                        active ? 'bg-violet-600 border-violet-600' : 'bg-white border-slate-200'
                      }`}
                    >
                      <Text className={`text-xs font-semibold ${active ? 'text-white' : 'text-slate-700'}`}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {lines.map((line, index) => (
              <View key={line.id} className="rounded-2xl border border-slate-200 p-3 mb-3">
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <Text className="text-[11px] font-bold uppercase text-slate-400 mb-1">Name</Text>
                    <TextInput
                      value={line.name}
                      onChangeText={(name) => updateLine(line.id, { name })}
                      placeholder="Medicine name"
                      placeholderTextColor="#94a3b8"
                      className="bg-slate-100 dark:bg-slate-700 rounded-xl px-3 py-2.5 text-slate-800 dark:text-white"
                    />
                  </View>
                  <View className="w-24">
                    <Text className="text-[11px] font-bold uppercase text-slate-400 mb-1">Quantity</Text>
                    <TextInput
                      value={line.quantity}
                      onChangeText={(quantity) => updateLine(line.id, { quantity })}
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      keyboardType="decimal-pad"
                      className="bg-slate-100 dark:bg-slate-700 rounded-xl px-3 py-2.5 text-slate-800 dark:text-white"
                    />
                  </View>
                </View>
                <Text className="text-[11px] font-bold uppercase text-slate-400 mt-3 mb-1">Status</Text>
                <TextInput
                  value={line.status}
                  onChangeText={(status) => updateLine(line.id, { status })}
                  className="bg-slate-100 dark:bg-slate-700 rounded-xl px-3 py-2.5 text-slate-800 dark:text-white"
                />
                {lines.length > 1 ? (
                  <TouchableOpacity
                    onPress={() => onChange(lines.filter((entry) => entry.id !== line.id))}
                    className="mt-2 self-end"
                  >
                    <Text className="text-xs font-semibold text-red-600">Remove item {index + 1}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            <TouchableOpacity
              onPress={() => onChange([...lines, createOutsideClinicLine()])}
              className="rounded-xl border border-violet-200 bg-violet-50 py-3 mb-3"
            >
              <Text className="text-center text-sm font-semibold text-violet-800">Add</Text>
            </TouchableOpacity>

            {error ? <Text className="text-xs text-red-600 mb-3">{error}</Text> : null}
            <View className="h-4" />
          </ScrollView>

          <View className="flex-row gap-3 px-5 py-4 border-t border-slate-100">
            <TouchableOpacity onPress={onClose} className="flex-1 rounded-xl bg-slate-100 py-3.5">
              <Text className="text-center font-semibold text-slate-700">Close</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={shareReceipt} className="flex-[1.4] rounded-xl bg-violet-600 py-3.5">
              <Text className="text-center font-semibold text-white">Share receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
