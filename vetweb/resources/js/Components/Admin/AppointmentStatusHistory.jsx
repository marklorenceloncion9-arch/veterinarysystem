const STATUS_STYLES = {
    pending: {
        dot: 'bg-amber-500',
        ring: 'ring-amber-100',
        card: 'border-amber-100 bg-amber-50/40',
        badge: 'bg-amber-100 text-amber-800',
    },
    approved: {
        dot: 'bg-blue-500',
        ring: 'ring-blue-100',
        card: 'border-blue-100 bg-blue-50/40',
        badge: 'bg-blue-100 text-blue-800',
    },
    processing: {
        dot: 'bg-violet-500',
        ring: 'ring-violet-100',
        card: 'border-violet-100 bg-violet-50/40',
        badge: 'bg-violet-100 text-violet-800',
    },
    ongoing: {
        dot: 'bg-indigo-500',
        ring: 'ring-indigo-100',
        card: 'border-indigo-100 bg-indigo-50/40',
        badge: 'bg-indigo-100 text-indigo-800',
    },
    completed: {
        dot: 'bg-emerald-500',
        ring: 'ring-emerald-100',
        card: 'border-emerald-100 bg-emerald-50/40',
        badge: 'bg-emerald-100 text-emerald-800',
    },
    cancelled: {
        dot: 'bg-red-500',
        ring: 'ring-red-100',
        card: 'border-red-100 bg-red-50/40',
        badge: 'bg-red-100 text-red-800',
    },
    rejected: {
        dot: 'bg-red-500',
        ring: 'ring-red-100',
        card: 'border-red-100 bg-red-50/40',
        badge: 'bg-red-100 text-red-800',
    },
};

// Diri ipakita ang history sa status sa appointment.
export default function AppointmentStatusHistory({ history = [], className = '' }) {
    if (!history || history.length === 0) {
        return null;
    }

    return (
        <div className={className}>
            <div className="space-y-3">
                {history.map((entry, index) => {
                    const styles = STATUS_STYLES[entry.status] || STATUS_STYLES.pending;
                    const actionLabel = entry.action_label
                        || `${entry.status_label} by ${entry.changed_by}`;
                    const animalNames = Array.isArray(entry.animal_names) ? entry.animal_names : [];
                    const services = Array.isArray(entry.services) ? entry.services : [];
                    const actionLabelLower = actionLabel.toLowerCase();
                    const animalAlreadyInLabel = animalNames.length > 0
                        && animalNames.every((name) => actionLabelLower.includes(String(name).toLowerCase()));
                    const showAnimalLine = animalNames.length > 0 && !animalAlreadyInLabel;
                    const showServices = services.length > 0 && !animalAlreadyInLabel;

                    return (
                        <div
                            key={`${entry.status}-${entry.changed_at}-${index}`}
                            className={`rounded-xl border px-4 py-3.5 ${styles.card}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-white ${styles.dot}`} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}>
                                            {entry.status_label}
                                        </span>
                                    </div>
                                    <p className="mt-1.5 text-sm font-semibold leading-snug text-gray-900">
                                        {actionLabel}
                                    </p>
                                    {showAnimalLine ? (
                                        <p className="mt-1 text-xs text-gray-600">
                                            {entry.is_bulk ? 'Animals: ' : 'Animal: '}
                                            {animalNames.join(', ')}
                                        </p>
                                    ) : null}
                                    {showServices ? (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {services.map((service) => (
                                                <span
                                                    key={`${entry.changed_at}-${service}`}
                                                    className="inline-flex rounded-md bg-white/80 px-2 py-0.5 text-[11px] font-medium text-gray-700 ring-1 ring-gray-200"
                                                >
                                                    {service}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                    <p className="mt-1 text-xs text-gray-500">
                                        {entry.changed_at_formatted || entry.changed_at}
                                    </p>
                                    {entry.notes ? (
                                        <p className="mt-2 rounded-lg border border-white/80 bg-white/70 px-3 py-2 text-xs leading-relaxed text-gray-600">
                                            {entry.notes}
                                        </p>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
