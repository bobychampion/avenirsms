import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UsePWAInstall {
  canInstall: boolean;
  isIOS: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<void>;
}

/**
 * Handles PWA install prompt for Android (beforeinstallprompt)
 * and detects iOS Safari for manual install instructions.
 */
export function usePWAInstall(): UsePWAInstall {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  const isIOS = typeof window !== 'undefined' &&
    /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    !(navigator as any).standalone;

  const isInstalled = typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return { canInstall, isIOS, isInstalled, promptInstall };
}
