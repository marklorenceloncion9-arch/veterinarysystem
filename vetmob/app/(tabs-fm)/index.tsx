import { Image, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/contexts/auth-context';
import FieldmanScreenHeader from '@/components/fieldman/FieldmanScreenHeader';
import ActiveHomeServicesPanel from '@/components/fieldman/ActiveHomeServicesPanel';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

const todayLabel = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

// Diri ang home screen sa fieldman.
export default function FieldmanHomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const layout = useResponsiveLayout();
  const firstName = user?.name?.split(' ')[0] || user?.firstname || 'Fieldman';
  const photoUrl = (user as any)?.profile_photo_url || '';
  const avatarSize = layout.isCompact ? 40 : 48;

  return (
    <ThemedView className="flex-1 bg-canvas dark:bg-navy-dark">
      <FieldmanScreenHeader
        eyebrow={todayLabel}
        title={firstName}
        subtitle="Home services"
        extraPaddingBottom={8}
        rightAction={
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => router.push('/(tabs-fm)/profile')}
              className="items-center justify-center overflow-hidden"
              style={{
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: '#E5E7EB',
              }}
            >
              {photoUrl ? (
                <Image
                  source={{ uri: photoUrl }}
                  style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
                  resizeMode="cover"
                />
              ) : (
                <MaterialIcons name="person" size={24} color="#16324F" />
              )}
            </TouchableOpacity>
          </View>
        }
      >
      </FieldmanScreenHeader>
      <ActiveHomeServicesPanel />
    </ThemedView>
  );
}
