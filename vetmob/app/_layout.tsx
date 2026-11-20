import '../global.css';
import 'react-native-gesture-handler';
import { Appearance, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { ThemePreferenceProvider, useAppTheme } from '@/contexts/theme-context';
import { ToastProvider } from '@/components/Toast';
import { AuthSplashScreen } from '@/components/AuthSplashScreen';

// Suppress the pointerEvents deprecation warning from react-native-web
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('props.pointerEvents is deprecated')) {
    return;
  }
  originalWarn.apply(console, args);
};

Appearance.setColorScheme('light');

// Diri ang sulod sa root layout ug navigation.
function RootLayoutContent() {
  const { theme } = useAppTheme();
  const { isLoading } = useAuth();
  const navigationTheme = theme === 'dark' ? DarkTheme : DefaultTheme;

  if (isLoading) {
    return (
      <ThemeProvider value={navigationTheme}>
        <View style={{ flex: 1 }}>
          <AuthSplashScreen />
          <StatusBar style="light" />
        </View>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={navigationTheme}>
      <View style={{ flex: 1 }}>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs-fm)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="light" />
      </View>
    </ThemeProvider>
  );
}

// Diri ang root layout nga nag-wrap sa mga provider.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemePreferenceProvider>
          <AuthProvider>
            <ToastProvider>
              <RootLayoutContent />
            </ToastProvider>
          </AuthProvider>
        </ThemePreferenceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
