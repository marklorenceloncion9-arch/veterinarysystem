import { Stack, useRouter } from 'expo-router';
import { DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { getHomeRoute } from '@/utils/auth-routing';

// Diri ang layout sa auth screens ug redirect kung naka-login na.
export default function AuthLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    router.replace(getHomeRoute(user));
  }, [isAuthenticated, isLoading, router, user]);

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#ffffff' },
        }}
        initialRouteName="login"
      >
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack>
    </ThemeProvider>
  );
}
