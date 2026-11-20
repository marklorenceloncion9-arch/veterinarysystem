import { Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNotifications } from '@/contexts/notification-context';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

// Diri ang notification button sa fieldman.
export default function FieldmanNotificationButton() {
  const layout = useResponsiveLayout();
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const buttonSize = layout.isCompact ? 40 : 48;

  return (
    <View style={{ width: buttonSize, height: buttonSize }}>
      <TouchableOpacity
        onPress={() => router.push('/(tabs-fm)/notifications')}
        className="items-center justify-center"
        style={{
          width: buttonSize,
          height: buttonSize,
          borderRadius: buttonSize / 2,
          backgroundColor: '#FFFFFF',
        }}
      >
        <MaterialIcons name="notifications" size={layout.isCompact ? 20 : 24} color="#1F7A8C" />
      </TouchableOpacity>
      {unreadCount > 0 ? (
        <View
          className="absolute min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 items-center justify-center border border-navy"
          style={{ top: -4, right: -4 }}
        >
          <Text className="text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
