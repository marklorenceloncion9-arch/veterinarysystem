import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { View, ScrollView, TouchableOpacity, Pressable, TextInput, Modal, Alert, ActivityIndicator, RefreshControl, Text, Image, Platform, StyleSheet, InteractionManager } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, LinearTransition, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useLocalSearchParams } from 'expo-router';
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
import { AppScreenHeader } from '@/components/AppScreenHeader';
import { HeaderTitle } from '@/components/AppHeaderBits';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { formatAppointmentTimeLabel } from '@/utils/appointmentDisplay';

const imageMediaTypes: ImagePicker.MediaType[] = ['images'];

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
  petNames?: string[];
  pets?: { id: number; pet_name: string }[];
  bookedPets?: BookedPet[];
  status_summary?: string | null;
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

interface BookedPet {
  id: number;
  pet_name: string;
  species_name?: string | null;
  breed_name?: string | null;
  registration_status?: string | null;
  services: string[];
  status: string;
  cancellation_reason?: string | null;
}

// Diri kuhaon ang mga pet nga naka-book.
function getBookedPets(appointment: Appointment): BookedPet[] {
  if (appointment.bookedPets?.length) {
    return appointment.bookedPets;
  }

  const services = appointment.services?.length
    ? appointment.services
    : appointment.service
    ? [appointment.service]
    : [];

  const fallbackName = appointment.petNames?.length
    ? appointment.petNames.join(', ')
    : appointment.petName;

  if (appointment.petNames && appointment.petNames.length > 1) {
    return appointment.petNames.map((name, index) => ({
      id: appointment.pets?.[index]?.id ?? index,
      pet_name: name,
      services,
      status: appointment.status,
    }));
  }

  return [{
    id: appointment.pets?.[0]?.id ?? 0,
    pet_name: fallbackName || 'Unknown',
    services,
    status: appointment.status,
  }];
}

// Diri i-format ang petsa sa appointment.
function formatAppointmentDateLabel(dateStr: string, options?: Intl.DateTimeFormatOptions) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', options ?? {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

// Diri ipakita ang summary sa naka-book nga pet.
function BookedPetSummaryRow({
  pet,
  compact = false,
}: {
  pet: BookedPet;
  compact?: boolean;
}) {
  const petStatusStyle = getStatusStyle(pet.status);

  return (
    <View className={compact ? 'py-1' : 'py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0'}>
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center flex-1 pr-2">
          <MaterialIcons name="pets" size={compact ? 14 : 18} color="#64748b" />
          <ThemedText
            className={`ml-1.5 flex-1 font-semibold text-slate-800 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}
            numberOfLines={1}
          >
            {pet.pet_name}
          </ThemedText>
        </View>
        {!compact ? (
          <View className={`rounded-full px-2 py-0.5 flex-row items-center shrink-0 ${petStatusStyle.badgeBg}`}>
            <MaterialIcons name={getStatusIcon(pet.status)} size={11} color={petStatusStyle.icon} />
            <Text className={`text-[10px] font-bold ml-1 ${petStatusStyle.badgeText}`}>
              {petStatusStyle.label}
            </Text>
          </View>
        ) : null}
      </View>

      {!compact && pet.species_name ? (
        <ThemedText className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5 ml-7">
          {pet.species_name}
          {pet.breed_name ? ` (${pet.breed_name})` : ''}
        </ThemedText>
      ) : null}

      {pet.services.length > 0 ? (
        compact ? (
          <Text className="mt-0.5 ml-5 text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
            {pet.services.join(' · ')}
          </Text>
        ) : (
        <View className="flex-row flex-wrap gap-1.5 mt-2 ml-7">
          {pet.services.map((service, serviceIndex) => (
            <View
              key={`${pet.id}-${service}-${serviceIndex}`}
              className="rounded-full bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 border border-blue-100 dark:border-blue-800"
            >
              <Text className="text-[11px] font-medium text-blue-800 dark:text-blue-200">
                {service}
              </Text>
            </View>
          ))}
        </View>
        )
      ) : (
        <ThemedText className={`text-xs text-slate-400 ${compact ? 'mt-0.5 ml-5' : 'mt-1.5 ml-7'}`}>
          No services listed
        </ThemedText>
      )}

      {pet.cancellation_reason ? (
        <ThemedText className={`text-xs text-red-600 dark:text-red-400 ${compact ? 'mt-1 ml-6' : 'mt-1.5 ml-7'}`}>
          {pet.cancellation_reason}
        </ThemedText>
      ) : null}
    </View>
  );
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
  species?: string | { species_name?: string | null; name?: string | null } | null;
  breed?: string | { breed_name?: string | null; name?: string | null } | null;
  identification_number?: string;
  registration_status?: string;
}

// Diri kuhaon ang ngalan sa species bisan nested o flat.
function readSpeciesName(source?: {
  species_name?: string | null;
  species?: string | { species_name?: string | null; name?: string | null } | null;
} | null): string {
  if (!source) return '';
  if (typeof source.species_name === 'string' && source.species_name.trim()) {
    return source.species_name.trim();
  }
  const species = source.species;
  if (typeof species === 'string') return species.trim();
  if (species && typeof species === 'object') {
    return String(species.species_name || species.name || '').trim();
  }
  return '';
}

// Diri ipakita ang vaccination kung cat o dog ang hayop.
function speciesAllowsVaccination(speciesName?: string | null): boolean {
  const normalized = (speciesName || '').trim().toLowerCase();
  return normalized === 'cat' || normalized === 'dog';
}

function filterVaccinationOption<T extends { id: string }>(options: T[], allowVaccination: boolean): T[] {
  if (allowVaccination) return options;
  return options.filter((option) => option.id !== 'vaccination');
}

function petsAllowVaccination(
  pets: { id: number; species_name?: string | null }[],
  animalList: Animal[],
): boolean {
  if (pets.length === 0) return false;
  return pets.every((pet) => {
    const listed = animalList.find((animal) => animal.id === pet.id);
    return speciesAllowsVaccination(readSpeciesName(listed) || pet.species_name || '');
  });
}

// Diri pilion ang kolor sa registration badge.
function getRegistrationBadgeStyle(status?: string) {
  if (status === 'registered') {
    return {
      container: 'bg-green-100 dark:bg-green-900/30',
      text: 'text-green-700 dark:text-green-400',
      label: 'Registered',
    };
  }
  if (status === 'exempt') {
    return {
      container: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      label: 'Exempt',
    };
  }
  if (status === 'declined') {
    return {
      container: 'bg-red-100 dark:bg-red-900/30',
      text: 'text-red-700 dark:text-red-400',
      label: 'Declined',
    };
  }
  return {
    container: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending',
  };
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

const MORNING_HOURS = [8, 9, 10, 11];
const AFTERNOON_HOURS = [13, 14, 15, 16];

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
              className="mt-6 w-full items-center rounded-xl bg-teal py-3.5"
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

const holidayDatesByYear = new Map<number, Set<string>>();

// Diri kuhaon ang mga holiday sa usa ka tuig.
const holidaysForYear = (year: number): Set<string> => {
  const cached = holidayDatesByYear.get(year);
  if (cached) return cached;

  const dates = new Set<string>();
  const list = phHolidays.getHolidays(year) || [];
  for (const holiday of list) {
    const raw = typeof holiday?.date === 'string' ? holiday.date : '';
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) dates.add(match[1]);
  }
  holidayDatesByYear.set(year, dates);
  return dates;
};

// Diri kuhaon ang mga holiday sa usa ka bulan.
const buildMonthHolidaySet = (year: number, month: number): Set<string> => {
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const holidays = new Set<string>();
  holidaysForYear(year).forEach((date) => {
    if (date.startsWith(prefix)) holidays.add(date);
  });
  return holidays;
};

// Diri i-format ang Date ngadto sa YYYY-MM-DD.
const formatLocalDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

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
            ? 'bg-teal'
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
              ? 'text-teal dark:text-teal-300'
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

// Diri himuon og label ang oras.
const formatHourLabel = (hour: number): string => minutesToLabel(hour * 60);

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
  approved: { bg: 'bg-teal-50 dark:bg-teal-900/20', text: 'text-blue-700 dark:text-blue-300', icon: '#1F7A8C' },
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

  if (compact || !appointment.status_message) {
    return null;
  }

  return (
    <View
      className={`rounded-xl border ${
        compact ? 'mt-2 p-2' : 'mb-4 p-3'
      } bg-teal-50 border-blue-200 dark:bg-teal-900/20 dark:border-blue-800`}
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

// Diri ang services screen para sa booking.
export default function ServicesScreen() {
  const { token } = useAuth();
  const layout = useResponsiveLayout();
  const { appointmentId: appointmentIdParam } = useLocalSearchParams<{ appointmentId?: string }>();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentFilter, setAppointmentFilter] = useState<'appointments' | 'history'>('appointments');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [tabTrackWidth, setTabTrackWidth] = useState(0);
  const tabProgress = useSharedValue(0);
  const bookingsListRef = useRef<ScrollView>(null);

  useEffect(() => {
    tabProgress.value = withTiming(appointmentFilter === 'history' ? 1 : 0, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
    bookingsListRef.current?.scrollTo({ y: 0, animated: false });
  }, [appointmentFilter, tabProgress]);

  const tabPillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabProgress.value * tabTrackWidth }],
  }));
  const appointmentsLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tabProgress.value, [0, 1], ['#ffffff', '#64748b']),
  }));
  const historyLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(tabProgress.value, [0, 1], ['#64748b', '#ffffff']),
  }));
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
    petIds: [] as number[],
    petNames: [] as string[],
    service: '',
    serviceType: '', // 'treatment' or 'preventive'
    date: '',
    time: '',
    notes: '',
    isBitten: false,
    biteDetails: '',
  });
  const [servicesByPetId, setServicesByPetId] = useState<Record<number, string[]>>({});
  const [activeServicePetId, setActiveServicePetId] = useState<number | null>(null);
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
  const [editExpandedHour, setEditExpandedHour] = useState<string | null>(null);
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
  const [expandedHour, setExpandedHour] = useState<string | null>(null);
  const effectiveActivePetId =
    activeServicePetId && newAppointment.petIds.includes(activeServicePetId)
      ? activeServicePetId
      : (newAppointment.petIds[0] ?? null);
  const activeAnimal = animals.find((animal) => animal.id === effectiveActivePetId) ?? null;
  const activePetAllowsVaccination = speciesAllowsVaccination(readSpeciesName(activeAnimal));
  const visibleServiceOptions = filterVaccinationOption(
    currentServiceOptions,
    activePetAllowsVaccination,
  );
  const editingPets = editingAppointment ? getBookedPets(editingAppointment) : [];
  const editAllowsVaccination = petsAllowVaccination(editingPets, animals);
  const editServiceOptions = filterVaccinationOption(
    editingAppointment?.isDoorToDoor ? homeServicesOptions : preventiveServiceOptions,
    editAllowsVaccination,
  );
  const selectedServicesForActivePet = effectiveActivePetId
    ? (servicesByPetId[effectiveActivePetId] || [])
    : [];
  const treatmentSelected = selectedServicesForActivePet.includes('treatment');
  const anyPetNeedsTreatment = Object.values(servicesByPetId).some((services) =>
    services.includes('treatment')
  );
  const everyPetHasServices =
    newAppointment.petIds.length > 0 &&
    newAppointment.petIds.every((petId) => (servicesByPetId[petId] || []).length > 0);
  const allSelectedServiceIds = Array.from(
    new Set(newAppointment.petIds.flatMap((petId) => servicesByPetId[petId] || []))
  );
  const canProceedFromStep1 =
    newAppointment.petIds.length > 0 &&
    everyPetHasServices &&
    (!anyPetNeedsTreatment || selectedSymptoms.length > 0);

  // Diri kwentahon ang total nga minutos sa serbisyo.
  const getTotalDurationMinutes = (services: string[] = selectedServicesForActivePet): number => {
    if (services.length === 0) return 0;
    return services.reduce((total, id) => total + (SERVICE_DURATIONS[id] || 0), 0);
  };

  // Diri kwentahon ang gidugayon para sa schedule.
  const getScheduleDurationMinutes = (services?: string[]): number => {
    if (services) {
      const serviceDuration = getTotalDurationMinutes(services);
      return serviceDuration > 0 ? serviceDuration : TREATMENT_DURATION_MINUTES;
    }
    return getBookingDurationMinutes();
  };

  // Diri kwentahon ang gidugayon sa tibuok booking.
  const getBookingDurationMinutes = (): number => {
    const total = newAppointment.petIds.reduce((sum, petId) => {
      return sum + getTotalDurationMinutes(servicesByPetId[petId] || []);
    }, 0);
    return total > 0 ? total : TREATMENT_DURATION_MINUTES;
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
    if (newAppointment.date && getBookingDurationMinutes() > 0) {
      fetchAvailableTimeSlots(newAppointment.date, newAppointment.time, services);
      return;
    }

    setNewAppointment((prev) => ({ ...prev, time: '' }));
    setExpandedHour(null);
    setAvailableTimeSlots([]);
  };

  // Diri i-update ang serbisyo sa aktibo nga pet.
  const updateActivePetServices = (nextServicesRaw: string[]) => {
    if (!effectiveActivePetId) return;
    const nextServices = sortServicesWithTreatmentFirst(nextServicesRaw);
    setServicesByPetId((prev) => ({
      ...prev,
      [effectiveActivePetId]: nextServices,
    }));
    refreshTimeSlotsIfScheduled(nextServices);
  };

  // Diri i-on o i-off ang treatment.
  const toggleTreatment = () => {
    if (!effectiveActivePetId) return;
    if (treatmentSelected) {
      const nextServices = selectedServicesForActivePet.filter((id) => id !== 'treatment');
      updateActivePetServices(nextServices);
      if (!Object.entries(servicesByPetId).some(([petId, services]) =>
        Number(petId) !== effectiveActivePetId && services.includes('treatment')
      ) && !nextServices.includes('treatment')) {
        setSelectedSymptoms([]);
        setNewAppointment((prev) => ({
          ...prev,
          isBitten: false,
          biteDetails: '',
        }));
      }
      return;
    }

    updateActivePetServices([...selectedServicesForActivePet, 'treatment']);
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
    if (!effectiveActivePetId) return;
    if (serviceId === 'vaccination' && !activePetAllowsVaccination) return;
    const { available } = getServiceAvailability(serviceId);
    const isSelected = selectedServicesForActivePet.includes(serviceId);
    if (!available && !isSelected) {
      return;
    }

    const nextServicesRaw = selectedServicesForActivePet.includes(serviceId)
      ? selectedServicesForActivePet.filter((id) => id !== serviceId)
      : [...selectedServicesForActivePet, serviceId];

    updateActivePetServices(nextServicesRaw);
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

  useEffect(() => {
    if (!appointmentIdParam || appointments.length === 0) return;
    const targetId = Number(appointmentIdParam);
    if (!Number.isFinite(targetId)) return;
    const match = appointments.find((appointment) => appointment.id === targetId);
    if (match) {
      setSelectedAppointment(match);
      setDetailModalVisible(true);
    }
  }, [appointmentIdParam, appointments]);

  // Fetch available time slots when date or services change
  useEffect(() => {
    if (newAppointment.date && everyPetHasServices) {
      fetchAvailableTimeSlots(newAppointment.date, newAppointment.time);
    } else {
      setAvailableTimeSlots([]);
      if (!everyPetHasServices) {
        setNewAppointment((prev) => ({ ...prev, time: '' }));
      }
    }
  }, [newAppointment.date, everyPetHasServices, servicesByPetId]);

  useEffect(() => {
    if (editServicesModalVisible && editDate && editSelectedServices.length > 0 && editingAppointment) {
      fetchEditAvailableTimeSlots(editDate, editTime, editSelectedServices, editingAppointment.id);
    } else if (!editServicesModalVisible) {
      setEditAvailableTimeSlots([]);
      setEditExpandedHour(null);
    }
  }, [editServicesModalVisible, editDate, editSelectedServices, editingAppointment?.id]);

  useEffect(() => {
    if (!effectiveActivePetId && newAppointment.petIds.length > 0) {
      setActiveServicePetId(newAppointment.petIds[0]);
    }
  }, [newAppointment.petIds, effectiveActivePetId]);

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
  const canCancelAppointment = (status: string) => status === 'pending' || status === 'approved';

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
    setEditExpandedHour(null);
    setEditAvailableTimeSlots([]);
  };

  // Diri pilion ang bag-ong petsa sa edit.
  const handleSelectEditDate = (dateStr: string) => {
    setEditDate(dateStr);
    setEditTime('');
    setEditExpandedHour(null);
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
    if (serviceId === 'vaccination' && !editAllowsVaccination) return;
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

    const allowVaccination = petsAllowVaccination(getBookedPets(appointment), animals);
    setEditingAppointment(appointment);
    setEditSelectedServices(
      mapServiceNamesToIds(serviceNames).filter((id) => id !== 'vaccination' || allowVaccination),
    );
    setEditSelectedSymptoms(mapSymptomsToSelected(appointment.symptoms));
    setEditIsBitten(!!appointment.isBitten);
    setEditBiteDetails(appointment.biteDetails || '');
    setEditDate(appointment.date);
    setEditTime(appointment.time);
    setEditMeetingPlacePhotoUrl(appointment.meetingPlacePhotoUrl || null);
    setEditExpandedHour(null);
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
    setEditExpandedHour(null);
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

    const servicesToSave = editAllowsVaccination
      ? editSelectedServices
      : editSelectedServices.filter((id) => id !== 'vaccination');

    if (servicesToSave.length === 0) {
      Alert.alert(
        'Required',
        editingAppointment?.isDoorToDoor
          ? 'Please select at least one service.'
          : 'Please select treatment or at least one service.'
      );
      return;
    }

    if (servicesToSave.includes('treatment') && editSelectedSymptoms.length === 0) {
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

    const orderedTreatmentTypeIds = buildTreatmentTypeIds(servicesToSave);
    const primaryTreatmentTypeId = orderedTreatmentTypeIds[0] ?? null;

    if (!primaryTreatmentTypeId) {
      Alert.alert('Error', 'Please select valid services');
      return;
    }

    const durationMinutes = getEditTotalDurationMinutes(servicesToSave) || TREATMENT_DURATION_MINUTES;

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

    const formattedSymptoms = servicesToSave.includes('treatment')
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
    _services?: string[]
  ) => {
    const durationMinutes = getBookingDurationMinutes();

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

    if (!newAppointment.petIds.length || !newAppointment.date) {
      Alert.alert('Error', 'Please select at least one pet and a date');
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

    // Build per-pet services payload
    const petServicesPayload = newAppointment.petIds.map((petId) => {
      const animal = animals.find((item) => item.id === petId);
      const allowVaccination = speciesAllowsVaccination(readSpeciesName(animal));
      const serviceIds = (servicesByPetId[petId] || []).filter(
        (id) => id !== 'vaccination' || allowVaccination,
      );
      const treatmentTypeIds = buildTreatmentTypeIds(serviceIds);
      return {
        pet_id: petId,
        treatment_type_ids: treatmentTypeIds,
      };
    });

    const allTreatmentTypeIds = Array.from(
      new Set(petServicesPayload.flatMap((entry) => entry.treatment_type_ids))
    );

    const treatmentService = treatmentTypes.find(t => t.type_name === 'Treatment');
    const orderedTreatmentTypeIds =
      treatmentService && allTreatmentTypeIds.includes(treatmentService.id)
        ? [
            treatmentService.id,
            ...allTreatmentTypeIds.filter((id) => id !== treatmentService.id),
          ]
        : allTreatmentTypeIds;

    const primaryTreatmentTypeId = orderedTreatmentTypeIds.length > 0
      ? orderedTreatmentTypeIds[0]
      : null;
    let serviceToBook = '';
    if (primaryTreatmentTypeId) {
      const primaryService = treatmentTypes.find(t => t.id === primaryTreatmentTypeId);
      serviceToBook = primaryService?.type_name || '';
    }

    // If no service to book, return error
    if (!serviceToBook || !primaryTreatmentTypeId || !everyPetHasServices) {
      Alert.alert('Error', 'Please select at least one service for each animal');
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

      // Only include complaints when Treatment is selected for any pet
      const formattedSymptoms = anyPetNeedsTreatment
        ? selectedSymptoms.map(s => ({
            name: s.symptom_id,
            days_count: s.days_count
          }))
        : [];

      const response = await axios.post(
        `${API_BASE_URL}/api/mobile/appointments`,
        {
          pet_id: newAppointment.petIds[0],
          pet_ids: newAppointment.petIds,
          pet_services: petServicesPayload,
          treatment_type_id: treatmentType.id,
          treatment_type_ids: orderedTreatmentTypeIds,
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

        setNewAppointment({
          petIds: [],
          petNames: [],
          service: getFirstTreatmentType(),
          date: '',
          time: '',
          notes: '',
          serviceType: '',
          isBitten: false,
          biteDetails: '',
        });
        setSelectedSymptoms([]);
        setServicesByPetId({});
        setActiveServicePetId(null);
        setCurrentStep(1);
        setExpandedHour(null);
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
      'Are you sure you want to cancel this appointment?',
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
    setExpandedHour(null);
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

  useEffect(() => {
    if (!modalVisible) return;
    const task = InteractionManager.runAfterInteractions(() => {
      const year = new Date().getFullYear();
      holidaysForYear(year);
      holidaysForYear(year + 1);
    });
    return () => task.cancel();
  }, [modalVisible]);

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
      petIds: [],
      petNames: [],
      service: '',
      serviceType: '',
      date: '',
      time: '',
      notes: '',
      isBitten: false,
      biteDetails: '',
    });
    setSelectedSymptoms([]);
    setServicesByPetId({});
    setActiveServicePetId(null);
    setShowAnimalDropdown(false);
    setExpandedHour(null);
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
      petIds: [],
      petNames: [],
      service: '',
      serviceType: '',
      date: '',
      time: '',
      notes: '',
      isBitten: false,
      biteDetails: '',
    });
    setSelectedSymptoms([]);
    setServicesByPetId({});
    setActiveServicePetId(null);
    setShowAnimalDropdown(false);
    setExpandedHour(null);
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

  const confirmStep = 3;
  const scheduleStep = 4;
  const reviewStep = isDoorToDoorBooking ? 6 : 5;
  const bookingSteps = isDoorToDoorBooking
    ? [
        { step: 1, label: 'Pets' },
        { step: 2, label: 'Services' },
        { step: 3, label: 'Confirm' },
        { step: 4, label: 'Schedule' },
        { step: 5, label: 'Location' },
        { step: 6, label: 'Review' },
      ]
    : [
        { step: 1, label: 'Pets' },
        { step: 2, label: 'Services' },
        { step: 3, label: 'Confirm' },
        { step: 4, label: 'Schedule' },
        { step: 5, label: 'Review' },
      ];

  // The vet is the shared resource behind both booking types, so vet day-off /
  // half-day unavailability applies to clinic appointments AND door-to-door alike.
  // Individual bookings (a specific clinic slot vs. a specific door-to-door slot)
  // still don't block each other — see fetchAvailableTimeSlots / is_door_to_door.

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      {/* Header */}
      <AppScreenHeader>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <HeaderTitle
              eyebrow="Your bookings"
              title="Services"
              subtitle={`${activeCount} active · ${historyCount} in history`}
              compact={layout.isCompact}
            />
          </View>
          <TouchableOpacity
            onPress={openBookingModal}
            activeOpacity={0.85}
            className="flex-row items-center rounded-full bg-navy px-4"
            style={{ height: 44 }}
          >
            <MaterialIcons name="add" size={19} color="#ffffff" />
            <Text className="text-white text-[13px] font-bold ml-1">Book</Text>
          </TouchableOpacity>
        </View>
      </AppScreenHeader>

      <View className="pt-4" style={layout.contentStyle}>
        <View
          className="flex-row rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1"
          style={{ shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
          onLayout={(event) => {
            const inner = event.nativeEvent.layout.width - 8;
            setTabTrackWidth(inner > 0 ? inner / 2 : 0);
          }}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 4,
                top: 4,
                bottom: 4,
                width: tabTrackWidth,
                borderRadius: 999,
                backgroundColor: '#1F7A8C',
              },
              tabPillStyle,
            ]}
          />
          <TouchableOpacity
            onPress={() => setAppointmentFilter('appointments')}
            activeOpacity={0.85}
            className="flex-1 flex-row items-center justify-center rounded-full py-2.5 bg-transparent"
          >
            <MaterialIcons
              name="event-note"
              size={18}
              color={appointmentFilter === 'appointments' ? '#ffffff' : '#64748b'}
            />
            <Animated.Text
              className={`ml-2 ${layout.isCompact ? 'text-xs' : 'text-sm'} font-semibold`}
              style={appointmentsLabelStyle}
              numberOfLines={1}
            >
              Appointments
            </Animated.Text>
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
            activeOpacity={0.85}
            className="flex-1 flex-row items-center justify-center rounded-full py-2.5 bg-transparent"
          >
            <MaterialIcons
              name="history"
              size={18}
              color={appointmentFilter === 'history' ? '#ffffff' : '#64748b'}
            />
            <Animated.Text
              className={`ml-2 ${layout.isCompact ? 'text-xs' : 'text-sm'} font-semibold`}
              style={historyLabelStyle}
              numberOfLines={1}
            >
              History
            </Animated.Text>
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
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          layout={LinearTransition.duration(280)}
          className="pt-3"
          style={layout.contentStyle}
        >
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
                  activeOpacity={0.85}
                  className={`flex-row items-center rounded-full px-4 py-2 border ${
                    isSelected
                      ? 'bg-teal border-teal'
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
        </Animated.View>
      )}

      <ScrollView
        ref={bookingsListRef}
        className="flex-1" 
        contentContainerStyle={[layout.scrollContent, { paddingTop: 12 }]}
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
          <Animated.View
            key={`${appointmentFilter}-${historyFilter}`}
            entering={FadeIn.duration(220)}
            exiting={FadeOut.duration(160)}
          >
        {filteredAppointments.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(250)} className="bg-white dark:bg-slate-800 rounded-3xl p-8 items-center border border-slate-100 dark:border-slate-700 mb-6">
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
            {filteredAppointments.map((appointment) => {
            const statusStyle = getStatusStyle(appointment.status);
            const bookingTypeBadge = getOwnerBookingTypeBadge(appointment);
            const bookedPets = getBookedPets(appointment);
            const isMultiPet = bookedPets.length > 1;
            const timeLabel = formatAppointmentTimeLabel(appointment.time);

            return (
            <View key={appointment.id}>
            <TouchableOpacity
              onPress={() => {
                setSelectedAppointment(appointment);
                setDetailModalVisible(true);
              }}
              activeOpacity={0.85}
              className="bg-white dark:bg-slate-800 rounded-3xl px-4 py-3.5 mb-2.5 border border-slate-100 dark:border-slate-700"
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <MaterialIcons name="event" size={14} color="#64748b" />
                    <Text className="ml-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {formatAppointmentDateLabel(appointment.date)}
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
                  {isMultiPet ? (
                    <Text className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                      {bookedPets.length} pets booked
                    </Text>
                  ) : null}
                </View>
                <View className="items-end shrink-0">
                  <View className={`rounded-full px-2.5 py-1 flex-row items-center ${statusStyle.badgeBg}`}>
                    <MaterialIcons name={getStatusIcon(appointment.status)} size={12} color={statusStyle.icon} />
                    <Text className={`text-[11px] font-bold ml-1 ${statusStyle.badgeText}`}>
                      {statusStyle.label}
                    </Text>
                  </View>
                  {appointment.status_summary ? (
                    <Text className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-1 text-right max-w-[120px]">
                      {appointment.status_summary}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View className="mt-1.5">
                {bookedPets.map((pet) => (
                  <BookedPetSummaryRow key={`${appointment.id}-pet-${pet.id}`} pet={pet} compact />
                ))}
              </View>

              <AppointmentStatusMessage appointment={appointment} compact />

              <View className="flex-row items-center justify-between mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700">
                <Text className="text-[11px] font-medium text-slate-400">
                  Tap for details
                </Text>
                <View className="flex-row items-center">
                  {canEditAppointmentServices(appointment.status) && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        openEditServicesModal(appointment);
                      }}
                      className="w-7 h-7 rounded-full items-center justify-center bg-amber-50 dark:bg-amber-900/20 mr-1"
                    >
                      <MaterialIcons name="edit" size={15} color="#d97706" />
                    </TouchableOpacity>
                  )}
                  {canCancelAppointment(appointment.status) && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        cancelAppointment(appointment.id);
                      }}
                      className="w-7 h-7 rounded-full items-center justify-center bg-red-50 dark:bg-red-900/20"
                    >
                      <MaterialIcons name="close" size={15} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                  {!canEditAppointmentServices(appointment.status) &&
                    !canCancelAppointment(appointment.status) && (
                      <MaterialIcons name="chevron-right" size={20} color="#94a3b8" />
                    )}
                </View>
              </View>
            </TouchableOpacity>
            </View>
            );
          })}
          </>
        )}
        </Animated.View>
        )}
        
        <View className="h-6" />
      </ScrollView>

      {/* Booking type picker and home-service notice share one overlay so the backdrop does not flash */}
      <Modal
        animationType="none"
        transparent
        visible={bookingTypePickerVisible || doorToDoorNoticeVisible || modalVisible}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setBookingTypePickerVisible(false);
          setDoorToDoorNoticeVisible(false);
          setModalVisible(false);
        }}
      >
        <View className="flex-1 items-center justify-center px-6" style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(15, 23, 42, 0.45)' }]}>
          {doorToDoorNoticeVisible ? (
          <Animated.View key="home-notice" entering={FadeIn.duration(220)} className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-800 p-6">
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
              activeOpacity={0.85}
              className="mt-6 items-center rounded-xl bg-sky-600 py-3.5"
            >
              <Text className="text-base font-semibold text-white">Start Home Services Booking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setDoorToDoorNoticeVisible(false);
                setBookingTypePickerVisible(true);
              }}
              activeOpacity={0.85}
              className="mt-3 items-center rounded-xl border border-slate-300 dark:border-slate-600 py-3"
            >
              <Text className="text-sm font-medium text-slate-500 dark:text-slate-400">Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
          ) : !modalVisible ? (
          <Animated.View key="booking-choice" entering={FadeIn.duration(220)} className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-800 px-5 pt-5 pb-6">
            <View className="mb-1 flex-row items-center justify-center">
              <Text className="flex-1 text-center text-xl font-bold text-slate-900 dark:text-white">Book a service</Text>
              <TouchableOpacity
                onPress={() => setBookingTypePickerVisible(false)}
                activeOpacity={0.7}
                hitSlop={8}
                className="absolute right-0 h-9 w-9 items-center justify-center"
              >
                <MaterialIcons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="mb-5 text-center text-sm text-slate-500 dark:text-slate-400">
              Choose clinic or home visit.
            </Text>

            <View className="flex-row gap-3">
              <Pressable
                onPress={startClinicBooking}
                className="flex-1 items-center rounded-2xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-3 py-5"
              >
                <View className="h-14 w-14 items-center justify-center rounded-2xl bg-teal">
                  <MaterialIcons name="local-hospital" size={28} color="#fff" />
                </View>
                <Text className="mt-3 text-center text-base font-semibold text-slate-800 dark:text-white">Clinical</Text>
                <Text className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
                  At the clinic
                </Text>
              </Pressable>

              <Pressable
                onPress={openDoorToDoorNotice}
                className="flex-1 items-center rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-3 py-5"
              >
                <View className="h-14 w-14 items-center justify-center rounded-2xl bg-sky-600">
                  <MaterialIcons name="home" size={28} color="#fff" />
                </View>
                <Text className="mt-3 text-center text-base font-semibold text-sky-800 dark:text-sky-300">Home Service</Text>
                <Text className="mt-1 text-center text-xs leading-5 text-sky-700 dark:text-sky-400">
                  Care at your door
                </Text>
              </Pressable>
            </View>
          </Animated.View>
          ) : null}
          {modalVisible && (
          <View className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl max-h-[88%] overflow-hidden">
            {/* Modal Header */}
            <View className="border-b border-slate-100 bg-white px-6 pb-4 pt-5">
              <View className="flex-row items-center justify-center">
                <Text className="text-center text-xl font-bold text-navy">
                  {isDoorToDoorBooking ? 'Home Services' : 'Book Services'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setModalVisible(false);
                    setIsDoorToDoorBooking(false);
                    setMeetingCoordinate(null);
                    setMeetingPlacePhotoUrl(null);
                  }}
                  className="absolute right-0 h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                >
                  <MaterialIcons name="close" size={22} color="#16324F" />
                </TouchableOpacity>
              </View>

              <View className="mt-5 flex-row items-start justify-center">
                {bookingSteps.map(({ step, label }, index, steps) => (
                  <View key={step} className="flex-row items-start">
                    <View className={`${steps.length > 5 ? 'w-10' : 'w-12'} items-center`}>
                      <View
                        className={`h-8 w-8 items-center justify-center rounded-full ${
                          currentStep >= step ? 'bg-navy' : 'bg-slate-200'
                        }`}
                      >
                        {currentStep > step ? (
                          <MaterialIcons name="check" size={18} color="#ffffff" />
                        ) : (
                          <Text
                            className="text-sm font-bold"
                            style={{ color: currentStep >= step ? '#ffffff' : '#64748b' }}
                          >
                            {step}
                          </Text>
                        )}
                      </View>
                      <Text
                        className={`mt-1 text-center font-medium ${steps.length > 5 ? 'text-[9px]' : 'text-[10px]'}`}
                        numberOfLines={1}
                        style={{ color: currentStep >= step ? '#16324F' : '#94a3b8' }}
                      >
                        {label}
                      </Text>
                    </View>
                    {index < steps.length - 1 && (
                      <View
                        className={`mt-4 h-0.5 ${steps.length > 5 ? 'w-1.5' : 'w-2'}`}
                        style={{ backgroundColor: currentStep > step ? '#16324F' : '#e2e8f0' }}
                      />
                    )}
                  </View>
                ))}
              </View>
            </View>

            <View className="px-6 pt-4 pb-6">
            {(currentStep === 1 || currentStep === 2) && (
              <ScrollView {...NO_BOUNCE_SCROLL} showsVerticalScrollIndicator={false} className="max-h-[62vh]">
                {/* Select Pets (multi-select) */}
                {currentStep === 1 && (
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Select Pets
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Tap to choose one or more pets.
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => setShowAnimalDropdown(!showAnimalDropdown)}
                    className="flex-row items-center bg-slate-100 dark:bg-slate-700 rounded-xl px-4 py-3"
                  >
                    <MaterialIcons name="pets" size={20} color="#64748b" />
                    <ThemedText className="flex-1 ml-3 text-base text-slate-800 dark:text-white">
                      {newAppointment.petNames.length === 0
                        ? 'Select one or more pets'
                        : newAppointment.petNames.length === 1
                          ? newAppointment.petNames[0]
                          : `${newAppointment.petNames.length} pets selected`}
                    </ThemedText>
                    <MaterialIcons name={showAnimalDropdown ? 'arrow-drop-up' : 'arrow-drop-down'} size={24} color="#64748b" />
                  </TouchableOpacity>

                  {!showAnimalDropdown && newAppointment.petIds.length > 0 ? (
                    <Animated.View entering={FadeInDown.duration(180)} className="mt-2 gap-2">
                      {newAppointment.petIds.map((petId, index) => {
                        const animal = animals.find((a) => a.id === petId);
                        const badge = getRegistrationBadgeStyle(animal?.registration_status);
                        return (
                          <View
                            key={petId}
                            className="flex-row items-center justify-between rounded-xl px-3 py-2.5 border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50"
                          >
                            <View className="flex-row items-center flex-1 pr-2">
                              <MaterialIcons name="pets" size={18} color="#64748b" />
                              <View className="ml-2 flex-1">
                                <ThemedText className="font-medium text-slate-800 dark:text-white">
                                  {newAppointment.petNames[index]}
                                </ThemedText>
                                {animal?.species_name ? (
                                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                                    {animal.species_name}
                                    {animal.breed_name ? ` (${animal.breed_name})` : ''}
                                  </ThemedText>
                                ) : null}
                              </View>
                            </View>
                            <View className={`px-2 py-0.5 rounded-full ${badge.container}`}>
                              <ThemedText className={`text-xs font-medium ${badge.text}`}>
                                {badge.label}
                              </ThemedText>
                            </View>
                          </View>
                        );
                      })}
                    </Animated.View>
                  ) : null}

                  {/* Animal Dropdown List */}
                  {showAnimalDropdown && (
                    <Animated.View
                      entering={FadeInDown.duration(220)}
                      exiting={FadeOut.duration(160)}
                      className="mt-2 bg-white dark:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden"
                    >
                      {animals.length === 0 ? (
                        <View className="px-4 py-3">
                          <ThemedText className="text-slate-500 dark:text-slate-400">No animals yet.</ThemedText>
                        </View>
                      ) : (
                        animals.map((animal: Animal) => {
                          const identification = getPetIdentificationDisplay(animal);
                          const isSelected = newAppointment.petIds.includes(animal.id);
                          return (
                          <TouchableOpacity
                            key={animal.id}
                            onPress={() => {
                              setNewAppointment((prev) => {
                                if (prev.petIds.includes(animal.id)) {
                                  const nextPairs = prev.petIds
                                    .map((id, index) => ({ id, name: prev.petNames[index] }))
                                    .filter((pair) => pair.id !== animal.id);
                                  setServicesByPetId((servicesPrev) => {
                                    const next = { ...servicesPrev };
                                    delete next[animal.id];
                                    return next;
                                  });
                                  setActiveServicePetId((current) => {
                                    if (current !== animal.id) return current;
                                    return nextPairs[0]?.id ?? null;
                                  });
                                  return {
                                    ...prev,
                                    petIds: nextPairs.map((pair) => pair.id),
                                    petNames: nextPairs.map((pair) => pair.name),
                                  };
                                }
                                setServicesByPetId((servicesPrev) => ({
                                  ...servicesPrev,
                                  [animal.id]: servicesPrev[animal.id] || [],
                                }));
                                setActiveServicePetId(animal.id);
                                return {
                                  ...prev,
                                  petIds: [...prev.petIds, animal.id],
                                  petNames: [...prev.petNames, animal.pet_name],
                                };
                              });
                            }}
                            className={`px-4 py-3 border-b border-slate-100 dark:border-slate-600 last:border-b-0 ${
                              isSelected ? 'bg-teal-50 dark:bg-teal-900/20' : ''
                            }`}
                          >
                            <View className="flex-row items-center flex-1">
                              <MaterialIcons
                                name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                                size={22}
                                color={isSelected ? '#1F7A8C' : '#64748b'}
                              />
                              <View className="ml-3 flex-1">
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-1">
                                    <ThemedText className={`font-medium ${
                                      isSelected ? 'text-teal dark:text-teal-300' : 'text-slate-800 dark:text-white'
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
                                        identification.tone === 'id' ? 'text-teal dark:text-teal-300' : 'text-slate-400'
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
                    </Animated.View>
                  )}
                </View>
                )}

                {currentStep === 2 && newAppointment.petIds.length > 0 && (
                  <View className="mb-4">
                    <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Configure Services
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                      Switch pets, then set services for each one.
                    </ThemedText>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row gap-2">
                        {newAppointment.petIds.map((petId, index) => {
                          const isActive = effectiveActivePetId === petId;
                          const petServices = servicesByPetId[petId] || [];
                          const hasServices = petServices.length > 0;
                          return (
                            <TouchableOpacity
                              key={petId}
                              onPress={() => setActiveServicePetId(petId)}
                              className={`rounded-full px-3 py-2 border ${
                                isActive
                                  ? 'bg-teal border-teal'
                                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600'
                              }`}
                            >
                              <View className="flex-row items-center gap-1.5">
                                {hasServices ? (
                                  <MaterialIcons
                                    name="check-circle"
                                    size={14}
                                    color={isActive ? '#ffffff' : '#1F7A8C'}
                                  />
                                ) : null}
                                <ThemedText className={`text-sm font-semibold ${
                                  isActive ? 'text-white' : 'text-slate-700 dark:text-slate-200'
                                }`}>
                                  {newAppointment.petNames[index]}
                                </ThemedText>
                                {hasServices ? (
                                  <View className={`rounded-full px-1.5 min-w-[18px] items-center ${
                                    isActive ? 'bg-white/25' : 'bg-blue-100 dark:bg-blue-900/30'
                                  }`}>
                                    <ThemedText className={`text-[10px] font-bold ${
                                      isActive ? 'text-white' : 'text-teal dark:text-teal-300'
                                    }`}>
                                      {petServices.length}
                                    </ThemedText>
                                  </View>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>

                    {effectiveActivePetId ? (
                      <View className="mt-4">
                        {!isDoorToDoorBooking && (
                          <>
                            {/* Treatment Selection */}
                            <View className="mb-4">
                              <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Treatment</ThemedText>

                              <TouchableOpacity
                                onPress={toggleTreatment}
                                className={`flex-row items-center p-3 rounded-xl border-2 ${
                                  treatmentSelected
                                    ? 'border-teal bg-teal-50 dark:bg-teal-900/20'
                                    : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                                }`}
                              >
                                <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                                  treatmentSelected ? 'bg-teal' : 'bg-slate-100 dark:bg-slate-700'
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
                                  treatmentSelected ? 'bg-teal border-teal' : 'border-slate-300 dark:border-slate-500'
                                }`}>
                                  {treatmentSelected && <MaterialIcons name="check" size={12} color="white" />}
                                </View>
                              </TouchableOpacity>
                            </View>

                            {treatmentSelected && (
                              <>
                                <View className="mb-4">
                                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Symptoms</ThemedText>
                                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">Choose at least one symptom.</ThemedText>
                                  <View className="gap-2">
                                    {complaintOptions.map((complaint) => {
                                      const selectedComplaint = selectedSymptoms.find(s => s.symptom_id === complaint.id);
                                      const isSelected = !!selectedComplaint;
                                      const daysCount = selectedComplaint?.days_count || 1;

                                      return (
                                        <View key={complaint.id} className={`rounded-xl border ${
                                          isSelected
                                            ? 'bg-teal-50 border-blue-500 dark:bg-teal-900/20 dark:border-blue-500'
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
                                              isSelected ? 'bg-teal border-teal' : 'border-slate-300 dark:border-slate-500'
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
                                        placeholder="Bite details"
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

                        <View className="mb-4">
                          <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Services
                          </ThemedText>
                          <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                            {isDoorToDoorBooking ? 'Choose a home visit service.' : 'Add the services this pet needs.'}
                          </ThemedText>

                          <View className="gap-2">
                            {visibleServiceOptions.map((service) => {
                              const isSelected = selectedServicesForActivePet.includes(service.id);
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
                                      ? 'border-teal bg-teal-50 dark:bg-teal-900/20'
                                      : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                                  }`}
                                >
                                  <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                                    isDisabled
                                      ? 'bg-slate-200 dark:bg-slate-700'
                                      : isSelected
                                      ? 'bg-teal'
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
                                      ? 'bg-teal border-teal'
                                      : 'border-slate-300 dark:border-slate-500'
                                  }`}>
                                    {isSelected && !isDisabled && <MaterialIcons name="check" size={12} color="white" />}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )}

                {everyPetHasServices && (
                  <View className="mb-4 rounded-xl p-3 border border-blue-200 dark:border-blue-800" style={{ backgroundColor: 'rgba(31, 122, 140, 0.08)' }}>
                    <ThemedText className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                      Total duration: {formatDuration(getBookingDurationMinutes())}
                    </ThemedText>
                    <ThemedText className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {newAppointment.petIds
                        .map((petId, index) => {
                          const names = (servicesByPetId[petId] || [])
                            .map((id) => allServiceOptions.find((s) => s.id === id)?.name)
                            .filter(Boolean)
                            .join(', ');
                          return names ? `${newAppointment.petNames[index]}: ${names}` : null;
                        })
                        .filter(Boolean)
                        .join(' · ')}
                    </ThemedText>
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => {
                    if (!newAppointment.petIds.length) {
                      Alert.alert('Required', 'Please select at least one pet.');
                      return;
                    }
                    if (currentStep === 1) {
                      setShowAnimalDropdown(false);
                      setCurrentStep(2);
                      return;
                    }
                    if (!everyPetHasServices) {
                      Alert.alert(
                        'Required',
                        'Please select at least one service for each pet.'
                      );
                      return;
                    }
                    if (anyPetNeedsTreatment && selectedSymptoms.length === 0) {
                      Alert.alert(
                        'Required',
                        'Please select at least one symptom, or deselect treatment to continue.'
                      );
                      return;
                    }
                    setCurrentStep(confirmStep);
                  }}
                  disabled={currentStep === 1 ? newAppointment.petIds.length === 0 : !canProceedFromStep1}
                  className={`py-4 rounded-xl items-center mt-2 mb-2 ${
                    ((currentStep === 1 && newAppointment.petIds.length > 0) || canProceedFromStep1)
                      ? 'bg-teal'
                      : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  style={
                    ((currentStep === 1 && newAppointment.petIds.length > 0) || canProceedFromStep1)
                      ? { shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }
                      : undefined
                  }
                >
                  <Text className={`font-semibold text-base ${
                    ((currentStep === 1 && newAppointment.petIds.length > 0) || canProceedFromStep1)
                      ? 'text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}>
                    Next
                  </Text>
                </TouchableOpacity>
                {currentStep === 2 && (
                  <TouchableOpacity
                    onPress={() => setCurrentStep(1)}
                    className="py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600 mb-2"
                  >
                    <Text className="text-slate-500 dark:text-slate-400 font-medium text-sm">← Back to Pets</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}

            {currentStep === confirmStep && (
              <ScrollView {...NO_BOUNCE_SCROLL} showsVerticalScrollIndicator={false} className="max-h-[62vh]">
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Selected pets & services
                  </ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Check each pet before you continue.
                  </ThemedText>

                  <View className="gap-3">
                    {newAppointment.petIds.map((petId, index) => {
                      const petServices = servicesByPetId[petId] || [];
                      const serviceNames = petServices
                        .map((id) => allServiceOptions.find((s) => s.id === id)?.name)
                        .filter(Boolean);
                      const animal = animals.find((a) => a.id === petId);
                      const badge = getRegistrationBadgeStyle(animal?.registration_status);

                      return (
                        <View
                          key={petId}
                          className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3"
                        >
                          <View className="flex-row items-center justify-between mb-2">
                            <View className="flex-row items-center flex-1 pr-2">
                              <MaterialIcons name="pets" size={18} color="#64748b" />
                              <ThemedText className="ml-2 font-semibold text-slate-800 dark:text-white">
                                {newAppointment.petNames[index]}
                              </ThemedText>
                            </View>
                            <View className={`px-2 py-0.5 rounded-full ${badge.container}`}>
                              <ThemedText className={`text-xs font-medium ${badge.text}`}>
                                {badge.label}
                              </ThemedText>
                            </View>
                          </View>
                          {serviceNames.length > 0 ? (
                            <View className="flex-row flex-wrap gap-1.5">
                              {serviceNames.map((name) => (
                                <View
                                  key={`${petId}-${name}`}
                                  className="flex-row items-center rounded-full px-2.5 py-1 bg-teal-50 dark:bg-teal-900/20 border border-blue-200 dark:border-blue-800"
                                >
                                  <MaterialIcons name="check-circle" size={12} color="#1F7A8C" />
                                  <ThemedText className="text-xs font-medium text-blue-700 dark:text-blue-400 ml-1">
                                    {name}
                                  </ThemedText>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <ThemedText className="text-xs text-amber-600 dark:text-amber-400">
                              No services selected
                            </ThemedText>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {everyPetHasServices && (
                    <View className="mt-4 rounded-xl p-3 border border-blue-200 dark:border-blue-800" style={{ backgroundColor: 'rgba(31, 122, 140, 0.08)' }}>
                      <ThemedText className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                        Total duration: {formatDuration(getBookingDurationMinutes())}
                      </ThemedText>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  onPress={() => {
                    if (!everyPetHasServices) {
                      Alert.alert(
                        'Required',
                        'Please select at least one service for each pet.'
                      );
                      return;
                    }
                    setCurrentStep(scheduleStep);
                  }}
                  disabled={!everyPetHasServices}
                  className={`py-4 rounded-xl items-center mt-2 mb-2 ${
                    everyPetHasServices ? 'bg-teal' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  style={everyPetHasServices ? { shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 } : undefined}
                >
                  <Text className={`font-semibold text-base ${everyPetHasServices ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                    Next
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCurrentStep(2)}
                  className="py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600 mb-2"
                >
                  <Text className="text-slate-500 dark:text-slate-400 font-medium text-sm">
                    ← Back to Services
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {currentStep === scheduleStep && (
              <ScrollView {...NO_BOUNCE_SCROLL} showsVerticalScrollIndicator={false} className="max-h-[62vh]">
                <View className={`mb-4 ${!everyPetHasServices ? 'opacity-40' : ''}`}>
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Date</ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">Pick an open day.</ThemedText>
                  {!everyPetHasServices && (
                    <ThemedText className="text-xs text-amber-600 dark:text-amber-400 mb-2">Select at least one service first</ThemedText>
                  )}

                  <BookingCalendar
                    currentMonth={currentMonth}
                    onMonthChange={handleMonthChange}
                    selectedDate={newAppointment.date}
                    unavailableDates={unavailableDates}
                    canSelect={everyPetHasServices}
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
                <View className={`mb-4 ${!everyPetHasServices ? 'opacity-40' : ''}`}>
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Time</ThemedText>
                  <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">Pick an open time.</ThemedText>

                  {!everyPetHasServices ? (
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
                                          ? 'bg-teal'
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
                          <View className="w-3 h-3 rounded bg-teal mr-1" />
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

                    setCurrentStep(isDoorToDoorBooking ? 5 : reviewStep);
                  }}
                  className="bg-teal py-4 rounded-xl items-center mt-2 mb-2"
                  style={{ shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }}
                >
                  <Text className="text-white font-semibold text-base">
                    {isDoorToDoorBooking ? 'Set Meeting Place' : 'Review Booking'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCurrentStep(confirmStep)}
                  className="py-3 rounded-xl items-center border border-slate-300 dark:border-slate-600 mb-2"
                >
                  <Text className="text-slate-500 dark:text-slate-400 font-medium text-sm">← Back to Confirm</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {isDoorToDoorBooking && currentStep === 5 && (
              <ScrollView
                {...NO_BOUNCE_SCROLL}
                showsVerticalScrollIndicator={false}
                className="max-h-[62vh]"
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <View className="mb-4">
                  <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Meeting place
                  </Text>
                  <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Pin where the vet should meet you, inside El Salvador City.
                  </Text>
                </View>

                <MeetingPlaceLocationPicker
                  coordinate={meetingCoordinate}
                  onCoordinateChange={setMeetingCoordinate}
                  height={240}
                />

                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mt-4 mb-1">
                  Landmark photo
                </ThemedText>
                <ThemedText className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                  Add a photo of your gate or house.
                </ThemedText>
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
                    setCurrentStep(reviewStep);
                  }}
                  className="bg-teal py-4 rounded-xl items-center mt-4 mb-2"
                  style={{ shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }}
                >
                  <Text className="text-white font-semibold text-base">Review Booking</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCurrentStep(scheduleStep)}
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
                  <Text className="text-xs font-semibold uppercase text-teal dark:text-teal-300 mb-2">Booking Summary</Text>
                  <View className="flex-row items-center mb-1">
                    <MaterialIcons name="pets" size={16} color="#1F7A8C" />
                    <Text className="text-sm text-slate-700 dark:text-slate-200 ml-2">
                      {newAppointment.petNames.length > 0
                        ? newAppointment.petNames.join(', ')
                        : 'No pets selected'}
                    </Text>
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

                {/* Selected services per animal */}
                <View className="mb-4">
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Selected Services</ThemedText>
                  <View className="gap-2">
                    {newAppointment.petIds.map((petId, index) => {
                      const petServiceIds = servicesByPetId[petId] || [];
                      return (
                        <View key={petId} className="rounded-xl border border-blue-200 dark:border-blue-800 bg-teal-50 dark:bg-teal-900/20 px-4 py-3">
                          <ThemedText className="font-semibold text-slate-800 dark:text-white mb-1">
                            {newAppointment.petNames[index]}
                          </ThemedText>
                          {petServiceIds.length === 0 ? (
                            <ThemedText className="text-sm text-slate-500">No services selected</ThemedText>
                          ) : (
                            petServiceIds.map((serviceId) => {
                              const service = allServiceOptions.find((s) => s.id === serviceId);
                              if (!service) return null;
                              return (
                                <View key={`${petId}-${serviceId}`} className="flex-row items-center justify-between mt-1">
                                  <View className="flex-row items-center">
                                    <MaterialIcons name={service.icon as any} size={18} color="#1F7A8C" />
                                    <ThemedText className="ml-2 text-sm text-slate-700 dark:text-slate-200">{service.name}</ThemedText>
                                  </View>
                                  <ThemedText className="text-xs text-teal dark:text-teal-300 font-medium">
                                    {formatDuration(service.duration)}
                                  </ThemedText>
                                </View>
                              );
                            })
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>

                {anyPetNeedsTreatment && selectedSymptoms.length > 0 && (
                  <View className="mb-4">
                    <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Treatment</ThemedText>
                    <View className="flex-row flex-wrap">
                      {selectedSymptoms.map((symptom, idx) => {
                        const complaint = complaintOptions.find((c) => c.id === symptom.symptom_id);
                        return (
                          <View key={idx} className="bg-teal-50 dark:bg-teal-900/20 px-3 py-1 rounded-lg mr-2 mb-2">
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
                  <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Notes</ThemedText>
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
                      setCurrentStep(scheduleStep);
                      return;
                    }

                    bookAppointment();
                  }}
                  disabled={!everyPetHasServices || bookingSubmitting}
                  className={`py-4 rounded-xl items-center mb-3 ${
                    everyPetHasServices && !bookingSubmitting ? 'bg-teal' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  style={everyPetHasServices && !bookingSubmitting ? { shadowColor: '#1F7A8C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 } : undefined}
                >
                  {bookingSubmitting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                  <Text className={`font-semibold text-base ${everyPetHasServices ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>
                    {everyPetHasServices ? 'Complete Booking' : 'Select Services First'}
                  </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCurrentStep(isDoorToDoorBooking ? 5 : scheduleStep)}
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
          )}
        </View>
      </Modal>

      {/* Symptom Selection Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSymptomModal}
        onRequestClose={() => setShowSymptomModal(false)}
      >
        <View className="flex-1 bg-black/50 justify-end" style={{ paddingBottom: layout.bottomInset }}>
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
                    className={`border-b border-slate-100 dark:border-slate-700 ${isSelected ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}
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
              className="bg-teal py-4 rounded-xl items-center mt-4"
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
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.55)', paddingBottom: layout.bottomInset }}>
          <View
            className="overflow-hidden rounded-t-3xl bg-white dark:bg-slate-800"
            style={{ height: layout.sheetMaxHeight }}
          >
            {selectedAppointment && (() => {
              const detailStatusStyle = getStatusStyle(selectedAppointment.status);
              const bookedPets = getBookedPets(selectedAppointment);
              const isMultiPet = bookedPets.length > 1;
              const formattedDate = formatAppointmentDateLabel(selectedAppointment.date, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              });
              const timeLabel = formatAppointmentTimeLabel(selectedAppointment.time);

              return (
                <>
                  <View className="border-b border-slate-100 bg-white px-6 pb-5 pt-6">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 pr-4">
                        <Text className="text-xl font-bold text-navy">
                          {isMultiPet ? 'Appointment Details' : bookedPets[0]?.pet_name || selectedAppointment.petName}
                        </Text>
                        <Text className="mt-1 text-sm text-muted">
                          {timeLabel ? `${formattedDate} • ${timeLabel}` : formattedDate}
                        </Text>
                        {isMultiPet ? (
                          <Text className="mt-1 text-xs text-slate-500">
                            {bookedPets.length} pets · {bookedPets.map((pet) => pet.pet_name).join(', ')}
                          </Text>
                        ) : null}
                        <View className="flex-row flex-wrap items-center gap-2 mt-3">
                          <View
                            className={`self-start rounded-full px-2.5 py-1 flex-row items-center ${detailStatusStyle.badgeBg}`}
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
                          {selectedAppointment.status_summary ? (
                            <View className="rounded-full bg-slate-100 px-2.5 py-1">
                              <Text className="text-[11px] font-semibold text-slate-600">
                                {selectedAppointment.status_summary}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={() => setDetailModalVisible(false)}
                        className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                      >
                        <MaterialIcons name="close" size={22} color="#16324F" />
                      </TouchableOpacity>
                    </View>

                    {(canEditAppointmentServices(selectedAppointment.status) ||
                      canCancelAppointment(selectedAppointment.status)) && (
                      <View className="mt-4 gap-2">
                        {canEditAppointmentServices(selectedAppointment.status) && (
                          <TouchableOpacity
                            onPress={() => openEditServicesModal(selectedAppointment)}
                            className="bg-amber-500 py-3.5 rounded-xl items-center flex-row justify-center"
                          >
                            <MaterialIcons name="edit" size={18} color="#ffffff" />
                            <Text className="text-white font-semibold text-base ml-2">
                              {selectedAppointment.isDoorToDoor ? 'Edit Home Service' : 'Edit Appointment'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {canCancelAppointment(selectedAppointment.status) && (
                          <TouchableOpacity
                            onPress={() => cancelAppointment(selectedAppointment.id)}
                            className="flex-row items-center justify-center rounded-xl border border-red-200 bg-red-50 py-3.5"
                          >
                            <MaterialIcons name="close" size={18} color="#dc2626" />
                            <Text className="ml-2 text-base font-semibold text-red-600">
                              {selectedAppointment.isDoorToDoor ? 'Cancel Home Service' : 'Cancel Appointment'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>

                  <ScrollView
                    className="flex-1 px-6"
                    contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
                    showsVerticalScrollIndicator={false}
                    {...NO_BOUNCE_SCROLL}
                  >
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
                    <DetailRow
                      label="Visit type"
                      value={
                        selectedAppointment.bookingTypeLabel ||
                        getOwnerBookingTypeLabel(selectedAppointment)
                      }
                    />
                    <DetailRow label="Date" value={formattedDate} />
                    {timeLabel ? <DetailRow label="Time" value={timeLabel} /> : null}
                    <DetailRow label="Overall status" value={detailStatusStyle.label} />

                    <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 mt-2">
                      Booked Pets
                    </Text>
                    <View className="mb-4 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/20 px-3">
                      {bookedPets.map((pet) => (
                        <BookedPetSummaryRow key={`detail-${selectedAppointment.id}-pet-${pet.id}`} pet={pet} />
                      ))}
                    </View>

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
                            showRouteLine
                            markerTitle="Meeting place"
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
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
          <View className="w-full max-w-sm overflow-hidden rounded-3xl bg-white dark:bg-slate-800 max-h-[88%]">
            <View className="border-b border-slate-100 bg-white px-6 pb-4 pt-5">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-4">
                  <Text className="text-xl font-bold text-navy">
                    {editingAppointment?.isDoorToDoor ? 'Edit Home Service' : 'Edit Appointment'}
                  </Text>
                  <Text className="mt-1 text-sm text-muted">
                    {editingAppointment?.isDoorToDoor
                      ? 'Pending approval — you can change services, schedule, and landmark photo'
                      : 'Pending approval — you can change services, date, and time'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={closeEditServicesModal}
                  disabled={editSubmitting}
                  className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                >
                  <MaterialIcons name="close" size={22} color="#16324F" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView {...NO_BOUNCE_SCROLL} className="max-h-[62vh] px-6 pt-4 pb-6" showsVerticalScrollIndicator={false}>
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
                      ? 'border-teal bg-teal-50 dark:bg-teal-900/20'
                      : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                  }`}
                >
                  <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                    editSelectedServices.includes('treatment') ? 'bg-teal' : 'bg-slate-100 dark:bg-slate-700'
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
                    editSelectedServices.includes('treatment') ? 'bg-teal border-teal' : 'border-slate-300 dark:border-slate-500'
                  }`}>
                    {editSelectedServices.includes('treatment') && <MaterialIcons name="check" size={12} color="white" />}
                  </View>
                </TouchableOpacity>
              </View>
              )}

              {!editingAppointment?.isDoorToDoor && editSelectedServices.includes('treatment') && (
                <>
                  <View className="mb-4">
                    <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Symptoms</ThemedText>
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
                                ? 'bg-teal-50 border-blue-500 dark:bg-teal-900/20 dark:border-blue-500'
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
                                isSelected ? 'bg-teal border-teal' : 'border-slate-300 dark:border-slate-500'
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
                          placeholder="Bite details"
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
                  Services
                </ThemedText>
                <View className="gap-2">
                  {editServiceOptions.map((service) => {
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
                            ? 'border-teal bg-teal-50 dark:bg-teal-900/20'
                            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800'
                        }`}
                      >
                        <View className={`w-10 h-10 rounded-xl items-center justify-center ${
                          isDisabled
                            ? 'bg-slate-200 dark:bg-slate-700'
                            : isSelected
                            ? 'bg-teal'
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
                            ? 'bg-teal border-teal'
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
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Date</ThemedText>
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
                <ThemedText className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Time</ThemedText>

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
                                        ? 'bg-teal'
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
                className="bg-teal py-4 rounded-xl items-center"
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
