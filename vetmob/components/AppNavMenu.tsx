import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { showToast } from '@/components/Toast';
import { Brand } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useNotifications } from '@/contexts/notification-context';
import { useAppTheme } from '@/contexts/theme-context';

type NavItem = {
  href: string;
  label: string;
  hint: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  match: string[];
};

const OWNER_NAV_ITEMS: NavItem[] = [
  {
    href: '/(tabs)',
    label: 'Home',
    hint: 'Welcome and upcoming visits',
    icon: 'home',
    match: ['/', '/index', '/(tabs)', '/(tabs)/index'],
  },
  {
    href: '/(tabs)/animals',
    label: 'Animals',
    hint: 'Your pets and records',
    icon: 'pets',
    match: ['/animals', '/(tabs)/animals'],
  },
  {
    href: '/(tabs)/servicesmob',
    label: 'Services',
    hint: 'Book and track visits',
    icon: 'medical-services',
    match: ['/servicesmob', '/(tabs)/servicesmob'],
  },
  {
    href: '/(tabs)/notifications',
    label: 'Notifications',
    hint: 'Updates about your visits',
    icon: 'notifications',
    match: ['/notifications', '/(tabs)/notifications'],
  },
  {
    href: '/(tabs)/profile',
    label: 'Profile',
    hint: 'Your account details',
    icon: 'person',
    match: ['/profile', '/(tabs)/profile'],
  },
];

const FIELDMAN_NAV_ITEMS: NavItem[] = [
  {
    href: '/(tabs-fm)',
    label: 'Home',
    hint: 'Home services and walk-ins',
    icon: 'home',
    match: ['/', '/index', '/(tabs-fm)', '/(tabs-fm)/index'],
  },
  {
    href: '/(tabs-fm)/vet-services',
    label: 'Vet Services',
    hint: 'Walk-ins and clinic visits',
    icon: 'medical-services',
    match: ['/vet-services', '/(tabs-fm)/vet-services'],
  },
  {
    href: '/(tabs-fm)/home-services',
    label: 'History',
    hint: 'Past visits and reports',
    icon: 'history',
    match: ['/home-services', '/(tabs-fm)/home-services'],
  },
  {
    href: '/(tabs-fm)/notifications',
    label: 'Notifications',
    hint: 'Assigned visits and updates',
    icon: 'notifications',
    match: ['/notifications', '/(tabs-fm)/notifications'],
  },
  {
    href: '/(tabs-fm)/profile',
    label: 'Profile',
    hint: 'Account details',
    icon: 'person',
    match: ['/profile', '/(tabs-fm)/profile'],
  },
];

// Diri susihon kung aktibo ang nav item.
function isItemActive(pathname: string, item: NavItem) {
  return item.match.some((route) => {
    if (route === '/') {
      return pathname === '/' || pathname === '' || pathname === '/index';
    }
    return pathname === route || pathname.endsWith(route);
  });
}

type AppNavMenuButtonProps = {
  variant?: 'owner' | 'fieldman';
};

const OPEN_MS = 320;
const CLOSE_MS = 260;

// Diri ang button ug drawer sa nav menu.
export function AppNavMenuButton({ variant = 'owner' }: AppNavMenuButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout, user } = useAuth();
  const { unreadCount } = useNotifications();
  const { theme } = useAppTheme();
  const isDark = theme === 'dark';
  const { width } = useWindowDimensions();
  const accent = Brand.teal;
  const { topInset, bottomInset } = useResponsiveLayout();
  const drawerWidth = Math.min(304, Math.round(width * 0.82));
  const [visible, setVisible] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutPrompt, setLogoutPrompt] = useState(false);
  const closingRef = useRef(false);
  const afterCloseRef = useRef<(() => void) | null>(null);
  const items = variant === 'fieldman' ? FIELDMAN_NAV_ITEMS : OWNER_NAV_ITEMS;
  const translateX = useSharedValue(-drawerWidth);
  const overlayOpacity = useSharedValue(0);

  const activeHref = useMemo(
    () => items.find((item) => isItemActive(pathname, item))?.href,
    [items, pathname]
  );

  // Diri tapuson ang pagsira sa menu.
  const finishClose = () => {
    setVisible(false);
    closingRef.current = false;
    const after = afterCloseRef.current;
    afterCloseRef.current = null;
    after?.();
  };

  // Diri ablihan ang drawer menu.
  const openMenu = () => {
    closingRef.current = false;
    translateX.value = -drawerWidth;
    overlayOpacity.value = 0;
    setVisible(true);
  };

  useEffect(() => {
    if (!visible) return;
    translateX.value = withTiming(0, {
      duration: OPEN_MS,
      easing: Easing.out(Easing.cubic),
    });
    overlayOpacity.value = withTiming(1, { duration: OPEN_MS - 40 });
  }, [overlayOpacity, translateX, visible]);

  // Diri isira ang drawer menu.
  const closeMenu = (after?: () => void) => {
    if (!visible || closingRef.current) return;
    closingRef.current = true;
    afterCloseRef.current = after ?? null;
    overlayOpacity.value = withTiming(0, { duration: CLOSE_MS });
    translateX.value = withTiming(
      -drawerWidth,
      { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(finishClose)();
        }
      }
    );
  };

  // Diri moadto sa napili nga page.
  const goTo = (href: string) => {
    translateX.value = -drawerWidth;
    overlayOpacity.value = 0;
    closingRef.current = false;
    afterCloseRef.current = null;
    setVisible(false);
    if (href !== activeHref) {
      router.push(href as any);
    }
  };

  // Diri ipakita ang confirm sa logout.
  const confirmLogout = () => {
    closeMenu(() => setLogoutPrompt(true));
  };

  // Diri ang tinuod nga pag-logout.
  const runLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setLogoutPrompt(false);
      showToast({ type: 'success', message: 'Logged out successfully' });
    } catch {
      showToast({ type: 'error', message: 'Failed to logout. Please try again.' });
    } finally {
      setLoggingOut(false);
    }
  };

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <>
      <TouchableOpacity
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel="Open pages menu"
        className="h-11 w-11 rounded-full items-center justify-center"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <View className="items-center justify-center">
          <View style={{ width: 18, height: 2.5, borderRadius: 99, backgroundColor: Brand.teal, marginBottom: 4 }} />
          <View style={{ width: 18, height: 2.5, borderRadius: 99, backgroundColor: Brand.teal, marginBottom: 4 }} />
          <View style={{ width: 18, height: 2.5, borderRadius: 99, backgroundColor: Brand.teal }} />
        </View>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={() => closeMenu()}>
        <View style={{ flex: 1 }}>
          <Animated.View style={[{ ...StyleSheet.absoluteFillObject, zIndex: 1 }, overlayStyle]}>
            <Pressable style={{ flex: 1, backgroundColor: 'rgba(16, 38, 60, 0.5)' }} onPress={() => closeMenu()} />
          </Animated.View>

          <Animated.View
            style={[
              {
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: drawerWidth,
                zIndex: 2,
                elevation: 16,
                backgroundColor: isDark ? Brand.navyDark : Brand.canvas,
              },
              drawerStyle,
            ]}
          >
            <View
              style={{
                backgroundColor: Brand.navy,
                paddingTop: topInset + 14,
                paddingHorizontal: 20,
                paddingBottom: 18,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800' }}>Menu</Text>
                  <Text style={{ color: '#D6EAEF', fontSize: 14, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
                    {user?.name?.split(' ')[0] || (variant === 'fieldman' ? 'Field staff' : 'ALAGANG ELSALVET')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => closeMenu()}
                  accessibilityRole="button"
                  accessibilityLabel="Close menu"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.14)',
                  }}
                >
                  <MaterialIcons name="close" size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {items.map((item) => {
                const active = item.href === activeHref;
                return (
                  <TouchableOpacity
                    key={item.href}
                    onPress={() => goTo(item.href)}
                    activeOpacity={0.75}
                    style={{
                      marginBottom: 8,
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: 16,
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      backgroundColor: active ? accent : (isDark ? '#1A3048' : '#FFFFFF'),
                      borderWidth: active ? 0 : 1,
                      borderColor: isDark ? '#2C4A66' : '#D5DEE8',
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? 'rgba(255, 255, 255, 0.22)' : (isDark ? '#16324F' : '#E5F4F7'),
                      }}
                    >
                      <MaterialIcons name={item.icon} size={20} color={active ? '#ffffff' : accent} />
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text
                        style={{
                          color: active ? '#FFFFFF' : (isDark ? '#F8FAFC' : Brand.ink),
                          fontSize: 16,
                          fontWeight: '700',
                        }}
                      >
                        {item.label}
                      </Text>
                      {item.icon === 'notifications' && unreadCount > 0 ? (
                        <View
                          style={{
                            marginTop: 6,
                            alignSelf: 'flex-start',
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            backgroundColor: active ? 'rgba(255,255,255,0.22)' : '#D64545',
                          }}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                            {unreadCount > 9 ? '9+' : unreadCount} unread
                          </Text>
                        </View>
                      ) : (
                        <Text style={{ color: active ? 'rgba(255,255,255,0.86)' : (isDark ? '#CBD5E1' : '#4B5563'), fontSize: 12, marginTop: 2 }}>
                          {item.hint}
                        </Text>
                      )}
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={22}
                      color={active ? '#FFFFFF' : accent}
                    />
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View
              style={{
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: bottomInset + 16,
                gap: 8,
              }}
            >
              <TouchableOpacity
                onPress={confirmLogout}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Logout"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  backgroundColor: isDark ? 'rgba(214, 69, 69, 0.15)' : '#FEF2F2',
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isDark ? 'rgba(214, 69, 69, 0.2)' : '#FEE2E2',
                  }}
                >
                  <MaterialIcons name="logout" size={20} color={Brand.danger} />
                </View>
                <Text style={{ color: Brand.danger, fontSize: 16, fontWeight: '700', marginLeft: 12, flex: 1 }}>
                  Logout
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={logoutPrompt} transparent animationType="fade" onRequestClose={() => setLogoutPrompt(false)}>
        <Pressable
          onPress={() => setLogoutPrompt(false)}
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 28,
            backgroundColor: 'rgba(16, 38, 60, 0.5)',
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 340,
              borderRadius: 20,
              backgroundColor: '#ffffff',
              paddingHorizontal: 22,
              paddingTop: 22,
              paddingBottom: 16,
            }}
          >
            <Text style={{ color: Brand.navy, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>
              Logout
            </Text>
            <Text style={{ color: Brand.muted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 }}>
              Are you sure you want to log out? You will need to sign in again to use the app.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                onPress={() => setLogoutPrompt(false)}
                disabled={loggingOut}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  borderRadius: 12,
                  paddingVertical: 12,
                  backgroundColor: '#F1F5F9',
                  opacity: loggingOut ? 0.6 : 1,
                }}
              >
                <Text style={{ color: Brand.ink, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={runLogout}
                disabled={loggingOut}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  borderRadius: 12,
                  paddingVertical: 12,
                  backgroundColor: Brand.danger,
                }}
              >
                {loggingOut ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: '700' }}>
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={loggingOut && !logoutPrompt} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(22, 50, 79, 0.72)',
          }}
        >
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={{ marginTop: 12, color: '#ffffff', fontSize: 16, fontWeight: '700' }}>
            Logging out
          </Text>
        </View>
      </Modal>
    </>
  );
}
