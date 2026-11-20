import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { API_BASE_URL } from '@/config/api';
import { createEcho } from '@/utils/echo';
import { showToast } from '@/components/Toast';
import { useAuth } from '@/contexts/auth-context';
export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  data?: {
    appointment_id?: number;
    pet_name?: string;
    booking_date?: string;
    booking_time?: string;
    booking_type?: string;
    booking_type_label?: string;
    status?: string;
    cancellation_reason?: string;
    schedule_date?: string;
    schedule_date_formatted?: string;
    services?: string[];
    barangays?: string[];
  } | null;
  is_read: boolean;
  created_at: string;
  created_at_human?: string;
}

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (notification: NotificationItem) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// Diri ang provider sa notifications.
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, user, refreshUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const echoRef = useRef<ReturnType<typeof createEcho> | null>(null);

  // Diri kuhaon ang mga notification.
  const fetchNotifications = useCallback(async () => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/mobile/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.unread_count || 0);
    } catch (error) {
      console.warn('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Diri markahan nga nabasa ang notification.
  const markNotificationRead = useCallback(
    async (notification: NotificationItem) => {
      if (notification.is_read || !token) return;

      setNotifications((prev) =>
        prev.map((item) => (item.id === notification.id ? { ...item, is_read: true } : item))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await axios.post(
          `${API_BASE_URL}/api/mobile/notifications/${notification.id}/read`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } catch (error) {
        console.warn('Failed to mark notification read:', error);
        fetchNotifications();
      }
    },
    [token, fetchNotifications]
  );

  // Diri markahan nga nabasa tanan notification.
  const markAllNotificationsRead = useCallback(async () => {
    if (!token) return;

    setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    setUnreadCount(0);

    try {
      await axios.post(
        `${API_BASE_URL}/api/mobile/notifications/read-all`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.warn('Failed to mark all notifications read:', error);
      fetchNotifications();
    }
  }, [token, fetchNotifications]);

  useEffect(() => {
    if (!token || !user?.id) return;
    fetchNotifications();
  }, [token, user, fetchNotifications]);

  useEffect(() => {
    if (!token || !user?.id) return;

    let echo: ReturnType<typeof createEcho> | null = null;
    try {
      echo = createEcho(token);
      echoRef.current = echo;
      echo.private(`App.Models.User.${user.id}`).listen('.notification.created', (event: any) => {
        fetchNotifications();

        const notifType = event?.type || '';
        const message = event?.message || event?.title || 'You have a new update.';
        const isCancelled =
          notifType.includes('cancelled') || notifType === 'appointment_cancelled';
        const isToday = notifType.includes('today');
        const isRegistrationDecision =
          notifType === 'client_registration_approved' ||
          notifType === 'client_registration_rejected';

        if (isRegistrationDecision) {
          refreshUser();
        }

        // Approval celebration modal handles the approved case; skip duplicate toast.
        if (notifType === 'client_registration_approved') {
          return;
        }

        showToast({
          type: isCancelled || notifType === 'client_registration_rejected' ? 'error' : isToday ? 'info' : 'success',
          message,
          duration: 5000,
        });
      });
    } catch (error) {
      console.warn('Failed to connect to Pusher:', error);
    }

    return () => {
      try {
        echo?.leave(`App.Models.User.${user.id}`);
        echo?.disconnect();
      } catch {
        // ignore teardown errors
      }
      echoRef.current = null;
    };
  }, [token, user?.id, user, fetchNotifications, refreshUser]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// Diri gamiton ang notification context.
export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
