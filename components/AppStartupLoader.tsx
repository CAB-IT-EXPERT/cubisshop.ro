import { useEffect } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { Colors, Theme } from '@/constants/colors';
import { AppAuroraGlows, appAuroraStyles } from '@/components/AppAuroraBackground';

const appIcon = require('../assets/images/cubis-shop-icon.png');

type AppStartupLoaderProps = {
  overlay?: boolean;
};

export default function AppStartupLoader({
  overlay = false,
}: AppStartupLoaderProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 950, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(360)}
      style={[appAuroraStyles.screen, styles.screen, overlay && styles.overlay]}>
      <StatusBar style="dark" />
      <AppAuroraGlows />
      <Animated.View
        entering={ZoomIn.duration(420).springify().damping(18).stiffness(135)}
        exiting={FadeOut.duration(220)}
        style={styles.spinner}>
        <Animated.View style={[styles.spinnerRing, spinnerStyle]} />
        <Image
          source={appIcon}
          style={styles.logo}
          resizeMode="cover"
          accessibilityLabel="Cubis Shop"
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
  },
  spinner: {
    width: 136,
    height: 136,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 68,
    borderWidth: 3,
    borderColor: Theme.colors.border.default,
    borderTopColor: Colors.orange,
    borderRightColor: Colors.orangeLight,
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: 27,
    backgroundColor: Theme.colors.surface.base,
    boxShadow: '0 12px 34px rgba(21,75,119,0.18)',
  },
});
