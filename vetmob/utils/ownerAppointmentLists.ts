export type OwnerBookingType = 'walk_in' | 'appointment' | 'home_service';

export type OwnerAppointmentListItem = {
  id: number;
  date: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  bookingType?: OwnerBookingType;
  isDoorToDoor?: boolean;
};

// Diri i-convert ang petsa ngadto sa timestamp.
function parseTimestamp(value?: string): number {
  if (!value) return Number.NaN;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// Diri kuhaon ang timestamp para sa pag-sort.
function getNewestSortTimestamp(
  appointment: OwnerAppointmentListItem,
  preferUpdatedAt = false
): number {
  const updatedAt = parseTimestamp(appointment.updated_at);
  const createdAt = parseTimestamp(appointment.created_at);
  const bookingDate = parseTimestamp(`${appointment.date}T00:00:00`);

  if (preferUpdatedAt && Number.isFinite(updatedAt)) return updatedAt;
  if (Number.isFinite(createdAt)) return createdAt;
  if (Number.isFinite(bookingDate)) return bookingDate;
  return appointment.id;
}

// Diri susihon kung walk-in ang booking.
export function isWalkInBooking(appointment: OwnerAppointmentListItem): boolean {
  return appointment.bookingType === 'walk_in';
}

// Diri ihan-ay ang appointment, pinakabag-o una.
export function sortAppointmentsNewestFirst<T extends OwnerAppointmentListItem>(
  items: T[],
  options?: { preferUpdatedAt?: boolean }
): T[] {
  const preferUpdatedAt = options?.preferUpdatedAt ?? false;

  return [...items].sort((left, right) => {
    const rightTimestamp = getNewestSortTimestamp(right, preferUpdatedAt);
    const leftTimestamp = getNewestSortTimestamp(left, preferUpdatedAt);
    if (rightTimestamp !== leftTimestamp) return rightTimestamp - leftTimestamp;

    const dateCompare = right.date.localeCompare(left.date);
    if (dateCompare !== 0) return dateCompare;

    return right.id - left.id;
  });
}

// Diri susihon kung home service ang booking.
export function isHomeServiceBooking(appointment: OwnerAppointmentListItem): boolean {
  return Boolean(appointment.isDoorToDoor || appointment.bookingType === 'home_service');
}

// Diri kuhaon ang aktibo nga appointment sa owner.
export function getActiveOwnerAppointments<T extends OwnerAppointmentListItem>(appointments: T[]): T[] {
  return sortAppointmentsNewestFirst(
    appointments.filter((appointment) => {
      if (!['pending', 'approved', 'processing', 'ongoing'].includes(appointment.status)) {
        return false;
      }

      return true;
    })
  );
}

// Diri kuhaon ang history sa appointment base sa filter.
export function getHistoryOwnerAppointments<T extends OwnerAppointmentListItem>(
  appointments: T[],
  historyFilter: 'all' | 'completed' | 'cancelled'
): T[] {
  let items = appointments.filter((appointment) =>
    ['completed', 'cancelled'].includes(appointment.status)
  );

  if (historyFilter === 'completed') {
    items = items.filter((appointment) => appointment.status === 'completed');
  } else if (historyFilter === 'cancelled') {
    items = items.filter((appointment) => appointment.status === 'cancelled');
  }

  return sortAppointmentsNewestFirst(items, { preferUpdatedAt: true });
}

// Diri kuhaon ang label sa klase sa booking.
export function getOwnerBookingTypeLabel(appointment: OwnerAppointmentListItem): string {
  if (appointment.isDoorToDoor || appointment.bookingType === 'home_service') {
    return 'Home Service';
  }
  if (isWalkInBooking(appointment)) {
    return 'Walk-in';
  }
  return 'Clinical Appointment';
}

// Diri kuhaon ang badge sa klase sa booking.
export function getOwnerBookingTypeBadge(appointment: OwnerAppointmentListItem): {
  label: string;
  icon: 'home' | 'directions-walk' | 'local-hospital';
  containerClass: string;
  textClass: string;
  iconColor: string;
} {
  if (appointment.isDoorToDoor || appointment.bookingType === 'home_service') {
    return {
      label: 'Home Service',
      icon: 'home',
      containerClass: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
      textClass: 'text-emerald-700 dark:text-emerald-300',
      iconColor: '#059669',
    };
  }

  if (isWalkInBooking(appointment)) {
    return {
      label: 'Walk-in',
      icon: 'directions-walk',
      containerClass: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
      textClass: 'text-amber-700 dark:text-amber-300',
      iconColor: '#d97706',
    };
  }

  return {
    label: 'Clinical Appointment',
    icon: 'local-hospital',
    containerClass: 'bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800',
    textClass: 'text-violet-700 dark:text-violet-300',
    iconColor: '#7c3aed',
  };
}
