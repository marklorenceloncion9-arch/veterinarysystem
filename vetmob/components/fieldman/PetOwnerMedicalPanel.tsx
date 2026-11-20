import { useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Image, TouchableOpacity, Modal } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { getPetIdentificationDisplay } from '@/utils/petIdentification';
import { vaccineCoverageLabel } from '@/utils/vaccinationSchedule';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

export interface PetOwnerDetails {
  id: number;
  pet_name: string;
  species?: string;
  breed?: string;
  sex?: string;
  color?: string;
  weight?: number | string;
  birthdate?: string;
  registration_status?: string;
  identification_number?: string;
  markings?: string;
  pet_photo_url?: string | null;
  markings_photo_url?: string | null;
  reproductive_status?: string | null;
  weeks_months?: string | null;
  diet?: string | null;
  diet_other?: string | null;
  dewormed?: string | null;
  last_deworming_date?: string | null;
  dewormer_name?: string | null;
  rabies_vaccine?: string | null;
  rabies_last_vaccination?: string | null;
  rabies_dose_type?: string | null;
  dhppl_vaccine?: string | null;
  dhppl_last_vaccination?: string | null;
  dhppl_dose_type?: string | null;
  other_vaccine_name?: string | null;
  other_vaccine_last_vaccination?: string | null;
  other_vaccine_dose_type?: string | null;
  owner?: {
    id: number;
    name?: string;
    firstname?: string;
    lastname?: string;
    phone_number?: string;
    email?: string;
    barangay?: string;
    zone?: string;
  };
}

export interface MedicalHistoryItem {
  id: number;
  service_type: string;
  treatment_date?: string;
  treatment_time?: string | null;
  administered_by?: string | null;
  notes?: string | null;
}

export interface MedicalProfile {
  reproductive_status?: string | null;
  weeks_months?: string | null;
  diet?: string | null;
  diet_other?: string | null;
  dewormed?: string | null;
  last_deworming_date?: string | null;
  dewormer_name?: string | null;
  rabies_vaccine?: string | null;
  rabies_last_vaccination?: string | null;
  rabies_dose_type?: string | null;
  dhppl_vaccine?: string | null;
  dhppl_last_vaccination?: string | null;
  dhppl_dose_type?: string | null;
  other_vaccine_name?: string | null;
  other_vaccine_last_vaccination?: string | null;
  other_vaccine_dose_type?: string | null;
}

export interface PetMedicalData {
  medical_profile?: MedicalProfile | null;
  history?: MedicalHistoryItem[];
  history_count?: number;
}

// Diri himuon nga nindot basahon ang label.
const formatLabel = (value?: string | null) => {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

// Diri i-format ang petsa.
const formatDate = (value?: string | null) => {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
};

// Diri buhaton ang medical profile sa pet.
const resolveMedicalProfile = (pet: PetOwnerDetails, medical: PetMedicalData | null): MedicalProfile => {
  const fromApi = medical?.medical_profile || {};
  return {
    reproductive_status: fromApi.reproductive_status ?? pet.reproductive_status,
    weeks_months: fromApi.weeks_months ?? pet.weeks_months,
    diet: fromApi.diet ?? pet.diet,
    diet_other: fromApi.diet_other ?? pet.diet_other,
    dewormed: fromApi.dewormed ?? pet.dewormed,
    last_deworming_date: fromApi.last_deworming_date ?? pet.last_deworming_date,
    dewormer_name: fromApi.dewormer_name ?? pet.dewormer_name,
    rabies_vaccine: fromApi.rabies_vaccine ?? pet.rabies_vaccine,
    rabies_last_vaccination: fromApi.rabies_last_vaccination ?? pet.rabies_last_vaccination,
    rabies_dose_type: fromApi.rabies_dose_type ?? pet.rabies_dose_type,
    dhppl_vaccine: fromApi.dhppl_vaccine ?? pet.dhppl_vaccine,
    dhppl_last_vaccination: fromApi.dhppl_last_vaccination ?? pet.dhppl_last_vaccination,
    dhppl_dose_type: fromApi.dhppl_dose_type ?? pet.dhppl_dose_type,
    other_vaccine_name: fromApi.other_vaccine_name ?? pet.other_vaccine_name,
    other_vaccine_last_vaccination:
      fromApi.other_vaccine_last_vaccination ?? pet.other_vaccine_last_vaccination,
    other_vaccine_dose_type: fromApi.other_vaccine_dose_type ?? pet.other_vaccine_dose_type,
  };
};

// Diri ang header sa section nga naay icon.
function SectionHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon: keyof typeof MaterialIcons.glyphMap }) {
  return (
    <View className="mb-3 mt-1">
      <View className="flex-row items-center">
        <View className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-navy/30 items-center justify-center mr-2">
          <MaterialIcons name={icon} size={16} color="#1F7A8C" />
        </View>
        <View className="flex-1">
          <Text className="text-sm font-bold text-slate-800 dark:text-white">{title}</Text>
          {subtitle ? <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</Text> : null}
        </View>
      </View>
    </View>
  );
}

// Diri ang tile nga nagpakita og info.
function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="w-[48%] min-w-[140px] grow bg-canvas dark:bg-navy-dark/50 rounded-xl px-3 py-3 mb-3 border border-slate-100 dark:border-slate-700">
      <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</Text>
      <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-1 leading-5">{value}</Text>
    </View>
  );
}

// Diri ang card sa health status.
function HealthCard({
  title,
  status,
  detail,
  date,
}: {
  title: string;
  status?: string | null;
  detail: string;
  date?: string | null;
}) {
  const normalized = (status || '').toLowerCase();
  const badge =
    normalized === 'yes'
      ? { wrap: 'bg-teal-100', text: 'text-navy' }
      : normalized === 'no'
        ? { wrap: 'bg-red-100', text: 'text-red-800' }
        : { wrap: 'bg-slate-100', text: 'text-slate-600' };

  return (
    <View className="w-[48%] min-w-[140px] grow rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-3 mb-3">
      <View className="flex-row items-center justify-between gap-2 mb-2">
        <Text className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-1">{title}</Text>
        {status ? (
          <View className={`rounded-full px-2 py-0.5 ${badge.wrap}`}>
            <Text className={`text-[10px] font-bold uppercase ${badge.text}`}>{formatLabel(status)}</Text>
          </View>
        ) : null}
      </View>
      <Text className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-5">{detail}</Text>
      {date && date !== '-' && date !== '—' ? (
        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1">{date}</Text>
      ) : null}
    </View>
  );
}

// Diri ang card sa litrato sa pet.
function PhotoCard({
  label,
  uri,
  emptyIcon,
  onPress,
}: {
  label: string;
  uri?: string | null;
  emptyIcon: keyof typeof MaterialIcons.glyphMap;
  onPress?: () => void;
}) {
  const imageBlock = uri ? (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: 128, borderRadius: 12 }}
      resizeMode="cover"
    />
  ) : (
    <View
      style={{ width: '100%', height: 128, borderRadius: 12 }}
      className="bg-slate-100 dark:bg-slate-700 items-center justify-center"
    >
      <MaterialIcons name={emptyIcon} size={28} color="#94a3b8" />
      <Text className="text-xs text-slate-400 mt-2">No photo</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{label}</Text>
      {uri && onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
          {imageBlock}
          <View className="absolute right-2 bottom-2 bg-black/60 px-2 py-1 rounded-lg flex-row items-center">
            <MaterialIcons name="zoom-in" size={12} color="#ffffff" />
            <Text className="text-[10px] text-white ml-1 font-semibold">View</Text>
          </View>
        </TouchableOpacity>
      ) : (
        imageBlock
      )}
    </View>
  );
}

// Diri ang row sa info sa tag-iya.
function OwnerRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-start py-3 border-b border-slate-100 dark:border-slate-700">
      <View className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center mr-3">
        <MaterialIcons name={icon} size={16} color="#64748b" />
      </View>
      <View className="flex-1">
        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</Text>
        <Text className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5 leading-5">{value}</Text>
      </View>
    </View>
  );
}

// Diri ang panel sa pet, tag-iya, ug medical info.
export default function PetOwnerMedicalPanel({
  pet,
  medical,
  loading = false,
}: {
  pet: PetOwnerDetails | null;
  medical: PetMedicalData | null;
  loading?: boolean;
}) {
  const [preview, setPreview] = useState<{ uri: string; title: string } | null>(null);
  const layout = useResponsiveLayout();

  const profile = useMemo(
    () => (pet ? resolveMedicalProfile(pet, medical) : null),
    [pet, medical]
  );

  if (loading) {
    return (
      <View className="bg-white dark:bg-slate-800 rounded-2xl p-8 items-center border border-slate-200 dark:border-slate-700 mb-4">
        <ActivityIndicator color="#1F7A8C" />
        <Text className="text-sm text-slate-500 dark:text-slate-400 mt-3">Loading pet and medical history...</Text>
      </View>
    );
  }

  if (!pet || !profile) return null;

  const ownerName =
    pet.owner?.name ||
    [pet.owner?.firstname, pet.owner?.lastname].filter(Boolean).join(' ') ||
    '—';
  const idDisplay = getPetIdentificationDisplay(pet);
  const hasOtherVaccine = !!(profile.other_vaccine_name && profile.other_vaccine_name.trim());

  return (
    <>
      <View className="bg-white dark:bg-slate-800 rounded-2xl border border-teal-200 dark:border-teal-800 mb-4 overflow-hidden">
        <View className="border-b border-slate-100 bg-canvas px-4 py-4">
          <View className="flex-row items-center">
            {pet.pet_photo_url ? (
              <Image
                source={{ uri: pet.pet_photo_url }}
                style={{ width: 64, height: 64, borderRadius: 16, borderWidth: 2, borderColor: '#E5E7EB' }}
                resizeMode="cover"
              />
            ) : (
              <View className="h-16 w-16 items-center justify-center rounded-2xl border-2 border-teal-100 bg-teal-50">
                <MaterialIcons name="pets" size={30} color="#1F7A8C" />
              </View>
            )}
            <View className="ml-4 flex-1">
              <Text className="text-xl font-bold text-navy">{pet.pet_name}</Text>
              <Text className="mt-0.5 text-sm text-muted">
                {[pet.species, pet.breed].filter(Boolean).join(' • ') || 'Unknown species'}
              </Text>
              {idDisplay ? (
                <Text className="mt-1 text-xs font-semibold text-navy">{idDisplay.text}</Text>
              ) : null}
              <View className="mt-2 self-start rounded-full bg-teal-50 px-2.5 py-1">
                <Text className="text-[11px] font-bold uppercase text-teal-800">
                  {formatLabel(pet.registration_status)}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="px-4 py-4">
          <SectionHeader title="Photos" icon="photo-library" />
          <View className="flex-row gap-3 mb-2">
            <PhotoCard
              label="Pet Photo"
              uri={pet.pet_photo_url}
              emptyIcon="pets"
              onPress={pet.pet_photo_url ? () => setPreview({ uri: pet.pet_photo_url!, title: 'Pet Photo' }) : undefined}
            />
            <PhotoCard
              label="Unique Markings"
              uri={pet.markings_photo_url}
              emptyIcon="fingerprint"
              onPress={
                pet.markings_photo_url
                  ? () => setPreview({ uri: pet.markings_photo_url!, title: 'Unique Markings Photo' })
                  : undefined
              }
            />
          </View>
          {pet.markings ? (
            <View className="mb-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 px-3 py-3 border border-amber-100 dark:border-amber-800">
              <Text className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                Markings Description
              </Text>
              <Text className="text-sm text-amber-900 dark:text-amber-100 mt-1 leading-5">{pet.markings}</Text>
            </View>
          ) : null}

          <View className="rounded-2xl border border-slate-200 dark:border-slate-700 px-3 mb-4 bg-slate-50/60 dark:bg-slate-900/30">
            <SectionHeader title="Owner Details" icon="person" />
            <OwnerRow icon="badge" label="Name" value={ownerName} />
            <OwnerRow icon="phone" label="Phone" value={pet.owner?.phone_number || '—'} />
            <OwnerRow icon="email" label="Email" value={pet.owner?.email || '—'} />
            <OwnerRow
              icon="location-on"
              label="Barangay"
              value={[pet.owner?.barangay, pet.owner?.zone].filter(Boolean).join(', ') || '—'}
            />
          </View>

          <SectionHeader title="Pet Information" icon="info" />
          <View className="flex-row flex-wrap justify-between">
            <InfoTile label="Sex" value={formatLabel(pet.sex)} />
            <InfoTile label="Color" value={pet.color || '—'} />
            <InfoTile label="Weight" value={pet.weight ? `${pet.weight} kg` : '—'} />
            <InfoTile label="Birthdate" value={formatDate(pet.birthdate) || '—'} />
          </View>

          <View className="rounded-2xl border border-teal-200 dark:border-teal-800 px-3 py-3 mb-4 bg-teal-50/50 dark:bg-navy/20">
            <SectionHeader
              title="Medical Profile"
              subtitle="Reproductive status, diet, deworming, and vaccinations"
              icon="medical-services"
            />
            <View className="flex-row flex-wrap justify-between">
              <HealthCard
                title="Reproductive"
                detail={formatLabel(profile.reproductive_status)}
                date={profile.weeks_months ? `Duration: ${profile.weeks_months}` : null}
              />
              <HealthCard
                title="Diet"
                detail={formatLabel(profile.diet)}
                date={profile.diet_other || null}
              />
              <HealthCard
                title="Deworming"
                status={profile.dewormed}
                detail={
                  profile.dewormed === 'yes'
                    ? profile.dewormer_name || 'Recorded'
                    : profile.dewormed === 'no'
                      ? 'Not dewormed'
                      : '—'
                }
                date={profile.dewormed === 'yes' ? formatDate(profile.last_deworming_date) : null}
              />
              <HealthCard
                title="Rabies Vaccine"
                status={profile.rabies_vaccine}
                detail={
                  profile.rabies_vaccine === 'yes'
                    ? 'Vaccinated'
                    : profile.rabies_vaccine === 'no'
                      ? 'Not vaccinated'
                      : '—'
                }
                date={profile.rabies_vaccine === 'yes' ? vaccineCoverageLabel(profile.rabies_last_vaccination, profile.rabies_dose_type) || formatDate(profile.rabies_last_vaccination) : null}
              />
              <HealthCard
                title="DHPPL Vaccine"
                status={profile.dhppl_vaccine}
                detail={
                  profile.dhppl_vaccine === 'yes'
                    ? 'Vaccinated'
                    : profile.dhppl_vaccine === 'no'
                      ? 'Not vaccinated'
                      : '—'
                }
                date={profile.dhppl_vaccine === 'yes' ? vaccineCoverageLabel(profile.dhppl_last_vaccination, profile.dhppl_dose_type) || formatDate(profile.dhppl_last_vaccination) : null}
              />
              {hasOtherVaccine ? (
                <HealthCard
                  title="Other Vaccine"
                  detail={profile.other_vaccine_name!.trim()}
                  date={vaccineCoverageLabel(profile.other_vaccine_last_vaccination, profile.other_vaccine_dose_type) || formatDate(profile.other_vaccine_last_vaccination)}
                />
              ) : null}
            </View>
          </View>


          <SectionHeader
            title={`Medical History${medical?.history_count ? ` (${medical.history_count})` : ''}`}
            subtitle="Past treatments, vaccines, and services"
            icon="history"
          />
          {medical?.history?.length ? (
            medical.history.map((entry, index) => (
              <View
                key={`${entry.id}-${entry.treatment_date}`}
                className="mb-3 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-3 bg-canvas dark:bg-navy-dark/40"
              >
                <View className="flex-row items-start">
                  <View className="w-7 h-7 rounded-full bg-teal-100 dark:bg-navy/40 items-center justify-center mr-3 mt-0.5">
                    <Text className="text-xs font-bold text-teal-700 dark:text-teal-200">{index + 1}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-bold text-slate-800 dark:text-white">{entry.service_type}</Text>
                    {entry.booking_type_label ? (
                      <Text className="text-[11px] font-bold text-teal-700 dark:text-teal-300 mt-0.5">
                        {entry.booking_type_label}
                      </Text>
                    ) : null}
                    <Text className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {formatDate(entry.treatment_date) || '—'}
                      {entry.treatment_time ? ` • ${entry.treatment_time}` : ''}
                      {entry.administered_by ? ` • ${entry.administered_by}` : ''}
                    </Text>
                    {entry.notes ? (
                      <Text className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-5">{entry.notes}</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))
          ) : (
            <Text className="text-sm text-slate-500 dark:text-slate-400 mb-2">No medical history recorded yet.</Text>
          )}
        </View>
      </View>

      <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
        <View className="flex-1 bg-black/90 justify-center">
          <View className="px-5 pb-6" style={{ paddingTop: layout.headerPaddingTop }}>
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-white text-lg font-bold">{preview?.title}</Text>
              <TouchableOpacity onPress={() => setPreview(null)} className="p-2">
                <MaterialIcons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
            {preview ? (
              <Image
                source={{ uri: preview.uri }}
                style={{ width: '100%', height: Math.min(420, layout.height * 0.62), borderRadius: 16 }}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}
