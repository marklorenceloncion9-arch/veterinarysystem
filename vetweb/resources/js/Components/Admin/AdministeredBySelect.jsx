import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { buildAdministeredByOptions, DEFAULT_ADMINISTERED_BY } from '@/utils/treatmentStaff';

export { DEFAULT_ADMINISTERED_BY };

// Diri ang dropdown sa pagpili kinsa ang ni-administer.
export default function AdministeredBySelect({ value, onChange, onStaffChange, error }) {
    const [staff, setStaff] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        axios.get('/api/admin/treatment-staff')
            .then((response) => {
                if (cancelled) return;
                if (response.data?.success) {
                    setStaff(response.data.staff || []);
                }
            })
            .catch((fetchError) => {
                if (!cancelled) {
                    console.error('Failed to fetch treatment staff:', fetchError);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const options = useMemo(() => buildAdministeredByOptions(staff), [staff]);

    const selectValue = value || DEFAULT_ADMINISTERED_BY;

    // Diri i-update ang napili ug ang staff info.
    const handleChange = (event) => {
        const nextValue = event.target.value;
        onChange(nextValue);

        if (onStaffChange) {
            const staffMember = staff.find((member) => (member?.name || '').trim() === nextValue.trim()) ?? null;
            onStaffChange(staffMember);
        }
    };

    return (
        <select
            value={selectValue}
            onChange={handleChange}
            disabled={loading}
            className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 disabled:cursor-wait disabled:bg-gray-50 ${
                error
                    ? 'border-red-300 focus:border-red-300 focus:ring-red-100'
                    : 'border-gray-200 focus:border-violet-300 focus:ring-violet-100'
            }`}
        >
            {options.map((option) => (
                <option key={option.value} value={option.value}>
                    {option.label}
                </option>
            ))}
        </select>
    );
}
