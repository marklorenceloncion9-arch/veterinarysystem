import { View, Text } from 'react-native';
import { FIELDMAN_THEME } from '@/components/fieldman/fieldmanTheme';
import { AppScreenHeader } from '@/components/AppScreenHeader';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type FieldmanScreenHeaderProps = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  extraPaddingBottom?: number;
  rightAction?: React.ReactNode;
  children?: React.ReactNode;
};

// Diri ang header sa screen sa fieldman.
export default function FieldmanScreenHeader({
  title,
  subtitle,
  eyebrow = 'Field staff',
  extraPaddingBottom = 0,
  rightAction,
  children,
}: FieldmanScreenHeaderProps) {
  const layout = useResponsiveLayout();

  return (
    <AppScreenHeader extraPaddingBottom={extraPaddingBottom}>
      <View className="flex-row items-start">
        <View className="flex-1 pr-3">
          <Text className={`${FIELDMAN_THEME.headerText} text-[11px] font-semibold uppercase tracking-wider`}>
            {eyebrow}
          </Text>
          <Text className={`${FIELDMAN_THEME.headerTitle} ${layout.titleClass} font-bold mt-0.5`} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text className={`${FIELDMAN_THEME.headerText} mt-1 text-sm`} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightAction}
      </View>
      {children}
    </AppScreenHeader>
  );
}
