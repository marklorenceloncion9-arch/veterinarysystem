// Diri himuon ang JSON data para sa QR sa hayop.
export function buildAnimalQrPayload(animal, ownerId) {
    if (!animal?.id) return '';

    return JSON.stringify({
        app: 'pet-harmony',
        type: 'animal',
        id: animal.id,
        identification_number: animal.identification_number || null,
        name: animal.pet_name || '',
        owner_id: ownerId ?? animal.user_id ?? null,
        species: animal.species?.species_name || animal.species_name || '',
        breed: animal.breed?.breed_name || animal.breed_name || '',
        registration: animal.registration_status || '',
    });
}
