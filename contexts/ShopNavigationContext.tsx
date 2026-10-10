import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';

type ShopNavigationContextValue = {
  pendingShopOrderId: string | null;
  openShopOrder: (orderId: string) => void;
  consumePendingShopOrder: () => void;
};

const ShopNavigationContext = createContext<ShopNavigationContextValue | null>(null);

function orderIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/^cubisshop:\/\/(?:order|orders)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:[/?#]|$)/i);
  return match?.[1]?.toLowerCase() || null;
}

export function ShopNavigationProvider({ children }: { children: React.ReactNode }) {
  const [pendingShopOrderId, setPendingShopOrderId] = useState<string | null>(null);

  const openShopOrder = useCallback((orderId: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return;
    setPendingShopOrderId(orderId.toLowerCase());
  }, []);

  const consumePendingShopOrder = useCallback(() => setPendingShopOrderId(null), []);

  useEffect(() => {
    const receive = (url: string | null | undefined) => {
      const orderId = orderIdFromUrl(url);
      if (orderId) openShopOrder(orderId);
    };
    void Linking.getInitialURL().then(receive).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => receive(url));
    return () => subscription.remove();
  }, [openShopOrder]);

  const value = useMemo(
    () => ({ pendingShopOrderId, openShopOrder, consumePendingShopOrder }),
    [consumePendingShopOrder, openShopOrder, pendingShopOrderId]
  );

  return <ShopNavigationContext.Provider value={value}>{children}</ShopNavigationContext.Provider>;
}

export function useShopNavigation() {
  const value = useContext(ShopNavigationContext);
  if (!value) throw new Error('useShopNavigation must be used inside ShopNavigationProvider');
  return value;
}
