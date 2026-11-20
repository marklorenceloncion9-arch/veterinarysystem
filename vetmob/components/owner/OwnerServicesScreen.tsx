import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { View, ScrollView, TouchableOpacity, TextInput, Modal, Alert, ActivityIndicator, RefreshControl, Text, Image, Platform } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { LoadingState } from '@/components/LoadingState';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/auth-context';
import { showToast } from '@/components/Toast';
import Holidays from 'date-holidays';
import { getPetIdentificationDisplay } from '@/utils/petIdentification';
import { getStatusIcon, getStatusStyle } from '@/utils/bookingStatus';
import {
  getActiveOwnerAppointments,
  getHistoryOwnerAppointments,
  getOwnerBookingTypeBadge,
  getOwnerBookingTypeLabel,
  type OwnerBookingType,
} from '@/utils/ownerAppointmentLists';
import { uploadImageToCloudinary } from '@/utils/cloudinary';
import {
  MeetingPlaceMap,
  isInsideElSalvadorCity,
  type MeetingCoordinate,
} from '@/components/MeetingPlaceMap';
import { MeetingPlaceLocationPicker } from '@/components/MeetingPlaceLocationPicker';
import { formatAppointmentTimeLabel } from '@/utils/appointmentDisplay';

const imageMediaTypes: ImagePicker.MediaType[] = ['images'];

// Diri ang fade-in animation sa matag resulta.
const getResultEntering = (index: number) => {
  const delay = Math.min(index * 40, 240);
  return FadeInDown.delay(delay).duration(250);
};

// Diri ang usa ka row sa detalye.
function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View className={`mb-4 pb-4 ${last ? 'mb-0 pb-0' : 'border-b border-slate-100 dark:border-slate-700'}`}>
      <Text className="text-xs font-semibold text-slate-400 uppercase mb-1">{label}</Text>
      <Text className="text-base text-slate-800 dark:text-slate-200">{value || '-'}</Text>
    </View>
  );
}

interface Appointment {
  id: number;
  petName: string;
  service: string;
  services: string[];
  date: string;
  time: string;
  status: 'pending' | 'approved' | 'processing' | 'ongoing' | 'completed' | 'cancelled' | 'rejected';
  notes?: string;
  cancellation_reason?: string | null;
  status_message?: string | null;
  symptoms?: { name: string; days_count?: number; notes?: string }[];
  isBitten?: boolean;
  biteDetails?: string;
  isDoorToDoor?: boolean;
  bookingType?: OwnerBookingType;
  bookingTypeLabel?: string;
  meetingLatitude?: number | null;
  meetingLongitude?: number | null;
  meetingPlaceLabel?: string | null;
  meetingPlacePhotoUrl?: string | null;
  created_at?: string;
  updated_at?: string;
  status_history?: StatusHistoryItem[];
}

interface StatusHistoryItem {
  status: string;
  status_label: string;
  changed_by: string;
  action_label?: string;
  changed_at: string;
  changed_at_formatted: string;
  notes?: string | null;
}

interface TreatmentType {
  id: number;
  type_name: string;
  description: string | null;
  is_available?: boolean;
  unavailable_reason?: string | null;
}

interface Animal {
  id: number;
  pet_name: string;
  species_name?: string;
  breed_name?: string;
  identification_number?: string;
  registration_status?: string;
}

interface Symptom {
  id: number;
  name: string;
}

interface SelectedSymptom {
  symptom_id: number | string;
  days_count?: number;
  notes?: string;
}

interface TimeSlot {
  time: string;
  label: string;
  period: 'morning' | 'afternoon';
  hour?: string;
  available: boolean;
  occupied?: boolean;
  unavailable?: boolean;
  capacity?: number | null;
  booked?: number;
  remaining?: number | null;
  fully_booked?: boolean;
  unlimited?: boolean;
}

const SLOT_INCREMENT_MINUTES = 60;

// Diri kuhaon ra ang mga slot nga eksakto sa oras.
const toHourlySlots = (slots: TimeSlot[] = []): TimeSlot[] =>
  slots.filter((slot) => Number(String(slot.time || '').split(':')[1] || 0) === 0);

// Diri himuon ang label sa nabilin nga slot.
const slotCountLabel = (slot: TimeSlot) => {
  // Home services omit capacity (remaining/capacity are null). Number(null) is 0,
  // which previously made every unlimited slot look fully booked.
  if (slot.unlimited) return '';
  const remainingRaw = slot.remaining ?? slot.capacity;
  if (remainingRaw == null) return '';
  const remaining = Number(remainingRaw);
  if (slot.fully_booked || (Number.isFinite(remaining) && remaining <= 0)) {
    return 'Fully booked';
  }
  if (!Number.isFinite(remaining)) {
    return '';
  }
  return `${remaining} available`;
};

const SERVICE_DURATIONS: Record<string, number> = {
  treatment: 10,
  deworming: 10,
  vaccination: 10,
  vitamin: 10,
  spay: 60,
  castration: 40,
};

const SERVICE_ID_TO_NAME: Record<string, string> = {
  treatment: 'Treatment',
  deworming: 'Deworming',
  vaccination: 'Vaccination',
  vitamin: 'Vitamin Supplement',
  spay: 'Spay',
  castration: 'Castration',
};

const SERVICE_NAME_TO_ID: Record<string, string> = {
  Treatment: 'treatment',
  Deworming: 'deworming',
  Vaccination: 'vaccination',
  'Vitamin Supplement': 'vitamin',
  'Vitamin Supplements': 'vitamin',
  Spay: 'spay',
  Castration: 'castration',
};

const TREATMENT_DURATION_MINUTES = 10;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CLOSED_DAYS = [0, 5, 6];

const NO_BOUNCE_SCROLL = {
  bounces: false,
  overScrollMode: 'never' as const,
};

// Diri ang modal sa success message.
function SuccessMessageModal({
  visible,
  title,
  message,
  onClose,
}: {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <View className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-2xl">
          <View className="items-center">
            <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <MaterialIcons name="check-circle" size={36} color="#16a34a" />
            </View>
            <ThemedText className="text-center text-lg font-bold text-slate-900 dark:text-white">{title}</ThemedText>
            <ThemedText className="mt-2 text-center text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {message}
            </ThemedText>
            <TouchableOpacity
              onPress={onClose}
              className="mt-6 w-full items-center rounded-xl bg-blue-600 py-3.5"
            >
              <Text className="text-base font-semibold text-white">OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const phHolidays = new Holidays('PH');

// Diri i-format ang Date ngadto sa YYYY-MM-DD.
const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Diri kuhaon ang mga holiday sa usa ka bulan.
const buildMonthHolidaySet = (year: number, month: number): Set<string> => {
  const holidays = new Set<string>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatLocalDate(new Date(year, month, day));
    if (phHolidays.isHoliday(dateStr)) {
      holidays.add(dateStr);
    }
  }
  return holidays;
};

interface CalendarDay {
  day: number;
  date: string;
  isToday: boolean;
  isPast: boolean;
  isClosedDay: boolean;
  isHoliday: boolean;
}

// Diri buhaton ang mga adlaw sa calendar.
const buildCalendarDays = (
  year: number,
  month: number,
  holidaySet: Set<string>,
  todayStr: string,
): (CalendarDay | null)[] => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days: (CalendarDay | null)[] = [];

  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = formatLocalDate(date);
    days.push({
      day,
      date: dateStr,
      isToday: todayStr === dateStr,
      isPast: date < startOfToday,
      isClosedDay: CLOSED_DAYS.includes(date.getDay()),
      isHoliday: holidaySet.has(dateStr),
    });
  }

  return days;
};

interface UnavailableDateInfo {
  date: string;
  type: 'full_day' | 'morning' | 'afternoon';
  reason?: string | null;
}

interface CalendarDayCellProps {
  date: CalendarDay;
  isSelected: boolean;
  unavailabilityType?: UnavailableDateInfo['type'] | null;
  isDisabled: boolean;
  onSelect: (dateStr: string) => void;
}

// Diri ang usa ka adlaw sa calendar.
const CalendarDayCell = memo(function CalendarDayCell({
  date,
  isSelected,
  unavailabilityType,
  isDisabled,
  onSelect,
}: CalendarDayCellProps) {
  const isFullDayUnavailable = unavailabilityType === 'full_day';
  const isHalfDayUnavailable = unavailabilityType === 'morning' || unavailabilityType === 'afternoon';
  const halfDayLabel = unavailabilityType === 'morning'
    ? 'PM'
    : unavailabilityType === 'afternoon'
    ? 'AM'
    : null;

  return (
    <View className="w-[14.28%] aspect-square p-1">
      <TouchableOpacity
        onPress={() => onSelect(date.date)}
        disabled={isDisabled}
        className={`flex-1 items-center justify-center rounded-lg ${
          isSelected
            ? 'bg-blue-600'
            : date.isHoliday
            ? 'bg-rose-200 dark:bg-rose-900/40'
            : date.isClosedDay
            ? 'bg-red-200 dark:bg-red-900/40'
            : isFullDayUnavailable
            ? 'bg-red-100 dark:bg-red-900/30'
            : isHalfDayUnavailable
            ? 'bg-amber-100 dark:bg-amber-900/30'
            : date.isToday
            ? 'bg-blue-100 dark:bg-blue-900/30'
            : date.isPast
            ? 'bg-slate-100 dark:bg-slate-800'
            : 'bg-slate-50 dark:bg-slate-700'
        }`}
      >
        <ThemedText
          className={`text-sm font-medium ${
            isSelected
              ? ''
              : date.isHoliday
              ? 'text-rose-700 dark:text-rose-300'
              : date.isClosedDay
              ? 'text-red-700 dark:text-red-300'
              : isFullDayUnavailable
              ? 'text-red-600 dark:text-red-400'
              : isHalfDayUnavailable
              ? 'text-amber-700 dark:text-amber-300'
              : date.isToday
              ? 'text-blue-600 dark:text-blue-400'
              : date.isPast
              ? 'text-slate-400 dark:text-slate-600'
              : 'text-slate-700 dark:text-slate-300'
          }`}
          style={isSelected ? { color: '#ffffff' } : undefined}
        >
          {date.day}
        </ThemedText>
        {halfDayLabel && (
          <ThemedText
            className={`text-[9px] font-semibold mt-0.5 ${
              isSelected ? '' : 'text-amber-700 dark:text-amber-300'
            }`}
            style={isSelected ? { color: 'rgba(255,255,255,0.9)' } : undefined}
          >
            {halfDayLabel}
          </ThemedText>
        )}
        {(date.isClosedDay || date.isHoliday || isFullDayUnavailable) && (
          <View className={`absolute bottom-1 w-1 h-1 rounded-full ${date.isHoliday ? 'bg-rose-600' : 'bg-red-600'}`} />
        )}
      </TouchableOpacity>
    </View>
  );
});

interface BookingCalendarProps {
  currentMonth: Date;
  onMonthChange: (offset: number) => void;
  selectedDate: string;
  unavailableDates: UnavailableDateInfo[];
  canSelect: boolean;
  onSelectDate: (dateStr: string) => void;
}

// Diri ang calendar para pilion ang petsa sa booking.
const BookingCalendar = memo(function BookingCalendar({
  currentMonth,
  onMonthChange,
  selectedDate,
  unavailableDates,
  canSelect,
  onSelectDate,
}: BookingCalendarProps) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const holidaySet = useMemo(() => buildMonthHolidaySet(year, month), [year, month]);
  const todayStr = useMemo(() => formatLocalDate(new Date()), [year, month]);
  const calendarDays = useMemo(
    () => buildCalendarDays(year, month, holidaySet, todayStr),
    [year, month, holidaySet, todayStr],
  );
  const unavailableMap = useMemo(() => {
    const map = new Map<string, UnavailableDateInfo>();
    unavailableDates.forEach((entry) => map.set(entry.date, entry));
    return map;
  }, [unavailableDates]);

  // Diri pilion ang petsa kung pwede.
  const handleSelect = useCallback(
    (dateStr: string) => {
      if (canSelect) {
        onSelectDate(dateStr);
      }
    },
    [canSelect, onSelectDate],
  );

  return (
    <View className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-600">
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity onPress={() => onMonthChange(-1)} className="p-2">
          <MaterialIcons name="chevron-left" size={24} color="#64748b" />
        </TouchableOpacity>
        <ThemedText className="text-base font-semibold text-slate-800 dark:text-white">
          {MONTH_NAMES[month]} {year}
        </ThemedText>
        <TouchableOpacity onPress={() => onMonthChange(1)} className="p-2">
          <MaterialIcons name="chevron-right" size={24} color="#64748b" />
        </TouchableOpacity>
      </View>

      <View className="flex-row mb-2">
        {WEEK_DAYS.map((day) => (
          <View key={day} className="flex-1 items-center py-2">
            <ThemedText className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {day}
            </ThemedText>
          </View>
        ))}
      </View>

      <View className="flex-row flex-wrap">
        {calendarDays.map((date, index) => {
          if (!date) {
            return <View key={`empty-${index}`} className="w-[14.28%] aspect-square p-1" />;
          }

          const unavailability = unavailableMap.get(date.date);
          const unavailabilityType = unavailability?.type ?? null;
          const isFullDayUnavailable = unavailabilityType === 'full_day';
          const isClosedOrHoliday = date.isClosedDay || date.isHoliday;
          const isDisabled = !canSelect || date.isPast || isFullDayUnavailable || isClosedOrHoliday;

          return (
            <CalendarDayCell
              key={date.date}
              date={date}
              isSelected={selectedDate === date.date}
              unavailabilityType={unavailabilityType}
              isDisabled={isDisabled}
              onSelect={handleSelect}
            />
          );
        })}
      </View>

      <View className="flex-row flex-wrap gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded mr-1" style={{ backgroundColor: '#1F7A8C' }} />
          <ThemedText className="text-xs text-slate-600 dark:text-slate-400">Selected</ThemedText>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-900/30 mr-1" />
          <ThemedText className="text-xs text-slate-600 dark:text-slate-400">Today</ThemedText>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded bg-red-200 dark:bg-red-900/40 mr-1" />
          <ThemedText className="text-xs text-slate-600 dark:text-slate-400">Fri, Sat, Sun (Closed)</ThemedText>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded bg-rose-200 dark:bg-rose-900/40 mr-1" />
          <ThemedText className="text-xs text-slate-600 dark:text-slate-400">Holiday</ThemedText>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded bg-red-100 dark:bg-red-900/30 mr-1" />
          <ThemedText className="text-xs text-slate-600 dark:text-slate-400">Unavailable (Full Day)</ThemedText>
        </View>
        <View className="flex-row items-center">
          <View className="w-3 h-3 rounded bg-amber-100 dark:bg-amber-900/30 mr-1" />
          <ThemedText className="text-xs text-slate-600 dark:text-slate-400">Half Day (AM/PM label)</ThemedText>
        </View>
      </View>
    </View>
  );
});

// Diri i-convert ang oras nga label ngadto sa minutos.
const labelToMinutes = (label: string): number => {
  const [time, period] = label.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

// Diri i-convert ang minutos ngadto sa oras nga label.
const minutesToLabel = (totalMinutes: number): string => {
  const hours24 = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  return `${hours12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${period}`;
};

// Diri i-format ang gidugayon sa minutos o oras.
const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
};

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
  approved: { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-300', icon: '#1F7A8C' },
  processing: { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-300', icon: '#7c3aed' },
  ongoing: { bg: 'bg-indigo-50 dark:bg-indigo-900/20', text: 'text-indigo-700 dark:text-indigo-300', icon: '#4f46e5' },
  completed: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', icon: '#059669' },
  cancelled: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', icon: '#dc2626' },
  rejected: { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', icon: '#dc2626' },
};

// Diri ipakita ang timeline sa status sa appointment.
const AppointmentStatusTimeline = memo(function AppointmentStatusTimeline({
  history,
}: {
  history: StatusHistoryItem[];
}) {
  if (!history || history.length === 0) {
    return null;
  }

  return (
    <View className="mb-4">
      <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Status History</Text>
      <View className="bg-slate-50 dark:bg-slate-700/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700">
        {history.map((entry, index) => {
          const colors = STATUS_HISTORY_COLORS[entry.status] ?? STATUS_HISTORY_COLORS.pending;
          const icon = STATUS_HISTORY_ICONS[entry.status] ?? 'info';
          const isLast = index === history.length - 1;
          const actionLabel = entry.action_label || `${entry.status_label} by ${entry.changed_by}`;

          return (
            <View key={`${entry.status}-${entry.changed_at}-${index}`} className="flex-row">
              <View className="items-center mr-3">
                <View className={`w-8 h-8 rounded-full items-center justify-center ${colors.bg}`}>
                  <MaterialIcons name={icon} size={16} color={colors.icon} />
                </View>
                {!isLast && <View className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-600 my-1" />}
              </View>
              <View className={`flex-1 ${isLast ? '' : 'pb-4'}`}>
                <ThemedText className={`font-semibold text-sm ${colors.text}`}>
                  {actionLabel}
                </ThemedText>
                <View className="flex-row items-center mt-1">
                  <MaterialIcons name="access-time" size={13} color="#64748b" />
                  <ThemedText className="text-xs text-slate-500 ml-1">
                    {entry.changed_at_formatted || entry.changed_at}
                  </ThemedText>
                </View>
                {entry.notes ? (
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-4">
                    {entry.notes}
                  </ThemedText>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

// Diri ipakita ang mensahe base sa status sa appointment.
const AppointmentStatusMessage = memo(function AppointmentStatusMessage({
  appointment,
  compact = false,
}: {
  appointment: Appointment;
  compact?: boolean;
}) {
  const isApproved = appointment.status === 'approved';
  const isCancelled = appointment.status === 'cancelled';

  if (!isApproved && !isCancelled) {
    return null;
  }

  if (isCancelled) {
    if (compact && appointment.cancellation_reason) {
      return (
        <View className="mt-2 rounded-lg bg-red-50 dark:bg-red-900/20 px-2 py-1.5">
          <ThemedText className="text-xs text-red-600 dark:text-red-400 leading-4" numberOfLines={2}>
            {appointment.cancellation_reason}
          </ThemedText>
        </View>
      );
    }

    return null;
  }

  if (!appointment.status_message) {
    return null;
  }

  return (
    <View
      className={`rounded-xl border ${
        compact ? 'mt-2 p-2' : 'mb-4 p-3'
      } bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800`}
    >
      <View className="flex-row items-start">
        <MaterialIcons
          name="check-circle"
          size={compact ? 16 : 18}
          color="#1F7A8C"
          style={{ marginTop: 1, marginRight: 8 }}
        />
        <View className="flex-1">
          <ThemedText
            className={`font-semibold ${
              compact ? 'text-xs' : 'text-sm'
            } text-blue-700 dark:text-blue-300`}
          >
            Appointment Approved
          </ThemedText>
          <ThemedText
            className={`mt-1 leading-5 ${
              compact ? 'text-xs' : 'text-sm'
            } text-blue-700 dark:text-blue-300`}
          >
            {appointment.status_message}
          </ThemedText>
        </View>
      </View>
    </View>
  );
});

// Diri ang services screen sa owner para sa booking.
export default function ServicesScreen() {
  const { token } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentFilter, setAppointmentFilter] = useState<'appointments' | 'history'>('appointments');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [bookingTypePickerVisible, setBookingTypePickerVisible] = useState(false);
  const [doorToDoorNoticeVisible, setDoorToDoorNoticeVisible] = useState(false);
  const [isDoorToDoorBooking, setIsDoorToDoorBooking] = useState(false);
  const [meetingCoordinate, setMeetingCoordinate] = useState<MeetingCoordinate | null>(null);
  const [meetingPlacePhotoUrl, setMeetingPlacePhotoUrl] = useState<string | null>(null);
  const [uploadingMeetingPlacePhoto, setUploadingMeetingPlacePhoto] = useState(false);
  const [treatmentTypes, setTreatmentTypes] = useState<TreatmentType[]>([]);
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [showAnimalDropdown, setShowAnimalDropdown] = useState(false);
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<SelectedSymptom[]>([]);
  const [showSymptomModal, setShowSymptomModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1); // Step 1: Treatment, Step 2: Services, Step 3: Schedule, Step 4: Review (or Meeting Place for door-to-door)
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [newAppointment, setNewAppointment] = useState({
    petId: 0,
    petName: '',
    service: '',
    serviceType: '', // 'treatment' or 'preventive'
    date: '',
    time: '',
    notes: '',
    isBitten: false,
    biteDetails: '',
  });
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editServicesModalVisible, setEditServicesModalVisible] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editSelectedServices, setEditSelectedServices] = useState<string[]>([]);
  const [editSelectedSymptoms, setEditSelectedSymptoms] = useState<SelectedSymptom[]>([]);
  const [editIsBitten, setEditIsBitten] = useState(false);
  const [editBiteDetails, setEditBiteDetails] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editAvailableTimeSlots, setEditAvailableTimeSlots] = useState<TimeSlot[]>([]);
  const [editLoadingTimeSlots, setEditLoadingTimeSlots] = useState(false);
  const [editMeetingPlacePhotoUrl, setEditMeetingPlacePhotoUrl] = useState<string | null>(null);
  const [editUploadingMeetingPlacePhoto, setEditUploadingMeetingPlacePhoto] = useState(false);
  const [successModal, setSuccessModal] = useState({ visible: false, title: '', message: '' });
  const successModalCallbackRef = useRef<(() => void) | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);

  const treatmentOption = {
    id: 'treatment',
    name: 'Treatment',
    icon: 'healing',
    duration: TREATMENT_DURATION_MINUTES,
  };

  const preventiveServiceOptions = [
    { id: 'deworming', name: 'Deworming', icon: 'pets', duration: 10 },
    { id: 'vaccination', name: 'Vaccination', icon: 'vaccines', duration: 10 },
    { id: 'vitamin', name: 'Vitamin Supplements', icon: 'medication', duration: 10 },
    { id: 'spay', name: 'Spay', icon: 'medical-services', duration: 60 },
    { id: 'castration', name: 'Castration', icon: 'medical-services', duration: 40 },
  ];

  const allServiceOptions = [treatmentOption, ...preventiveServiceOptions];

  // Home Services (door-to-door) only supports these 4 preventive services —
  // no clinical treatment and no vitamin supplements, since fieldmen handle
  // a fixed set of home-visit services.
  const homeServicesOptions = preventiveServiceOptions.filter((service) =>
    ['deworming', 'vaccination', 'spay', 'castration'].includes(service.id)
  );
  const currentServiceOptions = isDoorToDoorBooking ? homeServicesOptions : preventiveServiceOptions;

  // Helper to get first treatment type name
  // Diri kuhaon ang unang treatment type.
  const getFirstTreatmentType = () => {
    return treatmentTypes.length > 0 ? treatmentTypes[0].type_name : '';
  };
  const [availableTimeSlots, setAvailableTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const treatmentSelected = selectedServices.includes('treatment');
  const canProceedFromStep1 =
    newAppointment.petId > 0 && (!treatmentSelected || selectedSymptoms.length > 0);

  // Diri kwentahon ang total nga minutos sa serbisyo.
  const getTotalDurationMinutes = (services: string[] = selectedServices): number => {
    if (services.length === 0) return 0;
    return services.reduce((total, id) => total + (SERVICE_DURATIONS[id] || 0), 0);
  };

  // Diri kwentahon ang gidugayon para sa schedule.
  const getScheduleDurationMinutes = (services: string[] = selectedServices): number => {
    const serviceDuration = getTotalDurationMinutes(services);
    return serviceDuration > 0 ? serviceDuration : TREATMENT_DURATION_MINUTES;
  };

  // Diri kwentahon ang gidugayon sa tibuok booking.
  const getBookingDurationMinutes = (): number => {
    const serviceDuration = getTotalDurationMinutes();
    return serviceDuration > 0 ? serviceDuration : TREATMENT_DURATION_MINUTES;
  };

  // Diri kuhaon ang mga slot nga ma-okupar.
  const getReservedSlotLabels = (startLabel: string, durationMinutes: number): string[] => {
    if (!startLabel || durationMinutes <= 0) return [];
    const startMinutes = labelToMinutes(startLabel);
    const labels: string[] = [];
    for (let m = startMinutes; m < startMinutes + durationMinutes; m += SLOT_INCREMENT_MINUTES) {
      labels.push(minutesToLabel(m));
    }
    return labels;
  };

  // Diri i-una ang treatment sa lista sa serbisyo.
  const sortServicesWithTreatmentFirst = (services: string[]): string[] => {
    return [...services].sort((a, b) => {
      if (a === 'treatment' && b !== 'treatment') return -1;
      if (a !== 'treatment' && b === 'treatment') return 1;
      return 0;
    });
  };

  // Diri i-refresh ang time slots kung naay petsa na.
  const refreshTimeSlotsIfScheduled = (services: string[]) => {
    if (newAppointment.date && services.length > 0) {
      fetchAvailableTimeSlots(newAppointment.date, newAppointment.time, services);
      return;
    }

    setNewAppointment((prev) => ({ ...prev, time: '' }));
    setAvailableTimeSlots([]);
  };

  // Diri i-on o i-off ang treatment.
  const toggleTreatment = () => {
    if (treatmentSelected) {
      const nextServices = selectedServices.filter((id) => id !== 'treatment');
      setSelectedServices(nextServices);
      setSelectedSymptoms([]);
      setNewAppointment((prev) => ({
        ...prev,
        isBitten: false,
        biteDetails: '',
      }));
      refreshTimeSlotsIfScheduled(nextServices);
      return;
    }

    const nextServices = sortServicesWithTreatmentFirst([...selectedServices, 'treatment']);
    setSelectedServices(nextServices);
    refreshTimeSlotsIfScheduled(nextServices);
  };

  // Diri susihon kung available ang serbisyo.
  const getServiceAvailability = (serviceId: string): { available: boolean; reason: string | null } => {
    const serviceName = SERVICE_ID_TO_NAME[serviceId];
    if (!serviceName) {
      return { available: true, reason: null };
    }

    const match = treatmentTypes.find((t) => t.type_name === serviceName);
    if (!match) {
      return { available: true, reason: null };
    }

    return {
      available: match.is_available !== false,
      reason: match.unavailable_reason ?? null,
    };
  };

  // Diri pilion o tangtangon ang serbisyo.
  const toggleService = (serviceId: string) => {
    const { available } = getServiceAvailability(serviceId);
    const isSelected = selectedServices.includes(serviceId);
    if (!available && !isSelected) {
      return;
    }

    const nextServicesRaw = selectedServices.includes(serviceId)
      ? selectedServices.filter((id) => id !== serviceId)
      : [...selectedServices, serviceId];
    const nextServices = sortServicesWithTreatmentFirst(nextServicesRaw);

    setSelectedServices(nextServices);
    refreshTimeSlotsIfScheduled(nextServices);
  };

  const complaintOptions = [
    { id: 'not_eating', label: 'Not eating / Loss of appetite' },
    { id: 'vomiting', label: 'Vomiting' },
    { id: 'diarrhea', label: 'Diarrhea' },
    { id: 'lethargy', label: 'Lethargy / Weakness' },
    { id: 'coughing', label: 'Coughing / Sneezing' },
    { id: 'itching', label: 'Itching / Scratching' },
    { id: 'lameness', label: 'Lameness / Difficulty walking' },
    { id: 'eye_discharge', label: 'Eye discharge / Redness' },
    { id: 'ear_problem', label: 'Ear problem / Head shaking' },
    { id: 'weight_loss', label: 'Weight loss' },
    { id: 'excessive_thirst', label: 'Excessive thirst / Urination' },
    { id: 'behavior_change', label: 'Behavior change / Aggression' },
  ];

  // Fetch symptoms for complaint
  // Diri kuhaon ang lista sa sintomas.
  const fetchSymptoms = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/symptoms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setSymptoms(response.data.symptoms);
      }
    } catch (error) {
      console.error('Failed to fetch symptoms:', error);
    }
  };

  // Fetch appointments, treatment types, and animals from API
  useEffect(() => {
    // Diri kuhaon tanan data sa services screen.
    const loadData = async () => {
      if (!token) return;
      
      try {
        // Load all data in parallel for better performance
        await Promise.all([
          fetchAppointments(),
          fetchTreatmentTypes(),
          fetchAnimals(),
          fetchSymptoms()
        ]);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [token]);

  // Fetch available time slots when date or services change
  useEffect(() => {
    if (newAppointment.date && selectedServices.length > 0) {
      fetchAvailableTimeSlots(newAppointment.date, newAppointment.time, selectedServices);
    } else {
      setAvailableTimeSlots([]);
      if (selectedServices.length === 0) {
        setNewAppointment((prev) => ({ ...prev, time: '' }));
      }
    }
  }, [newAppointment.date, selectedServices]);

  useEffect(() => {
    if (editServicesModalVisible && editDate && editSelectedServices.length > 0 && editingAppointment) {
      fetchEditAvailableTimeSlots(editDate, editTime, editSelectedServices, editingAppointment.id);
    } else if (!editServicesModalVisible) {
      setEditAvailableTimeSlots([]);
    }
  }, [editServicesModalVisible, editDate, editSelectedServices, editingAppointment?.id]);

  // Diri kuhaon ang mga hayop sa user.
  const fetchAnimals = async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/animals`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        // Show all animals including unregistered ones
        const allAnimals = response.data.animals || response.data.pets || [];
        setAnimals(allAnimals);
        // Set first animal as default if available
        if (allAnimals.length > 0) {
          const firstAnimal = allAnimals[0];
          setNewAppointment(prev => ({
            ...prev,
            petId: firstAnimal.id,
            petName: firstAnimal.pet_name
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch animals:', error);
    }
  };

  // Diri kuhaon ang mga treatment type.
  const fetchTreatmentTypes = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/services`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setTreatmentTypes(response.data.services);
        // Set default service to first service if available
        if (response.data.services.length > 0) {
          setNewAppointment(prev => ({
            ...prev,
            service: response.data.services[0].type_name
          }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
    }
  };

  // Diri kuhaon ang mga appointment sa user.
  const fetchAppointments = async () => {
    if (!token) return;
    
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/appointments`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setAppointments(
          (response.data.appointments || []).map((appointment: Appointment & {
            booking_type?: OwnerBookingType;
            booking_type_label?: string;
          }) => ({
            ...appointment,
            bookingType: appointment.bookingType || appointment.booking_type,
            bookingTypeLabel: appointment.bookingTypeLabel || appointment.booking_type_label,
          }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch appointments:', error);
    }
  };

  // Diri i-refresh ang lista sa appointment.
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAppointments();
    setRefreshing(false);
  };

  // Diri susihon kung pwede pa ma-cancel ang appointment.
  const canCancelAppointment = (status: string) => status === 'approved';

  // Diri susihon kung pwede pa usbon ang serbisyo.
  const canEditAppointmentServices = (status: string) => status === 'pending';

  // Diri i-convert ang ngalan sa serbisyo ngadto sa ID.
  const mapServiceNamesToIds = (serviceNames: string[]): string[] => {
    const ids = serviceNames
      .map((name) => SERVICE_NAME_TO_ID[name])
      .filter((id): id is string => !!id);
    return sortServicesWithTreatmentFirst([...new Set(ids)]);
  };

  // Diri i-convert ang sintomas ngadto sa napili nga format.
  const mapSymptomsToSelected = (
    symptoms: { name: string; days_count?: number }[] = []
  ): SelectedSymptom[] => {
    const mapped: SelectedSymptom[] = [];
    symptoms.forEach((symptom) => {
      const complaint = complaintOptions.find(
        (option) => option.id === symptom.name || option.label === symptom.name
      );
      if (!complaint) return;
      mapped.push({
        symptom_id: complaint.id,
        days_count: symptom.days_count || 1,
      });
    });
    return mapped;
  };

  // Diri kwentahon ang total minutos sa gi-edit nga serbisyo.
  const getEditTotalDurationMinutes = (services: string[] = editSelectedServices): number => {
    if (services.length === 0) return 0;
    return services.reduce((total, id) => total + (SERVICE_DURATIONS[id] || 0), 0);
  };

  // Diri kwentahon ang gidugayon sa gi-edit nga schedule.
  const getEditScheduleDurationMinutes = (services: string[] = editSelectedServices): number => {
    const serviceDuration = getEditTotalDurationMinutes(services);
    return serviceDuration > 0 ? serviceDuration : TREATMENT_DURATION_MINUTES;
  };

  // Diri kuhaon ang available nga oras para sa edit.
  const fetchEditAvailableTimeSlots = async (
    date: string,
    selectedTimeLabel?: string,
    services: string[] = editSelectedServices,
    appointmentId?: number
  ) => {
    const durationMinutes = getEditScheduleDurationMinutes(services);

    setEditLoadingTimeSlots(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/available-time-slots`, {
        params: {
          date,
          duration_minutes: durationMinutes,
          exclude_appointment_id: appointmentId,
          is_door_to_door: editingAppointment?.isDoorToDoor || false,
          _t: Date.now(),
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        const slots: TimeSlot[] = toHourlySlots(response.data.slots || []);
        setEditAvailableTimeSlots(slots);

        const timeToCheck = selectedTimeLabel ?? editTime;
        if (timeToCheck) {
          const selectedSlot = slots.find((slot) => slot.label === timeToCheck);
          if (!selectedSlot?.available) {
            setEditTime('');
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch edit time slots:', error);
    } finally {
      setEditLoadingTimeSlots(false);
    }
  };

  // Diri i-refresh ang oras sa edit kung naay petsa.
  const refreshEditTimeSlotsIfScheduled = (services: string[]) => {
    if (editDate && services.length > 0 && editingAppointment) {
      fetchEditAvailableTimeSlots(editDate, editTime, services, editingAppointment.id);
      return;
    }

    setEditTime('');
    setEditAvailableTimeSlots([]);
  };

  // Diri pilion ang bag-ong petsa sa edit.
  const handleSelectEditDate = (dateStr: string) => {
    setEditDate(dateStr);
    setEditTime('');
  };

  // Diri i-on o i-off ang treatment sa edit.
  const toggleEditTreatment = () => {
    if (editSelectedServices.includes('treatment')) {
      const nextServices = editSelectedServices.filter((id) => id !== 'treatment');
      setEditSelectedServices(nextServices);
      setEditSelectedSymptoms([]);
      setEditIsBitten(false);
      setEditBiteDetails('');
      refreshEditTimeSlotsIfScheduled(nextServices);
      return;
    }

    const nextServices = sortServicesWithTreatmentFirst([...editSelectedServices, 'treatment']);
    setEditSelectedServices(nextServices);
    refreshEditTimeSlotsIfScheduled(nextServices);
  };

  // Diri pilion o tangtangon ang serbisyo sa edit.
  const toggleEditService = (serviceId: string) => {
    const { available } = getServiceAvailability(serviceId);
    const isSelected = editSelectedServices.includes(serviceId);
    if (!available && !isSelected) {
      return;
    }

    const nextServicesRaw = editSelectedServices.includes(serviceId)
      ? editSelectedServices.filter((id) => id !== serviceId)
      : [...editSelectedServices, serviceId];
    const nextServices = sortServicesWithTreatmentFirst(nextServicesRaw);
    setEditSelectedServices(nextServices);
    refreshEditTimeSlotsIfScheduled(nextServices);
  };

  // Diri ablihan ang modal sa pag-edit sa serbisyo.
  const openEditServicesModal = (appointment: Appointment) => {
    const serviceNames = appointment.services?.length
      ? appointment.services
      : appointment.service
      ? [appointment.service]
      : [];

    setEditingAppointment(appointment);
    setEditSelectedServices(mapServiceNamesToIds(serviceNames));
    setEditSelectedSymptoms(mapSymptomsToSelected(appointment.symptoms));
    setEditIsBitten(!!appointment.isBitten);
    setEditBiteDetails(appointment.biteDetails || '');
    setEditDate(appointment.date);
    setEditTime(appointment.time);
    setEditMeetingPlacePhotoUrl(appointment.meetingPlacePhotoUrl || null);
    const [year, month] = appointment.date.split('-').map(Number);
    setCurrentMonth(new Date(year, month - 1, 1));
    setEditServicesModalVisible(true);
    setDetailModalVisible(false);
  };

  // Diri isira ang modal sa pag-edit sa serbisyo.
  const closeEditServicesModal = () => {
    if (editSubmitting) return;
    setEditServicesModalVisible(false);
    setEditingAppointment(null);
    setEditSelectedServices([]);
    setEditSelectedSymptoms([]);
    setEditIsBitten(false);
    setEditBiteDetails('');
    setEditDate('');
    setEditTime('');
    setEditMeetingPlacePhotoUrl(null);
    setEditUploadingMeetingPlacePhoto(false);
    setEditAvailableTimeSlots([]);
  };

  // Diri ipakita ang success message.
  const showSuccessMessage = (title: string, message: string, onDismiss?: () => void) => {
    successModalCallbackRef.current = onDismiss ?? null;
    setSuccessModal({ visible: true, title, message });
  };

  // Diri isira ang success message.
  const closeSuccessMessage = () => {
    setSuccessModal({ visible: false, title: '', message: '' });
    const callback = successModalCallbackRef.current;
    successModalCallbackRef.current = null;
    callback?.();
  };

  // Diri kuhaon ang treatment type ID sa napili nga serbisyo.
  const buildTreatmentTypeIds = (serviceIds: string[]): number[] => {
    const selectedTreatmentTypeIds: number[] = [];

    serviceIds.forEach((serviceId) => {
      const serviceName = SERVICE_ID_TO_NAME[serviceId];
      if (!serviceName) return;

      const treatmentType = treatmentTypes.find((t) => t.type_name === serviceName);
      if (treatmentType) {
        selectedTreatmentTypeIds.push(treatmentType.id);
      }
    });

    const treatmentService = treatmentTypes.find((t) => t.type_name === 'Treatment');
    if (treatmentService && selectedTreatmentTypeIds.includes(treatmentService.id)) {
      return [
        treatmentService.id,
        ...selectedTreatmentTypeIds.filter((id) => id !== treatmentService.id),
      ];
    }

    return selectedTreatmentTypeIds;
  };

  // Diri i-save ang gi-edit nga serbisyo sa appointment.
  const saveEditedServices = async () => {
    if (!token || !editingAppointment) {
      Alert.alert('Error', 'Please login first');
      return;
    }

    if (editSelectedServices.length === 0) {
      Alert.alert(
        'Required',
        editingAppointment?.isDoorToDoor
          ? 'Please select at least one service.'
          : 'Please select treatment or at least one service.'
      );
      return;
    }

    if (editSelectedServices.includes('treatment') && editSelectedSymptoms.length === 0) {
      Alert.alert('Required', 'Please select at least one symptom, or deselect treatment.');
      return;
    }

    if (!editDate) {
      Alert.alert('Required', 'Please select a date.');
      return;
    }

    if (!editTime) {
      Alert.alert('Required', 'Please select a time slot.');
      return;
    }

    if (editUploadingMeetingPlacePhoto) {
      Alert.alert('Please wait', 'Your landmark photo is still uploading.');
      return;
    }

    const orderedTreatmentTypeIds = buildTreatmentTypeIds(editSelectedServices);
    const primaryTreatmentTypeId = orderedTreatmentTypeIds[0] ?? null;

    if (!primaryTreatmentTypeId) {
      Alert.alert('Error', 'Please select valid services');
      return;
    }

    const durationMinutes = getEditTotalDurationMinutes() || TREATMENT_DURATION_MINUTES;

    try {
      const slotResponse = await axios.get(`${API_BASE_URL}/api/mobile/available-time-slots`, {
        params: {
          date: editDate,
          duration_minutes: durationMinutes,
          exclude_appointment_id: editingAppointment.id,
          is_door_to_door: editingAppointment.isDoorToDoor || false,
          _t: Date.now(),
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (slotResponse.data.success) {
        const slots: TimeSlot[] = slotResponse.data.slots || [];
        const selectedSlot = slots.find((slot) => slot.label === editTime);
        if (!selectedSlot?.available) {
          showToast({
            type: 'error',
            message: 'This time slot is no longer available. Please choose another time.',
          });
          return;
        }
      }
    } catch {
      // Continue — backend performs the final slot validation.
    }

    const formattedSymptoms = editSelectedServices.includes('treatment')
      ? editSelectedSymptoms.map((symptom) => ({
          name: symptom.symptom_id,
          days_count: symptom.days_count,
        }))
      : [];

    setEditSubmitting(true);

    try {
      const response = await axios.patch(
        `${API_BASE_URL}/api/mobile/appointments/${editingAppointment.id}/services`,
        {
          treatment_type_id: primaryTreatmentTypeId,
          treatment_type_ids: orderedTreatmentTypeIds,
          appointment_date: editDate,
          appointment_time: convertTo24Hour(editTime),
          symptoms: formattedSymptoms,
          is_bitten: editIsBitten,
          bite_details: editIsBitten ? editBiteDetails : null,
          meeting_place_photo_url: editingAppointment.isDoorToDoor
            ? (editMeetingPlacePhotoUrl || null)
            : undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        const updatedAppointment = response.data.appointment as Appointment;
        setAppointments((prev) =>
          prev.map((item) => (item.id === updatedAppointment.id ? { ...item, ...updatedAppointment } : item))
        );
        setSelectedAppointment((prev) =>
          prev?.id === updatedAppointment.id ? { ...prev, ...updatedAppointment } : prev
        );
        closeEditServicesModal();
        showSuccessMessage(
          'Appointment Updated',
          'Your changes have been saved. The clinic will review your updated appointment.',
          () => setDetailModalVisible(true),
        );
      } else {
        Alert.alert('Error', response.data.error || 'Failed to update appointment');
      }
    } catch (error: any) {
      let message = 'Failed to update appointment';
      const data = error.response?.data;

      if (data?.error) {
        message = data.error;
      } else if (data?.message && data.message !== 'Server Error') {
        message = data.message;
      }

      showToast({ type: 'error', message });
    } finally {
      setEditSubmitting(false);
    }
  };

  // Convert 12-hour time ("09:00 AM") to 24-hour format ("09:00") for API
  // Diri i-convert ang 12-hour nga oras ngadto sa 24-hour.
  const convertTo24Hour = (time12h: string): string => {
    const [time, period] = time12h.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    
    if (period === 'PM' && hours !== 12) {
      hours += 12;
    } else if (period === 'AM' && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // Diri kuhaon ang available nga oras sa petsa.
  const fetchAvailableTimeSlots = async (
    date: string,
    selectedTimeLabel?: string,
    services: string[] = selectedServices
  ) => {
    const durationMinutes = getScheduleDurationMinutes(services);

    setLoadingTimeSlots(true);
    try {
      const timestamp = Date.now();
      const response = await axios.get(`${API_BASE_URL}/api/mobile/available-time-slots`, {
        params: {
          date,
          duration_minutes: durationMinutes,
          is_door_to_door: isDoorToDoorBooking,
          _t: timestamp,
        },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        const slots: TimeSlot[] = toHourlySlots(response.data.slots);
        setAvailableTimeSlots(slots);

        const timeToCheck = selectedTimeLabel ?? newAppointment.time;
        if (timeToCheck) {
          const selectedSlot = slots.find((s) => s.label === timeToCheck);
          // API already validates whether the full duration can start at this label.
          // Checking every reserved label for "available" causes false negatives on long bookings.
          if (!selectedSlot?.available) {
            setNewAppointment((prev) => ({ ...prev, time: '' }));
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch time slots:', error);
    } finally {
      setLoadingTimeSlots(false);
    }
  };

  // Diri susihon kung available pa ang napili nga oras.
  const isSelectedSlotStillAvailable = async (durationMinutes?: number): Promise<boolean> => {
    if (!newAppointment.date || !newAppointment.time) {
      return false;
    }

    const duration = durationMinutes ?? getScheduleDurationMinutes();
    if (duration <= 0) {
      return false;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/available-time-slots`, {
        params: {
          date: newAppointment.date,
          duration_minutes: duration,
          is_door_to_door: isDoorToDoorBooking,
          _t: Date.now(),
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.data.success) {
        return false;
      }

      const slots: TimeSlot[] = toHourlySlots(response.data.slots || []);
      setAvailableTimeSlots(slots);

      const selectedSlot = slots.find((s) => s.label === newAppointment.time);
      return !!selectedSlot?.available;
    } catch {
      return false;
    }
  };

  // Diri pilion ang litrato sa meeting place.
  const pickMeetingPlacePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Permission needed', 'Photo library access is required to upload a landmark photo.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: imageMediaTypes,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setUploadingMeetingPlacePhoto(true);
      const uploadedUrl = await uploadImageToCloudinary(result.assets[0].uri);
      setMeetingPlacePhotoUrl(uploadedUrl);
      showToast({ type: 'success', message: 'Meeting place photo uploaded.' });
    } catch (error: any) {
      console.error('Meeting place photo upload error:', error);
      Alert.alert('Upload failed', error?.message || 'Failed to upload meeting place photo.');
    } finally {
      setUploadingMeetingPlacePhoto(false);
    }
  };

  // Diri pilion ang litrato sa meeting place sa edit.
  const pickEditMeetingPlacePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permission.status !== 'granted') {
          Alert.alert('Permission needed', 'Photo library access is required to upload a landmark photo.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: imageMediaTypes,
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setEditUploadingMeetingPlacePhoto(true);
      const uploadedUrl = await uploadImageToCloudinary(result.assets[0].uri);
      setEditMeetingPlacePhotoUrl(uploadedUrl);
      showToast({ type: 'success', message: 'Meeting place photo updated.' });
    } catch (error: any) {
      console.error('Edit meeting place photo upload error:', error);
      Alert.alert('Upload failed', error?.message || 'Failed to upload meeting place photo.');
    } finally {
      setEditUploadingMeetingPlacePhoto(false);
    }
  };

  // Diri i-book ang bag-ong appointment.
  const bookAppointment = async () => {
    if (!token) {
      Alert.alert('Error', 'Please login first');
      return;
    }

    if (!newAppointment.petId || !newAppointment.date) {
      Alert.alert('Error', 'Please select a pet and date');
      return;
    }
    
    if (!newAppointment.time || newAppointment.time.trim() === '') {
      Alert.alert('Error', 'Please select a time slot');
      return;
    }

    if (isDoorToDoorBooking) {
      if (!meetingCoordinate) {
        Alert.alert('Required', 'Please set your meeting place using GPS, the Mapbox map, or street address search.');
        return;
      }
      if (!isInsideElSalvadorCity(meetingCoordinate.latitude, meetingCoordinate.longitude)) {
        Alert.alert(
          'Outside El Salvador City',
          'You cannot continue with a location outside El Salvador City. Please choose a location inside the city.'
        );
        return;
      }
    }

    // Map selected service IDs to backend service names
    const selectedTreatmentTypeIds: number[] = [];
    selectedServices.forEach(serviceId => {
      const serviceName = SERVICE_ID_TO_NAME[serviceId as string];
      if (serviceName) {
        const treatmentType = treatmentTypes.find(t => t.type_name === serviceName);
        if (treatmentType) {
          selectedTreatmentTypeIds.push(treatmentType.id);
        }
      }
    });

    const treatmentService = treatmentTypes.find(t => t.type_name === 'Treatment');
    const orderedTreatmentTypeIds =
      treatmentService && selectedTreatmentTypeIds.includes(treatmentService.id)
        ? [
            treatmentService.id,
            ...selectedTreatmentTypeIds.filter((id) => id !== treatmentService.id),
          ]
        : selectedTreatmentTypeIds;

    // Use first selected service type as primary service
    const primaryTreatmentTypeId = orderedTreatmentTypeIds.length > 0
      ? orderedTreatmentTypeIds[0]
      : null;
    let serviceToBook = '';
    if (primaryTreatmentTypeId) {
      const primaryService = treatmentTypes.find(t => t.id === primaryTreatmentTypeId);
      serviceToBook = primaryService?.type_name || '';
    }

    // If no service to book, return error
    if (!serviceToBook || !primaryTreatmentTypeId) {
      Alert.alert('Error', 'Please select at least one service');
      return;
    }

    const bookingDurationMinutes = getBookingDurationMinutes();

    const slotStillAvailable = await isSelectedSlotStillAvailable(bookingDurationMinutes);
    if (!slotStillAvailable) {
      showToast({
        type: 'error',
        message: 'This time slot is no longer available. Please choose another time.',
      });
      setCurrentStep(1);
      return;
    }

    setBookingSubmitting(true);

    try {
      // Find treatment_type_id from service name
      const treatmentType = treatmentTypes.find(t => t.type_name === serviceToBook);
      if (!treatmentType) {
        Alert.alert('Error', 'Please select a valid service');
        return;
      }

      // Convert time to 24-hour format for API
      const time24h = convertTo24Hour(newAppointment.time);

      // Only include complaints when Treatment is selected
      const formattedSymptoms = selectedServices.includes('treatment')
        ? selectedSymptoms.map(s => ({
            name: s.symptom_id,
            days_count: s.days_count
          }))
        : [];

      // Prepare treatment type IDs (all selected preventive services)
      const treatmentTypeIds = [...orderedTreatmentTypeIds];

      const response = await axios.post(
        `${API_BASE_URL}/api/mobile/appointments`,
        {
          pet_id: newAppointment.petId,
          treatment_type_id: treatmentType.id,
          treatment_type_ids: treatmentTypeIds,
          appointment_date: newAppointment.date,
          appointment_time: time24h,
          duration_minutes: bookingDurationMinutes,
          notes: newAppointment.notes,
          symptoms: formattedSymptoms,
          is_bitten: newAppointment.isBitten || false,
          bite_details: newAppointment.isBitten ? newAppointment.biteDetails : null,
          is_door_to_door: isDoorToDoorBooking,
          meeting_latitude: isDoorToDoorBooking ? meetingCoordinate?.latitude : null,
          meeting_longitude: isDoorToDoorBooking ? meetingCoordinate?.longitude : null,
          meeting_place_photo_url: isDoorToDoorBooking ? meetingPlacePhotoUrl : null,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.data.success) {
        const wasDoorToDoor = isDoorToDoorBooking;
        fetchAppointments();

        const firstAnimal = animals.length > 0 ? animals[0] : null;
        setNewAppointment({
          petId: firstAnimal ? firstAnimal.id : 0,
          petName: firstAnimal ? firstAnimal.pet_name : '',
          service: getFirstTreatmentType(),
          date: '',
          time: '',
          notes: '',
          serviceType: '',
          isBitten: false,
          biteDetails: '',
        });
        setSelectedSymptoms([]);
        setSelectedServices([]);
        setCurrentStep(1);
        setAvailableTimeSlots([]);
        setMeetingCoordinate(null);
        setMeetingPlacePhotoUrl(null);
        setIsDoorToDoorBooking(false);
        setModalVisible(false);
        showSuccessMessage(
          wasDoorToDoor ? 'Home Services Booking Successful' : 'Booking Successful',
          wasDoorToDoor
            ? 'Your Home Services booking has been submitted. Your pinned location is marked as the MEETING PLACE in the system.'
            : 'Your appointment has been submitted for review. You will be notified once it is approved.',
        );
      }
    } catch (error: any) {
      let message = 'Failed to book appointment';
      
      // Handle Laravel validation errors (422)
      if (error.response?.data) {
        const data = error.response.data;
        
        if (data.errors || data.messages) {
          const validation = data.errors || data.messages;
          const errorMessages = Object.values(validation).flat().join('\n');
          message = errorMessages || 'Validation failed';
        } else if (data.message) {
          message = data.message;
        } else if (data.error) {
          message = data.error;
        } else if (typeof data === 'string') {
          message = data;
        }
      } else if (error.message) {
        message = error.message;
      }
      
      showToast({ type: 'error', message });
    } finally {
      setBookingSubmitting(false);
    }
  };

  // Diri i-cancel ang appointment human sa confirm.
  const cancelAppointment = (id: number) => {
    Alert.alert(
      'Cancel Appointment',
      'Are you sure you want to cancel this approved appointment?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;

            try {
              const response = await axios.patch(
                `${API_BASE_URL}/api/mobile/appointments/${id}/cancel`,
                { cancellation_reason: 'Cancelled by pet owner.' },
                {
                  headers: { Authorization: `Bearer ${token}` },
                }
              );

              if (response.data.success) {
                await fetchAppointments();
                if (selectedAppointment?.id === id) {
                  setDetailModalVisible(false);
                  setSelectedAppointment(null);
                }
                showToast({ type: 'success', message: 'Appointment cancelled successfully' });
              } else {
                showToast({
                  type: 'error',
                  message: response.data.message || response.data.error || 'Failed to cancel appointment',
                });
              }
            } catch (error: any) {
              console.error('Cancel appointment error:', error);
              let message = 'Failed to cancel appointment';

              if (error.response?.data?.error) {
                message = error.response.data.error;
              } else if (error.response?.data?.message && error.response.data.message !== 'Server Error') {
                message = error.response.data.message;
              }

              showToast({ type: 'error', message });
            }
          },
        },
      ]
    );
  };

  // Calendar state
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [unavailableDates, setUnavailableDates] = useState<UnavailableDateInfo[]>([]);

  // Diri ilisan ang bulan sa calendar.
  const handleMonthChange = useCallback((offset: number) => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  }, []);

  // Diri pilion ang petsa sa booking.
  const handleSelectBookingDate = useCallback((dateStr: string) => {
    setNewAppointment((prev) => ({ ...prev, date: dateStr, time: '' }));
  }, []);

  // Diri kuhaon ang mga petsa nga dili available.
  const fetchUnavailableDates = useCallback(async () => {
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth() + 1; // 1-based month
      const response = await axios.get(`${API_BASE_URL}/api/mobile/vet-unavailable-dates`, {
        params: { year, month },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setUnavailableDates(response.data.unavailable_dates);
      }
    } catch (error) {
      console.error('Failed to fetch unavailable dates:', error);
    }
  }, [currentMonth, token]);

  useEffect(() => {
    fetchUnavailableDates();
  }, [fetchUnavailableDates]);

  const activeCount = appointments.filter((a) =>
    ['pending', 'approved', 'processing', 'ongoing'].includes(a.status)
  ).length;
  const completedCount = appointments.filter((a) => a.status === 'completed').length;
  const cancelledCount = appointments.filter((a) => a.status === 'cancelled').length;
  const historyCount = completedCount + cancelledCount;

  const activeAppointments = useMemo(
    () => getActiveOwnerAppointments(appointments),
    [appointments]
  );

  const historyAppointments = useMemo(
    () => getHistoryOwnerAppointments(appointments, historyFilter),
    [appointments, historyFilter]
  );

  const filteredAppointments = appointmentFilter === 'appointments' ? activeAppointments : historyAppointments;

  const historyFilterOptions = [
    { id: 'all' as const, label: 'All', count: historyCount },
    { id: 'completed' as const, label: 'Completed', count: completedCount },
    { id: 'cancelled' as const, label: 'Cancelled', count: cancelledCount },
  ];

  // Diri kuhaon ang mensahe kung walay sulod ang filter.
  const getEmptyFilterMessage = () => {
    if (appointmentFilter === 'appointments') {
      return 'No active appointments.\nBook a visit to get started!';
    }

    switch (historyFilter) {
      case 'completed':
        return 'No completed appointments yet.';
      case 'cancelled':
        return 'No cancelled appointments.';
      default:
        return historyCount === 0
          ? 'No appointment history yet.\nCompleted and cancelled visits, including walk-ins, will appear here.'
          : 'No appointments match this filter.';
    }
  };

  // Diri ablihan ang pilianan sa klase sa booking.
  const openBookingTypePicker = () => {
    setBookingTypePickerVisible(true);
  };

  // Diri sugdan ang booking sa clinic.
  const startClinicBooking = () => {
    setBookingTypePickerVisible(false);
    setIsDoorToDoorBooking(false);
    setMeetingCoordinate(null);
    setMeetingPlacePhotoUrl(null);
    setNewAppointment({
      petId: 0,
      petName: '',
      service: '',
      serviceType: '',
      date: '',
      time: '',
      notes: '',
      isBitten: false,
      biteDetails: '',
    });
    setSelectedSymptoms([]);
    setSelectedServices([]);
    setCurrentMonth(new Date());
    setCurrentStep(1);
    setModalVisible(true);
  };

  // Diri sugdan ang door-to-door nga booking.
  const startDoorToDoorBooking = () => {
    setDoorToDoorNoticeVisible(false);
    setIsDoorToDoorBooking(true);
    setMeetingCoordinate(null);
    setMeetingPlacePhotoUrl(null);
    setNewAppointment({
      petId: 0,
      petName: '',
      service: '',
      serviceType: '',
      date: '',
      time: '',
      notes: '',
      isBitten: false,
      biteDetails: '',
    });
    setSelectedSymptoms([]);
    setSelectedServices([]);
    setCurrentMonth(new Date());
    setCurrentStep(1);
    setModalVisible(true);
  };

  // Diri ipakita ang pahibalo sa door-to-door.
  const openDoorToDoorNotice = () => {
    setBookingTypePickerVisible(false);
    setDoorToDoorNoticeVisible(true);
    setMeetingCoordinate(null);
    setMeetingPlacePhotoUrl(null);
  };

  // Diri isira ang pahibalo sa door-to-door.
  const closeDoorToDoorNotice = () => {
    setDoorToDoorNoticeVisible(false);
  };

  const openBookingModal = openBookingTypePicker;

  const reviewStep = isDoorToDoorBooking ? 5 : 4;
  const bookingSteps = isDoorToDoorBooking
    ? [
        { step: 1, label: 'Treatment' },
        { step: 2, label: 'Services' },
        { step: 3, label: 'Schedule' },
        { step: 4, label: 'Location' },
        { step: 5, label: 'Review' },
      ]
    : [
        { step: 1, label: 'Treatment' },
        { step: 2, label: 'Services' },
        { step: 3, label: 'Schedule' },
        { step: 4, label: 'Review' },
      ];

  // The vet is the shared resource behind both booking types, so vet day-off /
  // half-day unavailability applies to clinic appointments AND door-to-door alike.
  // Individual bookings (a specific clinic slot vs. a specific door-to-door slot)
  // still don't block each other — see fetchAvailableTimeSlots / is_door_to_door.

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      {/* Header */}
      <View className="bg-navy pt-12 pb-6 px-6" style={{ borderBottomWidth: 4, borderBottomColor: '#1F7A8C' }}>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-2xl font-bold text-white">Services</Text>
          <TouchableOpacity 
            onPress={openBookingModal}
            className="flex-row items-center px-3 py-2"
            style={{ backgroundColor: '#1F7A8C' }}
          >
            <MaterialIcons name="add" size={20} color="#ffffff" />
            <Text className="text-white text-sm font-medium ml-1">Book Services</Text>
          </TouchableOpacity>
        </View>
        
        {/* Stats */}
        <View className="flex-row gap-3">
          <View className="flex-1 border border-white/30 px-3 py-2">
            <ThemedText className="text-2xl font-bold text-white">{activeCount}</ThemedText>
            <Text className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>Active</Text>
          </View>
          <View className="flex-1 border border-white/30 px-3 py-2">
            <ThemedText className="text-2xl font-bold text-white">{historyCount}</ThemedText>
            <Text className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.8)' }}>History</Text>
          </View>
        </View>
      </View>

      <View className="px-4 pt-4">
        <View
          className="flex-row rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
        >
          <TouchableOpacity
            onPress={() => setAppointmentFilter('appointments')}
            className={`flex-1 flex-row items-center justify-center rounded-lg py-3 ${
              appointmentFilter === 'appointments' ? 'bg-blue-600' : 'bg-transparent'
            }`}
          >
            <MaterialIcons
              name="event-note"
              size={18}
              color={appointmentFilter === 'appointments' ? '#ffffff' : '#64748b'}
            />
            <Text
              className={`ml-2 text-sm font-semibold ${
                appointmentFilter === 'appointments' ? 'text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Appointments
            </Text>
            {activeCount > 0 && (
              <View
                className={`ml-2 min-w-[20px] rounded-full px-1.5 py-0.5 items-center ${
                  appointmentFilter === 'appointments' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    appointmentFilter === 'appointments' ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {activeCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setAppointmentFilter('history')}
            className={`flex-1 flex-row items-center justify-center rounded-lg py-3 ${
              appointmentFilter === 'history' ? 'bg-blue-600' : 'bg-transparent'
            }`}
          >
            <MaterialIcons
              name="history"
              size={18}
              color={appointmentFilter === 'history' ? '#ffffff' : '#64748b'}
            />
            <Text
              className={`ml-2 text-sm font-semibold ${
                appointmentFilter === 'history' ? 'text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              History
            </Text>
            {historyCount > 0 && (
              <View
                className={`ml-2 min-w-[20px] rounded-full px-1.5 py-0.5 items-center ${
                  appointmentFilter === 'history' ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    appointmentFilter === 'history' ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {historyCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {appointmentFilter === 'history' && (
        <View className="px-4 pt-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            {...NO_BOUNCE_SCROLL}
            contentContainerStyle={{ gap: 8, paddingRight: 4 }}
          >
            {historyFilterOptions.map((option) => {
              const isSelected = historyFilter === option.id;

              return (
                <TouchableOpacity
                  key={option.id}
                  onPress={() => setHistoryFilter(option.id)}
                  className={`flex-row items-center rounded-full px-4 py-2 border ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600'
                  }`}
                >
                  <ThemedText
                    className={`text-sm font-medium ${
                      isSelected ? 'text-white' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {option.label}
                  </ThemedText>
                  <View
                    className={`ml-2 min-w-[20px] rounded-full px-1.5 py-0.5 items-center ${
                      isSelected ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'
                    }`}
                  >
                    <ThemedText
                      className={`text-xs font-semibold ${
                        isSelected ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {option.count}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView 
        className="flex-1 px-4 pt-3" 
        showsVerticalScrollIndicator={false}
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
        {loading ? (
          <LoadingState label="Fetching your visits" icon="event" />
        ) : (
          <>
        {filteredAppointments.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(250)} className="bg-white dark:bg-slate-800 rounded-2xl p-8 items-center border border-slate-100 dark:border-slate-700 mb-6">
            <MaterialIcons
              name={
                appointmentFilter === 'history'
                  ? historyFilter === 'cancelled'
                    ? 'event-busy'
                    : historyFilter === 'completed'
                    ? 'task-alt'
                    : 'history'
                  : 'calendar-today'
              }
              size={56}
              color="#cbd5e1"
            />
            <Text className="text-base font-semibold text-slate-700 dark:text-slate-200 mt-4 text-center">
              {getEmptyFilterMessage()}
            </Text>
            <Text className="text-sm text-slate-400 mt-2 text-center">
              {appointmentFilter === 'appointments'
                ? 'Book a service to see it here.'
                : 'Completed and cancelled visits, including walk-ins, will appear here.'}
            </Text>
          </Animated.View>
        ) : (
          <>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {filteredAppointments.length}{' '}
              {appointmentFilter === 'history' ? 'past' : 'upcoming'}{' '}
              {filteredAppointments.length === 1 ? 'booking' : 'bookings'}
            </Text>
            {filteredAppointments.map((appointment, index) => {
            const statusStyle = getStatusStyle(appointment.status);
            const bookingTypeBadge = getOwnerBookingTypeBadge(appointment);
            const services = appointment.services?.length
              ? appointment.services
              : appointment.service
              ? [appointment.service]
              : [];
            const timeLabel = formatAppointmentTimeLabel(appointment.time);

            return (
            <Animated.View
              key={appointment.id}
              entering={getResultEntering(index)}
              exiting={FadeOut.duration(120)}
            >
            <TouchableOpacity
              onPress={() => {
                setSelectedAppointment(appointment);
                setDetailModalVisible(true);
              }}
              activeOpacity={0.85}
              className="bg-white dark:bg-slate-800 rounded-2xl p-4 mb-3 border border-slate-100 dark:border-slate-700"
              style={{
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-800 dark:text-white">
                    {appointment.petName}
                  </Text>
                  <View
                    className={`mt-1.5 self-start flex-row items-center rounded-full px-2 py-0.5 border ${bookingTypeBadge.containerClass}`}
                  >
                    <MaterialIcons
                      name={bookingTypeBadge.icon}
                      size={12}
                      color={bookingTypeBadge.iconColor}
                    />
                    <Text className={`ml-1 text-[10px] font-bold ${bookingTypeBadge.textClass}`}>
                      {appointment.bookingTypeLabel || bookingTypeBadge.label}
                    </Text>
                  </View>
                  <View className="flex-row items-center mt-1">
                    <MaterialIcons name="event" size={14} color="#64748b" />
                    <Text className="ml-1.5 text-sm text-slate-500 dark:text-slate-400">
                      {(() => {
                        const [y, m, d] = appointment.date.split('-').map(Number);
                        const date = new Date(y, m - 1, d);
                        return date.toLocaleDateString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        });
                      })()}
                    </Text>
                    {timeLabel ? (
                      <>
                        <Text className="mx-1.5 text-slate-300">•</Text>
                        <Text className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          {timeLabel}
                        </Text>
                      </>
                    ) : null}
                  </View>
                </View>
                <View className={`rounded-full px-2.5 py-1 flex-row items-center ${statusStyle.badgeBg}`}>
                  <MaterialIcons name={getStatusIcon(appointment.status)} size={12} color={statusStyle.icon} />
                  <Text className={`text-[11px] font-bold ml-1 ${statusStyle.badgeText}`}>
                    {statusStyle.label}
                  </Text>
                </View>
              </View>

              {services.length > 0 ? (
                <View className="flex-row flex-wrap gap-2 mt-3">
                  {services.map((service, serviceIndex) => (
                    <View
                      key={`${appointment.id}-${service}-${serviceIndex}`}
                      className="rounded-full bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 border border-blue-100 dark:border-blue-800"
                    >
                      <Text className="text-xs font-medium text-blue-800 dark:text-blue-200">
                        {service}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <AppointmentStatusMessage appointment={appointment} compact />

              <View className="flex-row items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
                <Text className="text-xs font-medium text-slate-400">
                  Tap for details
                </Text>
                <View className="flex-row items-center">
                  {canEditAppointmentServices(appointment.status) && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        openEditServicesModal(appointment);
                      }}
                      className="w-9 h-9 rounded-full items-center justify-center bg-amber-50 dark:bg-amber-900/20 mr-1"
                    >
                      <MaterialIcons name="edit" size={18} color="#d97706" />
                    </TouchableOpacity>
                  )}
                  {canCancelAppointment(appointment.status) && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        cancelAppointment(appointment.id);
                      }}
                      className="w-9 h-9 rounded-full items-center justify-center bg-red-50 dark:bg-red-900/20"
                    >
                      <MaterialIcons name="close" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                  {!canEditAppointmentServices(appointment.status) &&
                    !canCancelAppointment(appointment.status) && (
                      <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
                    )}
                </View>
              </View>
            </TouchableOpacity>
            </Animated.View>
            );
          })}
          </>
        )}
        </>
        )}
        
        <View className="h-6" />
      </ScrollView>

      {/* Booking type picker */}
      <Modal
        animationType="fade"
        transparent
        visible={bookingTypePickerVisible}
        onRequestClose={() => setBookingTypePickerVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="rounded-t-3xl bg-white dark:bg-slate-800 px-6 pt-5 pb-8">
            <View className="mb-4 flex-row items-center justify-between">
              <Text className="text-xl font-bold text-slate-900 dark:text-white">Book a service</Text>
              <TouchableOpacity onPress={() => setBookingTypePickerVisible(false)}>
                <MaterialIcons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              How would you like to get care for your pet today?
            </Text>

            <TouchableOpacity
              onPress={startClinicBooking}
              className="mb-3 flex-row items-center rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
                <MaterialIcons name="local-hospital" size={24} color="#fff" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold text-slate-800 dark:text-white">Clinic Appointment</Text>
                <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Visit the clinic on your scheduled date and time.
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#94a3b8" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openDoorToDoorNotice}
              className="flex-row items-center rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-4"
            >
              <View className="h-12 w-12 items-center justify-center rounded-xl bg-sky-600">
                <MaterialIcons name="home" size={24} color="#fff" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-semibold text-sky-800 dark:text-sky-300">Home Services</Text>
                <Text className="mt-0.5 text-xs leading-5 text-sky-700 dark:text-sky-400">
                  Vet care at your doorstep — no travel, less stress, happier pets.
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={22} color="#0284c7" />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Home Services notice */}
      <Modal
        animationType="fade"
        transparent
        visible={doorToDoorNoticeVisible}
        onRequestClose={closeDoorToDoorNotice}
      >
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 p-6">
            <View className="mb-4 h-14 w-14 items-center justify-center self-center rounded-full bg-sky-100 dark:bg-sky-900/30">
              <MaterialIcons name="home" size={28} color="#0284c7" />
            </View>
            <Text className="text-center text-lg font-bold text-slate-900 dark:text-white">
              Vet care, right at your home
            </Text>
            <Text className="mt-2 text-center text-sm leading-6 text-slate-600 dark:text-slate-300">
              Skip the trip to the clinic. Our team comes to you so your pet stays comfortable in familiar surroundings.
            </Text>

            <View className="mt-4 rounded-xl border border-sky-100 dark:border-sky-800/50 bg-sky-50 dark:bg-sky-900/20 px-4 py-3">
              <View className="flex-row items-start mb-2.5">
                <MaterialIcons name="favorite" size={16} color="#0284c7" style={{ marginTop: 2 }} />
                <Text className="ml-2 flex-1 text-xs leading-5 text-sky-800 dark:text-sky-300">
                  Your pet stays calm and relaxed at home
                </Text>
              </View>
              <View className="flex-row items-start mb-2.5">
                <MaterialIcons name="schedule" size={16} color="#0284c7" style={{ marginTop: 2 }} />
                <Text className="ml-2 flex-1 text-xs leading-5 text-sky-800 dark:text-sky-300">
                  Save time — we bring professional care to your doorstep
                </Text>
              </View>
              <View className="flex-row items-start">
                <MaterialIcons name="medical-services" size={16} color="#0284c7" style={{ marginTop: 2 }} />
                <Text className="ml-2 flex-1 text-xs leading-5 text-sky-800 dark:text-sky-300">
                  Book preventive care without leaving your home
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={startDoorToDoorBooking}
              className="mt-6 items-center rounded-xl bg-sky-600 py-3.5"
            >
              <Text className="text-base font-semibold text-white">Start Home Services Booking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                closeDoorToDoorNotice();
                setBookingTypePickerVisible(true);
              }}
              className="mt-3 items-center rounded-xl border border-slate-300 dark:border-slate-600 py-3"
            >
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Book Appointment Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="bg-white dark:bg-slate-800 rounded-t-3xl max-h-[90%] overflow-hidden">
            {/* Modal Header */}
            <View className="bg-navy px-6 pt-5 pb-4 rounded-t-3xl">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xl font-bold text-white">
                    {isDoorToDoorBooking ? 'Home Services' : 'Book Services'} — Step {currentStep}
                  </Text>
                  <Text className="text-sm mt-1" style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
                    {currentStep === 1 && 'Select pet & treatment details'}
                    {currentStep === 2 && 'Add preventive services'}
                    {currentStep === 3 && 'Pick date & time'}
                    {isDoorToDoorBooking && currentStep === 4 && 'Choose how to set your meeting place'}
                    {currentStep === reviewStep && 'Review & complete booking'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setModalVisible(false);
                    setIsDoorToDoorBooking(false);
                    setMeetingCoordinate(null);
                    setMeetingPlacePhotoUrl(null);
                  }}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                >
                  <MaterialIcons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Step Indicator */}
              <View className="flex-row items-center justify-center mt-5">
                {bookingSteps.map(({ step, label }, index, steps) => (
                  <View key={step} className="flex-row items-center">
                    <View className="items-center">
                      <View
                        className={`w-8 h-8 rounded-full items-center justify-center ${
                          currentStep >= step ? 'bg-white' : 'bg-white/30'
                        }`}
                      >
                        {currentStep > step ? (
                          <MaterialIcons name="check" size={18} color="#1F7A8C" />
                        ) : (
                          <Text
                            className="text-sm font-bold"
                            style={{ color: currentStep >= step ? '#1F7A8C' : 'rgba(255, 255, 255, 0.8)' }}
                          >
                            {step}
                          </Text>
                        )}
                      </View>
                      <Text
                        className="text-[10px] mt-1 font-medium"
                        style={{ color: currentStep >= step ? '#ffffff' : 'rgba(255, 255, 255, 0.65)' }}
                      >
                        {label}
                      </Text>
                    </View>
                    {index < steps.length - 1 && (
                      <View
                        className={`${isDoorToDoorBooking ? 'w-3' : 'w-6'} h-0.5 mx-1 mb-4`}
                        style={{ backgroundColor: currentStep > step ? '#ffffff' : 'rgba(255, 255, 255, 0.35)' }}
                      />
                    )}
                  </View>
                ))}
              </View>
            </View>

            <View className="px-6 pt-4 pb-6">
            {currentStep === 1 && (
              <ScrollView {...NO_BOUNCE_SCROLL} showsVerticalScrollIndicator={false} className="max-h-[62vh]">
                {/* Animal Selection Dropdown */}
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Animal *</ThemedText>
                  <TouchableOpacity
                    onPress={() => setShowAnimalDropdown(!showAnimalDropdown)}
                    className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3"
                  >
                    <MaterialIcons name="pets" size={20} color="#64748b" />
                    <ThemedText className="flex-1 ml-3 text-base text-slate-800 dark:text-white">
                      {newAppointment.petName || 'Select an animal'}
                    </ThemedText>
                    <MaterialIcons name={showAnimalDropdown ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color="#64748b" />
                  </TouchableOpacity>

                  {/* Animal Dropdown List */}
                  {showAnimalDropdown && (
                    <View className="mt-2 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden">
                      {animals.length === 0 ? (
                        <View className="px-4 py-3">
                          <ThemedText className="text-slate-500 dark:text-slate-400">No animals found. Please add animals to your profile first.</ThemedText>
                        </View>
                      ) : (
                        animals.map((animal: Animal) => {
                          const identification = getPetIdentificationDisplay(animal);
                          return (
                          <TouchableOpacity
                            key={animal.id}
                            onPress={() => {
                              setNewAppointment({ ...newAppointment, petId: animal.id, petName: animal.pet_name });
                              setShowAnimalDropdown(false);
                            }}
                            className={`px-4 py-3 border-b border-slate-100 dark:border-slate-600 last:border-b-0 ${
                              newAppointment.petId === animal.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                            }`}
                          >
                            <View className="flex-row items-center flex-1">
                              <MaterialIcons
                                name={newAppointment.petId === animal.id ? 'check-circle' : 'pets'}
                                size={20}
                                color={newAppointment.petId === animal.id ? '#1F7A8C' : '#64748b'}
                              />
                              <View className="ml-3 flex-1">
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-1">
                                    <ThemedText className={`font-medium ${
                                      newAppointment.petId === animal.id ? 'text-blue-600 dark:text-blue-400' : 'text-slate-800 dark:text-white'
                                    }`}>
                                      {animal.pet_name}
                                    </ThemedText>
                                    {animal.species_name && (
                                      <ThemedText className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                                        {animal.species_name}
                                        {animal.breed_name && (
                                          <ThemedText className="text-xs text-slate-500">
                                            {' '}({animal.breed_name})
                                          </ThemedText>
                                        )}
                                      </ThemedText>
                                    )}
                                    {identification ? (
                                      <ThemedText className={`text-xs mt-0.5 font-semibold ${
                                        identification.tone === 'id' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                                      }`}>
                                        {identification.text}
                                      </ThemedText>
                                    ) : null}
                                  </View>
                                  <View className={`px-2 py-0.5 rounded-full ${
                                    animal.registration_status === 'registered'
                                      ? 'bg-green-100 dark:bg-green-900/30'
                                      : animal.registration_status === 'exempt'
                                      ? 'bg-blue-100 dark:bg-blue-900/30'
                                      : animal.registration_status === 'declined'
                                      ? 'bg-red-100 dark:bg-red-900/30'
                                      : 'bg-amber-100 dark:bg-amber-900/30'
                                  }`}>
                                    <ThemedText className={`text-xs capitalize ${
                                      animal.registration_status === 'registered'
                                        ? 'text-green-700 dark:text-green-400'
                                        : animal.registration_status === 'exempt'
                                        ? 'text-blue-700 dark:text-blue-400'
                                        : animal.registration_status === 'declined'
                                        ? 'text-red-700 dark:text-red-400'
                                        : 'text-amber-700 dark:text-amber-400'
                                    }`}>
                                      {animal.registration_status === 'exempt' ? 'Exempt' : animal.registration_status}
                                    </ThemedText>
                                  </View>
                                </View>
                              </View>
                            </View>
                          </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  )}

                  {/* Registration requirement info */}
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    All animals can book services
                  </ThemedText>
                </View>

                {!isDoorToDoorBooking && (
                  <>
                    {/* Treatment Selection */}
                    <View className="mb-4">
                      <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Treatment</ThemedText>
                      <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                        Optional. Select if your pet needs medical treatment — symptoms will appear below.
                      </ThemedText>

                      <TouchableOpacity
                        onPress={toggleTreatment}
                        className={`flex-row items-center p-3 rounded-xl border-2 ${
                          treatmentSelected
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                          treatmentSelected ? 'bg-blue-600' : 'bg-slate-100 dark:bg-slate-700'
                        }`}>
                          <MaterialIcons
                            name={treatmentOption.icon as any}
                            size={20}
                            color={treatmentSelected ? '#fff' : '#64748b'}
                          />
                        </View>
                        <View className="ml-3 flex-1">
                          <ThemedText className={`font-semibold text-sm ${
                            treatmentSelected ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-white'
                          }`}>
                            {treatmentOption.name}
                          </ThemedText>
                          <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                            {formatDuration(treatmentOption.duration)}
                          </ThemedText>
                        </View>
                        <View className={`w-5 h-5 rounded border-2 items-center justify-center ${
                          treatmentSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-500'
                        }`}>
                          {treatmentSelected && <MaterialIcons name="check" size={12} color="white" />}
                        </View>
                      </TouchableOpacity>
                    </View>

                    {treatmentSelected && (
                      <>
                        <View className="mb-4">
                          <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Symptoms *</ThemedText>
                          <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                            Select at least one symptom, or deselect treatment above to continue.
                          </ThemedText>
                          <View className="gap-2">
                            {complaintOptions.map((complaint) => {
                              const selectedComplaint = selectedSymptoms.find(s => s.symptom_id === complaint.id);
                              const isSelected = !!selectedComplaint;
                              const daysCount = selectedComplaint?.days_count || 1;

                              return (
                                <View key={complaint.id} className={`rounded-xl border ${
                                  isSelected
                                    ? 'bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500'
                                    : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-600'
                                }`}>
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (isSelected) {
                                        setSelectedSymptoms(selectedSymptoms.filter(s => s.symptom_id !== complaint.id));
                                      } else {
                                        setSelectedSymptoms([...selectedSymptoms, { symptom_id: complaint.id, days_count: 1 }]);
                                      }
                                    }}
                                    className="flex-row items-center p-3"
                                  >
                                    <View className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center ${
                                      isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-500'
                                    }`}>
                                      {isSelected && <MaterialIcons name="check" size={14} color="white" />}
                                    </View>
                                    <ThemedText className={`flex-1 ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                      {complaint.label}
                                    </ThemedText>
                                  </TouchableOpacity>

                                  {isSelected && (
                                    <View className="flex-row items-center px-3 pb-3">
                                      <ThemedText className="text-xs text-slate-500 mr-2">Days:</ThemedText>
                                      <View className="flex-row items-center bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500">
                                        <TouchableOpacity
                                          onPress={() => {
                                            if (daysCount > 1) {
                                              setSelectedSymptoms(selectedSymptoms.map(s =>
                                                s.symptom_id === complaint.id
                                                  ? { ...s, days_count: daysCount - 1 }
                                                  : s
                                              ));
                                            }
                                          }}
                                          className="px-3 py-1"
                                        >
                                          <MaterialIcons name="remove" size={16} color="#64748b" />
                                        </TouchableOpacity>
                                        <ThemedText className="text-sm font-medium text-slate-800 dark:text-white px-2 min-w-[24px] text-center">
                                          {daysCount}
                                        </ThemedText>
                                        <TouchableOpacity
                                          onPress={() => {
                                            setSelectedSymptoms(selectedSymptoms.map(s =>
                                              s.symptom_id === complaint.id
                                                ? { ...s, days_count: daysCount + 1 }
                                                : s
                                            ));
                                          }}
                                          className="px-3 py-1"
                                        >
                                          <MaterialIcons name="add" size={16} color="#64748b" />
                                        </TouchableOpacity>
                                      </View>
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        </View>

                        <View className="mb-4">
                          <View className="flex-row items-center mb-2">
                            <TouchableOpacity
                              onPress={() => setNewAppointment({ ...newAppointment, isBitten: !newAppointment.isBitten, biteDetails: newAppointment.biteDetails })}
                              className="flex-row items-center"
                            >
                              <View className={`w-5 h-5 rounded border-2 mr-2 flex items-center justify-center ${newAppointment.isBitten ? 'bg-red-500 border-red-500' : 'border-slate-300 dark:border-slate-500'}`}>
                                {newAppointment.isBitten && <MaterialIcons name="check" size={14} color="white" />}
                              </View>
                              <ThemedText className="text-slate-700 dark:text-slate-300">Has the pet bitten anyone?</ThemedText>
                            </TouchableOpacity>
                          </View>

                          {newAppointment.isBitten && (
                            <View className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mt-2">
                              <TextInput
                                className="text-base text-slate-800 dark:text-white"
                                placeholder="Please provide details about the bite incident..."
                                placeholderTextColor="#94a3b8"
                                value={newAppointment.biteDetails}
                                onChangeText={(text) => setNewAppointment({ ...newAppointment, biteDetails: text, isBitten: true })}
                                multiline
                                numberOfLines={2}
                              />
                            </View>
                          )}
                        </View>
                      </>
                    )}
                  </>
                )}

                <TouchableOpacity
                  onPress={() => {
                    if (!newAppointment.petId) {
                      Alert.alert('Required', 'Please select an animal.');
                      return;
                    }
                    if (treatmentSelected && selectedSymptoms.length === 0) {
                      Alert.alert(
                        'Required',
                        'Please select at least one symptom, or deselect treatment to continue.'
                      );
                      return;
                    }
                    setCurrentStep(2);
                  }}
                  disabled={!canProceedFromStep1}
                  className={`py-4 rounded-xl items-center mt-2 mb-2 ${
                    canProceedFromStep1 ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  style={canProceedFromStep1 ? { shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 } : undefined}
                >
                  <Text className={`font-semibold text-base ${
                    canProceedFromStep1 ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    Next
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {currentStep === 2 && (
              <ScrollView {...NO_BOUNCE_SCROLL} showsVerticalScrollIndicator={false} className="max-h-[62vh]">
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    {isDoorToDoorBooking ? 'Select Services *' : 'Add Services'}
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    {isDoorToDoorBooking
                      ? 'Home Services covers these 4 services only.'
                      : 'Select additional preventive services. You can skip this if you only need treatment.'}
                  </ThemedText>

                  <View className="gap-2">
                    {currentServiceOptions.map((service) => {
                      const isSelected = selectedServices.includes(service.id);
                      const { available, reason } = getServiceAvailability(service.id);
                      const isDisabled = !available && !isSelected;

                      return (
                        <TouchableOpacity
                          key={service.id}
                          onPress={() => toggleService(service.id)}
                          disabled={isDisabled}
                          className={`flex-row items-center p-3 rounded-xl border-2 ${
                            isDisabled
                              ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 opacity-60'
                              : isSelected
                              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                          }`}
                        >
                          <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                            isDisabled
                              ? 'bg-slate-200 dark:bg-slate-700'
                              : isSelected
                              ? 'bg-blue-600'
                              : 'bg-slate-100 dark:bg-slate-700'
                          }`}>
                            <MaterialIcons
                              name={service.icon as any}
                              size={20}
                              color={isDisabled ? '#94a3b8' : isSelected ? '#fff' : '#64748b'}
                            />
                          </View>
                          <View className="ml-3 flex-1">
                            <ThemedText className={`font-semibold text-sm ${
                              isDisabled
                                ? 'text-slate-400 dark:text-slate-500'
                                : isSelected
                                ? 'text-blue-700 dark:text-blue-400'
                                : 'text-slate-800 dark:text-white'
                            }`}>
                              {service.name}
                            </ThemedText>
                            <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                              {isDisabled
                                ? reason || 'Temporarily unavailable'
                                : formatDuration(service.duration)}
                            </ThemedText>
                          </View>
                          <View className={`w-5 h-5 rounded border-2 items-center justify-center ${
                            isDisabled
                              ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800'
                              : isSelected
                              ? 'bg-blue-600 border-blue-600'
                              : 'border-slate-300 dark:border-slate-500'
                          }`}>
                            {isSelected && !isDisabled && <MaterialIcons name="check" size={12} color="white" />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {selectedServices.length > 0 && (
                    <View className="mt-3 rounded-xl p-3 border border-blue-200 dark:border-blue-800" style={{ backgroundColor: 'rgba(31, 122, 140, 0.08)' }}>
                      <ThemedText className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                        Total duration: {formatDuration(getTotalDurationMinutes())}
                      </ThemedText>
                      <ThemedText className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {selectedServices.map((id) => allServiceOptions.find((s) => s.id === id)?.name).filter(Boolean).join(' · ')}
                      </ThemedText>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => {
                    if (selectedServices.length === 0) {
                      Alert.alert(
                        'Required',
                        isDoorToDoorBooking
                          ? 'Please select at least one service.'
                          : 'Please select treatment or at least one service.'
                      );
                      return;
                    }
                    setCurrentStep(3);
                  }}
                  className="bg-blue-600 py-4 rounded-xl items-center mt-2 mb-2"
                  style={{ shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }}
                >
                  <Text className="text-white font-semibold text-base">Next</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCurrentStep(1)}
                  className="py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600 mb-2"
                >
                  <Text className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                    {isDoorToDoorBooking ? '← Back' : '← Back to Treatment'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {currentStep === 3 && (
              <ScrollView {...NO_BOUNCE_SCROLL} showsVerticalScrollIndicator={false} className="max-h-[62vh]">
                <View className={`mb-4 ${selectedServices.length === 0 ? 'opacity-40' : ''}`}>
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Date *</ThemedText>
                  {selectedServices.length === 0 && (
                    <ThemedText className="text-xs text-amber-600 dark:text-amber-400 mb-2">Select at least one service first</ThemedText>
                  )}

                  <BookingCalendar
                    currentMonth={currentMonth}
                    onMonthChange={handleMonthChange}
                    selectedDate={newAppointment.date}
                    unavailableDates={unavailableDates}
                    canSelect={selectedServices.length > 0}
                    onSelectDate={handleSelectBookingDate}
                  />

                  {newAppointment.date && (() => {
                    const entry = unavailableDates.find((d) => d.date === newAppointment.date);
                    if (!entry || entry.type === 'full_day') return null;

                    return (
                      <View className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                        <ThemedText className="text-xs text-amber-700 dark:text-amber-300">
                          {entry.type === 'morning'
                            ? 'Morning is unavailable on this date. Afternoon slots only.'
                            : 'Afternoon is unavailable on this date. Morning slots only.'}
                        </ThemedText>
                      </View>
                    );
                  })()}
                </View>

                {/* Time Selection — hourly slots */}
                <View className={`mb-4 ${selectedServices.length === 0 ? 'opacity-40' : ''}`}>
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Time *</ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Hourly slots{isDoorToDoorBooking
                      ? ' · Home services have no booking limit'
                      : ' · Each time shows how many openings are left'}
                  </ThemedText>

                  {selectedServices.length === 0 ? (
                    <ThemedText className="text-slate-400 text-sm italic">Select services first to see available times</ThemedText>
                  ) : loadingTimeSlots ? (
                    <View className="items-center py-4">
                      <ActivityIndicator size="small" color="#1F7A8C" />
                    </View>
                  ) : !newAppointment.date ? (
                    <ThemedText className="text-slate-400 text-sm italic">Select a date to see available times</ThemedText>
                  ) : (
                    <View>
                      {(() => {
                        const totalDuration = getScheduleDurationMinutes();
                        const reservedLabels = newAppointment.time
                          ? getReservedSlotLabels(newAppointment.time, totalDuration)
                          : [];

                        // Diri ipakita ang mga slot sa buntag o hapon.
                        const renderPeriodSlots = (period: 'morning' | 'afternoon', title: string) => {
                          const periodSlots = availableTimeSlots.filter((s) => s.period === period);
                          if (periodSlots.length === 0) return null;

                          return (
                            <View className="mb-3">
                              <ThemedText className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{title}</ThemedText>
                              <View className="flex-row flex-wrap gap-2">
                                {periodSlots.map((slot) => {
                                  const isStart = newAppointment.time === slot.label;
                                  const isReserved = reservedLabels.includes(slot.label) && !isStart;

                                  return (
                                    <TouchableOpacity
                                      key={slot.time}
                                      onPress={() => {
                                        if (slot.available) {
                                          setNewAppointment((prev) => ({ ...prev, time: slot.label }));
                                        }
                                      }}
                                      disabled={!slot.available}
                                      className={`px-3 py-2 rounded-xl min-w-[92px] ${
                                        isStart
                                          ? 'bg-blue-600'
                                          : isReserved
                                          ? 'bg-blue-200 dark:bg-blue-800/50'
                                          : slot.fully_booked
                                          ? 'bg-red-50 dark:bg-red-900/20'
                                          : slot.available
                                          ? 'bg-slate-100 dark:bg-slate-700'
                                          : 'bg-slate-200 dark:bg-slate-800 opacity-50'
                                      }`}
                                    >
                                      <Text
                                        className={`text-sm text-center ${
                                          isStart
                                            ? 'text-white font-semibold'
                                            : isReserved
                                            ? 'text-blue-800 dark:text-blue-200 font-medium'
                                            : slot.fully_booked
                                            ? 'text-red-700 dark:text-red-300 font-semibold'
                                            : slot.available
                                            ? 'text-slate-600 dark:text-slate-300'
                                            : 'text-slate-400 line-through'
                                        }`}
                                      >
                                        {slot.label}
                                      </Text>
                                      {slotCountLabel(slot) ? (
                                        <Text
                                          className={`text-[10px] text-center mt-0.5 ${
                                            isStart
                                              ? 'text-white/90'
                                              : slot.fully_booked
                                              ? 'text-red-600 dark:text-red-300'
                                              : 'text-slate-500'
                                          }`}
                                        >
                                          {slotCountLabel(slot)}
                                        </Text>
                                      ) : null}
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            </View>
                          );
                        };

                        return (
                          <>
                            {renderPeriodSlots('morning', 'Morning (8:00 AM - 12:00 PM)')}
                            {renderPeriodSlots('afternoon', 'Afternoon (1:00 PM - 5:00 PM)')}
                          </>
                        );
                      })()}

                      {newAppointment.time && (
                        <View className="mt-3 rounded-xl p-3 border border-blue-200 dark:border-blue-800" style={{ backgroundColor: 'rgba(31, 122, 140, 0.08)' }}>
                          <ThemedText className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                            Reserved: {newAppointment.time} – {minutesToLabel(labelToMinutes(newAppointment.time) + getScheduleDurationMinutes())}
                          </ThemedText>
                          <ThemedText className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            Visit length: {formatDuration(getScheduleDurationMinutes())}
                          </ThemedText>
                        </View>
                      )}

                      <View className="flex-row gap-4 mt-3 flex-wrap">
                        <View className="flex-row items-center">
                          <View className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-700 mr-1" />
                          <ThemedText className="text-xs text-slate-500 dark:text-slate-400">Available</ThemedText>
                        </View>
                        <View className="flex-row items-center">
                          <View className="w-3 h-3 rounded bg-blue-600 mr-1" />
                          <ThemedText className="text-xs text-slate-500 dark:text-slate-400">Start time</ThemedText>
                        </View>
                        <View className="flex-row items-center">
                          <View className="w-3 h-3 rounded bg-blue-200 dark:bg-blue-800 mr-1" />
                          <ThemedText className="text-xs text-slate-500 dark:text-slate-400">Reserved</ThemedText>
                        </View>
                      </View>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    if (!newAppointment.date) {
                      Alert.alert('Required', 'Please select a date.');
                      return;
                    }
                    if (!newAppointment.time) {
                      Alert.alert('Required', 'Please select a time slot.');
                      return;
                    }

                    const slotStillAvailable = await isSelectedSlotStillAvailable(getScheduleDurationMinutes());
                    if (!slotStillAvailable) {
                      Alert.alert(
                        'Time Unavailable',
                        'This time slot is no longer available. Please select another time.'
                      );
                      return;
                    }

                    setCurrentStep(isDoorToDoorBooking ? 4 : reviewStep);
                  }}
                  className="bg-blue-600 py-4 rounded-xl items-center mt-2 mb-2"
                  style={{ shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }}
                >
                  <Text className="text-white font-semibold text-base">
                    {isDoorToDoorBooking ? 'Set Meeting Place' : 'Review Booking'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCurrentStep(2)}
                  className="py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600 mb-2"
                >
                  <Text className="text-slate-500 dark:text-slate-400 font-medium text-sm">← Back to Services</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {isDoorToDoorBooking && currentStep === 4 && (
              <ScrollView
                {...NO_BOUNCE_SCROLL}
                showsVerticalScrollIndicator={false}
                className="max-h-[62vh]"
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <View className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
                  <Text className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                    Set your meeting place for the home visit
                  </Text>
                  <Text className="mt-1 text-xs leading-5 text-blue-700 dark:text-blue-400">
                    Use GPS, tap the Mapbox map, or search your street address. Location must be inside El Salvador City.
                  </Text>
                </View>

                <MeetingPlaceLocationPicker
                  coordinate={meetingCoordinate}
                  onCoordinateChange={setMeetingCoordinate}
                  height={240}
                />

                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-4 mb-2">
                  Meeting Place / Landmark Photo
                </ThemedText>
                <Text className="text-xs leading-5 text-slate-500 dark:text-slate-400 mb-3">
                  Add a photo of your gate, house front, or a nearby landmark so staff can find you easily.
                </Text>
                <TouchableOpacity
                  onPress={pickMeetingPlacePhoto}
                  disabled={uploadingMeetingPlacePhoto}
                  className="overflow-hidden rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60"
                  activeOpacity={0.85}
                >
                  {meetingPlacePhotoUrl ? (
                    <View className="relative">
                      <Image
                        source={{ uri: meetingPlacePhotoUrl }}
                        className="h-44 w-full"
                        resizeMode="cover"
                      />
                      <View className="absolute bottom-0 left-0 right-0 bg-black/45 px-3 py-2">
                        <Text className="text-center text-xs font-semibold text-white">
                          {uploadingMeetingPlacePhoto ? 'Uploading...' : 'Tap to change photo'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View className="h-44 items-center justify-center px-4">
                      {uploadingMeetingPlacePhoto ? (
                        <ActivityIndicator color="#1F7A8C" />
                      ) : (
                        <>
                          <MaterialIcons name="add-a-photo" size={28} color="#64748b" />
                          <Text className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                            Add landmark photo
                          </Text>
                          <Text className="mt-1 text-center text-xs text-slate-400">
                            Optional, but recommended
                          </Text>
                        </>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
                {meetingPlacePhotoUrl && !uploadingMeetingPlacePhoto && (
                  <TouchableOpacity
                    onPress={() => setMeetingPlacePhotoUrl(null)}
                    className="mt-2 py-2 items-center"
                  >
                    <Text className="text-sm font-medium text-red-500">Remove photo</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => {
                    if (!meetingCoordinate) {
                      Alert.alert(
                        'Meeting Place Required',
                        'Please set your meeting place using GPS, the Mapbox map, or street address search.'
                      );
                      return;
                    }
                    if (!isInsideElSalvadorCity(meetingCoordinate.latitude, meetingCoordinate.longitude)) {
                      Alert.alert(
                        'Outside El Salvador City',
                        'You cannot continue with a location outside El Salvador City. Please choose a location inside the city.'
                      );
                      return;
                    }
                    if (uploadingMeetingPlacePhoto) {
                      Alert.alert('Please wait', 'Your landmark photo is still uploading.');
                      return;
                    }
                    setCurrentStep(5);
                  }}
                  className="bg-blue-600 py-4 rounded-xl items-center mt-4 mb-2"
                  style={{ shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }}
                >
                  <Text className="text-white font-semibold text-base">Review Booking</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCurrentStep(3)}
                  className="py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600 mb-2"
                >
                  <Text className="text-slate-500 dark:text-slate-400 font-medium text-sm">← Back to Schedule</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {currentStep === reviewStep && (
              <ScrollView {...NO_BOUNCE_SCROLL} showsVerticalScrollIndicator={false} className="max-h-[62vh]">
                {/* Booking summary */}
                <View className="mb-4 rounded-xl p-4 border border-blue-100 dark:border-blue-900/40" style={{ backgroundColor: 'rgba(31, 122, 140, 0.08)' }}>
                  <Text className="text-xs font-semibold uppercase text-blue-600 dark:text-blue-400 mb-2">Booking Summary</Text>
                  <View className="flex-row items-center mb-1">
                    <MaterialIcons name="pets" size={16} color="#1F7A8C" />
                    <Text className="text-sm text-slate-700 dark:text-slate-200 ml-2">{newAppointment.petName || 'No pet selected'}</Text>
                  </View>
                  <View className="flex-row items-center mb-1">
                    <MaterialIcons name="event" size={16} color="#1F7A8C" />
                    <Text className="text-sm text-slate-700 dark:text-slate-200 ml-2">
                      {newAppointment.date
                        ? (() => {
                            const [y, m, d] = newAppointment.date.split('-').map(Number);
                            return new Date(y, m - 1, d).toLocaleDateString('en-US', {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            });
                          })()
                        : 'No date'}
                    </Text>
                  </View>
                  <View className="flex-row items-center mb-1">
                    <MaterialIcons name="access-time" size={16} color="#1F7A8C" />
                    <Text className="text-sm text-slate-700 dark:text-slate-200 ml-2">
                      {newAppointment.time
                        ? `${newAppointment.time} – ${minutesToLabel(labelToMinutes(newAppointment.time) + getBookingDurationMinutes())}`
                        : 'No time selected'}
                    </Text>
                  </View>
                  <View className="flex-row items-center mb-1">
                    <MaterialIcons name="schedule" size={16} color="#1F7A8C" />
                    <Text className="text-sm text-slate-700 dark:text-slate-200 ml-2">
                      Duration: {formatDuration(getBookingDurationMinutes())}
                    </Text>
                  </View>
                  {isDoorToDoorBooking && (
                    <View className="flex-row items-center mt-1">
                      <MaterialIcons name="home" size={16} color="#1F7A8C" />
                      <Text className="text-sm text-slate-700 dark:text-slate-200 ml-2">
                        Home Services · MEETING PLACE pinned
                      </Text>
                    </View>
                  )}
                </View>

                {isDoorToDoorBooking && meetingCoordinate && (
                  <View className="mb-4">
                    <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      Meeting Place
                    </ThemedText>
                    <MeetingPlaceMap
                      coordinate={meetingCoordinate}
                      editable={false}
                      height={180}
                      showUserLocation
                    />
                    {meetingPlacePhotoUrl ? (
                      <View className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                        <Image
                          source={{ uri: meetingPlacePhotoUrl }}
                          className="h-40 w-full"
                          resizeMode="cover"
                        />
                        <Text className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                          Landmark photo attached
                        </Text>
                      </View>
                    ) : (
                      <Text className="mt-2 text-xs text-slate-400">
                        No landmark photo added
                      </Text>
                    )}
                  </View>
                )}

                {/* Selected services */}
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Selected Services</ThemedText>
                  <View className="gap-2">
                    {selectedServices.map((serviceId) => {
                      const service = allServiceOptions.find((s) => s.id === serviceId);
                      if (!service) return null;
                      return (
                        <View key={serviceId} className="flex-row items-center justify-between rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-3">
                          <View className="flex-row items-center">
                            <MaterialIcons name={service.icon as any} size={20} color="#1F7A8C" />
                            <ThemedText className="ml-3 font-medium text-slate-800 dark:text-white">{service.name}</ThemedText>
                          </View>
                          <ThemedText className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                            {formatDuration(service.duration)}
                          </ThemedText>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {treatmentSelected && selectedSymptoms.length > 0 && (
                  <View className="mb-4">
                    <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Treatment</ThemedText>
                    <View className="flex-row flex-wrap">
                      {selectedSymptoms.map((symptom, idx) => {
                        const complaint = complaintOptions.find((c) => c.id === symptom.symptom_id);
                        return (
                          <View key={idx} className="bg-blue-50 dark:bg-blue-900/20 px-3 py-1 rounded-lg mr-2 mb-2">
                            <ThemedText className="text-sm text-blue-700 dark:text-blue-300">
                              {complaint?.label || symptom.symptom_id}
                              {symptom.days_count ? ` (${symptom.days_count} ${symptom.days_count === 1 ? 'day' : 'days'})` : ''}
                            </ThemedText>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Notes */}
                <View className="mb-6">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Notes (Optional)</ThemedText>
                  <View className="bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3">
                    <TextInput
                      className="text-base text-slate-800 dark:text-white"
                      placeholder="Any special requests or concerns..."
                      placeholderTextColor="#94a3b8"
                      value={newAppointment.notes}
                      onChangeText={(text) => setNewAppointment({ ...newAppointment, notes: text })}
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    const slotStillAvailable = await isSelectedSlotStillAvailable(getScheduleDurationMinutes());
                    if (!slotStillAvailable) {
                      Alert.alert(
                        'Time Unavailable',
                        'This time slot is no longer available. Please select another time.'
                      );
                      setCurrentStep(3);
                      return;
                    }

                    bookAppointment();
                  }}
                  disabled={selectedServices.length === 0 || bookingSubmitting}
                  className={`py-4 rounded-xl items-center mb-3 ${
                    selectedServices.length > 0 && !bookingSubmitting ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  style={selectedServices.length > 0 && !bookingSubmitting ? { shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 } : undefined}
                >
                  {bookingSubmitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                  <Text className={`font-semibold text-base ${selectedServices.length > 0 ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                    {selectedServices.length > 0 ? 'Complete Booking' : 'Select Services First'}
                  </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCurrentStep(isDoorToDoorBooking ? 4 : 3)}
                  className="py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600 mb-2"
                >
                  <Text className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                    {isDoorToDoorBooking ? '← Back to Meeting Place' : '← Back to Schedule'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Symptom Selection Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSymptomModal}
        onRequestClose={() => setShowSymptomModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white dark:bg-slate-800 rounded-t-3xl p-6 max-h-[70%]">
            <View className="flex-row items-center justify-between mb-4">
              <ThemedText className="text-xl font-bold text-slate-800 dark:text-white">Select Symptoms</ThemedText>
              <TouchableOpacity onPress={() => setShowSymptomModal(false)}>
                <MaterialIcons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            
            <ScrollView {...NO_BOUNCE_SCROLL} className="max-h-[300px]">
              {symptoms.map((symptom) => {
                const selectedSymptom = selectedSymptoms.find(s => s.symptom_id === symptom.id);
                const isSelected = !!selectedSymptom;
                return (
                  <View
                    key={symptom.id}
                    className={`border-b border-slate-100 dark:border-slate-700 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        if (isSelected) {
                          setSelectedSymptoms(selectedSymptoms.filter(s => s.symptom_id !== symptom.id));
                        } else {
                          setSelectedSymptoms([...selectedSymptoms, { symptom_id: symptom.id, days_count: 1 }]);
                        }
                      }}
                      className="flex-row items-center justify-between p-4"
                    >
                      <ThemedText className={`text-base ${isSelected ? 'text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                        {symptom.name}
                      </ThemedText>
                      {isSelected && <MaterialIcons name="check" size={20} color="#1F7A8C" />}
                    </TouchableOpacity>
                    
                    {isSelected && (
                      <View className="px-4 pb-4">
                        <View className="flex-row items-center">
                          <ThemedText className="text-sm text-slate-600 dark:text-slate-400 mr-3">How many days?</ThemedText>
                          <View className="flex-row items-center bg-white dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
                            <TouchableOpacity
                              onPress={() => {
                                const currentDays = selectedSymptom?.days_count || 1;
                                if (currentDays > 1) {
                                  setSelectedSymptoms(selectedSymptoms.map(s => 
                                    s.symptom_id === symptom.id 
                                      ? { ...s, days_count: currentDays - 1 }
                                      : s
                                  ));
                                }
                              }}
                              className="px-3 py-2"
                            >
                              <MaterialIcons name="remove" size={16} color="#64748b" />
                            </TouchableOpacity>
                            
                            <ThemedText className="text-base font-medium text-slate-800 dark:text-white px-2 min-w-[30px] text-center">
                              {selectedSymptom?.days_count || 1}
                            </ThemedText>
                            
                            <TouchableOpacity
                              onPress={() => {
                                const currentDays = selectedSymptom?.days_count || 1;
                                setSelectedSymptoms(selectedSymptoms.map(s => 
                                  s.symptom_id === symptom.id 
                                    ? { ...s, days_count: currentDays + 1 }
                                    : s
                                ));
                              }}
                              className="px-3 py-2"
                            >
                              <MaterialIcons name="add" size={16} color="#64748b" />
                            </TouchableOpacity>
                          </View>
                          <ThemedText className="text-sm text-slate-500 ml-2">day(s)</ThemedText>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </ScrollView>
            
            <TouchableOpacity
              onPress={() => setShowSymptomModal(false)}
              className="bg-blue-600 py-4 rounded-xl items-center mt-4"
            >
              <ThemedText className="text-white font-semibold text-base">Done</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Appointment Detail Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={detailModalVisible}
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)' }}>
          <View className="bg-white dark:bg-slate-800 rounded-t-3xl max-h-[88%] overflow-hidden">
            {selectedAppointment && (() => {
              const detailStatusStyle = getStatusStyle(selectedAppointment.status);
              const detailServices = selectedAppointment.services?.length
                ? selectedAppointment.services
                : selectedAppointment.service
                ? [selectedAppointment.service]
                : [];
              const formattedDate = (() => {
                const [y, m, d] = selectedAppointment.date.split('-').map(Number);
                const date = new Date(y, m - 1, d);
                return date.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                });
              })();
              const timeLabel = formatAppointmentTimeLabel(selectedAppointment.time);

              return (
                <>
                  <View className="bg-navy rounded-t-3xl px-6 pt-6 pb-5">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-4">
                        <Text className="text-xl font-bold text-white">
                          {selectedAppointment.petName}
                        </Text>
                        <Text className="text-teal-100 mt-1 text-sm">
                          {timeLabel ? `${formattedDate} • ${timeLabel}` : formattedDate}
                        </Text>
                        <View
                          className={`mt-3 self-start rounded-full px-2.5 py-1 flex-row items-center ${detailStatusStyle.badgeBg}`}
                        >
                          <MaterialIcons
                            name={getStatusIcon(selectedAppointment.status)}
                            size={12}
                            color={detailStatusStyle.icon}
                          />
                          <Text className={`text-[11px] font-bold ml-1 ${detailStatusStyle.badgeText}`}>
                            {detailStatusStyle.label}
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => setDetailModalVisible(false)}
                        className="w-10 h-10 rounded-full items-center justify-center"
                        style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                      >
                        <MaterialIcons name="close" size={22} color="#ffffff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <ScrollView className="px-6 py-5" showsVerticalScrollIndicator={false} {...NO_BOUNCE_SCROLL}>
                    {selectedAppointment.status === 'approved' && (
                      <AppointmentStatusMessage appointment={selectedAppointment} />
                    )}

                    {selectedAppointment.status_history &&
                      selectedAppointment.status_history.length > 0 && (
                        <AppointmentStatusTimeline history={selectedAppointment.status_history} />
                      )}

                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Booking
                    </Text>
                    <DetailRow label="Pet" value={selectedAppointment.petName} />
                    <DetailRow
                      label="Visit type"
                      value={
                        selectedAppointment.bookingTypeLabel ||
                        getOwnerBookingTypeLabel(selectedAppointment)
                      }
                    />
                    <DetailRow label="Date" value={formattedDate} />
                    {timeLabel ? <DetailRow label="Time" value={timeLabel} /> : null}
                    <DetailRow
                      label="Services"
                      value={detailServices.length ? detailServices.join(', ') : '-'}
                    />
                    <DetailRow label="Status" value={detailStatusStyle.label} />

                    {selectedAppointment.isDoorToDoor &&
                      selectedAppointment.meetingLatitude != null &&
                      selectedAppointment.meetingLongitude != null && (
                        <View className="mb-4 mt-2">
                          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                            Meeting Place
                          </Text>
                          <MeetingPlaceMap
                            coordinate={{
                              latitude: Number(selectedAppointment.meetingLatitude),
                              longitude: Number(selectedAppointment.meetingLongitude),
                            }}
                            editable={false}
                            height={200}
                            showUserLocation
                            markerTitle={selectedAppointment.meetingPlaceLabel || 'MEETING PLACE'}
                          />
                          {selectedAppointment.meetingPlacePhotoUrl ? (
                            <View className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                              <Image
                                source={{ uri: selectedAppointment.meetingPlacePhotoUrl }}
                                className="h-44 w-full"
                                resizeMode="cover"
                              />
                              <Text className="px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                                Landmark photo
                              </Text>
                            </View>
                          ) : (
                            <Text className="mt-2 text-xs text-slate-400">
                              No landmark photo attached
                            </Text>
                          )}
                        </View>
                      )}

                    {selectedAppointment.symptoms && selectedAppointment.symptoms.length > 0 ? (
                      <>
                        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 mt-2">
                          Treatment
                        </Text>
                        {selectedAppointment.symptoms.map((symptom, idx) => (
                          <DetailRow
                            key={`${selectedAppointment.id}-symptom-${idx}`}
                            label={symptom.name}
                            value={
                              symptom.days_count
                                ? `${symptom.days_count} ${symptom.days_count === 1 ? 'day' : 'days'}`
                                : '-'
                            }
                            last={idx === selectedAppointment.symptoms!.length - 1 && !selectedAppointment.notes && !selectedAppointment.created_at}
                          />
                        ))}
                      </>
                    ) : null}

                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 mt-2">
                      Additional Info
                    </Text>
                    <DetailRow
                      label="Bite Incident"
                      value={
                        selectedAppointment.isBitten
                          ? selectedAppointment.biteDetails
                            ? `Yes — ${selectedAppointment.biteDetails}`
                            : 'Yes'
                          : 'No'
                      }
                    />
                    {selectedAppointment.notes ? (
                      <DetailRow label="Notes" value={selectedAppointment.notes} />
                    ) : null}
                    {selectedAppointment.cancellation_reason ? (
                      <DetailRow
                        label="Cancellation Reason"
                        value={selectedAppointment.cancellation_reason}
                      />
                    ) : null}
                    {selectedAppointment.created_at ? (
                      <DetailRow
                        label="Booked On"
                        value={new Date(selectedAppointment.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        last
                      />
                    ) : (
                      <View className="mb-2" />
                    )}

                    {canEditAppointmentServices(selectedAppointment.status) && (
                      <TouchableOpacity
                        onPress={() => openEditServicesModal(selectedAppointment)}
                        className="bg-amber-500 py-3.5 rounded-xl items-center mt-2 flex-row justify-center"
                      >
                        <MaterialIcons name="edit" size={18} color="#ffffff" />
                        <Text className="text-white font-semibold text-base ml-2">
                          Edit Appointment
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() => setDetailModalVisible(false)}
                      className={`bg-blue-600 py-3.5 rounded-xl items-center mb-8 ${
                        canEditAppointmentServices(selectedAppointment.status) ? 'mt-3' : 'mt-4'
                      }`}
                    >
                      <Text className="text-white font-semibold text-base">Close</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* Edit Appointment Modal (pending appointments only) */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={editServicesModalVisible}
        onRequestClose={closeEditServicesModal}
      >
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="bg-white dark:bg-slate-800 rounded-t-3xl max-h-[90%] overflow-hidden">
            <View className="bg-amber-500 px-6 pt-5 pb-4 rounded-t-3xl">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xl font-bold text-white">Edit Appointment</Text>
                  <Text className="text-sm mt-1" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                    {editingAppointment?.isDoorToDoor
                      ? 'Pending approval — you can change services, schedule, and landmark photo'
                      : 'Pending approval — you can change services, date, and time'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeEditServicesModal}
                  disabled={editSubmitting}
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                >
                  <MaterialIcons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView {...NO_BOUNCE_SCROLL} className="px-6 pt-4 pb-6" showsVerticalScrollIndicator={false}>
              {editingAppointment && (
                <View className="mb-4 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
                  <ThemedText className="text-sm text-amber-800 dark:text-amber-200">
                    {editingAppointment.petName} · {editingAppointment.date} · {editingAppointment.time}
                  </ThemedText>
                </View>
              )}

              {!editingAppointment?.isDoorToDoor && (
              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Treatment</ThemedText>
                <TouchableOpacity
                  onPress={toggleEditTreatment}
                  disabled={editSubmitting}
                  className={`flex-row items-center p-3 rounded-xl border-2 ${
                    editSelectedServices.includes('treatment')
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                  }`}
                >
                  <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                    editSelectedServices.includes('treatment') ? 'bg-blue-600' : 'bg-slate-100 dark:bg-slate-700'
                  }`}>
                    <MaterialIcons
                      name={treatmentOption.icon as any}
                      size={20}
                      color={editSelectedServices.includes('treatment') ? '#fff' : '#64748b'}
                    />
                  </View>
                  <View className="ml-3 flex-1">
                    <ThemedText className={`font-semibold text-sm ${
                      editSelectedServices.includes('treatment') ? 'text-blue-700 dark:text-blue-400' : 'text-slate-800 dark:text-white'
                    }`}>
                      {treatmentOption.name}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDuration(treatmentOption.duration)}
                    </ThemedText>
                  </View>
                  <View className={`w-5 h-5 rounded border-2 items-center justify-center ${
                    editSelectedServices.includes('treatment') ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-500'
                  }`}>
                    {editSelectedServices.includes('treatment') && <MaterialIcons name="check" size={12} color="white" />}
                  </View>
                </TouchableOpacity>
              </View>
              )}

              {!editingAppointment?.isDoorToDoor && editSelectedServices.includes('treatment') && (
                <>
                  <View className="mb-4">
                    <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Symptoms *</ThemedText>
                    <View className="gap-2">
                      {complaintOptions.map((complaint) => {
                        const selectedComplaint = editSelectedSymptoms.find((s) => s.symptom_id === complaint.id);
                        const isSelected = !!selectedComplaint;
                        const daysCount = selectedComplaint?.days_count || 1;

                        return (
                          <View
                            key={complaint.id}
                            className={`rounded-xl border ${
                              isSelected
                                ? 'bg-blue-50 border-blue-500 dark:bg-blue-900/20 dark:border-blue-500'
                                : 'bg-white border-slate-200 dark:bg-slate-800 dark:border-slate-600'
                            }`}
                          >
                            <TouchableOpacity
                              onPress={() => {
                                if (isSelected) {
                                  setEditSelectedSymptoms(editSelectedSymptoms.filter((s) => s.symptom_id !== complaint.id));
                                } else {
                                  setEditSelectedSymptoms([...editSelectedSymptoms, { symptom_id: complaint.id, days_count: 1 }]);
                                }
                              }}
                              disabled={editSubmitting}
                              className="flex-row items-center p-3"
                            >
                              <View className={`w-5 h-5 rounded border-2 mr-3 flex items-center justify-center ${
                                isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-slate-500'
                              }`}>
                                {isSelected && <MaterialIcons name="check" size={14} color="white" />}
                              </View>
                              <ThemedText className={`flex-1 ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}`}>
                                {complaint.label}
                              </ThemedText>
                            </TouchableOpacity>

                            {isSelected && (
                              <View className="flex-row items-center px-3 pb-3">
                                <ThemedText className="text-xs text-slate-500 mr-2">Days:</ThemedText>
                                <View className="flex-row items-center bg-white dark:bg-slate-600 rounded-lg border border-slate-200 dark:border-slate-500">
                                  <TouchableOpacity
                                    onPress={() => {
                                      if (daysCount > 1) {
                                        setEditSelectedSymptoms(editSelectedSymptoms.map((s) =>
                                          s.symptom_id === complaint.id ? { ...s, days_count: daysCount - 1 } : s
                                        ));
                                      }
                                    }}
                                    disabled={editSubmitting}
                                    className="px-3 py-1"
                                  >
                                    <MaterialIcons name="remove" size={16} color="#64748b" />
                                  </TouchableOpacity>
                                  <ThemedText className="text-sm font-medium text-slate-800 dark:text-white px-2 min-w-[24px] text-center">
                                    {daysCount}
                                  </ThemedText>
                                  <TouchableOpacity
                                    onPress={() => {
                                      setEditSelectedSymptoms(editSelectedSymptoms.map((s) =>
                                        s.symptom_id === complaint.id ? { ...s, days_count: daysCount + 1 } : s
                                      ));
                                    }}
                                    disabled={editSubmitting}
                                    className="px-3 py-1"
                                  >
                                    <MaterialIcons name="add" size={16} color="#64748b" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <View className="mb-4">
                    <TouchableOpacity
                      onPress={() => setEditIsBitten(!editIsBitten)}
                      disabled={editSubmitting}
                      className="flex-row items-center"
                    >
                      <View className={`w-5 h-5 rounded border-2 mr-2 flex items-center justify-center ${editIsBitten ? 'bg-red-500 border-red-500' : 'border-slate-300 dark:border-slate-500'}`}>
                        {editIsBitten && <MaterialIcons name="check" size={14} color="white" />}
                      </View>
                      <ThemedText className="text-slate-700 dark:text-slate-300">Has the pet bitten anyone?</ThemedText>
                    </TouchableOpacity>

                    {editIsBitten && (
                      <View className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 mt-2">
                        <TextInput
                          className="text-base text-slate-800 dark:text-white"
                          placeholder="Please provide details about the bite incident..."
                          placeholderTextColor="#94a3b8"
                          value={editBiteDetails}
                          onChangeText={setEditBiteDetails}
                          multiline
                          numberOfLines={2}
                          editable={!editSubmitting}
                        />
                      </View>
                    )}
                  </View>
                </>
              )}

              <View className="mb-4">
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  {editingAppointment?.isDoorToDoor ? 'Select Services *' : 'Preventive Services'}
                </ThemedText>
                <View className="gap-2">
                  {(editingAppointment?.isDoorToDoor ? homeServicesOptions : preventiveServiceOptions).map((service) => {
                    const isSelected = editSelectedServices.includes(service.id);
                    const { available, reason } = getServiceAvailability(service.id);
                    const isDisabled = (!available && !isSelected) || editSubmitting;

                    return (
                      <TouchableOpacity
                        key={service.id}
                        onPress={() => toggleEditService(service.id)}
                        disabled={isDisabled}
                        className={`flex-row items-center p-3 rounded-xl border-2 ${
                          isDisabled
                            ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/60 opacity-60'
                            : isSelected
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                          isDisabled
                            ? 'bg-slate-200 dark:bg-slate-700'
                            : isSelected
                            ? 'bg-blue-600'
                            : 'bg-slate-100 dark:bg-slate-700'
                        }`}>
                          <MaterialIcons
                            name={service.icon as any}
                            size={20}
                            color={isDisabled ? '#94a3b8' : isSelected ? '#fff' : '#64748b'}
                          />
                        </View>
                        <View className="ml-3 flex-1">
                          <ThemedText className={`font-semibold text-sm ${
                            isDisabled
                              ? 'text-slate-400 dark:text-slate-500'
                              : isSelected
                              ? 'text-blue-700 dark:text-blue-400'
                              : 'text-slate-800 dark:text-white'
                          }`}>
                            {service.name}
                          </ThemedText>
                          <ThemedText className="text-xs text-slate-500 dark:text-slate-400">
                            {isDisabled && !editSubmitting
                              ? reason || 'Temporarily unavailable'
                              : formatDuration(service.duration)}
                          </ThemedText>
                        </View>
                        <View className={`w-5 h-5 rounded border-2 items-center justify-center ${
                          isDisabled
                            ? 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800'
                            : isSelected
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-slate-300 dark:border-slate-500'
                        }`}>
                          {isSelected && !isDisabled && <MaterialIcons name="check" size={12} color="white" />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {editSelectedServices.length > 0 && (
                <View className="mb-4 rounded-xl p-3 border border-blue-200 dark:border-blue-800" style={{ backgroundColor: 'rgba(31, 122, 140, 0.08)' }}>
                  <ThemedText className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                    Total duration: {formatDuration(getEditTotalDurationMinutes() || TREATMENT_DURATION_MINUTES)}
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    {editSelectedServices.map((id) => allServiceOptions.find((s) => s.id === id)?.name).filter(Boolean).join(' · ')}
                  </ThemedText>
                </View>
              )}

              <View className={`mb-4 ${editSelectedServices.length === 0 ? 'opacity-40' : ''}`}>
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Select Date *</ThemedText>
                {editSelectedServices.length === 0 && (
                  <ThemedText className="text-xs text-amber-600 dark:text-amber-400 mb-2">Select at least one service first</ThemedText>
                )}

                <BookingCalendar
                  currentMonth={currentMonth}
                  onMonthChange={handleMonthChange}
                  selectedDate={editDate}
                  unavailableDates={unavailableDates}
                  canSelect={editSelectedServices.length > 0 && !editSubmitting}
                  onSelectDate={handleSelectEditDate}
                />

                {editDate && (() => {
                  const entry = unavailableDates.find((d) => d.date === editDate);
                  if (!entry || entry.type === 'full_day') return null;

                  return (
                    <View className="mt-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                      <ThemedText className="text-xs text-amber-700 dark:text-amber-300">
                        {entry.type === 'morning'
                          ? 'Morning is unavailable on this date. Afternoon slots only.'
                          : 'Afternoon is unavailable on this date. Morning slots only.'}
                      </ThemedText>
                    </View>
                  );
                })()}
              </View>

              <View className={`mb-4 ${editSelectedServices.length === 0 ? 'opacity-40' : ''}`}>
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Select Time *</ThemedText>
                <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Hourly slots{editingAppointment?.isDoorToDoor
                      ? ' · Home services have no booking limit'
                      : ' · Each time shows how many openings are left'}
                </ThemedText>

                {editSelectedServices.length === 0 ? (
                  <ThemedText className="text-slate-400 text-sm italic">Select services first to see available times</ThemedText>
                ) : editLoadingTimeSlots ? (
                  <View className="items-center py-4">
                    <ActivityIndicator size="small" color="#1F7A8C" />
                  </View>
                ) : !editDate ? (
                  <ThemedText className="text-slate-400 text-sm italic">Select a date to see available times</ThemedText>
                ) : (
                  <View>
                    {(() => {
                      const totalDuration = getEditScheduleDurationMinutes();
                      const reservedLabels = editTime
                        ? getReservedSlotLabels(editTime, totalDuration)
                        : [];

                      // Diri ipakita ang mga slot sa edit sa buntag o hapon.
                      const renderPeriodSlots = (period: 'morning' | 'afternoon', title: string) => {
                        const periodSlots = editAvailableTimeSlots.filter((s) => s.period === period);
                        if (periodSlots.length === 0) return null;

                        return (
                          <View className="mb-3">
                            <ThemedText className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{title}</ThemedText>
                            <View className="flex-row flex-wrap gap-2">
                              {periodSlots.map((slot) => {
                                const isStart = editTime === slot.label;
                                const isReserved = reservedLabels.includes(slot.label) && !isStart;

                                return (
                                  <TouchableOpacity
                                    key={slot.time}
                                    onPress={() => {
                                      if (slot.available) {
                                        setEditTime(slot.label);
                                      }
                                    }}
                                    disabled={!slot.available || editSubmitting}
                                    className={`px-3 py-2 rounded-xl min-w-[92px] ${
                                      isStart
                                        ? 'bg-blue-600'
                                        : isReserved
                                        ? 'bg-blue-200 dark:bg-blue-800/50'
                                        : slot.fully_booked
                                        ? 'bg-red-50 dark:bg-red-900/20'
                                        : slot.available
                                        ? 'bg-slate-100 dark:bg-slate-700'
                                        : 'bg-slate-200 dark:bg-slate-800 opacity-50'
                                    }`}
                                  >
                                    <Text
                                      className={`text-sm text-center ${
                                        isStart
                                          ? 'text-white font-semibold'
                                          : isReserved
                                          ? 'text-blue-800 dark:text-blue-200 font-medium'
                                          : slot.fully_booked
                                          ? 'text-red-700 dark:text-red-300 font-semibold'
                                          : slot.available
                                          ? 'text-slate-600 dark:text-slate-300'
                                          : 'text-slate-400 line-through'
                                      }`}
                                    >
                                      {slot.label}
                                    </Text>
                                    {slotCountLabel(slot) ? (
                                      <Text
                                        className={`text-[10px] text-center mt-0.5 ${
                                          isStart
                                            ? 'text-white/90'
                                            : slot.fully_booked
                                            ? 'text-red-600 dark:text-red-300'
                                            : 'text-slate-500'
                                        }`}
                                      >
                                        {slotCountLabel(slot)}
                                      </Text>
                                    ) : null}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        );
                      };

                      return (
                        <>
                          {renderPeriodSlots('morning', 'Morning (8:00 AM - 12:00 PM)')}
                          {renderPeriodSlots('afternoon', 'Afternoon (1:00 PM - 5:00 PM)')}
                        </>
                      );
                    })()}

                    {editTime && (
                      <View className="mt-3 rounded-xl p-3 border border-blue-200 dark:border-blue-800" style={{ backgroundColor: 'rgba(31, 122, 140, 0.08)' }}>
                        <ThemedText className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                          Reserved: {editTime} – {minutesToLabel(labelToMinutes(editTime) + getEditScheduleDurationMinutes())}
                        </ThemedText>
                          <ThemedText className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            Visit length: {formatDuration(getEditScheduleDurationMinutes())}
                          </ThemedText>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {editingAppointment?.isDoorToDoor && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Meeting Place / Landmark Photo
                  </ThemedText>
                  <Text className="text-xs leading-5 text-slate-500 dark:text-slate-400 mb-3">
                    Update the photo of your gate, house front, or a nearby landmark.
                  </Text>
                  <TouchableOpacity
                    onPress={pickEditMeetingPlacePhoto}
                    disabled={editSubmitting || editUploadingMeetingPlacePhoto}
                    className="overflow-hidden rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60"
                    activeOpacity={0.85}
                  >
                    {editMeetingPlacePhotoUrl ? (
                      <View className="relative">
                        <Image
                          source={{ uri: editMeetingPlacePhotoUrl }}
                          className="h-44 w-full"
                          resizeMode="cover"
                        />
                        <View className="absolute bottom-0 left-0 right-0 bg-black/45 px-3 py-2">
                          <Text className="text-center text-xs font-semibold text-white">
                            {editUploadingMeetingPlacePhoto ? 'Uploading...' : 'Tap to change photo'}
                          </Text>
                        </View>
                      </View>
                    ) : (
                      <View className="h-44 items-center justify-center px-4">
                        {editUploadingMeetingPlacePhoto ? (
                          <ActivityIndicator color="#1F7A8C" />
                        ) : (
                          <>
                            <MaterialIcons name="add-a-photo" size={28} color="#64748b" />
                            <Text className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                              Add landmark photo
                            </Text>
                            <Text className="mt-1 text-center text-xs text-slate-400">
                              Optional, but recommended
                            </Text>
                          </>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                  {editMeetingPlacePhotoUrl && !editUploadingMeetingPlacePhoto && (
                    <TouchableOpacity
                      onPress={() => setEditMeetingPlacePhotoUrl(null)}
                      disabled={editSubmitting}
                      className="mt-2 py-2 items-center"
                    >
                      <Text className="text-sm font-medium text-red-500">Remove photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <TouchableOpacity
                onPress={saveEditedServices}
                disabled={editSubmitting || editUploadingMeetingPlacePhoto}
                className="bg-blue-600 py-4 rounded-xl items-center"
                style={{ opacity: editSubmitting || editUploadingMeetingPlacePhoto ? 0.7 : 1 }}
              >
                {editSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white font-semibold text-base">Save Changes</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={closeEditServicesModal}
                disabled={editSubmitting}
                className="py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600 mt-3 mb-2"
              >
                <Text className="text-slate-500 dark:text-slate-400 font-medium text-sm">Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <SuccessMessageModal
        visible={successModal.visible}
        title={successModal.title}
        message={successModal.message}
        onClose={closeSuccessMessage}
      />
    </ThemedView>
  );
}
