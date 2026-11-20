import { Tabs, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { FloatingNavBar } from '@/components/FloatingNavBar';
import { ScreenFrame } from '@/components/ScreenFrame';
import { useAuth } from '@/contexts/auth-context';
import { NotificationProvider } from '@/contexts/notification-context';
import { isFieldman } from '@/utils/auth-routing';
import { TAB_SCREEN_OPTIONS } from '@/utils/tabTransition';

// Diri ang tab layout sa fieldman.
export default function FieldmanTabLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    if (!isFieldman(user)) {
      router.replace('/(tabs)');
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
          tabBarIcon: ({ color }) => <MaterialIcons name="home" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="vet-services"
        options={{
          title: 'Vet Services',
          tabBarIcon: ({ color }) => <MaterialIcons name="medical-services" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="home-services"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <MaterialIcons name="history" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarIcon: ({ color }) => <MaterialIcons name="notifications" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <MaterialIcons name="person" size={26} color={color} />,
        }}
      />
    </Tabs>
    <FloatingNavBar variant="fieldman" />
    </ScreenFrame>
    </NotificationProvider>
  );
}
