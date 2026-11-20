import { useEffect } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Brand } from '@/constants/theme';

type LoadingStateProps = {
  label?: string;
  hint?: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  compact?: boolean;
  style?: ViewStyle;
};

// Diri ang tuldok nga nag-bounce.
function BounceDot({ delay }: { delay: number }) {
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 300, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [delay, offset]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <Animated.View
      style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: Brand.teal }, style]}
    />
  );
}

// Diri ang loading screen nga naay text.
export function LoadingState({
  label = 'Loading...',
  hint,
  icon = 'pets',
  compact = false,
  style,
}: LoadingStateProps) {
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);
  const size = compact ? 56 : 72;

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1100, easing: Easing.linear }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 550, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [pulse, rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center', paddingVertical: compact ? 24 : 40 }, style]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 4,
            borderColor: '#D6EAEF',
          }}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 4,
              borderColor: 'transparent',
              borderTopColor: Brand.teal,
              borderRightColor: Brand.accent,
            },
            ringStyle,
          ]}
        />
        <Animated.View
          style={[
            {
              width: size - 22,
              height: size - 22,
              borderRadius: (size - 22) / 2,
              backgroundColor: Brand.teal,
              alignItems: 'center',
              justifyContent: 'center',
            },
            iconStyle,
          ]}
        >
          <MaterialIcons name={icon} size={compact ? 18 : 24} color="#ffffff" />
        </Animated.View>
      </View>

      <View
        style={{
          marginTop: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: '#EEF6F8',
          borderRadius: 999,
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: Brand.navy }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 12 }}>
          <BounceDot delay={0} />
          <BounceDot delay={120} />
          <BounceDot delay={240} />
        </View>
      </View>
      {hint ? (
        <Text style={{ marginTop: 8, fontSize: 12, color: Brand.muted, textAlign: 'center' }}>{hint}</Text>
      ) : null}
    </View>
  );
}
