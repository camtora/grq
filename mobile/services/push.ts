import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from './api';

/** Push registration (D53 backend, unchanged): ask permission, mint the raw
 * APNs device token, and register it with our env + bundle so the server
 * pushes it on the right gateway with the right apns-topic. Quietly no-ops
 * on the simulator (no APNs there) or when permission is denied. */
export async function registerForPush(): Promise<void> {
  try {
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    const t = await Notifications.getDevicePushTokenAsync();
    const token = typeof t.data === 'string' ? t.data : '';
    if (!token) return;

    await api('/api/notifications/register', {
      method: 'POST',
      body: JSON.stringify({
        token,
        platform: 'ios',
        // An Xcode/Metro dev build gets a SANDBOX token; TestFlight/App Store
        // builds get production — the server retries the other gateway if a
        // build lies about itself (BadEnvironmentKeyInToken self-heal).
        apnsEnv: __DEV__ ? 'sandbox' : 'production',
        bundleId: Constants.expoConfig?.ios?.bundleIdentifier ?? 'com.camerontora.grqgo',
      }),
    });
  } catch {
    /* simulator / denied / offline — registration retries next sign-in */
  }
}
