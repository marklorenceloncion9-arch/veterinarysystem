import {
    Badge,
    DetailField,
    ModalShell,
    SectionTitle,
    formatCurrency,
    formatDate,
    getTotalAnimals,
    getValidityStatus,
    purposeTone,
} from '@/Components/Admin/vhcUi';

// Diri ang modal sa pagtan-aw sa VHC details.
export default function VhcViewModal({ isOpen, onClose, record }) {
    if (!isOpen || !record) return null;

    const validity = getValidityStatus(record);
    const totalAnimals = getTotalAnimals(record);

    return (
        <ModalShell
            title={record.name}
            subtitle={`Certificate #${String(record.id).padStart(4, '0')}`}
            onClose={onClose}
            maxWidth="max-w-2xl"
            footer={
                <div className="flex items-center justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                        Close
                    </button>
                </div>
            }
        >
            <div className="space-y-6 p-6">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={purposeTone(record.purpose)}>{record.purpose || 'No purpose'}</Badge>
                    <Badge tone={validity.tone}>{validity.label}</Badge>
                    {totalAnimals > 0 && (
                        <Badge tone="violet">{totalAnimals} head{totalAnimals === 1 ? '' : 's'}</Badge>
                    )}
                </div>

                <section>
                    <SectionTitle>Certificate Information</SectionTitle>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DetailField label="Name" value={record.name} />
                        <DetailField label="Contact Number" value={record.contact_number} />
                        <DetailField label="Age" value={record.age} />
                        <DetailField label="Color" value={record.color} />
                        <DetailField label="Origin" value={record.origin} />
                        <DetailField label="Animals Origin" value={record.animals_origin} />
                        <DetailField label="Destination" value={record.destination} />
                        <DetailField label="SLH" value={record.slh} />
                        <DetailField label="Issued On" value={formatDate(record.issued_on, 'long')} />
                        <DetailField label="Valid Till" value={formatDate(record.valid_till, 'long')} />
                        <DetailField label="O.R Number" value={record.or_number} />
                        <DetailField label="Amount Paid" value={formatCurrency(record.amount_paid)} />
                        <DetailField label="Issued At" value={record.issued_at} />
                        <DetailField label="Inspected By" value={record.inspected_by} />
                    </div>
                </section>

                <section>
                    <SectionTitle accent="emerald">Livestock & Poultry Details</SectionTitle>
                    {record.livestock?.length > 0 ? (
                        <div className="overflow-hidden rounded-xl border border-slate-200">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-100 bg-slate-50">
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">Species</th>
                                        <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Male</th>
                                        <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Female</th>
                                        <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {record.livestock.map((entry) => (
                                        <tr key={entry.id}>
                                            <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                                {entry.species?.species_name || '—'}
                                            </td>
                                            <td className="px-4 py-3 text-center text-sm tabular-nums text-slate-600">{entry.male_count}</td>
                                            <td className="px-4 py-3 text-center text-sm tabular-nums text-slate-600">{entry.female_count}</td>
                                            <td className="px-4 py-3 text-center text-sm font-semibold tabular-nums text-slate-900">
                                                {Number(entry.male_count) + Number(entry.female_count)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                            No livestock or poultry entries recorded.
                        </div>
                    )}
                </section>

                <section>
                    <SectionTitle accent="blue">Record Information</SectionTitle>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <DetailField label="Created On" value={formatDate(record.created_at, 'long')} />
                        <DetailField label="Certificate ID" value={`#${String(record.id).padStart(4, '0')}`} />
                    </div>
                </section>
            </div>
        </ModalShell>
    );
}
