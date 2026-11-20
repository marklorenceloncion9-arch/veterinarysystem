export interface BookedPetDisplay {
  id: number;
  pet_name: string;
  species_name?: string | null;
  breed_name?: string | null;
  registration_status?: string | null;
  services: string[];
  status: string;
  cancellation_reason?: string | null;
}

export interface AppointmentDisplayLike {
  id?: number;
  petName?: string;
  petNames?: string[];
  pets?: { id: number; pet_name: string }[];
  bookedPets?: BookedPetDisplay[];
  service?: string;
  services?: string[];
  status?: string;
}

// Diri tigumon ang ngalan sa serbisyo sa appointment.
export function collectAppointmentServiceNames(appointment: AppointmentDisplayLike): string[] {
  const fromBookedPets = (appointment.bookedPets || []).flatMap((pet) => pet.services || []);
  const fromServices = appointment.services?.length ? appointment.services : [];
  const fromSingle = appointment.service ? [appointment.service] : [];

  return Array.from(new Set([...fromBookedPets, ...fromServices, ...fromSingle].filter(Boolean)));
}

// Diri kuhaon ang mga pet nga ipakita sa appointment.
export function getBookedPetsForDisplay(appointment: AppointmentDisplayLike): BookedPetDisplay[] {
  if (appointment.bookedPets?.length) {
    return appointment.bookedPets.map((pet) => ({
      ...pet,
      services: pet.services?.length ? pet.services : collectAppointmentServiceNames(appointment),
    }));
  }

  const allServices = collectAppointmentServiceNames(appointment);
  const fallbackName = appointment.petNames?.length
    ? appointment.petNames.join(', ')
    : (appointment.petName || 'Unknown');

  if (appointment.petNames && appointment.petNames.length > 1) {
    return appointment.petNames.map((name, index) => ({
      id: appointment.pets?.[index]?.id ?? index,
      pet_name: name,
      services: allServices,
      status: appointment.status || 'pending',
    }));
  }

  return [{
    id: appointment.pets?.[0]?.id ?? 0,
    pet_name: fallbackName,
    services: allServices,
    status: appointment.status || 'pending',
  }];
}

const PLACEHOLDER_TIME = /^(0?0:00(?::00)?(?:\.0+)?|12:00(?::00)?\s*AM)$/i;

// Diri i-format ang oras sa appointment.
export function formatAppointmentTimeLabel(time?: string | null): string {
  if (!time) return '';
  const raw = String(time).trim();
  if (!raw || PLACEHOLDER_TIME.test(raw)) return '';

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = twelveHour[2];
    const period = twelveHour[3].toUpperCase();
    if (hour === 12 && minute === '00' && period === 'AM') return '';
    return `${hour}:${minute} ${period}`;
  }

  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/);
  if (twentyFour) {
    const hours = Number(twentyFour[1]);
    const minutes = Number(twentyFour[2]);
    if (hours === 0 && minutes === 0) return '';
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  return raw;
}

// Diri limpyohan ang appointment data para ipakita.
export function normalizeAppointment<T extends AppointmentDisplayLike>(appointment: T): T {
  const bookedPets = getBookedPetsForDisplay(appointment);
  const services = collectAppointmentServiceNames({
    ...appointment,
    bookedPets,
  });

  return {
    ...appointment,
    bookedPets,
    services,
    service: services[0] || appointment.service,
  };
}
