// Diri i-parse ang timestamp ngadto sa milliseconds.
export function parseAdminTimestamp(value) {
    if (!value) return Number.NaN;

    const normalized = String(value).includes('T')
        ? String(value)
        : String(value).replace(' ', 'T');
    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
}

// Diri pilion ang timestamp nga gamiton sa pag-sort sa appointment.
export function getAdminAppointmentSortTimestamp(appointment, options = {}) {
    const preferUpdatedAt = options.preferUpdatedAt ?? false;
    const updatedAt = parseAdminTimestamp(appointment?.updated_at);
    const createdAt = parseAdminTimestamp(appointment?.created_at);

    const bookingDate = appointment?.date || appointment?.appointment_date || '';
    const bookingTime = appointment?.time || appointment?.appointment_time || '00:00';
    const bookingTimestamp = parseAdminTimestamp(
        bookingDate ? `${bookingDate}T${String(bookingTime).slice(0, 5)}` : ''
    );

    if (preferUpdatedAt && Number.isFinite(updatedAt)) return updatedAt;
    if (Number.isFinite(createdAt)) return createdAt;
    if (Number.isFinite(bookingTimestamp)) return bookingTimestamp;

    return Number(appointment?.id) || 0;
}

// Diri i-sort ang appointments nga bag-o ang una.
export function sortAdminAppointmentsNewestFirst(appointments, options = {}) {
    return [...(appointments || [])].sort((left, right) => {
        const rightTimestamp = getAdminAppointmentSortTimestamp(right, options);
        const leftTimestamp = getAdminAppointmentSortTimestamp(left, options);
        if (rightTimestamp !== leftTimestamp) return rightTimestamp - leftTimestamp;

        return Number(right.id) - Number(left.id);
    });
}

// Diri i-convert ang booking time ngadto sa minutes.
export function parseBookingTimeMinutes(time) {
    if (!time) return 24 * 60;

    const [hours, minutes] = String(time).slice(0, 5).split(':').map(Number);
    if (!Number.isFinite(hours)) return 24 * 60;

    return (hours * 60) + (Number.isFinite(minutes) ? minutes : 0);
}

// Diri i-format ang oras nga AM/PM label.
export function formatHourLabel(time) {
    if (!time) return 'No time set';

    const hours = Number(String(time).slice(0, 2));
    if (!Number.isFinite(hours)) return 'No time set';

    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hour12}:00 ${suffix}`;
}

// Diri i-sort ang appointments sumala sa petsa ug oras.
export function sortAdminAppointmentsByHour(appointments) {
    return [...(appointments || [])].sort((left, right) => {
        const dateCompare = String(left?.date || '').localeCompare(String(right?.date || ''));
        if (dateCompare !== 0) return dateCompare;

        const timeCompare = parseBookingTimeMinutes(left?.time) - parseBookingTimeMinutes(right?.time);
        if (timeCompare !== 0) return timeCompare;

        return Number(left?.id) - Number(right?.id);
    });
}

// Diri i-grupo ang appointments matag oras.
export function groupAdminAppointmentsByHour(appointments) {
    const groups = [];
    const grouped = new Map();

    sortAdminAppointmentsByHour(appointments).forEach((appointment) => {
        const hourKey = appointment?.time ? String(appointment.time).slice(0, 2) : 'none';
        if (!grouped.has(hourKey)) {
            const group = {
                hour: hourKey,
                label: hourKey === 'none' ? 'No time set' : formatHourLabel(`${hourKey}:00`),
                items: [],
            };
            grouped.set(hourKey, group);
            groups.push(group);
        }
        grouped.get(hourKey).items.push(appointment);
    });

    return groups;
}
