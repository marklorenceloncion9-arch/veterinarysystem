import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import axios from 'axios';
import { LoadingState } from '@/components/LoadingState';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/auth-context';
import { showToast } from '@/components/Toast';
import WalkInFormModal, { type WalkInResumeBooking } from '@/components/fieldman/WalkInFormModal';
import FieldmanBookingCard from '@/components/fieldman/FieldmanBookingCard';
import VetBookingDetailModal, { type VetBookingDetail } from '@/components/fieldman/VetBookingDetailModal';
import { MeetingPlaceMap } from '@/components/MeetingPlaceMap';
import { normalizeFieldmanBooking, toResumeBooking, withResolvedMeetingPlaceLabels, isMeaningfulMeetingPlaceLabel } from '@/components/fieldman/fieldmanBookingUtils';
import { FIELDMAN_THEME } from '@/components/fieldman/fieldmanTheme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

// Diri kuhaon ang petsa karon nga YYYY-MM-DD.
function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Diri ihan-ay ang booking base sa petsa ug oras.
function sortBookings(list: VetBookingDetail[]) {
  return [...list].sort((left, right) => {
    const dateCompare = String(left.date || '').localeCompare(String(right.date || ''));
    if (dateCompare !== 0) return dateCompare;
    const timeCompare = String(left.time || '').localeCompare(String(right.time || ''));
    if (timeCompare !== 0) return timeCompare;
    return Number(left.id) - Number(right.id);
  });
}

// Diri ang panel sa aktibo nga home service.
export default function ActiveHomeServicesPanel() {
  const { token } = useAuth();
  const layout = useResponsiveLayout();
  const [homeServices, setHomeServices] = useState<VetBookingDetail[]>([]);
  const [walkIns, setWalkIns] = useState<VetBookingDetail[]>([]);
  const [appointments, setAppointments] = useState<VetBookingDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<VetBookingDetail | null>(null);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [resumeBooking, setResumeBooking] = useState<WalkInResumeBooking | null>(null);
  const startingVisitRef = useRef(false);
  const completingVisitRef = useRef(false);

  // Diri ablihan ang inventory para sa booking.
  const openInventoryForBooking = useCallback((booking: VetBookingDetail) => {
    setSelectedBooking(null);
    setResumeBooking(toResumeBooking({ ...booking, status: 'processing' }, 'appointment'));
    setShowInventoryModal(true);
  }, []);

  // Diri kuhaon ang aktibo nga home services.
  const fetchActiveHomeServices = useCallback(async () => {
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
      console.error('Failed to fetch veterinary services:', error);
      setHomeServices([]);
      setWalkIns([]);
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchActiveHomeServices();
  }, [fetchActiveHomeServices]);

  useFocusEffect(
    useCallback(() => {
      fetchActiveHomeServices();
    }, [fetchActiveHomeServices])
  );

  // Diri i-refresh ang home services.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchActiveHomeServices();
    setRefreshing(false);
  }, [fetchActiveHomeServices]);

  const today = todayKey();
  const homeServiceVisits = useMemo(
    () => sortBookings(homeServices.filter((booking) => !booking.date || booking.date >= today)),
    [homeServices, today]
  );
  const assignedClinicAndWalkIns = useMemo(
    () => sortBookings([...appointments, ...walkIns]),
    [appointments, walkIns]
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
          await fetchActiveHomeServices();
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
    [token, fetchActiveHomeServices]
  );

  // Diri i-cancel ang home service uban ang rason.
  const handleCancelHomeService = useCallback(
    async (booking: VetBookingDetail, reason: string) => {
      if (!token) return;

      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/mobile/appointments/${booking.id}/fieldman-cancel`,
          { cancellation_reason: reason },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data?.success) {
          showToast({ type: 'success', message: 'Home Service visit cancelled successfully.' });
          setSelectedBooking(null);
          await fetchActiveHomeServices();
        } else {
          showToast({
            type: 'error',
            message: response.data?.error || 'Failed to cancel visit.',
          });
        }
      } catch (error: any) {
        showToast({
          type: 'error',
          message: error?.response?.data?.error || 'Failed to cancel visit.',
        });
      }
    },
    [token, fetchActiveHomeServices]
  );

  // Diri isira ang inventory modal.
  const handleCloseInventoryModal = useCallback(() => {
    setShowInventoryModal(false);
    setResumeBooking(null);
  }, []);

  // Diri i-refresh human ma-save ang inventory.
  const handleInventorySuccess = useCallback(() => {
    setResumeBooking(null);
    fetchActiveHomeServices();
  }, [fetchActiveHomeServices]);

  // Diri padayonon ang walk-in nga booking.
  const handleContinueWalkIn = useCallback((booking: VetBookingDetail) => {
    setSelectedBooking(null);
    setResumeBooking(toResumeBooking(booking, 'walk_in'));
    setShowInventoryModal(true);
  }, []);

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerStyle={[layout.scrollContent, { paddingTop: 16, paddingBottom: 32 }]}
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
        <Text className="text-[17px] font-extrabold text-slate-800 dark:text-white mb-3">
          Home Services
        </Text>
        {loading ? (
          <LoadingState label="Fetching home services" icon="home" />
        ) : (
          <View className="mb-8">
            {homeServiceVisits.length === 0 ? (
              <TodayEmpty label="No home service today or upcoming" />
            ) : (
              homeServiceVisits.map((booking) => (
                <TodayHomeService
                  key={`home-${booking.id}`}
                  booking={booking}
                  whenLabel={!booking.date || booking.date === today ? 'Today' : 'Upcoming'}
                  onPress={() => setSelectedBooking(booking)}
                />
              ))
            )}
          </View>
        )}

        <Text className="text-[17px] font-extrabold text-slate-800 dark:text-white mb-1">
          Assigned to you
        </Text>
        <Text className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Clinical appointments and walk-ins
        </Text>
        {!loading && assignedClinicAndWalkIns.length === 0 ? (
          <View className="bg-white dark:bg-slate-800 rounded-3xl p-6 items-center border border-slate-100 dark:border-slate-700">
            <Text className="text-sm font-semibold text-slate-600 dark:text-slate-300 text-center">
              No clinical appointments or walk-ins assigned to you
            </Text>
          </View>
        ) : (
          <View>
            {assignedClinicAndWalkIns.map((booking) => (
              <FieldmanBookingCard
                key={`assigned-${booking.booking_type}-${booking.id}`}
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
        onContinueWalkIn={handleContinueWalkIn}
        onStartAppointment={handleMarkHomeServiceOngoing}
        onContinueAppointment={handleMarkHomeServiceOngoing}
        onCancelAppointment={handleCancelHomeService}
        onCompleteHomeService={handleCompleteHomeService}
      />

      <WalkInFormModal
        visible={showInventoryModal}
        token={token}
        onClose={handleCloseInventoryModal}
        onSuccess={handleInventorySuccess}
        resumeBooking={resumeBooking}
      />
    </>
  );
}

// Diri ipakita kung walay booking karon.
function TodayEmpty({ label }: { label: string }) {
  return (
    <View className="rounded-3xl border border-slate-100 bg-white px-4 py-6 dark:border-slate-700 dark:bg-slate-800">
      <Text className="text-sm text-center text-slate-500 dark:text-slate-400">{label}</Text>
    </View>
  );
}

// Diri ang card sa home service karong adlawa.
function TodayHomeService({
  booking,
  whenLabel,
  onPress,
}: {
  booking: VetBookingDetail;
  whenLabel: 'Today' | 'Upcoming';
  onPress: () => void;
}) {
  const latitude = Number(booking.meeting_latitude);
  const longitude = Number(booking.meeting_longitude);
  const hasMap =
    booking.meeting_latitude != null
    && booking.meeting_longitude != null
    && Number.isFinite(latitude)
    && Number.isFinite(longitude);
  const placeName = isMeaningfulMeetingPlaceLabel(booking.meeting_place_label)
    ? String(booking.meeting_place_label).trim()
    : booking.user?.name || 'Client';

  return (
    <View className="mb-4">
      <View className="mb-2 flex-row">
        <View className={`rounded-full px-2.5 py-1 ${whenLabel === 'Today' ? 'bg-teal' : 'bg-navy'}`}>
          <Text className="text-[10px] font-bold text-white">{whenLabel}</Text>
        </View>
      </View>
      <FieldmanBookingCard booking={booking} onPress={onPress} flush />
      <View className="mt-2 overflow-hidden rounded-3xl border border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
        {hasMap ? (
          <MeetingPlaceMap
            coordinate={{ latitude, longitude }}
            editable={false}
            height={200}
            showUserLocation={false}
            showRouteLine
            markerTitle={placeName}
          />
        ) : (
          <Text className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">
            No map pin for this client yet.
          </Text>
        )}
      </View>
    </View>
  );
}
