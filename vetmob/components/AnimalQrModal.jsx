import { useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import QRCode from 'qrcode';
import Svg, { Rect } from 'react-native-svg';
import { buildAnimalQrPayload } from '@/utils/animalQr';
import { getPetIdentificationDisplay } from '@/utils/petIdentification';

// Diri kuhaon ang ngalan sa species.
const getSpeciesLabel = (animal) => {
  if (!animal) return '-';
  if (typeof animal.species === 'string') return animal.species || '-';
  return animal.species?.species_name || animal.species?.name || animal.species_name || '-';
};

// Diri kuhaon ang ngalan sa breed.
const getBreedLabel = (animal) => {
  if (!animal) return '-';
  if (typeof animal.breed === 'string') return animal.breed || '-';
  return animal.breed?.breed_name || animal.breed?.name || animal.breed_name || '-';
};

// Diri buhaton ang QR code nga litrato.
function QrImage({ value, size }) {
  const qr = useMemo(() => {
    try {
      return QRCode.create(value || ' ', { errorCorrectionLevel: 'M' });
    } catch {
      return null;
    }
  }, [value]);

  if (!qr?.modules?.size || !qr?.modules?.data) {
    return (
      <View style={[styles.qrPlaceholder, { width: size, height: size }]}>
        <MaterialIcons name="error-outline" size={28} color="#94a3b8" />
      </View>
    );
  }

  const moduleCount = qr.modules.size;
  const quietZone = 4;
  const viewBoxSize = moduleCount + quietZone * 2;
  const cells = [];

  qr.modules.data.forEach((enabled, index) => {
    if (!enabled) return;
    const x = (index % moduleCount) + quietZone;
    const y = Math.floor(index / moduleCount) + quietZone;
    cells.push(<Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#0f172a" />);
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}>
      <Rect x={0} y={0} width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
      {cells}
    </Svg>
  );
}

// Diri ang modal nga nagpakita sa QR sa hayop.
export function AnimalQrModal({ visible, animal, ownerId, onClose }) {
  if (!animal) return null;

  const qrValue = buildAnimalQrPayload(animal, ownerId);
  const speciesLabel = getSpeciesLabel(animal);
  const breedLabel = getBreedLabel(animal);
  const identification = getPetIdentificationDisplay(animal);
  const metaLabel = identification
    ? identification.text
    : `ID #${animal.id}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Animal QR Code</Text>
              <Text style={styles.subtitle}>{animal.pet_name}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialIcons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          <View style={styles.qrWrap}>
            <QrImage value={qrValue} size={220} />
          </View>

          <Text style={styles.meta}>
            {metaLabel} · {speciesLabel} · {breedLabel}
          </Text>
          <Text style={styles.hint}>Scan to view this animal&apos;s registration details.</Text>

          <TouchableOpacity onPress={onClose} style={styles.doneBtn}>
            <MaterialIcons name="check-circle" size={18} color="#ffffff" />
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  qrWrap: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
  },
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
  },
  meta: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'center',
  },
  hint: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1F7A8C',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  doneText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
