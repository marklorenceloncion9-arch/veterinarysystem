import { Image, Text, View, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { Brand } from '@/constants/theme';
import { MIN_SPLASH_MS } from '@/contexts/auth-context';

const STATUS_STEPS: { until: number; label: string }[] = [
  { until: 35, label: 'Checking your account' },
  { until: 70, label: 'Fetching your records' },
  { until: 99, label: 'Almost ready' },
  { until: 100, label: 'Welcome back!' },
];

// Diri ang splash screen samtang nag-load ang auth.
export function AuthSplashScreen() {
  const { width } = useWindowDimensions();
  const barWidth = Math.min(width - 96, 260);
  const barWidthSV = useSharedValue(barWidth);
  const progress = useSharedValue(0);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: MIN_SPLASH_MS,
      easing: Easing.inOut(Easing.quad),
    });
  }, [progress]);

  useEffect(() => {
    barWidthSV.value = barWidth;
  }, [barWidth, barWidthSV]);

  useAnimatedReaction(
    () => Math.min(100, Math.round(progress.value * 100)),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setPercent)(current);
      }
    },
    [progress]
  );

  const fillStyle = useAnimatedStyle(() => ({
    width: progress.value * barWidthSV.value,
  }));

  const status = STATUS_STEPS.find((step) => percent <= step.until) ?? STATUS_STEPS[STATUS_STEPS.length - 1];

  return (
    <View style={styles.overlay}>
      <View style={styles.brand}>
        <View style={styles.logoCircle}>
          <Image
            source={require('../assets/images/elsalvet-logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
          ALAGANG ELSALVET
        </Text>
        <Text style={styles.subtitle}>El Salvador Veterinary Clinic</Text>
      </View>

      <View style={[styles.loader, { width: barWidth }]}>
        <View style={styles.statusRow}>
          <Text style={styles.status}>{status.label}</Text>
          <Text style={styles.percent}>{percent}%</Text>
        </View>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fillStyle]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: Brand.navy,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  brand: {
    alignItems: 'center',
  },
  logoCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: Brand.teal,
  },
  logoImage: {
    width: 82,
    height: 82,
  },
  title: {
    marginTop: 16,
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#D6EAEF',
  },
  loader: {
    marginTop: 28,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
    color: '#D6EAEF',
  },
  percent: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.6)',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: Brand.teal,
  },
});
