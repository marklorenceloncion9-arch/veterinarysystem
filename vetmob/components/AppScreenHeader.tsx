import { View, type ViewProps } from 'react-native';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type AppScreenHeaderProps = ViewProps & {
  extraPaddingBottom?: number;
  showFieldmanAccent?: boolean;
};

/**
 * Light top area shared by every screen: sits on the canvas background with no
 * coloured band, so titles and search fields read as part of the page.
 */
// Diri ang header sa screen.
export function AppScreenHeader({
  children,
  extraPaddingBottom = 0,
  style,
  ...props
}: AppScreenHeaderProps) {
  const layout = useResponsiveLayout();

  return (
    <View
      style={[
        {
          paddingTop: layout.headerPaddingTop,
          paddingBottom: 10 + extraPaddingBottom,
          paddingHorizontal: layout.gutter,
        },
        style,
      ]}
      {...props}
    >
      <View style={layout.constrain}>{children}</View>
    </View>
  );
}
