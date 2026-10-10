import { useEffect, useState } from 'react';
import { LogBox, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '@/contexts/AuthContext';
import MobileLoginGate from '@/components/MobileLoginGate';
import MobileUpdateStartupNotifier from '@/components/MobileUpdateStartupNotifier';
import SmartBillAutoSync from '@/components/SmartBillAutoSync';
import AppStartupLoader from '@/components/AppStartupLoader';
import { ShopNavigationProvider } from '@/contexts/ShopNavigationContext';
import { installReadableTypography } from '@/utils/readableTypography';
import { Theme } from '@/constants/colors';

installReadableTypography();

// React Native Web afișează în dezvoltare câteva avertismente provenite din
// adaptoarele Expo/Reanimated, deși proprietățile sunt valide pe Android/iOS.
// Le ascundem doar în preview-ul web, ca să nu acopere interfața verificată.
if (__DEV__ && Platform.OS === 'web') {
  // Browserul local este folosit pentru verificarea vizuală a aplicației
  // native; avertismentele adaptoarelor RN Web rămân în consola dezvoltatorului.
  LogBox.ignoreAllLogs(true);
}

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useFrameworkReady();
  const [startupStartedAt] = useState(() => Date.now());
  const [appMounted, setAppMounted] = useState(false);
  const [showStartupLoader, setShowStartupLoader] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;

    const elapsed = Date.now() - startupStartedAt;
    const delay = Math.max(60 - elapsed, 0);
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const mountTimer = setTimeout(() => {
      setAppMounted(true);
      hideTimer = setTimeout(() => setShowStartupLoader(false), 20);
    }, delay);

    return () => {
      clearTimeout(mountTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [fontsLoaded, fontError, startupStartedAt]);

  return (
    <GestureHandlerRootView style={styles.root}>
      {appMounted ? (
        <AuthProvider>
          <MobileLoginGate>
            <ShopNavigationProvider>
              <ShopApp />
            </ShopNavigationProvider>
          </MobileLoginGate>
        </AuthProvider>
      ) : null}
      {showStartupLoader ? <AppStartupLoader overlay={appMounted} /> : null}
    </GestureHandlerRootView>
  );
}

function ShopApp() {
  return (
    <>
      <MobileUpdateStartupNotifier />
      <SmartBillAutoSync />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Theme.colors.transparent },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="order/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.colors.background.canvas,
  },
});
