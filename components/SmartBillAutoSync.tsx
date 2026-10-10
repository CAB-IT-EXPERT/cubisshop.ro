import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi } from '@/services/shopApi';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

export default function SmartBillAutoSync() {
  const { token } = useAuth();
  const inFlight = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    if (!token) return undefined;

    const refresh = () => {
      if (inFlight.current) return inFlight.current;
      const request = shopApi.getSmartBillSettings(token)
        .catch(() => null)
        .finally(() => {
          inFlight.current = null;
        });
      inFlight.current = request;
      return request;
    };

    void refresh();
    const timer = setInterval(() => void refresh(), DEFAULT_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      inFlight.current = null;
    };
  }, [token]);

  return null;
}
