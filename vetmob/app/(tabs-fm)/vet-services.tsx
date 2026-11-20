import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import axios from 'axios';
import { LoadingState } from '@/components/LoadingState';
import { ThemedView } from '@/components/themed-view';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/auth-context';
import { showToast } from '@/components/Toast';
import WalkInFormModal, { type WalkInResumeBooking } from '@/components/fieldman/WalkInFormModal';
import DamageReportModal from '@/components/fieldman/DamageReportModal';
import FieldmanBookingCard from '@/components/fieldman/FieldmanBookingCard';
import VetBookingDetailModal, { type VetBookingDetail } from '@/components/fieldman/VetBookingDetailModal';
import { normalizeFieldmanBooking, toResumeBooking, withResolvedMeetingPlaceLabels } from '@/components/fieldman/fieldmanBookingUtils';
import FieldmanScreenHeader from '@/components/fieldman/FieldmanScreenHeader';
import { FIELDMAN_THEME } from '@/components/fieldman/fieldmanTheme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type BookingTab = 'home_service' | 'walk_in' | 'appointment';

const TAB_CONFIG: Record<BookingTab, { label: string; empty: string }> = {
  home_service: { label: 'Home Service', empty: 'No home services yet' },
  walk_in: { label: 'Walk-in', empty: 'No walk-ins yet' },
  appointment: { label: 'Clinical', empty: 'No clinical appointments yet' },
};

// Diri ang vet services screen sa fieldman.
export default function FieldmanVetServicesScreen() {
  const { token } = useAuth();
  const layout = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState<BookingTab>('home_service');
  const [homeServices, setHomeServices] = useState<VetBookingDetail[]>([]);
  const [walkIns, setWalkIns] = useState<VetBookingDetail[]>([]);
  const [appointments, setAppointments] = useState<VetBookingDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<VetBookingDetail | null>(null);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [showDamageReportModal, setShowDamageReportModal] = useState(false);
  const [resumeWalkIn, setResumeWalkIn] = useState<WalkInResumeBooking | null>(null);
  const startingVisitRef = useRef(false);
  const completingVisitRef = useRef(false);

  // Diri ablihan ang inventory para sa booking.
  const openInventoryForBooking = useCallback((booking: VetBookingDetail) => {
    setSelectedBooking(null);
    setResumeWalkIn(toResumeBooking({ ...booking, status: 'processing' }, 'appointment'));
    setShowWalkInModal(true);
  }, []);

  // Diri kuhaon ang mga booking sa fieldman.
  const fetchBookings = useCallback(async () => {
    if (!token) {
      setHomeServices([]);
      setWalkIns([]);
      setAppointments([]);
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/vet-bookings`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data?.success) {
        const nextHomeServices = await withResolvedMeetingPlaceLabels(
          (response.data.home_services || []).map((booking: VetBookingDetail) =>
            normalizeFieldmanBooking(booking)
          )
        );
        const nextWalkIns = (response.data.walk_ins || []).map((booking: VetBookingDetail) =>
          normalizeFieldmanBooking(booking)
        );
        const nextAppointments = (response.data.appointments || []).map((booking: VetBookingDetail) =>
          normalizeFieldmanBooking(booking)
        );
        setHomeServices(nextHomeServices);
        setWalkIns(nextWalkIns);
        setAppointments(nextAppointments);
      }
    } catch (error) {
      console.error('Failed to fetch vet bookings:', error);
      setHomeServices([]);
      setWalkIns([]);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Diri i-refresh ang mga booking.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchBookings();
    setRefreshing(false);
  }, [fetchBookings]);

  const displayedBookings = useMemo(() => {
    const list =
      activeTab === 'home_service'
        ? homeServices
        : activeTab === 'walk_in'
          ? walkIns
          : appointments;
    return [...list].sort((left, right) => {
      const dateCompare = String(left.date || '').localeCompare(String(right.date || ''));
      if (dateCompare !== 0) return dateCompare;
      const timeCompare = String(left.time || '').localeCompare(String(right.time || ''));
      if (timeCompare !== 0) return timeCompare;
      return Number(left.id) - Number(right.id);
    });
  }, [activeTab, appointments, homeServices, walkIns]);

  const selectedType = selectedBooking?.booking_type;

  // Diri padayonon ang walk-in nga booking.
  const handleContinueWalkIn = useCallback((booking: VetBookingDetail) => {
    setSelectedBooking(null);
    setResumeWalkIn(toResumeBooking(booking, 'walk_in'));
    setShowWalkInModal(true);
  }, []);

  // Diri sugdan ang pag-process sa appointment.
  const handleStartAppointment = useCallback(
    async (booking: VetBookingDetail) => {
      if (!token) return;

      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/mobile/appointments/${booking.id}/mark-processing`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data?.success) {
          showToast({ type: 'success', message: 'Appointment marked as processing.' });
          await fetchBookings();
        } else {
          showToast({
            type: 'error',
            message: response.data?.error || 'Failed to mark appointment as processing.',
          });
        }
      } catch (error: any) {
        showToast({
          type: 'error',
          message: error?.response?.data?.error || 'Failed to mark appointment as processing.',
        });
      }
    },
    [token, fetchBookings]
  );

  // Diri padayonon ang appointment nga nag-process.
  const handleContinueAppointment = useCallback((booking: VetBookingDetail) => {
    if (booking.status !== 'processing') return;
    setSelectedBooking(null);
    setResumeWalkIn(toResumeBooking(booking, 'appointment'));
    setShowWalkInModal(true);
  }, []);

  // Diri i-cancel ang appointment uban ang rason.
  const handleCancelAppointment = useCallback(
    async (booking: VetBookingDetail, reason: string) => {
      if (!token) return;

      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/mobile/appointments/${booking.id}/fieldman-cancel`,
          { cancellation_reason: reason },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data?.success) {
          showToast({
            type: 'success',
            message: booking.booking_type === 'home_service'
              ? 'Home Service visit cancelled successfully.'
              : 'Appointment cancelled successfully.',
          });
          setSelectedBooking(null);
          await fetchBookings();
        } else {
          showToast({
            type: 'error',
            message: response.data?.error || 'Failed to cancel appointment.',
          });
        }
      } catch (error: any) {
        showToast({
          type: 'error',
          message: error?.response?.data?.error || 'Failed to cancel appointment.',
        });
      }
    },
    [token, fetchBookings]
  );

  // Diri markahan nga ongoing ang home service.
  const handleMarkHomeServiceOngoing = useCallback(
    async (booking: VetBookingDetail) => {
      if (!token || startingVisitRef.current) return;

      const effectiveStatus = booking.display_status || booking.status;

      if (effectiveStatus === 'processing') {
        openInventoryForBooking(booking);
        return;
      }

      if (effectiveStatus !== 'approved') return;

      startingVisitRef.current = true;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/mobile/appointments/${booking.id}/mark-processing`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data?.success) {
          const updatedBooking = response.data.appointment
            ? { ...booking, ...response.data.appointment, status: 'processing' as const }
            : { ...booking, status: 'processing' as const };

          openInventoryForBooking(updatedBooking);
        } else {
          showToast({
            type: 'error',
            message: response.data?.error || 'Failed to start this home visit.',
          });
        }
      } catch (error: any) {
        const message =
          error?.response?.data?.error
          || error?.response?.data?.message
          || 'Failed to start this home visit.';
        const alreadyProcessing =
          booking.status === 'processing'
          || String(message).toLowerCase().includes('already processing')
          || String(message).toLowerCase().includes('already in processing');

        if (error?.response?.status === 422 && alreadyProcessing) {
          openInventoryForBooking({ ...booking, status: 'processing' });
          return;
        }

        showToast({ type: 'error', message });
      } finally {
        startingVisitRef.current = false;
      }
    },
    [token, openInventoryForBooking]
  );

  // Diri markahan nga completed ang home service.
  const handleCompleteHomeService = useCallback(
    async (booking: VetBookingDetail) => {
      if (!token || completingVisitRef.current) return;

      completingVisitRef.current = true;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/mobile/appointments/${booking.id}/complete`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data?.success) {
          showToast({
            type: 'success',
            message: response.data?.message || 'Home visit completed. Inventory deducted.',
          });
          setSelectedBooking(null);
          await fetchBookings();
        } else {
          showToast({
            type: 'error',
            message: response.data?.error || 'Failed to complete this home visit.',
          });
        }
      } catch (error: any) {
        showToast({
          type: 'error',
          message:
            error?.response?.data?.error
            || error?.response?.data?.message
            || 'Failed to complete this home visit.',
        });
      } finally {
        completingVisitRef.current = false;
      }
    },
    [token, fetchBookings]
  );

  // Diri isira ang walk-in modal.
  const handleCloseWalkInModal = useCallback(() => {
    setShowWalkInModal(false);
    setResumeWalkIn(null);
  }, []);

  // Diri i-refresh human ma-save ang walk-in.
  const handleWalkInSuccess = useCallback(() => {
    setResumeWalkIn(null);
    fetchBookings();
  }, [fetchBookings]);

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      <FieldmanScreenHeader
        title="Vet Services"
        subtitle="Home services, walk-ins, and clinic appointments."
      >
        <View className="mt-4 flex-row flex-wrap gap-2">
          {activeTab === 'walk_in' ? (
            <TouchableOpacity
              onPress={() => {
                setResumeWalkIn(null);
                setShowWalkInModal(true);
              }}
              className="self-start flex-row items-center rounded-full bg-navy px-4 py-2.5"
            >
              <MaterialIcons name="add" size={18} color="#ffffff" />
              <Text className="ml-1 text-sm font-bold text-white">Add Walk-in</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={() => setShowDamageReportModal(true)}
            className="self-start flex-row items-center rounded-full bg-white px-4 py-2.5"
          >
            <MaterialIcons name="report-problem" size={18} color={FIELDMAN_THEME.primary} />
            <Text className={`ml-1 text-sm font-bold ${FIELDMAN_THEME.activeTabText}`}>
              New damage report
            </Text>
          </TouchableOpacity>
        </View>
      </FieldmanScreenHeader>

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
        <View className="flex-row gap-2 mb-4">
          {(Object.keys(TAB_CONFIG) as BookingTab[]).map((tab) => {
            const selected = activeTab === tab;
            const count = tab === 'home_service' ? homeServices.length : tab === 'walk_in' ? walkIns.length : appointments.length;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.85}
                className={`flex-1 items-center rounded-full border px-2 py-2.5 ${
                  selected ? 'bg-navy border-navy' : 'bg-white border-slate-200'
                }`}
              >
                <Text className={`text-[12px] font-bold ${selected ? 'text-white' : 'text-navy'}`} numberOfLines={1}>
                  {TAB_CONFIG[tab].label}
                </Text>
                <Text className={`text-[10px] font-semibold mt-0.5 ${selected ? 'text-teal-100' : 'text-slate-400'}`}>
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {loading ? (
          <LoadingState label="Fetching bookings" icon="medical-services" />
        ) : displayedBookings.length === 0 ? (
          <View className="bg-white dark:bg-slate-800 rounded-3xl p-8 items-center border border-slate-100 dark:border-slate-700 mb-8">
            <MaterialIcons name="medical-services" size={48} color="#cbd5e1" />
            <Text className="text-base font-semibold text-slate-700 dark:text-slate-200 mt-4 text-center">
              {TAB_CONFIG[activeTab].empty}
            </Text>
          </View>
        ) : (
          <View className="mb-8">
            {displayedBookings.map((booking) => (
              <FieldmanBookingCard
                key={`${booking.booking_type}-${booking.id}`}
                booking={booking}
                onPress={() => setSelectedBooking(booking)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <VetBookingDetailModal
        visible={!!selectedBooking}
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onContinueWalkIn={selectedType === 'walk_in' ? handleContinueWalkIn : undefined}
        onStartAppointment={
          selectedType === 'appointment'
            ? handleStartAppointment
            : selectedType === 'home_service'
              ? handleMarkHomeServiceOngoing
              : undefined
        }
        onContinueAppointment={
          selectedType === 'appointment'
            ? handleContinueAppointment
            : selectedType === 'home_service'
              ? handleMarkHomeServiceOngoing
              : undefined
        }
        onCancelAppointment={
          selectedType === 'appointment' || selectedType === 'home_service'
            ? handleCancelAppointment
            : undefined
        }
        onCompleteHomeService={selectedType === 'home_service' ? handleCompleteHomeService : undefined}
      />

      <WalkInFormModal
        visible={showWalkInModal}
        token={token}
        onClose={handleCloseWalkInModal}
        onSuccess={handleWalkInSuccess}
        resumeBooking={resumeWalkIn}
      />

      <DamageReportModal
        visible={showDamageReportModal}
        token={token}
        onClose={() => setShowDamageReportModal(false)}
      />
    </ThemedView>
  );
}
