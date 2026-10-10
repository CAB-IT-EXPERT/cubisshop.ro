import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, type Href, useLocalSearchParams } from 'expo-router';
import { Colors, Theme } from '@/constants/colors';
import { useShopNavigation } from '@/contexts/ShopNavigationContext';

export default function OpenShopOrderRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { openShopOrder } = useShopNavigation();

  useEffect(() => {
    const orderId = Array.isArray(id) ? id[0] : id;
    if (orderId) openShopOrder(orderId);
    router.replace('/(tabs)' as Href);
  }, [id, openShopOrder]);

  return <View style={styles.container}><ActivityIndicator color={Colors.orange} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.colors.background.canvas },
});
