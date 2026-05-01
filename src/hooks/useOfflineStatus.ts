/**
 * useOfflineStatus
 * ─────────────────
 * Tracks browser online/offline state.
 * Components can use this to show a "You are offline — showing cached data"
 * banner when the network is unavailable.
 *
 * Usage:
 *   const isOffline = useOfflineStatus();
 *   {isOffline && <OfflineBanner />}
 */
import { useEffect, useState } from 'react';

export function useOfflineStatus(): boolean {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline  = () => setIsOffline(false);

    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);

    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  return isOffline;
}
