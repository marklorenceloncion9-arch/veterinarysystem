import { View, type ViewProps } from 'react-native';
import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/contexts/theme-context';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

// Diri ang frame sa screen nga naay padding sa ubos.
export function ScreenFrame({ children, style, ...props }: ViewProps) {
  const { bottomInset } = useResponsiveLayout();
  const { theme } = useAppTheme();
  const backgroundColor = Colors[theme === 'dark' ? 'dark' : 'light'].background;

  return (
    <View
      style={[{ flex: 1, backgroundColor, paddingBottom: bottomInset }, style]}
      {...props}
    >
      {children}
    </View>
  );
}
