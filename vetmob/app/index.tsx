import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { getHomeRoute } from '@/utils/auth-routing';

// Diri i-redirect ang user base sa login ug role.
export default function Index() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated) {
    return <Redirect href={getHomeRoute(user)} />;
  }

  return <Redirect href="/(auth)/login" />;
}
