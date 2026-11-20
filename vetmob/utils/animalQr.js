// Diri basahon ang data gikan sa QR sa hayop.
export function parseAnimalQrPayload(raw) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(String(raw).trim());
    if (parsed?.app === 'pet-harmony' && parsed?.type === 'animal' && parsed?.id) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

// Diri buhaton ang data nga ibutang sa QR sa hayop.
export function buildAnimalQrPayload(animal, ownerId) {
  if (!animal?.id) return '';

  const species = typeof animal.species === 'string'
    ? animal.species
    : animal.species?.species_name || animal.species?.name || animal.species_name || '';
  const breed = typeof animal.breed === 'string'
    ? animal.breed
    : animal.breed?.breed_name || animal.breed?.name || animal.breed_name || '';

  return JSON.stringify({
    app: 'pet-harmony',
    type: 'animal',
    id: animal.id,
    identification_number: animal.identification_number || null,
    name: animal.pet_name || '',
    owner_id: ownerId ?? animal.user_id ?? null,
    species,
    breed,
    registration: animal.registration_status || '',
  });
}
