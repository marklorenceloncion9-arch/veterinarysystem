import type { VetBookingDetail } from '@/components/fieldman/VetBookingDetailModal';
import type { WalkInResumeBooking } from '@/components/fieldman/WalkInFormModal';
import { reverseGeocodeMeetingPlace } from '@/utils/mapbox';

export const SERVICE_DURATIONS: Record<string, number> = {
  'vitamin supplement': 10,
  vitamin: 10,
  vaccination: 10,
  deworming: 10,
  treatment: 10,
  castration: 40,
  spay: 60,
};

// Diri kuhaon ang gidugayon base sa ngalan sa serbisyo.
export function getDurationForServiceName(typeName?: string | null) {
  const key = (typeName || '').toLowerCase().trim();
  if (!key) return 10;
  const entries = Object.entries(SERVICE_DURATIONS).sort(([a], [b]) => b.length - a.length);
  for (const [name, minutes] of entries) {
    if (key === name || key.includes(name)) return minutes;
  }
  return 10;
}

// Diri kuhaon ang mga pet ug ilang serbisyo sa booking.
export function getBookingPetsWithServices(booking: VetBookingDetail) {
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
export function getBookingDuration(booking: VetBookingDetail) {
  const names = Array.from(
    new Set(getBookingPetsWithServices(booking).flatMap((pet) => pet.services).filter(Boolean))
  );
  const fromNames = names.reduce((sum, name) => sum + getDurationForServiceName(name), 0);
  if (fromNames > 0) return fromNames;
  if (booking.duration_minutes && booking.duration_minutes > 0) return booking.duration_minutes;
  return 10;
}

// Diri i-format ang gidugayon sa minutos o oras.
export function formatDuration(minutes: number) {
  const value = minutes > 0 ? minutes : 10;
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return mins > 0 ? `${hours} hr ${mins} min` : `${hours} hr`;
}

// Diri himuon ang range sa oras sugod hangtod human.
export function formatTimeRange(time: string, durationMinutes: number) {
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

// Diri limpyohan ang booking data para sa fieldman.
export function normalizeFieldmanBooking<T extends VetBookingDetail>(booking: T): T {
  const bookedPets = getBookingPetsWithServices(booking);
  const services = Array.from(new Set(bookedPets.flatMap((pet) => pet.services).filter(Boolean)));
  const pets = bookedPets.map((pet) => {
    const existing = booking.pets?.find((item) => item.id === pet.id);
    return {
      ...(existing ?? booking.pet),
      id: pet.id,
      name: pet.name,
      pet_name: pet.name,
      services: pet.services,
    };
  });

  return {
    ...booking,
    pets,
    services,
    service: services[0] || booking.service,
  };
}

// Diri susihon kung tinuod nga label ang meeting place.
export function isMeaningfulMeetingPlaceLabel(label?: string | null) {
  const value = String(label || '').trim();
  if (!value) return false;
  return value.toUpperCase() !== 'MEETING PLACE';
}

// Diri himuon ang barangay ug zone sa tag-iya.
export function getOwnerLocationLine(booking: VetBookingDetail) {
  return [booking.user?.barangay, booking.user?.zone].filter(Boolean).join(' · ');
}

// Diri pangitaon ang label sa meeting place.
export async function resolveMeetingPlaceLabel(booking: VetBookingDetail): Promise<string | null> {
  if (isMeaningfulMeetingPlaceLabel(booking.meeting_place_label)) {
    return String(booking.meeting_place_label).trim();
  }

  const latitude = Number(booking.meeting_latitude);
  const longitude = Number(booking.meeting_longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (latitude === 0 && longitude === 0)) {
    return null;
  }

  return reverseGeocodeMeetingPlace(latitude, longitude);
}

// Diri butangan og meeting place label ang tanan booking.
export async function withResolvedMeetingPlaceLabels<T extends VetBookingDetail>(bookings: T[]): Promise<T[]> {
  return Promise.all(
    bookings.map(async (booking) => {
      if (booking.booking_type !== 'home_service') return booking;
      const label = await resolveMeetingPlaceLabel(booking);
      if (!label) return booking;
      return { ...booking, meeting_place_label: label };
    })
  );
}

// Diri i-convert ang booking para mapadayon.
export function toResumeBooking(
  booking: VetBookingDetail,
  kind: WalkInResumeBooking['kind'] = 'walk_in'
): WalkInResumeBooking {
  const normalized = normalizeFieldmanBooking(booking);
  const primaryPet = getBookingPetsWithServices(normalized)[0];

  return {
    id: normalized.id,
    kind,
    user: {
      id: normalized.user.id,
      name: normalized.user.name,
      email: normalized.user.email,
      phone_number: normalized.user.phone_number,
      barangay: normalized.user.barangay,
      zone: normalized.user.zone,
    },
    animalId: primaryPet?.id ?? normalized.pet.id,
    services: normalized.services?.length ? normalized.services : [normalized.service],
    date: normalized.date,
    time: normalized.time,
    notes: normalized.notes,
    administered_by: normalized.administered_by,
    petWeight: normalized.pet.weight,
    complaint: normalized.complaint,
  };
}
