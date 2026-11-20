import { Easing, type Animated } from 'react-native';

export const TAB_TRANSITION_DURATION = 220;

export const TAB_TRANSITION_SPEC = {
  animation: 'timing' as const,
  config: {
    duration: TAB_TRANSITION_DURATION,
    easing: Easing.inOut(Easing.cubic),
  },
};

// Diri ang fade kung mag-ilis og tab.
export function tabSceneStyleInterpolator({
  current,
}: {
  current: { progress: Animated.Value };
}) {
  return {
    sceneStyle: {
      opacity: current.progress.interpolate({
        inputRange: [-1, 0, 1],
        outputRange: [0, 1, 0],
        extrapolate: 'clamp',
      }),
    },
  };
}

export const TAB_SCREEN_OPTIONS = {
  headerShown: false,
  lazy: false,
  freezeOnBlur: true,
  animation: 'fade' as const,
  transitionSpec: TAB_TRANSITION_SPEC,
  sceneStyleInterpolator: tabSceneStyleInterpolator,
};
