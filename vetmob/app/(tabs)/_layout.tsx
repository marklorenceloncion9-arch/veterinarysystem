import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { FloatingNavBar } from '@/components/FloatingNavBar';
import { ScreenFrame } from '@/components/ScreenFrame';
import { useAuth } from '@/contexts/auth-context';
import { NotificationProvider } from '@/contexts/notification-context';
import { isFieldman } from '@/utils/auth-routing';
import { TAB_SCREEN_OPTIONS } from '@/utils/tabTransition';

// Diri ang tab layout sa pet owner.
export default function TabLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    if (isFieldman(user)) {
      router.replace('/(tabs-fm)');
    }
  }, [isAuthenticated, isLoading, router, user]);

  return (
    <NotificationProvider>
    <ScreenFrame>
    <Tabs
      tabBar={() => null}
      detachInactiveScreens={false}
      screenOptions={TAB_SCREEN_OPTIONS}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="animals"
        options={{
          title: 'Animals',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="heart.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="servicesmob"
        options={{
          title: 'Services',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.fill" color={color} />,
        }}
      />
     
    </Tabs>
    <FloatingNavBar variant="owner" />
    </ScreenFrame>
    </NotificationProvider>
  );
}
