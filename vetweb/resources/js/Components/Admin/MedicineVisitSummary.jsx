import { formatOutsideQuantity, normalizeOutsidePurchaseStatus } from '@/Components/Admin/OutsidePurchaseReceipt';

// Diri ipakita ang usa ka summary sa tanang hayop.
export default function MedicineVisitSummary({ groups = [] }) {
    const names = groups.map((group) => group.name).filter(Boolean);
    const services = [...new Set(groups.flatMap((group) => group.services || []).filter(Boolean))];
    const clinicItems = groups.flatMap((group) => (group.clinicItems || []).map((item) => ({
        ...item,
        key: `${group.id}-${item.id}`,
        animalName: groups.length > 1 ? group.name : '',
    })));
    const outsideItems = [];
    const seenOutside = new Set();

    groups.forEach((group) => {
        (group.outsideItems || []).forEach((item) => {
            const key = `${item.name}|${item.quantity}|${item.status}`;
            if (seenOutside.has(key)) return;
            seenOutside.add(key);
            outsideItems.push(item);
        });
    });

    return (
        <aside className="rounded-2xl border border-gray-200 bg-gray-50 p-4 xl:sticky xl:top-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Summary</p>
            <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-gray-200">
                <p className="text-sm font-semibold text-gray-900">{names.join(', ') || 'No animal'}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                    {services.length ? services.join(', ') : 'No service'}
                </p>
                <p className="mt-2 text-[11px] font-medium text-violet-700">
                    {clinicItems.length} from clinic
                    {' · '}
                    {outsideItems.length} outside clinic
                </p>

                <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">From clinic</p>
                    {clinicItems.length === 0 ? (
                        <p className="mt-1 text-sm text-gray-500">None selected</p>
                    ) : (
                        <ul className="mt-1.5 space-y-2">
                            {clinicItems.map((item) => (
                                <li key={item.key} className="flex items-start justify-between gap-3 text-sm">
                                    <span className="min-w-0">
                                        <span className="block font-medium text-gray-800">{item.name}</span>
                                        {item.animalName || item.category ? (
                                            <span className="block text-xs text-gray-500">
                                                {[item.animalName, item.category].filter(Boolean).join(' · ')}
                                            </span>
                                        ) : null}
                                    </span>
                                    <span className="shrink-0 font-semibold text-violet-800">{item.quantityLabel}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Outside clinic</p>
                    {outsideItems.length === 0 ? (
                        <p className="mt-1 text-sm text-gray-500">None added</p>
                    ) : (
                        <ul className="mt-1.5 space-y-2">
                            {outsideItems.map((item) => (
                                <li key={item.id || item.name} className="text-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <span className="font-medium text-gray-800">{item.name}</span>
                                        <span className="shrink-0 font-semibold text-amber-800">
                                            {item.quantity ? formatOutsideQuantity(item.quantity) : '—'}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-gray-500">
                                        Status: {normalizeOutsidePurchaseStatus(item.status)}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </aside>
    );
}
