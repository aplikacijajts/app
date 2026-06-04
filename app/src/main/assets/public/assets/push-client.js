import { PushNotifications } from '@capacitor/push-notifications';
import { api, getToken } from './api.js';

export async function initPush() {
  // работи само во мобилен апк (Capacitor)
  if (!window.Capacitor || !window.Capacitor.isNativePlatform) return;

  const jwt = getToken();
  if (!jwt) return;

  // 1) permission
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive !== 'granted') {
    perm = await PushNotifications.requestPermissions();
  }
  if (perm.receive !== 'granted') return;

  // 2) register with FCM/APNS
  await PushNotifications.register();

  // 3) token event
  PushNotifications.addListener('registration', async (token) => {
    try {
      await api('/api/push/register', {
        method: 'POST',
        body: { token: token.value, platform: 'android' }
      });
      console.log('✅ Push token registered');
    } catch (e) {
      console.log('❌ Push register failed', e.message);
    }
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.log('❌ Push registration error', err);
  });

  // optional: кога стига нотификација додека апкот е отворен
  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('🔔 Push received', notification);
  });

  // optional: кога ќе кликнеш на нотификација
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    console.log('👉 Push action', action);
  });
}
