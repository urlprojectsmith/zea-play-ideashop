import api from './mockApi';
import { User } from '../types';

function base64UrlToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isBrowserPushSupported(): boolean {
  return (
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  );
}

export async function syncBrowserPushSubscription(user: User | null): Promise<void> {
  console.log('syncBrowserPushSubscription: Start', { user: user?.id, isSupported: isBrowserPushSupported() });
  if (!user || !isBrowserPushSupported()) {
    return;
  }

  console.log('syncBrowserPushSubscription: Fetching settings...');
  const settings = await api.getBrowserPushSettings();
  console.log('syncBrowserPushSubscription: Settings fetched', { enabled: settings.enabled, hasVapidKey: !!settings.vapidPublicKey });
  if (!settings.vapidPublicKey) {
    console.warn('syncBrowserPushSubscription: No VAPID public key found in settings');
    return;
  }

  console.log('syncBrowserPushSubscription: Registering service worker /push-sw.js...');
  const registration = await navigator.serviceWorker.register('/push-sw.js');
  console.log('syncBrowserPushSubscription: Service worker registered', { scope: registration.scope });
  const existingSubscription = await registration.pushManager.getSubscription();
  console.log('syncBrowserPushSubscription: Existing subscription:', existingSubscription ? 'found' : 'not found');

  if (!settings.enabled) {
    console.log('syncBrowserPushSubscription: Push is disabled in settings');
    if (existingSubscription) {
      const endpoint = existingSubscription.endpoint;
      console.log('syncBrowserPushSubscription: Unsubscribing from existing subscription...', endpoint);
      await existingSubscription.unsubscribe();
      if (endpoint) {
        await api.unregisterBrowserPushSubscription(endpoint);
      }
    }
    return;
  }

  if (Notification.permission === 'denied') {
    console.error('syncBrowserPushSubscription: Notification permission is denied');
    return;
  }
  if (Notification.permission === 'default') {
    console.log('syncBrowserPushSubscription: Requesting notification permission...');
    const permission = await Notification.requestPermission();
    console.log('syncBrowserPushSubscription: Permission result:', permission);
    if (permission !== 'granted') {
      return;
    }
  }

  try {
    console.log('syncBrowserPushSubscription: Subscribing to push manager...');
    const subscription = existingSubscription ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(settings.vapidPublicKey),
    });

    console.log('syncBrowserPushSubscription: Subscription obtained. Registering with backend...', subscription.endpoint);
    await api.registerBrowserPushSubscription(subscription.toJSON());
    console.log('syncBrowserPushSubscription: Successfully registered with backend');
  } catch (error) {
    console.error('syncBrowserPushSubscription: Fatal error during subscription', error);
  }
}

export async function disableBrowserPushSubscription(): Promise<void> {
  if (!isBrowserPushSupported()) {
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration('/push-sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) {
    return;
  }
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  if (endpoint) {
    await api.unregisterBrowserPushSubscription(endpoint);
  }
}
