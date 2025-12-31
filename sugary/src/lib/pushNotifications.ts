import { supabase } from './supabase';

// VAPID public key for web push
const VAPID_PUBLIC_KEY = 'BGQuzX9jFnLQzQRBD67BeX-noMCkcbrMiUv12A158h6-vhh2kZXWgMxMM09Va2nzkOQjfwi_3wNtNZQKz_pWz_M';

// Convert base64 to Uint8Array for applicationServerKey
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Check if push notifications are supported
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Get current notification permission status
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return await Notification.requestPermission();
}

// Register service worker
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
}

// Subscribe to push notifications
export async function subscribeToPush(userId: string): Promise<boolean> {
  if (!isPushSupported()) {
    console.log('Push notifications not supported');
    return false;
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    console.log('Notification permission denied');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      // Create new subscription
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Save subscription to Supabase
    const subscriptionData = subscription.toJSON();
    
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: subscriptionData.endpoint,
      p256dh: subscriptionData.keys?.p256dh,
      auth: subscriptionData.keys?.auth,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',
    });

    if (error) {
      console.error('Error saving subscription:', error);
      return false;
    }

    console.log('Push subscription saved!');
    return true;
  } catch (error) {
    console.error('Error subscribing to push:', error);
    return false;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(userId: string): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
    }

    // Remove from Supabase
    await supabase.from('push_subscriptions').delete().eq('user_id', userId);
    
    console.log('Unsubscribed from push notifications');
    return true;
  } catch (error) {
    console.error('Error unsubscribing:', error);
    return false;
  }
}

// Check if user is subscribed
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

// Send a test notification locally (no server needed)
export async function sendTestNotification(): Promise<boolean> {
  if (!('Notification' in window)) {
    alert('Notifications not supported in this browser');
    return false;
  }

  if (Notification.permission !== 'granted') {
    alert('Notification permission not granted. Please enable notifications first.');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    await registration.showNotification('🍬 Test Notification!', {
      body: '🥇 You: 0g\n🥈 Friend: 5g\n🥉 Other: 10g',
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: { url: '/' },
      tag: 'test-notification',
    } as NotificationOptions);

    return true;
  } catch (error) {
    console.error('Error sending test notification:', error);
    alert('Failed to send test notification: ' + (error as Error).message);
    return false;
  }
}

