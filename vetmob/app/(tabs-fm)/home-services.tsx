import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  RefreshControl,
  TouchableOpacity,
  Image,
  Modal,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import { LoadingState } from '@/components/LoadingState';
import { ThemedView } from '@/components/themed-view';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/auth-context';
import FieldmanBookingCard from '@/components/fieldman/FieldmanBookingCard';
import VetBookingDetailModal, { type VetBookingDetail } from '@/components/fieldman/VetBookingDetailModal';
import FieldmanScreenHeader from '@/components/fieldman/FieldmanScreenHeader';
import { FIELDMAN_THEME } from '@/components/fieldman/fieldmanTheme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { normalizeFieldmanBooking } from '@/components/fieldman/fieldmanBookingUtils';

type HistoryTab = 'home_service' | 'walk_in' | 'appointment' | 'damage';
type VisitHistoryTab = Exclude<HistoryTab, 'damage'>;

interface DamageReportItem {
  id: number;
  medicine_name: string;
  category?: string;
  batch_number?: string | null;
  quantity: number | string;
  quantity_display?: string;
  unit?: string;
  reason: string;
  evidence_image_url?: string | null;
  evidence_image_urls?: string[] | null;
  status: string;
  created_at?: string | null;
  reviewed_at?: string | null;
  deducted_at?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  under_review: 'Under Review',
  approved: 'Approved',
  rejected: 'Rejected',
  deducted: 'Approved',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  under_review: { bg: 'bg-amber-50', text: 'text-amber-800' },
  approved: { bg: 'bg-teal-50', text: 'text-navy' },
  rejected: { bg: 'bg-red-50', text: 'text-red-800' },
  deducted: { bg: 'bg-teal-50', text: 'text-navy' },
};

// Diri kuhaon ang mga litrato sa damage report.
function reportPhotos(report: DamageReportItem) {
  const urls = Array.isArray(report.evidence_image_urls)
    ? report.evidence_image_urls.filter(Boolean)
    : [];
  if (report.evidence_image_url && !urls.includes(report.evidence_image_url)) {
    urls.unshift(report.evidence_image_url);
  }
  return urls.slice(0, 3);
}

// Diri i-format ang petsa ug oras.
function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const dt = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Diri ang history screen sa fieldman.
export default function FieldmanHomeServicesHistoryScreen() {
  const { token } = useAuth();
  const layout = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState<HistoryTab>('home_service');
  const [homeServiceHistory, setHomeServiceHistory] = useState<VetBookingDetail[]>([]);
  const [walkInHistory, setWalkInHistory] = useState<VetBookingDetail[]>([]);
  const [appointmentHistory, setAppointmentHistory] = useState<VetBookingDetail[]>([]);
  const [damageReports, setDamageReports] = useState<DamageReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<VetBookingDetail | null>(null);
  const [selectedDamage, setSelectedDamage] = useState<DamageReportItem | null>(null);

  // Diri kuhaon ang history sa bisita base sa tab.
  const fetchVisitHistory = useCallback(async (bookingType: VisitHistoryTab) => {
    // Diri ibutang ang rows sa sakto nga history list.
    const apply = (rows: VetBookingDetail[]) => {
      if (bookingType === 'walk_in') setWalkInHistory(rows);
      else if (bookingType === 'appointment') setAppointmentHistory(rows);
      else setHomeServiceHistory(rows);
    };

    if (!token) {
      apply([]);
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/vet-bookings/history`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { booking_type: bookingType },
      });

      if (response.data?.success) {
        const history = (response.data.history || []).map((booking: VetBookingDetail) =>
          normalizeFieldmanBooking(booking)
        );
        apply(history);
      }
    } catch (error) {
      console.error(`Failed to fetch ${bookingType} history:`, error);
      apply([]);
    }
  }, [token]);

  // Diri kuhaon ang history sa damage report.
  const fetchDamageHistory = useCallback(async () => {
    if (!token) {
      setDamageReports([]);
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/fieldman/damage-reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.success) {
        setDamageReports(response.data.reports || []);
      }
    } catch (error) {
      console.error('Failed to fetch damage history:', error);
      setDamageReports([]);
    }
  }, [token]);

  // Diri kuhaon tanan history.
  const fetchAll = useCallback(async () => {
    if (!token) {
      setHomeServiceHistory([]);
      setWalkInHistory([]);
      setAppointmentHistory([]);
      setDamageReports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    await Promise.all([
      fetchVisitHistory('home_service'),
      fetchVisitHistory('walk_in'),
      fetchVisitHistory('appointment'),
      fetchDamageHistory(),
    ]);
    setLoading(false);
  }, [token, fetchVisitHistory, fetchDamageHistory]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Diri i-refresh ang tanan history.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      fetchVisitHistory('home_service'),
      fetchVisitHistory('walk_in'),
      fetchVisitHistory('appointment'),
      fetchDamageHistory(),
    ]);
    setRefreshing(false);
  }, [fetchVisitHistory, fetchDamageHistory]);

  // Diri ihan-ay ang mga bisita, pinakabag-o una.
  const sortVisits = (rows: VetBookingDetail[]) =>
    [...rows].sort((left, right) => {
      const leftUpdated = Date.parse(String(left.updated_at || left.created_at || '').replace(' ', 'T'));
      const rightUpdated = Date.parse(String(right.updated_at || right.created_at || '').replace(' ', 'T'));
      if (Number.isFinite(leftUpdated) && Number.isFinite(rightUpdated) && rightUpdated !== leftUpdated) {
        return rightUpdated - leftUpdated;
      }
      return Number(right.id) - Number(left.id);
    });

  const sortedHomeServiceHistory = useMemo(() => sortVisits(homeServiceHistory), [homeServiceHistory]);
  const sortedWalkInHistory = useMemo(() => sortVisits(walkInHistory), [walkInHistory]);
  const sortedAppointmentHistory = useMemo(() => sortVisits(appointmentHistory), [appointmentHistory]);

  const historyTabs: { id: HistoryTab; label: string; count: number }[] = [
    { id: 'home_service', label: 'Home', count: sortedHomeServiceHistory.length },
    { id: 'walk_in', label: 'Walk-in', count: sortedWalkInHistory.length },
    { id: 'appointment', label: 'Clinical', count: sortedAppointmentHistory.length },
    { id: 'damage', label: 'Damage', count: damageReports.length },
  ];

  const activeVisits =
    activeTab === 'walk_in'
      ? sortedWalkInHistory
      : activeTab === 'appointment'
        ? sortedAppointmentHistory
        : sortedHomeServiceHistory;

  const emptyVisitCopy =
    activeTab === 'walk_in'
      ? {
          title: 'No walk-in history yet',
          hint: 'Completed, cancelled, and rejected walk-ins will appear here.',
        }
      : activeTab === 'appointment'
        ? {
            title: 'No clinical history yet',
            hint: 'Completed, cancelled, and rejected clinical appointments will appear here.',
          }
        : {
            title: 'No home service history yet',
            hint: 'Completed, cancelled, and rejected home service visits will appear here.',
          };

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      <FieldmanScreenHeader
        title="History"
        subtitle="Home visits, walk-ins, clinical appointments, and damage reports."
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={[layout.scrollContent, { paddingTop: 20 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[FIELDMAN_THEME.primary]}
            tintColor={FIELDMAN_THEME.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-4 flex-row gap-2">
          {historyTabs.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.85}
                className={`flex-1 items-center rounded-full border px-1 py-2.5 ${
                  selected ? 'border-navy bg-navy' : 'border-slate-200 bg-white'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${selected ? 'text-white' : 'text-navy'}`}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                <Text className={`mt-0.5 text-[10px] font-semibold ${selected ? 'text-teal-100' : 'text-slate-400'}`}>
                  {tab.count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {loading ? (
          <LoadingState label="Loading history" icon="history" />
        ) : activeTab !== 'damage' ? (
          activeVisits.length === 0 ? (
            <View className="bg-white dark:bg-slate-800 rounded-3xl p-8 items-center border border-slate-100 dark:border-slate-700 mb-8">
              <MaterialIcons name="history" size={48} color="#cbd5e1" />
              <Text className="text-base font-semibold text-slate-700 dark:text-slate-200 mt-4 text-center">
                {emptyVisitCopy.title}
              </Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center">
                {emptyVisitCopy.hint}
              </Text>
            </View>
          ) : (
            <View className="mb-8">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                {activeVisits.length}{' '}
                {activeVisits.length === 1 ? 'past visit' : 'past visits'}
              </Text>
              {activeVisits.map((booking) => (
                <FieldmanBookingCard
                  key={`${booking.booking_type}-${booking.id}`}
                  booking={booking}
                  onPress={() => setSelectedBooking(booking)}
                />
              ))}
            </View>
          )
        ) : damageReports.length === 0 ? (
          <View className="bg-white dark:bg-slate-800 rounded-3xl p-8 items-center border border-slate-100 dark:border-slate-700 mb-8">
            <MaterialIcons name="report-problem" size={48} color="#cbd5e1" />
            <Text className="text-base font-semibold text-slate-700 dark:text-slate-200 mt-4 text-center">
              No damage history yet
            </Text>
            <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2 text-center">
              Damage reports you submit from Vet Services will appear here.
            </Text>
          </View>
        ) : (
          <View className="mb-8">
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {damageReports.length}{' '}
              {damageReports.length === 1 ? 'submitted report' : 'submitted reports'}
            </Text>
            {damageReports.map((report) => {
              const statusStyle = STATUS_COLORS[report.status] || STATUS_COLORS.under_review;
              const photos = reportPhotos(report);
              return (
                <TouchableOpacity
                  key={report.id}
                  onPress={() => setSelectedDamage(report)}
                  className="mb-3 overflow-hidden rounded-3xl border border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800"
                >
                  <View className="flex-row gap-3 p-4">
                    {photos[0] ? (
                      <Image
                        source={{ uri: photos[0] }}
                        className="h-16 w-16 rounded-xl"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="h-16 w-16 items-center justify-center rounded-xl bg-slate-100">
                        <MaterialIcons name="image-not-supported" size={22} color="#94a3b8" />
                      </View>
                    )}
                    <View className="flex-1">
                      <View className="flex-row items-start justify-between gap-2">
                        <Text className="flex-1 text-base font-bold text-slate-900 dark:text-white">
                          {report.medicine_name}
                        </Text>
                        <View className={`rounded-full px-2.5 py-1 ${statusStyle.bg}`}>
                          <Text className={`text-[10px] font-bold ${statusStyle.text}`}>
                            {STATUS_LABELS[report.status] || report.status}
                          </Text>
                        </View>
                      </View>
                      <Text className="mt-1 text-sm font-semibold text-amber-700">
                        {report.quantity_display || `${report.quantity} ${report.unit || ''}`}
                      </Text>
                      <Text className="mt-1 text-xs text-slate-500" numberOfLines={2}>
                        {report.reason}
                      </Text>
                      <Text className="mt-2 text-xs text-slate-400">
                        Submitted {formatDateTime(report.created_at)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <VetBookingDetailModal
        visible={!!selectedBooking}
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />

      <Modal
        visible={!!selectedDamage}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedDamage(null)}
      >
        {selectedDamage ? (
          <View className="flex-1 bg-canvas">
            <View
              className="border-b border-slate-200 bg-white pb-4"
              style={{
                paddingTop: layout.headerPaddingTop,
                paddingHorizontal: layout.headerGutter,
              }}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-xs font-bold uppercase tracking-wider text-muted">
                    Damage history
                  </Text>
                  <Text className={`mt-1 ${layout.titleClass} font-bold text-navy`}>{selectedDamage.medicine_name}</Text>
                  <Text className="mt-1 text-sm text-muted">
                    {selectedDamage.quantity_display ||
                      `${selectedDamage.quantity} ${selectedDamage.unit || ''}`}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedDamage(null)}
                  className="h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white"
                >
                  <MaterialIcons name="close" size={22} color="#16324F" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              className="flex-1"
              contentContainerStyle={[layout.scrollContent, { paddingTop: 16, paddingBottom: 24 + layout.bottomInset }]}
            >
              <View className="mb-4 rounded-3xl border border-slate-100 bg-white p-4">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</Text>
                <Text className="mt-1 text-base font-semibold text-slate-900">
                  {STATUS_LABELS[selectedDamage.status] || selectedDamage.status}
                </Text>
                <Text className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Submitted
                </Text>
                <Text className="mt-1 text-sm text-slate-700">
                  {formatDateTime(selectedDamage.created_at)}
                </Text>
                {selectedDamage.reviewed_at ? (
                  <>
                    <Text className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                      Reviewed
                    </Text>
                    <Text className="mt-1 text-sm text-slate-700">
                      {formatDateTime(selectedDamage.reviewed_at)}
                    </Text>
                  </>
                ) : null}
              </View>

              <View className="mb-4 rounded-3xl border border-slate-100 bg-white p-4">
                <Text className="text-xs font-bold uppercase tracking-wider text-slate-400">Reason</Text>
                <Text className="mt-2 text-sm leading-6 text-slate-800">{selectedDamage.reason}</Text>
              </View>

              <View className="mb-8 rounded-3xl border border-slate-100 bg-white p-4">
                <Text className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Evidence
                </Text>
                {reportPhotos(selectedDamage).length ? (
                  <View className="gap-3">
                    {reportPhotos(selectedDamage).map((url) => (
                      <Image
                        key={url}
                        source={{ uri: url }}
                        className="h-56 w-full rounded-xl"
                        resizeMode="cover"
                      />
                    ))}
                  </View>
                ) : (
                  <View className="h-40 items-center justify-center rounded-xl bg-slate-100">
                    <Text className="text-sm text-slate-400">No evidence photo</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        ) : null}
      </Modal>
    </ThemedView>
  );
}
