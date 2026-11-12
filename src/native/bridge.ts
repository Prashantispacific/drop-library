import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Toast } from '@capacitor/toast';

export const isNative = Capacitor.isNativePlatform();

/**
 * Configure mobile status bar for OLED Dark or True Black and update safe area height.
 */
export async function setupStatusBar(isTrueBlack: boolean) {
  if (!isNative) return;
  try {
    await StatusBar.setStyle({ style: Style.Dark }); // Light text for dark background
    await StatusBar.setBackgroundColor({
      color: isTrueBlack ? '#000000' : '#0A0A0A',
    });

    const info = await StatusBar.getInfo();
    if (info && typeof info.height === 'number' && info.height > 0) {
      document.documentElement.style.setProperty('--status-bar-height', `${info.height}px`);
    } else {
      document.documentElement.style.setProperty('--status-bar-height', '38px');
    }
  } catch (err) {
    console.warn('[NativeBridge] StatusBar error:', err);
    document.documentElement.style.setProperty('--status-bar-height', '38px');
  }
}

/**
 * Trigger subtle haptic feedback on user interaction.
 */
export async function triggerHaptic(type: 'light' | 'success' | 'warning' | 'error' = 'light') {
  if (isNative) {
    try {
      if (type === 'light') {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (type === 'success') {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (type === 'warning') {
        await Haptics.notification({ type: NotificationType.Warning });
      } else if (type === 'error') {
        await Haptics.notification({ type: NotificationType.Error });
      }
      return;
    } catch {
      // Fall through to web vibration
    }
  }

  // Web vibration fallback
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'light') {
        navigator.vibrate(15);
      } else if (type === 'success') {
        navigator.vibrate([15, 30, 25]);
      } else if (type === 'error') {
        navigator.vibrate([40, 40, 40]);
      }
    } catch {
      // Ignore vibration errors
    }
  }
}

/**
 * Open external URL safely via Capacitor InAppBrowser or new browser tab.
 */
export async function openExternalUrl(url: string) {
  if (!url) return;
  if (isNative) {
    try {
      await Browser.open({
        url,
        presentationStyle: 'popover',
        toolbarColor: '#0A0A0A',
      });
      return;
    } catch (e) {
      console.warn('[NativeBridge] Browser open error:', e);
    }
  }

  // Web fallback
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Show a native Android system toast overlay.
 */
export async function showToast(text: string) {
  if (isNative) {
    try {
      await Toast.show({
        text,
        duration: 'short',
        position: 'bottom',
      });
      return;
    } catch (err) {
      console.warn('[NativeBridge] Toast error:', err);
    }
  }
}

/**
 * Minimizes Drop Library and returns user instantly to the calling app (Instagram, YouTube, etc.)
 * Drop Library continues running in the background to unfurl and enrich with Gemini.
 */
export async function returnToPreviousApp(toastMessage?: string) {
  if (isNative) {
    try {
      if (toastMessage) {
        // Fire toast non-blocking so minimizeApp executes without delay
        showToast(toastMessage).catch((e) => console.warn('[NativeBridge] Toast error:', e));
      }
      console.log('[NativeBridge] Minimizing app to return to caller...');
      await App.minimizeApp();
    } catch (err) {
      console.warn('[NativeBridge] minimizeApp error:', err);
    }
  }
}

type BackButtonHandler = () => boolean; // returns true if consumed
const backHandlers: BackButtonHandler[] = [];

/**
 * Registers a hardware back button handler. Handlers are evaluated in LIFO order.
 */
export function registerBackButtonHandler(handler: BackButtonHandler): () => void {
  backHandlers.push(handler);
  return () => {
    const idx = backHandlers.indexOf(handler);
    if (idx !== -1) backHandlers.splice(idx, 1);
  };
}

// Global Android hardware back button listener
if (isNative) {
  try {
    App.addListener('backButton', (event) => {
      // Check if any active modal or drawer wants to consume back
      for (let i = backHandlers.length - 1; i >= 0; i--) {
        const consumed = backHandlers[i]();
        if (consumed) {
          return;
        }
      }

      // If nothing consumed and can't go back, exit app
      if (!event.canGoBack) {
        App.exitApp();
      }
    });
  } catch (err) {
    console.warn('[NativeBridge] Hardware backButton registration error:', err);
  }
}
