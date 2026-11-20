import { View, Text, ActivityIndicator } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

// Diri i-format ang petsa sa history.
const formatDate = (value) => {
  if (!value) return '—';
  const str = String(value).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return str;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

// Diri pilion ang icon base sa serbisyo.
const getServiceIcon = (serviceType) => {
  const key = (serviceType || '').toLowerCase();
  if (key.includes('vaccin')) return 'vaccines';
  if (key.includes('deworm')) return 'medication';
  if (key.includes('vitamin')) return 'eco';
  if (key.includes('spay') || key.includes('castrat')) return 'content-cut';
  if (key.includes('treatment')) return 'healing';
  return 'medical-services';
};

// Diri i-format ang gidaghanon sa tambal.
const formatQuantity = (value) => {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) {
    return String(value).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1') || String(value);
  }
  if (Math.abs(num % 1) < 1e-9) return String(Math.round(num));
  return String(parseFloat(num.toFixed(3)));
};

// Diri himuon ang linya sa tambal ug gidaghanon.
const formatMedicineLine = (medicine) => {
  const qty = formatQuantity(medicine.quantity);
  const unit = medicine.unit ? String(medicine.unit).trim() : null;
  const amount = qty && unit ? `${qty} ${unit}` : qty || unit || null;
  return amount ? `${medicine.medicine_name} (${amount})` : medicine.medicine_name;
};

// Diri ipakita ang timeline sa medical history.
export default function AnimalMedicalHistoryTimeline({ history = [], loading = false, count = 0 }) {
  if (loading) {
    return (
      <View className="items-center py-8">
        <ActivityIndicator size="small" color="#1F7A8C" />
        <Text className="text-sm text-slate-500 dark:text-slate-400 mt-3">Loading visit history...</Text>
      </View>
    );
  }

  if (!history.length) {
    return (
      <View className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 px-4 py-8 items-center">
        <MaterialIcons name="history" size={32} color="#94a3b8" />
        <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 mt-3 text-center">
          No visit history yet
        </Text>
        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-center leading-5">
          Completed clinic visits and treatments will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View>
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Visit History
        </Text>
        {count > history.length ? (
          <Text className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            Showing latest {history.length} of {count}
          </Text>
        ) : (
          <Text className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {count} {count === 1 ? 'visit' : 'visits'}
          </Text>
        )}
      </View>

      <View className="rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
        {history.map((entry, index) => {
          const isLast = index === history.length - 1;
          const icon = getServiceIcon(entry.service_type);
          const medicines = Array.isArray(entry.medicines) ? entry.medicines : [];

          return (
            <View key={`${entry.id}-${entry.treatment_date || index}`} className="flex-row">
              <View className="items-center mr-3">
                <View className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 items-center justify-center">
                  <MaterialIcons name={icon} size={18} color="#059669" />
                </View>
                {!isLast ? (
                  <View className="w-0.5 flex-1 bg-emerald-200 dark:bg-emerald-800 my-1 min-h-[24px]" />
                ) : null}
              </View>

              <View className={`flex-1 ${isLast ? '' : 'pb-5'}`}>
                <Text className="text-sm font-bold text-slate-800 dark:text-white">
                  {entry.service_type || 'Visit'}
                </Text>
                {entry.booking_type_label ? (
                  <Text className="text-[11px] font-bold text-teal-700 dark:text-teal-300 mt-0.5">
                    {entry.booking_type_label}
                  </Text>
                ) : null}

                <View className="flex-row items-center flex-wrap gap-x-2 mt-1">
                  <View className="flex-row items-center">
                    <MaterialIcons name="event" size={13} color="#64748b" />
                    <Text className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                      {formatDate(entry.treatment_date)}
                    </Text>
                  </View>
                  {entry.treatment_time ? (
                    <View className="flex-row items-center">
                      <MaterialIcons name="schedule" size={13} color="#64748b" />
                      <Text className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                        {entry.treatment_time}
                      </Text>
                    </View>
                  ) : null}
                  {entry.administered_by ? (
                    <View className="flex-row items-center">
                      <MaterialIcons name="person" size={13} color="#64748b" />
                      <Text className="text-xs text-slate-500 dark:text-slate-400 ml-1">
                        {entry.administered_by}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {medicines.length > 0 ? (
                  <View className="mt-2 rounded-xl bg-white dark:bg-slate-800 px-3 py-2 border border-slate-100 dark:border-slate-700">
                    <Text className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                      Medicines Used
                    </Text>
                    {medicines.map((medicine, medIndex) => (
                      <Text
                        key={`${entry.id}-med-${medicine.id || medIndex}`}
                        className="text-xs text-slate-600 dark:text-slate-300 leading-5"
                      >
                        • {formatMedicineLine(medicine)}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {Array.isArray(entry.outside_items) && entry.outside_items.length > 0 ? (
                  <View className="mt-2 rounded-xl bg-violet-50 dark:bg-violet-900/20 px-3 py-2 border border-violet-100 dark:border-violet-800">
                    <Text className="text-[10px] font-bold text-violet-700 uppercase mb-1.5">
                      Outside clinic
                    </Text>
                    {entry.outside_items.map((item, itemIndex) => (
                      <Text
                        key={`${entry.id}-outside-${item.id || itemIndex}`}
                        className="text-xs text-slate-700 dark:text-slate-200 leading-5"
                      >
                        • {item.name}{item.quantity ? ` · ${item.quantity}` : ''}{item.status ? ` · ${item.status}` : ''}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {entry.notes ? (
                  <Text className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-4">
                    {entry.notes}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
