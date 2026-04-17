import { useState, useEffect } from 'react';

/**
 * Returns true when the viewport width is < 1024px (tablet/mobile).
 * Uses matchMedia for accurate, jank-free resize detection.
 */
export function useMobile(): boolean {
  const query = '(max-width: 1023px)';
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
