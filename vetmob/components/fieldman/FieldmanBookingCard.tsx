import { View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { VetBookingDetail } from '@/components/fieldman/VetBookingDetailModal';
import { getStatusIcon, getStatusStyle } from '@/utils/bookingStatus';
import {
  formatTimeRange,
  getBookingDuration,
  getBookingPetsWithServices,
} from '@/components/fieldman/fieldmanBookingUtils';

// Diri kuhaon ang label ug icon sa klase sa booking.
function getTypeMeta(booking: VetBookingDetail) {
  if (booking.booking_type === 'home_service') {
    return {
      label: 'Home Service',
      icon: 'home' as const,
      textClass: 'text-teal-700 dark:text-teal-200',
      iconColor: '#1F7A8C',
      tint: '#EEF6F8',
    };
  }

  if (booking.booking_type === 'walk_in') {
    return {
      label: 'Walk-in',
      icon: 'directions-walk' as const,
      textClass: 'text-amber-700 dark:text-amber-300',
      iconColor: '#d97706',
      tint: '#FEF3C7',
    };
  }

  return {
    label: 'Clinical',
    icon: 'local-hospital' as const,
    textClass: 'text-violet-700 dark:text-violet-300',
    iconColor: '#7c3aed',
    tint: '#EDE9FE',
  };
}

// Diri ang card sa booking para sa fieldman.
export default function FieldmanBookingCard({
  booking,
  onPress,
  flush = false,
}: {
  booking: VetBookingDetail;
  onPress: () => void;
  flush?: boolean;
}) {
  const statusStyle = getStatusStyle(booking.display_status || booking.status);
  const duration = getBookingDuration(booking);
  const typeMeta = getTypeMeta(booking);
  const bookedPets = getBookingPetsWithServices(booking);
  const petLabel = bookedPets.length > 1
    ? bookedPets.map((pet) => pet.name).join(', ')
    : bookedPets[0]?.name || 'Animal';
  const serviceLine = bookedPets
    .flatMap((pet) => pet.services)
    .filter(Boolean)
    .join(' · ');
  const when = [booking.date_formatted, formatTimeRange(booking.time, duration)].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`bg-white dark:bg-slate-800 rounded-3xl px-4 py-3.5 border border-slate-100 dark:border-slate-700 ${flush ? '' : 'mb-2.5'}`}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="w-11 h-11 rounded-2xl items-center justify-center"
          style={{ backgroundColor: typeMeta.tint }}
        >
          <MaterialIcons name={typeMeta.icon} size={20} color={typeMeta.iconColor} />
        </View>

        <View className="flex-1">
          <Text className="text-[15px] font-bold text-slate-800 dark:text-white" numberOfLines={1}>
            {petLabel}
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5" numberOfLines={1}>
            {[booking.booking_type_label || typeMeta.label, booking.user.name].filter(Boolean).join(' · ')}
          </Text>
        </View>

        <View className={`rounded-full px-2.5 py-1 flex-row items-center ${statusStyle.badgeBg}`}>
          <MaterialIcons name={getStatusIcon(booking.display_status || booking.status)} size={11} color={statusStyle.icon} />
          <Text className={`text-[10px] font-bold ml-1 ${statusStyle.badgeText}`}>{statusStyle.label}</Text>
        </View>
      </View>

      {serviceLine ? (
        <Text className="mt-2.5 text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
          {serviceLine}
        </Text>
      ) : null}

      {when ? (
        <View className="flex-row items-center justify-between mt-2 pt-2.5 border-t border-slate-100 dark:border-slate-700">
          <Text className="flex-1 text-[11px] font-medium text-slate-400" numberOfLines={1}>
            {when}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color="#94a3b8" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
