import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getPetIdentificationDisplay } from '@/utils/petIdentification';
import { getStatusIcon, getStatusStyle } from '@/utils/bookingStatus';
import { MeetingPlaceMap } from '@/components/MeetingPlaceMap';
import { formatOwnerDisplayName } from '@/utils/ownerStatus';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  isMeaningfulMeetingPlaceLabel,
  resolveMeetingPlaceLabel,
} from '@/components/fieldman/fieldmanBookingUtils';

export interface VetBookingPet {
  id: number;
  name: string;
  pet_name?: string;
  identification_number?: string | null;
  species?: string | null;
  breed?: string | null;
  registration_status?: string | null;
  color?: string | null;
  weight?: number | null;
  age?: string | null;
  sex?: string | null;
  markings?: string | null;
  pet_photo_url?: string | null;
  markings_photo_url?: string | null;
  services?: string[];
  booking_status?: string;
}

export interface VetBookingUser {
  id: number;
  name: string;
  email?: string;
  phone_number?: string;
  barangay?: string | null;
  zone?: string | null;
  approval_status?: 'pending' | 'approved' | 'rejected' | null;
  approval_label?: string | null;
}

export interface VetBookingTreatmentItem {
  medicine_name: string;
  quantity_used: string;
  unit_name?: string;
}

export interface VetBookingStatusEntry {
  status: string;
  status_label?: string;
  action_label?: string;
  changed_by?: string;
  changed_at?: string;
  changed_at_formatted?: string;
  notes?: string | null;
}

export interface VetBookingDetail {
  id: number;
  status: string;
  display_status?: string;
  booking_type: 'walk_in' | 'appointment' | 'home_service';
  booking_type_label?: string;
  date: string;
  date_formatted?: string;
  time: string;
  time_formatted?: string;
  duration_minutes?: number;
  service: string;
  services: string[];
  notes?: string | null;
  administered_by?: string | null;
  user: VetBookingUser;
  pet: VetBookingPet;
  pets?: VetBookingPet[];
  complaint?: {
    is_bitten?: boolean;
    bite_details?: string | null;
    symptoms?: { name: string; days_count?: number; notes?: string }[];
  };
  treatment_items?: VetBookingTreatmentItem[];
  status_history?: VetBookingStatusEntry[];
  meeting_latitude?: number | null;
  meeting_longitude?: number | null;
  meeting_place_label?: string | null;
  meeting_place_photo_url?: string | null;
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

// Diri kuhaon ang gidugayon base sa ngalan sa serbisyo.
function getDurationForServiceName(typeName?: string | null) {
  const key = (typeName || '').toLowerCase().trim();
  if (!key) return 10;
  const entries = Object.entries(SERVICE_DURATIONS).sort(([a], [b]) => b.length - a.length);
  for (const [name, minutes] of entries) {
    if (key === name || key.includes(name)) return minutes;
  }
  return 10;
}

// Diri kuhaon ang mga pet ug ilang serbisyo sa booking.
function getBookingPetsWithServices(booking: VetBookingDetail) {
  const fallbackServices = booking.services?.length
    ? booking.services
    : booking.service
    ? [booking.service]
    : [];

  if (booking.pets?.length) {
    return booking.pets.map((pet) => ({
      id: pet.id,
      name: pet.name || pet.pet_name || 'Unknown',
      services: pet.services?.length ? pet.services : fallbackServices,
    }));
  }

  return [{
    id: booking.pet.id,
    name: booking.pet.name || booking.pet.pet_name || 'Unknown',
    services: booking.pet.services?.length ? booking.pet.services : fallbackServices,
  }];
}

// Diri kwentahon ang total nga gidugayon sa booking.
function getBookingDuration(booking: VetBookingDetail) {
  const names = Array.from(
    new Set(getBookingPetsWithServices(booking).flatMap((pet) => pet.services).filter(Boolean))
  );
  const fromNames = names.reduce((sum, name) => sum + getDurationForServiceName(name), 0);
  if (fromNames > 0) return fromNames;
  if (booking.duration_minutes && booking.duration_minutes > 0) return booking.duration_minutes;
  return 10;
}

// Diri i-format ang gidugayon sa minutos o oras.
function formatDuration(minutes: number) {
  const value = minutes > 0 ? minutes : 10;
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

// Diri himuon ang range sa oras sugod hangtod human.
function formatTimeRange(time: string, durationMinutes: number) {
  if (!time) return '';
  const raw = String(time).trim();
  if (/^(0?0:00(?::00)?(?:\.0+)?|12:00(?::00)?\s*AM)$/i.test(raw)) return '';
  const [h, m] = raw.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  if (h === 0 && m === 0) return '';
  const start = new Date();
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + (durationMinutes > 0 ? durationMinutes : 10) * 60000);
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString('en-US', opts)} – ${end.toLocaleTimeString('en-US', opts)}`;
}

// Diri himuon nga nindot basahon ang label.
function formatLabel(value?: string | null) {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

// Diri ang card sa matag section.
function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  children: ReactNode;
}) {
  return (
    <View className="bg-white dark:bg-slate-800 rounded-2xl p-4 mb-4 border border-slate-200 dark:border-slate-700">
      <View className="flex-row items-center mb-3">
        <View className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-navy/30 items-center justify-center mr-2">
          <MaterialIcons name={icon} size={16} color="#1F7A8C" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-slate-800 dark:text-white">{title}</Text>
          {subtitle ? (
            <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

// Diri ang tile nga nagpakita og info.
function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-[48%] min-w-[140px] grow bg-canvas dark:bg-navy-dark/50 rounded-xl px-3 py-3 mb-3 border border-slate-100 dark:border-slate-700">
      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</Text>
      <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1 leading-5">{value}</Text>
    </View>
  );
}

// Diri ang row sa info sa tag-iya.
function OwnerRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0">
      <View className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center mr-3">
        <MaterialIcons name={icon} size={16} color="#64748b" />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</Text>
        <Text className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5 leading-5">{value}</Text>
      </View>
    </View>
  );
}

const STATUS_HISTORY_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  pending: 'schedule',
  approved: 'check-circle',
  processing: 'autorenew',
  ongoing: 'medical-services',
  completed: 'task-alt',
  cancelled: 'cancel',
  rejected: 'block',
};

const STATUS_HISTORY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  pending: { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', icon: '#d97706' },
  approved: { bg: 'bg-teal-50 dark:bg-navy/20', text: 'text-teal-700 dark:text-teal-200', icon: '#1F7A8C' },
  processing: { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', icon: '#7c3aed' },
  ongoing: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300', icon: '#4f46e5' },
  completed: { bg: 'bg-teal-50 dark:bg-navy/20', text: 'text-teal-700 dark:text-teal-200', icon: '#1F7A8C' },
  cancelled: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', icon: '#dc2626' },
  rejected: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', icon: '#dc2626' },
};

// Diri ipakita ang timeline sa status sa booking.
function StatusTimeline({ history }: { history: VetBookingStatusEntry[] }) {
  if (!history.length) return null;

  return (
    <SectionCard title="Status History" subtitle="Recent updates on this booking" icon="history">
      <View className="bg-canvas dark:bg-navy-dark/40 rounded-xl p-3 border border-slate-100 dark:border-slate-700">
        {history.map((entry, index) => {
          const colors = STATUS_HISTORY_COLORS[entry.status] ?? STATUS_HISTORY_COLORS.pending;
          const icon = STATUS_HISTORY_ICONS[entry.status] ?? 'info';
          const isLast = index === history.length - 1;
          const actionLabel = entry.action_label || `${entry.status_label || entry.status} by ${entry.changed_by || 'Staff'}`;

          return (
            <View key={`${entry.status}-${entry.changed_at}-${index}`} className="flex-row">
              <View className="items-center mr-3">
                <View className={`w-8 h-8 rounded-full items-center justify-center ${colors.bg}`}>
                  <MaterialIcons name={icon} size={16} color={colors.icon} />
                </View>
                {!isLast ? <View className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-600 my-1" /> : null}
              </View>
              <View className={`flex-1 ${isLast ? '' : 'pb-4'}`}>
                <Text className={`font-semibold text-sm ${colors.text}`}>{actionLabel}</Text>
                <View className="flex-row items-center mt-1">
                  <MaterialIcons name="access-time" size={13} color="#64748b" />
                  <Text className="text-xs text-slate-500 ml-1">
                    {entry.changed_at_formatted || entry.changed_at || '—'}
                  </Text>
                </View>
                {entry.notes ? (
                  <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-4">{entry.notes}</Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </SectionCard>
  );
}

// Diri ang modal sa detalye sa booking.
export default function VetBookingDetailModal({
  visible,
  booking,
  onClose,
  onContinueWalkIn,
  onStartAppointment,
  onContinueAppointment,
  onCancelAppointment,
  onCompleteHomeService,
}: {
  visible: boolean;
  booking: VetBookingDetail | null;
  onClose: () => void;
  onContinueWalkIn?: (booking: VetBookingDetail) => void;
  onStartAppointment?: (booking: VetBookingDetail) => void;
  onContinueAppointment?: (booking: VetBookingDetail) => void;
  onCancelAppointment?: (booking: VetBookingDetail, reason: string) => Promise<void> | void;
  onCompleteHomeService?: (booking: VetBookingDetail) => Promise<void> | void;
}) {
  const [photoPreview, setPhotoPreview] = useState<{ uri: string; title: string } | null>(null);
  const layout = useResponsiveLayout();
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [startingProcessing, setStartingProcessing] = useState(false);
  const [completingVisit, setCompletingVisit] = useState(false);
  const [detailStep, setDetailStep] = useState<'location' | 'details'>('location');
  const [resolvedPlaceLabel, setResolvedPlaceLabel] = useState<string | null>(null);

  const statusKey = booking?.display_status || booking?.status || 'pending';
  const statusStyle = getStatusStyle(statusKey);
  const duration = booking ? getBookingDuration(booking) : 10;
  const bookedPets = booking ? getBookingPetsWithServices(booking) : [];
  const petIdDisplay = booking?.pet
    ? getPetIdentificationDisplay({
        identification_number: booking.pet.identification_number || undefined,
        registration_status: booking.pet.registration_status || undefined,
      })
    : null;
  const isFinishedVisit = ['completed', 'cancelled', 'rejected'].includes(statusKey);
  const isWalkIn = booking?.booking_type === 'walk_in';
  const isHomeService = booking?.booking_type === 'home_service';
  const hasMeetingCoordinates =
    booking?.meeting_latitude != null
    && booking?.meeting_longitude != null
    && Number.isFinite(Number(booking.meeting_latitude))
    && Number.isFinite(Number(booking.meeting_longitude));
  const meetingPlaceName =
    resolvedPlaceLabel
    || (isMeaningfulMeetingPlaceLabel(booking?.meeting_place_label) ? String(booking?.meeting_place_label).trim() : null)
    || (hasMeetingCoordinates ? 'Pinned meeting place' : null);
  const usesLocationStep = isHomeService && (hasMeetingCoordinates || !!booking?.meeting_place_photo_url);
  const isApprovedAppointment = !isWalkIn && booking?.status === 'approved';
  const isProcessingAppointment = !isWalkIn && booking?.status === 'processing';
  const isProcessingWalkIn = isWalkIn && (statusKey === 'processing' || booking?.status === 'pending');
  const canContinueWalkIn = isProcessingWalkIn && !!onContinueWalkIn;
  const canStartAppointment = !isHomeService && isApprovedAppointment && !!onStartAppointment && !!onCancelAppointment;
  const canContinueAppointment = !isHomeService && isProcessingAppointment && !!onContinueAppointment;
  const canMarkHomeServiceOngoing =
    isHomeService
    && ['approved', 'processing'].includes(booking?.display_status || booking?.status || '')
    && !!(onStartAppointment || onContinueAppointment);
  const canMarkHomeServiceCompleted =
    isHomeService
    && (booking?.display_status || booking?.status) === 'ongoing'
    && !!onCompleteHomeService;

  useEffect(() => {
    if (visible && booking) {
      setDetailStep(usesLocationStep ? 'location' : 'details');
    }
  }, [visible, booking?.id, usesLocationStep]);

  useEffect(() => {
    let cancelled = false;

    if (!visible || !booking || booking.booking_type !== 'home_service' || isFinishedVisit) {
      setResolvedPlaceLabel(null);
      return undefined;
    }

    if (isMeaningfulMeetingPlaceLabel(booking.meeting_place_label)) {
      setResolvedPlaceLabel(String(booking.meeting_place_label).trim());
      return undefined;
    }

    setResolvedPlaceLabel(null);
    resolveMeetingPlaceLabel(booking).then((label) => {
      if (!cancelled && label) setResolvedPlaceLabel(label);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, booking?.id, booking?.meeting_place_label, booking?.meeting_latitude, booking?.meeting_longitude, isFinishedVisit]);

  // Diri isira ang modal ug i-reset ang cancel form.
  const handleClose = () => {
    setShowCancelForm(false);
    setCancelReason('');
    setCancelling(false);
    setStartingProcessing(false);
    setCompletingVisit(false);
    setDetailStep('location');
    onClose();
  };

  // Diri sugdan ang pag-process sa appointment.
  const handleStartProcessing = async () => {
    if (!booking || !onStartAppointment) return;
    setStartingProcessing(true);
    try {
      await onStartAppointment(booking);
      onClose();
    } catch {
      // Errors are surfaced via toast in the parent screen.
    } finally {
      setStartingProcessing(false);
    }
  };

  // Diri markahan nga ongoing ang home service.
  const handleMarkHomeServiceOngoing = async () => {
    if (!booking || startingProcessing) return;

    const effectiveStatus = booking.display_status || booking.status;

    setStartingProcessing(true);
    try {
      if (effectiveStatus === 'processing' && onContinueAppointment) {
        onContinueAppointment(booking);
        return;
      }

      if (effectiveStatus === 'approved' && onStartAppointment) {
        await onStartAppointment(booking);
      }
    } catch {
      // Errors are surfaced via toast in the parent screen.
    } finally {
      setStartingProcessing(false);
    }
  };

  // Diri markahan nga completed ang home service.
  const handleMarkHomeServiceCompleted = async () => {
    if (!booking || !onCompleteHomeService || completingVisit) return;

    setCompletingVisit(true);
    try {
      await onCompleteHomeService(booking);
      onClose();
    } catch {
      // Errors are surfaced via toast in the parent screen.
    } finally {
      setCompletingVisit(false);
    }
  };

  // Diri kumpirmahon ang pag-cancel sa booking.
  const handleConfirmCancel = async () => {
    if (!booking || !onCancelAppointment) return;
    const reason = cancelReason.trim();
    if (reason.length < 3) return;

    setCancelling(true);
    try {
      await onCancelAppointment(booking, reason);
      setShowCancelForm(false);
      setCancelReason('');
      onClose();
    } finally {
      setCancelling(false);
    }
  };

  const scheduleSummary = useMemo(() => {
    if (!booking) return '';
    const dateLabel = booking.date_formatted || booking.date;
    const timeLabel = formatTimeRange(booking.time, duration);
    return [dateLabel, timeLabel].filter(Boolean).join(' · ');
  }, [booking, duration]);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)', paddingBottom: layout.bottomInset }}>
          <View className="overflow-hidden rounded-t-3xl bg-canvas dark:bg-navy-dark"
            style={{
              height: layout.sheetMaxHeight,
              width: '100%',
              maxWidth: layout.contentMaxWidth,
              alignSelf: 'center',
            }}
          >
            {booking ? (
              <>
                <View className="border-b border-slate-200 bg-white px-5 pb-5 pt-5">
                  <View className="flex-row items-start">
                    <TouchableOpacity
                      activeOpacity={booking.pet.pet_photo_url ? 0.85 : 1}
                      onPress={() =>
                        booking.pet.pet_photo_url
                          ? setPhotoPreview({ uri: booking.pet.pet_photo_url!, title: booking.pet.name })
                          : undefined
                      }
                    >
                      {booking.pet.pet_photo_url ? (
                        <Image
                          source={{ uri: booking.pet.pet_photo_url }}
                          style={{ width: 64, height: 64, borderRadius: 18, borderWidth: 2, borderColor: '#E5E7EB' }}
                        />
                      ) : (
                        <View
                          style={{ width: 64, height: 64, borderRadius: 18 }}
                          className="items-center justify-center border-2 border-teal-100 bg-teal-50"
                        >
                          <MaterialIcons name="pets" size={30} color="#1F7A8C" />
                        </View>
                      )}
                    </TouchableOpacity>

                    <View className="ml-3 flex-1 pr-2">
                      <Text className="text-xl font-bold text-navy">
                        {booking.pet.name}
                      </Text>
                      <Text className="mt-0.5 text-sm text-muted">
                        {[booking.pet.species, booking.pet.breed].filter(Boolean).join(' • ') || 'Animal'}
                      </Text>
                      {petIdDisplay ? (
                        <View className="mt-2 self-start rounded-full border border-slate-200 bg-canvas px-2.5 py-1">
                          <Text className="text-[11px] font-bold text-navy">{petIdDisplay.text}</Text>
                        </View>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      onPress={handleClose}
                      className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                    >
                      <MaterialIcons name="close" size={22} color="#16324F" />
                    </TouchableOpacity>
                  </View>
                </View>

                <View className="mt-4 px-4">
                  <View
                    className="bg-white dark:bg-slate-800 rounded-2xl px-4 py-3 border border-slate-200 dark:border-slate-700 mb-4"
                    style={{
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.06,
                      shadowRadius: 6,
                      elevation: 3,
                    }}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className={`rounded-full px-2.5 py-1 flex-row items-center ${statusStyle.badgeBg}`}>
                        <MaterialIcons name={getStatusIcon(statusKey)} size={12} color={statusStyle.icon} />
                        <Text className={`text-[11px] font-bold ml-1 ${statusStyle.badgeText}`}>{statusStyle.label}</Text>
                      </View>
                      <Text className="text-xs font-semibold text-teal-700 dark:text-teal-200">
                        {booking.booking_type_label
                          || (booking.booking_type === 'home_service'
                            ? 'Home Service'
                            : isWalkIn
                              ? 'Walk-in'
                              : 'Clinical Appointment')}
                      </Text>
                    </View>
                    <View className="flex-row items-center mt-3">
                      <MaterialIcons name="event" size={16} color="#64748b" />
                      <Text className="ml-2 text-sm font-medium text-slate-700 dark:text-slate-200 flex-1">
                        {scheduleSummary}
                      </Text>
                    </View>
                    <View className="flex-row items-center mt-2">
                      <MaterialIcons name="timer" size={16} color="#64748b" />
                      <Text className="ml-2 text-sm text-slate-500 dark:text-slate-400">
                        Total duration: {formatDuration(duration)}
                      </Text>
                    </View>
                  </View>
                </View>

                <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                  {usesLocationStep ? (
                    <View className="flex-row mb-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-1">
                      <TouchableOpacity
                        onPress={() => setDetailStep('location')}
                        className={`flex-1 rounded-lg py-2 ${detailStep === 'location' ? 'bg-teal' : ''}`}
                      >
                        <Text className={`text-center text-xs font-bold ${detailStep === 'location' ? 'text-white' : 'text-slate-500'}`}>
                          1. Location
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setDetailStep('details')}
                        className={`flex-1 rounded-lg py-2 ${detailStep === 'details' ? 'bg-teal' : ''}`}
                      >
                        <Text className={`text-center text-xs font-bold ${detailStep === 'details' ? 'text-white' : 'text-slate-500'}`}>
                          2. Visit Details
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {usesLocationStep && detailStep === 'location' ? (
                    <>
                      <SectionCard
                        title="Meeting Place"
                        subtitle="Pinned location for this Home Service visit"
                        icon="map"
                      >
                        {meetingPlaceName ? (
                          <View className="mb-3 rounded-xl border border-teal-100 bg-teal-50/80 dark:border-teal-800 dark:bg-navy/20 px-3 py-2.5">
                            <Text className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-200">
                              Marked location
                            </Text>
                            <Text className="mt-1 text-sm font-semibold text-navy dark:text-teal-100">
                              {meetingPlaceName}
                            </Text>
                          </View>
                        ) : null}
                        {hasMeetingCoordinates ? (
                          <MeetingPlaceMap
                            coordinate={{
                              latitude: Number(booking.meeting_latitude),
                              longitude: Number(booking.meeting_longitude),
                            }}
                            editable={false}
                            height={220}
                            showUserLocation={false}
                            showRouteLine={!isFinishedVisit}
                            markerTitle={meetingPlaceName || 'MEETING PLACE'}
                          />
                        ) : (
                          <Text className="text-sm text-slate-500 dark:text-slate-400">
                            No map coordinates available for this visit.
                          </Text>
                        )}
                      </SectionCard>

                      {booking.meeting_place_photo_url ? (
                        <SectionCard
                          title="Landmark Photo"
                          subtitle="Photo from the owner to help you find the location"
                          icon="photo-camera"
                        >
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() =>
                              setPhotoPreview({
                                uri: booking.meeting_place_photo_url!,
                                title: 'Meeting Place / Landmark',
                              })
                            }
                            className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                          >
                            <Image
                              source={{ uri: booking.meeting_place_photo_url }}
                              className="h-44 w-full"
                              resizeMode="cover"
                            />
                            <Text className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                              Tap to enlarge
                            </Text>
                          </TouchableOpacity>
                        </SectionCard>
                      ) : null}

                      <SectionCard title="Owner Location" subtitle="Barangay and zone for this visit" icon="location-on">
                        <OwnerRow icon="location-on" label="Barangay" value={booking.user.barangay || '—'} />
                        <OwnerRow icon="map" label="Zone" value={booking.user.zone || '—'} />
                        <OwnerRow icon="person" label="Owner" value={formatOwnerDisplayName(booking.user.name, booking.user)} />
                      </SectionCard>

                      <TouchableOpacity
                        onPress={() => setDetailStep('details')}
                        className="bg-teal rounded-xl py-3.5 mb-2 flex-row items-center justify-center"
                      >
                        <Text className="text-white text-center font-semibold">Next: Visit Details</Text>
                        <MaterialIcons name="arrow-forward" size={18} color="#ffffff" style={{ marginLeft: 6 }} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={handleClose} className="bg-slate-200 dark:bg-slate-700 rounded-xl py-3.5 mb-2">
                        <Text className="text-slate-700 dark:text-slate-200 text-center font-semibold">Close</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                  {usesLocationStep ? (
                    <TouchableOpacity
                      onPress={() => setDetailStep('location')}
                      className="mb-4 self-start flex-row items-center rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-navy/20 px-3 py-2"
                    >
                      <MaterialIcons name="arrow-back" size={16} color="#1F7A8C" />
                      <Text className="ml-1.5 text-xs font-bold text-teal-700 dark:text-teal-200">Back to Location</Text>
                    </TouchableOpacity>
                  ) : null}

                  {isHomeService && !usesLocationStep ? (
                    <SectionCard
                      title="Meeting Place / Landmark"
                      subtitle="Photo from the owner to help you find the location"
                      icon="place"
                    >
                      {meetingPlaceName ? (
                        <View className="mb-3 rounded-xl border border-teal-100 bg-teal-50/80 dark:border-teal-800 dark:bg-navy/20 px-3 py-2.5">
                          <Text className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-200">
                            Marked location
                          </Text>
                          <Text className="mt-1 text-sm font-semibold text-navy dark:text-teal-100">
                            {meetingPlaceName}
                          </Text>
                        </View>
                      ) : null}
                      {booking.meeting_place_photo_url ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() =>
                            setPhotoPreview({
                              uri: booking.meeting_place_photo_url!,
                              title: 'Meeting Place / Landmark',
                            })
                          }
                          className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
                        >
                          <Image
                            source={{ uri: booking.meeting_place_photo_url }}
                            className="h-44 w-full"
                            resizeMode="cover"
                          />
                          <Text className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                            Tap to enlarge
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text className="text-sm text-slate-500 dark:text-slate-400">
                          No landmark photo uploaded
                        </Text>
                      )}
                    </SectionCard>
                  ) : null}

                  <SectionCard title="Services" subtitle="Selected treatments per pet" icon="medical-services">
                    <View className="gap-3">
                      {bookedPets.map((pet) => (
                        <View
                          key={`${booking.id}-pet-${pet.id}`}
                          className="rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/20 px-3 py-2.5"
                        >
                          <Text className="text-sm font-semibold text-slate-800 dark:text-white">{pet.name}</Text>
                          <View className="flex-row flex-wrap gap-2 mt-2">
                            {pet.services.map((service) => (
                              <View
                                key={`${booking.id}-${pet.id}-${service}`}
                                className="rounded-full bg-teal-50 dark:bg-navy/20 px-3 py-1.5 border border-teal-100 dark:border-teal-800"
                              >
                                <Text className="text-xs font-semibold text-navy dark:text-teal-100">
                                  {service} · {formatDuration(getDurationForServiceName(service))}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                    {booking.administered_by ? (
                      <View className="flex-row items-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <MaterialIcons name="badge" size={16} color="#1F7A8C" />
                        <Text className="ml-2 text-sm text-slate-700 dark:text-slate-200">
                          Administered by <Text className="font-bold">{booking.administered_by}</Text>
                        </Text>
                      </View>
                    ) : null}
                    {booking.notes ? (
                      <View className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Notes</Text>
                        <Text className="text-sm text-slate-700 dark:text-slate-200 mt-1 leading-5">{booking.notes}</Text>
                      </View>
                    ) : null}
                  </SectionCard>

                  <SectionCard title="Owner" subtitle="Client information" icon="person">
                    <OwnerRow icon="person" label="Name" value={formatOwnerDisplayName(booking.user.name, booking.user)} />
                    {isHomeService && meetingPlaceName ? (
                      <OwnerRow icon="place" label="Home service location" value={meetingPlaceName} />
                    ) : null}
                    <OwnerRow icon="location-on" label="Barangay" value={booking.user.barangay || '—'} />
                    <OwnerRow icon="map" label="Zone" value={booking.user.zone || '—'} />
                    {booking.user.phone_number ? (
                      <OwnerRow icon="phone" label="Phone" value={booking.user.phone_number} />
                    ) : null}
                    {booking.user.email ? (
                      <OwnerRow icon="email" label="Email" value={booking.user.email} />
                    ) : null}
                  </SectionCard>

                  <SectionCard title="Pet Profile" subtitle="Animal details" icon="pets">
                    <View className="flex-row flex-wrap justify-between">
                      <InfoTile label="Registration" value={formatLabel(booking.pet.registration_status)} />
                      <InfoTile label="Sex" value={formatLabel(booking.pet.sex)} />
                      <InfoTile label="Age" value={booking.pet.age || '—'} />
                      <InfoTile label="Color" value={booking.pet.color || '—'} />
                      <InfoTile
                        label="Weight"
                        value={booking.pet.weight ? `${booking.pet.weight} kg` : '—'}
                      />
                      <InfoTile
                        label="Markings"
                        value={booking.pet.markings?.trim() ? booking.pet.markings : '—'}
                      />
                    </View>

                    {booking.pet.markings_photo_url ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() =>
                          setPhotoPreview({
                            uri: booking.pet.markings_photo_url!,
                            title: `${booking.pet.name} — Markings`,
                          })
                        }
                        className="mt-1"
                      >
                        <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Markings Photo</Text>
                        <Image
                          source={{ uri: booking.pet.markings_photo_url }}
                          style={{ width: '100%', height: 120, borderRadius: 12 }}
                          resizeMode="cover"
                        />
                      </TouchableOpacity>
                    ) : null}
                  </SectionCard>

                  {!isProcessingWalkIn && statusKey !== 'processing' && booking.treatment_items && booking.treatment_items.length > 0 ? (
                    <SectionCard title="Inventory Used" subtitle="Medicines recorded for this visit" icon="inventory-2">
                      {booking.treatment_items.map((item, index) => (
                        <View
                          key={`${booking.id}-item-${index}`}
                          className={`flex-row items-center justify-between py-3 ${
                            index < booking.treatment_items!.length - 1
                              ? 'border-b border-slate-100 dark:border-slate-700'
                              : ''
                          }`}
                        >
                          <Text className="flex-1 text-sm font-medium text-slate-800 dark:text-white pr-3">
                            {item.medicine_name}
                          </Text>
                          <Text className="text-sm font-semibold text-teal-700 dark:text-teal-200">
                            {item.quantity_used}
                          </Text>
                        </View>
                      ))}
                    </SectionCard>
                  ) : isWalkIn && !isProcessingWalkIn ? (
                    <SectionCard title="Inventory Used" subtitle="Medicines recorded for this visit" icon="inventory-2">
                      <Text className="text-sm text-slate-500 dark:text-slate-400">No inventory items recorded.</Text>
                    </SectionCard>
                  ) : null}

                  {booking.complaint?.symptoms?.length || booking.complaint?.is_bitten ? (
                    <SectionCard title="Complaint" subtitle="Symptoms and bite details" icon="healing">
                      {booking.complaint.symptoms?.map((symptom) => (
                        <View
                          key={`${booking.id}-${symptom.name}`}
                          className="py-2 border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                        >
                          <Text className="text-sm font-semibold text-slate-800 dark:text-white">{symptom.name}</Text>
                          <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {[
                              symptom.days_count ? `${symptom.days_count} day(s)` : null,
                              symptom.notes || null,
                            ]
                              .filter(Boolean)
                              .join(' • ') || 'No extra details'}
                          </Text>
                        </View>
                      ))}
                      {booking.complaint.is_bitten ? (
                        <View className="mt-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-3 border border-amber-100 dark:border-amber-800">
                          <Text className="text-sm font-semibold text-amber-800 dark:text-amber-200">Bite incident</Text>
                          <Text className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-4">
                            {booking.complaint.bite_details || 'Recorded as a bite case.'}
                          </Text>
                        </View>
                      ) : null}
                    </SectionCard>
                  ) : null}

                  {booking.status_history && booking.status_history.length > 0 ? (
                    <StatusTimeline history={booking.status_history} />
                  ) : null}

                  {canContinueWalkIn ? (
                    <View className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl p-4 mb-4 border border-amber-200 dark:border-amber-800">
                      <Text className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                        Walk-in needs inventory
                      </Text>
                      <Text className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-5">
                        Select medicines and mark this walk-in as ongoing to finish the visit.
                      </Text>
                      <TouchableOpacity
                        onPress={() => onContinueWalkIn?.(booking)}
                        className="mt-3 w-full flex-row items-center justify-center bg-amber-600 rounded-xl px-4 py-3"
                      >
                        <MaterialIcons name="inventory" size={16} color="#ffffff" />
                        <Text className="ml-1.5 text-sm font-bold text-white">Continue Walk-in</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {canMarkHomeServiceOngoing ? (
                    <View className="bg-teal-50 dark:bg-navy/20 rounded-2xl p-4 mb-4 border border-teal-200 dark:border-teal-800">
                      <Text className="text-sm font-semibold text-navy dark:text-teal-100">
                        {booking.status === 'approved' || (booking.display_status || booking.status) === 'approved' ? 'Approved home visit' : 'Home visit in progress'}
                      </Text>
                      <Text className="text-xs text-teal-700 dark:text-teal-200 mt-1 leading-5">
                        Review the meeting place, select inventory, and mark this visit as ongoing.
                      </Text>
                      <View className="flex-row flex-wrap gap-2 mt-3">
                        <TouchableOpacity
                          onPress={handleMarkHomeServiceOngoing}
                          disabled={startingProcessing}
                          className="flex-1 min-w-[140px] flex-row items-center justify-center bg-teal rounded-xl px-4 py-3"
                        >
                          {startingProcessing ? (
                            <ActivityIndicator color="#ffffff" size="small" />
                          ) : (
                            <>
                              <MaterialIcons name="inventory" size={18} color="#ffffff" />
                              <Text className="ml-1 text-sm font-bold text-white">Mark as Ongoing</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        {((booking.display_status || booking.status) === 'approved') && onCancelAppointment ? (
                          <TouchableOpacity
                            onPress={() => setShowCancelForm(true)}
                            disabled={startingProcessing}
                            className="flex-1 min-w-[120px] flex-row items-center justify-center bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-red-200 dark:border-red-800"
                          >
                            <MaterialIcons name="cancel" size={16} color="#dc2626" />
                            <Text className="ml-1 text-sm font-bold text-red-600">Cancel</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  ) : null}

                  {canMarkHomeServiceCompleted ? (
                    <View className="bg-teal-50 dark:bg-navy/20 rounded-2xl p-4 mb-4 border border-teal-200 dark:border-teal-800">
                      <Text className="text-sm font-semibold text-navy dark:text-teal-100">
                        Ongoing home visit
                      </Text>
                      <Text className="text-xs text-teal-700 dark:text-teal-200 mt-1 leading-5">
                        Mark as completed to deduct inventory from stock and finish this visit.
                      </Text>
                      <TouchableOpacity
                        onPress={handleMarkHomeServiceCompleted}
                        disabled={completingVisit}
                        className="mt-3 w-full flex-row items-center justify-center bg-teal rounded-xl px-4 py-3"
                      >
                        {completingVisit ? (
                          <ActivityIndicator color="#ffffff" size="small" />
                        ) : (
                          <>
                            <MaterialIcons name="check-circle" size={18} color="#ffffff" />
                            <Text className="ml-1 text-sm font-bold text-white">Mark as Completed</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {canStartAppointment ? (
                    <View className="bg-teal-50 dark:bg-navy/20 rounded-2xl p-4 mb-4 border border-teal-200 dark:border-teal-800">
                      <Text className="text-sm font-semibold text-navy dark:text-teal-100">
                        {isHomeService ? 'Approved home visit' : 'Approved appointment'}
                      </Text>
                      <Text className="text-xs text-teal-700 dark:text-teal-200 mt-1 leading-5">
                        {isHomeService
                          ? 'Review the meeting place, then mark as processing to start the visit or cancel if it cannot proceed.'
                          : 'Mark as processing to start the visit, or cancel if the appointment cannot proceed.'}
                      </Text>
                      <View className="flex-row flex-wrap gap-2 mt-3">
                        <TouchableOpacity
                          onPress={handleStartProcessing}
                          disabled={startingProcessing}
                          className="flex-1 min-w-[140px] flex-row items-center justify-center bg-teal rounded-xl px-4 py-3"
                        >
                          {startingProcessing ? (
                            <ActivityIndicator color="#ffffff" size="small" />
                          ) : (
                            <>
                              <MaterialIcons name="play-arrow" size={18} color="#ffffff" />
                              <Text className="ml-1 text-sm font-bold text-white">Mark as Processing</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setShowCancelForm(true)}
                          disabled={startingProcessing}
                          className="flex-1 min-w-[120px] flex-row items-center justify-center bg-white dark:bg-slate-800 rounded-xl px-4 py-3 border border-red-200 dark:border-red-800"
                        >
                          <MaterialIcons name="cancel" size={16} color="#dc2626" />
                          <Text className="ml-1 text-sm font-bold text-red-600">Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  {canContinueAppointment ? (
                    <View className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl p-4 mb-4 border border-violet-200 dark:border-violet-800">
                      <Text className="text-sm font-semibold text-violet-800 dark:text-violet-200">
                        {isHomeService ? 'Processing home visit' : 'Processing appointment'}
                      </Text>
                      <Text className="text-xs text-violet-700 dark:text-violet-300 mt-1 leading-5">
                        {isHomeService
                          ? 'Select inventory and mark this home visit as ongoing to continue.'
                          : 'Select inventory and mark this appointment as ongoing to continue the visit.'}
                      </Text>
                      <TouchableOpacity
                        onPress={() => onContinueAppointment?.(booking)}
                        className="mt-3 w-full flex-row items-center justify-center bg-violet-600 rounded-xl px-4 py-3"
                      >
                        <MaterialIcons name="inventory" size={16} color="#ffffff" />
                        <Text className="ml-1.5 text-sm font-bold text-white">
                          {isHomeService ? 'Select Inventory & Mark Ongoing' : 'Continue to Ongoing'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  <TouchableOpacity onPress={handleClose} className="bg-slate-200 dark:bg-slate-700 rounded-xl py-3.5 mb-2">
                    <Text className="text-slate-700 dark:text-slate-200 text-center font-semibold">Close</Text>
                  </TouchableOpacity>
                    </>
                  )}
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={showCancelForm} transparent animationType="fade" onRequestClose={() => setShowCancelForm(false)}>
        <View className="flex-1 justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: layout.modalGutter }}>
          <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
            <Text className="text-lg font-bold text-slate-800 dark:text-white">
              {isHomeService ? 'Cancel Home Service Visit' : 'Cancel Appointment'}
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-5">
              {isHomeService
                ? 'Provide a reason for cancelling this approved home visit.'
                : 'Provide a reason for cancelling this approved appointment.'}
            </Text>
            <TextInput
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="Reason for cancellation"
              placeholderTextColor="#94a3b8"
              multiline
              className="mt-4 min-h-[96px] rounded-xl px-3 py-3 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-white bg-canvas dark:bg-navy-dark"
              textAlignVertical="top"
            />
            <View className="flex-row gap-3 mt-4">
              <TouchableOpacity
                onPress={() => {
                  setShowCancelForm(false);
                  setCancelReason('');
                }}
                disabled={cancelling}
                className="flex-1 rounded-xl py-3 bg-slate-200 dark:bg-slate-700"
              >
                <Text className="text-center font-semibold text-slate-700 dark:text-slate-200">Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmCancel}
                disabled={cancelling || cancelReason.trim().length < 3}
                className={`flex-1 rounded-xl py-3 ${cancelReason.trim().length >= 3 ? 'bg-red-600' : 'bg-red-300'}`}
              >
                {cancelling ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-center font-semibold text-white">Confirm Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!photoPreview} transparent animationType="fade" onRequestClose={() => setPhotoPreview(null)}>
        <View className="flex-1 bg-black/90 justify-center px-4">
          <TouchableOpacity
            onPress={() => setPhotoPreview(null)}
            className="absolute right-5 z-10 w-10 h-10 rounded-full bg-white/15 items-center justify-center"
            style={{ top: layout.headerPaddingTop }}
          >
            <MaterialIcons name="close" size={22} color="#ffffff" />
          </TouchableOpacity>
          {photoPreview ? (
            <>
              <Text className="text-white text-center font-semibold mb-4">{photoPreview.title}</Text>
              <Image source={{ uri: photoPreview.uri }} style={{ width: '100%', height: '70%' }} resizeMode="contain" />
            </>
          ) : null}
        </View>
      </Modal>
    </>
  );
}
