import { useMemo } from 'react';
import { Platform, StatusBar, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const COMPACT_WIDTH = 375;
const TABLET_WIDTH = 768;
const CONTENT_MAX_WIDTH = 720;
const ANDROID_NAV_FALLBACK = 48;
const ANDROID_STATUS_MIN = 36;
const IOS_STATUS_FALLBACK = 47;
const FLOATING_NAV_BAR_HEIGHT = 62;
export const FLOATING_NAV_HEIGHT = FLOATING_NAV_BAR_HEIGHT;

// Diri kwentahon ang responsive layout sa screen.
export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const isCompact = width < COMPACT_WIDTH;
    const isTablet = width >= TABLET_WIDTH;
    const gutter = isTablet ? 24 : isCompact ? 12 : 16;
    const headerGutter = isTablet ? 28 : isCompact ? 16 : 24;
    const androidStatus = Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0;
    // Android edge-to-edge often reports insets.top as 0 while the status bar
    // (clock, battery, notifications) still overlays the screen.
    const topInset =
      insets.top > 0
        ? Math.max(insets.top, androidStatus)
        : Platform.OS === 'android'
          ? Math.max(androidStatus, ANDROID_STATUS_MIN)
          : Platform.OS === 'ios'
            ? IOS_STATUS_FALLBACK
            : 0;
    const headerPaddingTop = topInset + (isCompact ? 4 : 6);
    const headerPaddingBottom = isCompact ? 12 : 14;
    const contentMaxWidth = isTablet ? CONTENT_MAX_WIDTH : undefined;
    const gridColumns = isTablet ? 3 : 2;
    const gridGap = 12;
    const contentWidth = Math.min(width, contentMaxWidth ?? width) - gutter * 2;
    const gridItemWidth = (contentWidth - gridGap * (gridColumns - 1)) / gridColumns;
    const bottomInset =
      insets.bottom > 0
        ? insets.bottom
        : Platform.OS === 'android'
          ? ANDROID_NAV_FALLBACK
          : 0;

    const constrain: ViewStyle = contentMaxWidth
      ? { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' }
      : { width: '100%' };

    // Room a scroll view must leave so the floating bottom nav never covers content.
    // ScreenFrame already pads for the system nav, so only the bar itself counts.
    const tabBarSpace = FLOATING_NAV_BAR_HEIGHT + 24;

    return {
      width,
      height,
      insets,
      topInset,
      bottomInset,
      isCompact,
      isTablet,
      gutter,
      headerGutter,
      headerPaddingTop,
      headerPaddingBottom,
      contentMaxWidth,
      gridColumns,
      gridGap,
      gridItemWidth,
      constrain,
      tabBarSpace,
      contentStyle: {
        ...constrain,
        paddingHorizontal: gutter,
      } as ViewStyle,
      scrollContent: {
        ...constrain,
        paddingHorizontal: gutter,
        paddingBottom: 24 + tabBarSpace,
      } as ViewStyle,
      sheetMaxHeight: Math.round(height * 0.9),
      modalGutter: isCompact ? 16 : 24,
      titleClass: isCompact ? 'text-xl' : 'text-2xl',
    };
  }, [height, insets.bottom, insets.top, width]);
}
