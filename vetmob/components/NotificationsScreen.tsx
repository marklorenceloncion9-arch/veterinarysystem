import { memo, useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppScreenHeader } from '@/components/AppScreenHeader';
import { LoadingState } from '@/components/LoadingState';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useNotifications, type NotificationItem } from '@/contexts/notification-context';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

const NO_BOUNCE_SCROLL = {
  bounces: false,
  overScrollMode: 'never' as const,
};

// Diri i-format ang petsa sa booking.
function formatBookingDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Diri pilion ang icon ug kolor sa notification.
function notificationIcon(item: NotificationItem): { name: keyof typeof MaterialIcons.glyphMap; color: string } {
  const type = item.type || '';
  const isHome = item.data?.booking_type === 'home_service' || type.includes('home_service');

  if (type.includes('cancelled')) return { name: 'cancel', color: '#dc2626' };
  if (type.includes('walk_in')) return { name: 'directions-walk', color: '#1F7A8C' };
  if (type.includes('today')) return { name: isHome ? 'home' : 'today', color: '#1F7A8C' };
  if (isHome) return { name: 'home', color: '#1F7A8C' };
  if (type.includes('clinic') || type.includes('appointment')) return { name: 'event-available', color: '#1F7A8C' };
  return { name: 'notifications', color: '#1F7A8C' };
}

// Diri ang usa ka row sa notification.
const NotificationRow = memo(function NotificationRow({
  item,
  expanded,
  onPress,
}: {
  item: NotificationItem;
  expanded: boolean;
  onPress: (item: NotificationItem) => void;
}) {
  const icon = notificationIcon(item);
  const bookingDateLabel = item.data?.schedule_date_formatted || formatBookingDate(item.data?.booking_date);

  return (
    <Pressable
      onPress={() => onPress(item)}
      className={`rounded-2xl px-3 py-2.5 mb-2 border ${
        item.is_read
          ? 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700'
          : 'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800'
      }`}
    >
      <View className="flex-row items-start">
        <View
          className="w-8 h-8 rounded-lg items-center justify-center mr-2.5"
          style={{ backgroundColor: `${icon.color}1a` }}
        >
          <MaterialIcons name={icon.name} size={16} color={icon.color} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <ThemedText className="text-sm font-semibold text-slate-800 dark:text-white flex-1" numberOfLines={1}>
              {item.title}
            </ThemedText>
            {!item.is_read ? <View className="w-2 h-2 rounded-full bg-teal-600 ml-2" /> : null}
          </View>
          <ThemedText
            className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-4"
            numberOfLines={expanded ? undefined : 1}
          >
            {item.message}
          </ThemedText>
          {expanded ? (
            <View>
              {item.data?.pet_name ? (
                <View className="flex-row items-center mt-2">
                  <MaterialIcons name="pets" size={12} color="#64748b" />
                  <ThemedText className="text-[11px] text-slate-500 ml-1">{item.data.pet_name}</ThemedText>
                </View>
              ) : null}
              {item.data?.services && item.data.services.length > 0 ? (
                <View className="flex-row flex-wrap gap-1.5 mt-2">
                  {item.data.services.map((service, index) => (
                    <View
                      key={`${item.id}-service-${index}`}
                      className="rounded-full bg-teal-50 dark:bg-teal-900/20 px-2 py-0.5 border border-teal-100 dark:border-teal-800"
                    >
                      <ThemedText className="text-[11px] font-medium text-teal-800 dark:text-teal-200">
                        {service}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              ) : null}
              <View className="flex-row items-center justify-between mt-2">
                {bookingDateLabel ? (
                  <ThemedText className="text-[11px] text-slate-500">{bookingDateLabel}</ThemedText>
                ) : (
                  <View />
                )}
                {item.created_at_human ? (
                  <ThemedText className="text-[11px] text-slate-400">{item.created_at_human}</ThemedText>
                ) : null}
              </View>
              <ThemedText className="text-[11px] font-semibold text-teal-700 dark:text-teal-300 mt-2">
                Tap to close
              </ThemedText>
            </View>
          ) : (
            <ThemedText className="text-[11px] text-teal-700 dark:text-teal-300 mt-1">
              Tap to read
            </ThemedText>
          )}
        </View>
      </View>
    </Pressable>
  );
});

// Diri ang screen sa lista sa notification.
export default function NotificationsScreen({ variant }: { variant: 'owner' | 'fieldman' }) {
  const layout = useResponsiveLayout();
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
  } = useNotifications();
  const [opening, setOpening] = useState(notifications.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const hasNotificationsRef = useRef(notifications.length > 0);
  hasNotificationsRef.current = notifications.length > 0;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!hasNotificationsRef.current) setOpening(true);
      fetchNotifications().finally(() => {
        if (active) setOpening(false);
      });
      return () => {
        active = false;
      };
    }, [fetchNotifications])
  );

  // Diri i-refresh ang mga notification.
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  // Diri ablihan ug markahan nga nabasa ang notification.
  const openItem = useCallback((item: NotificationItem) => {
    setExpandedId((current) => (current === item.id ? null : item.id));
    if (!item.is_read) {
      setTimeout(() => markNotificationRead(item), 0);
    }
  }, [markNotificationRead]);

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      <AppScreenHeader showFieldmanAccent={variant === 'fieldman'}>
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">Updates</Text>
            <Text className={`${layout.isCompact ? 'text-[24px]' : 'text-[28px]'} font-extrabold text-navy mt-1`}>
              Notifications
            </Text>
            <Text className="text-sm text-muted mt-1" numberOfLines={1}>
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <TouchableOpacity
              onPress={markAllNotificationsRead}
              className="rounded-full bg-teal px-4 items-center justify-center"
              style={{ height: 40 }}
            >
              <Text className="text-[13px] font-bold text-white">Mark all</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </AppScreenHeader>

      <ScrollView
        className="flex-1"
        contentContainerStyle={[layout.scrollContent, { paddingTop: 16 }]}
        showsVerticalScrollIndicator={false}
        {...NO_BOUNCE_SCROLL}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1F7A8C']} tintColor="#1F7A8C" />
        }
      >
        {opening && notifications.length === 0 ? (
          <LoadingState label="Loading notifications" icon="notifications" />
        ) : notifications.length === 0 ? (
          <View className="bg-white dark:bg-slate-800 rounded-2xl p-8 items-center border border-slate-100 dark:border-slate-700">
            <MaterialIcons name="notifications-none" size={56} color="#cbd5e1" />
            <ThemedText className="text-base font-semibold text-slate-700 dark:text-slate-200 mt-4 text-center">
              No notifications yet
            </ThemedText>
            <ThemedText className="text-sm text-slate-400 mt-2 text-center">
              {variant === 'fieldman'
                ? 'Assigned home services, walk-ins, and clinic appointments will appear here.'
                : 'Updates about your visits will appear here.'}
            </ThemedText>
          </View>
        ) : (
          <>
            <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              {notifications.length} {notifications.length === 1 ? 'update' : 'updates'}
            </Text>
            {notifications.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                expanded={expandedId === item.id}
                onPress={openItem}
              />
            ))}
          </>
        )}
        <View className="h-6" />
      </ScrollView>
    </ThemedView>
  );
}
