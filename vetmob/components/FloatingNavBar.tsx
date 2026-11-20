import { useEffect, useRef, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Brand } from '@/constants/theme';
import { TAB_TRANSITION_DURATION } from '@/utils/tabTransition';
import { useNotifications } from '@/contexts/notification-context';
import { FLOATING_NAV_HEIGHT, useResponsiveLayout } from '@/hooks/use-responsive-layout';

type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  match: string[];
};

const OWNER_ITEMS: NavItem[] = [
  { href: '/(tabs)', label: 'Home', icon: 'home', match: ['/', '/index', '/(tabs)', '/(tabs)/index'] },
  { href: '/(tabs)/animals', label: 'Pets', icon: 'pets', match: ['/animals', '/(tabs)/animals'] },
  {
    href: '/(tabs)/servicesmob',
    label: 'Visits',
    icon: 'medical-services',
    match: ['/servicesmob', '/(tabs)/servicesmob'],
  },
  {
    href: '/(tabs)/notifications',
    label: 'Alerts',
    icon: 'notifications',
    match: ['/notifications', '/(tabs)/notifications'],
  },
  { href: '/(tabs)/profile', label: 'Profile', icon: 'person', match: ['/profile', '/(tabs)/profile'] },
];

const FIELDMAN_ITEMS: NavItem[] = [
  { href: '/(tabs-fm)', label: 'Today', icon: 'home', match: ['/', '/index', '/(tabs-fm)', '/(tabs-fm)/index'] },
  {
    href: '/(tabs-fm)/vet-services',
    label: 'Services',
    icon: 'medical-services',
    match: ['/vet-services', '/(tabs-fm)/vet-services'],
  },
  {
    href: '/(tabs-fm)/home-services',
    label: 'History',
    icon: 'history',
    match: ['/home-services', '/(tabs-fm)/home-services'],
  },
  {
    href: '/(tabs-fm)/notifications',
    label: 'Alerts',
    icon: 'notifications',
    match: ['/notifications', '/(tabs-fm)/notifications'],
  },
  { href: '/(tabs-fm)/profile', label: 'Profile', icon: 'person', match: ['/profile', '/(tabs-fm)/profile'] },
];

// Diri ang floating nav bar sa ubos.
export function FloatingNavBar({ variant = 'owner' }: { variant?: 'owner' | 'fieldman' }) {
  const router = useRouter();
  const pathname = usePathname();
  const layout = useResponsiveLayout();
  const { unreadCount } = useNotifications();
  const items = variant === 'fieldman' ? FIELDMAN_ITEMS : OWNER_ITEMS;

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.match.some((candidate) => candidate === pathname))
  );
  const activeHref = items[activeIndex]?.href ?? items[0].href;
  const [trackWidth, setTrackWidth] = useState(0);
  const pillX = useSharedValue(0);
  const pillReady = useRef(false);
  const pillSize = FLOATING_NAV_HEIGHT - 16;
  const slotWidth = items.length > 0 ? trackWidth / items.length : 0;

  useEffect(() => {
    if (slotWidth <= 0) return;
    const next = slotWidth * activeIndex + (slotWidth - pillSize) / 2;
    if (!pillReady.current) {
      pillX.value = next;
      pillReady.current = true;
      return;
    }
    pillX.value = withTiming(next, {
      duration: TAB_TRANSITION_DURATION,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [activeIndex, pillSize, pillX, slotWidth]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 12,
        alignItems: 'center',
        paddingHorizontal: layout.gutter,
      }}
    >
      <View
        className="flex-row items-center rounded-full bg-navy"
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        style={{
          height: FLOATING_NAV_HEIGHT,
          width: '100%',
          maxWidth: layout.contentMaxWidth ?? 420,
          shadowColor: Brand.navy,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.28,
          shadowRadius: 16,
          elevation: 12,
        }}
      >
        {slotWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: (FLOATING_NAV_HEIGHT - pillSize) / 2,
                width: pillSize,
                height: pillSize,
                borderRadius: pillSize / 2,
                backgroundColor: '#FFFFFF',
              },
              pillStyle,
            ]}
          />
        ) : null}
        {items.map((item) => {
          const active = item.href === activeHref;
          const showBadge = item.icon === 'notifications' && unreadCount > 0;

          return (
            <TouchableOpacity
              key={item.href}
              onPress={() => {
                if (!active) router.navigate(item.href as never);
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              className="flex-1 h-[46px] items-center justify-center rounded-full"
            >
              <View>
                <MaterialIcons
                  name={item.icon}
                  size={22}
                  color={active ? Brand.teal : 'rgba(255, 255, 255, 0.72)'}
                />
                {showBadge ? (
                  <View
                    className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 items-center justify-center"
                  >
                    <Text className="text-[8px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
