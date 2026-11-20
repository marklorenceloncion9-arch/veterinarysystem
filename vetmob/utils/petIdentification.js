// Diri kuhaon ang ID sa pet nga ipakita.
export function getPetIdentificationDisplay(animal) {
  if (!animal) return null;

  if (animal.identification_number) {
    return { text: animal.identification_number, tone: 'id' };
  }

  if (animal.registration_status === 'exempt') {
    return { text: 'No ID needed', tone: 'muted' };
  }

  return null;
}
