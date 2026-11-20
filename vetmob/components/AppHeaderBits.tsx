import type { ReactNode } from 'react';
import { Text, TextInput, TouchableOpacity, View, type ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Brand } from '@/constants/theme';

// Diri ang icon button sa header.
export function HeaderIconButton({
  icon,
  onPress,
  badgeCount = 0,
  children,
  accessibilityLabel,
}: {
  icon?: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  badgeCount?: number;
  children?: ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-11 w-11 rounded-full items-center justify-center overflow-hidden border border-line bg-white"
    >
      {children ?? <MaterialIcons name={icon ?? 'more-horiz'} size={21} color={Brand.navy} />}
      {badgeCount > 0 ? (
        <View className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 items-center justify-center border-2 border-white">
          <Text className="text-[9px] font-bold text-white">{badgeCount > 9 ? '9+' : badgeCount}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// Diri ang titulo sa header.
export function HeaderTitle({
  eyebrow,
  title,
  subtitle,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <View>
      {eyebrow ? (
        <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted">{eyebrow}</Text>
      ) : null}
      <Text
        className={`${compact ? 'text-[24px]' : 'text-[28px]'} font-extrabold text-navy mt-1`}
        numberOfLines={1}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text className="text-sm text-muted mt-1" numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

// Diri ang search bar sa header.
export function HeaderSearch({
  value,
  onChangeText,
  placeholder,
  style,
}: {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  style?: ViewStyle;
}) {
  return (
    <View
      className="flex-row items-center rounded-full border border-line bg-white px-4"
      style={[{ minHeight: 52 }, style]}
    >
      <MaterialIcons name="search" size={20} color={Brand.muted} />
      <TextInput
        className="flex-1 ml-2.5 text-[15px]"
        style={{ color: Brand.ink }}
        placeholder={placeholder}
        placeholderTextColor={Brand.muted}
        value={value}
        onChangeText={onChangeText}
        selectionColor={Brand.teal}
        underlineColorAndroid="transparent"
      />
      {value.length > 0 ? (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={10} className="ml-1 p-1">
          <MaterialIcons name="close" size={18} color={Brand.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Diri ang heading sa section nga naay action.
export function SectionHeading({
  title,
  actionLabel,
  onAction,
  className = '',
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <View className={`flex-row items-center justify-between mb-3 ${className}`}>
      <Text className="text-[18px] font-extrabold text-navy" numberOfLines={1}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8}>
          <Text className="text-[13px] font-bold text-teal">{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Diri ang chip para sa filter.
export function FilterChip({
  label,
  count,
  selected,
  icon,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  icon?: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`flex-row items-center gap-1.5 rounded-full border px-4 ${
        selected ? 'bg-navy border-navy' : 'bg-white border-line'
      }`}
      style={{ height: 40 }}
    >
      {icon ? (
        <MaterialIcons name={icon} size={16} color={selected ? '#FFFFFF' : Brand.muted} />
      ) : null}
      <Text className={`text-[13px] font-bold ${selected ? 'text-white' : 'text-ink'}`} numberOfLines={1}>
        {label}
      </Text>
      {typeof count === 'number' ? (
        <View className={`min-w-[20px] items-center rounded-full px-1.5 py-0.5 ${selected ? 'bg-white/25' : 'bg-canvas'}`}>
          <Text className={`text-[11px] font-bold ${selected ? 'text-white' : 'text-muted'}`}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
