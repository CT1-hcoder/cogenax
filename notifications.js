// Bridge to the native Android notifications (Capacitor LocalNotifications plugin).
// In a normal browser there is no Capacitor, so every function quietly does nothing.
import { CHANNEL_ID, NOTIF } from './logic.js';

const cap = () => globalThis.Capacitor;
const plugin = () => cap()?.Plugins?.LocalNotifications;

export function isNative() {
  try {
    return !!cap()?.isNativePlatform?.() && !!plugin();
  } catch {
    return false;
  }
}

export async function setupChannel() {
  if (!isNative()) return;
  try {
    await plugin().createChannel({
      id: CHANNEL_ID, name: 'Cogenax', description: 'Study reminders',
      importance: 4, visibility: 1, vibration: true
    });
  } catch { /* channels only exist on Android 8+ */ }
}

// Returns 'granted' | 'denied' | 'prompt' | 'web'
export async function permissionState(ask) {
  if (!isNative()) return 'web';
  try {
    const p = plugin();
    let s = (await p.checkPermissions()).display;
    if (ask && (s === 'prompt' || s === 'prompt-with-rationale')) s = (await p.requestPermissions()).display;
    return s === 'prompt-with-rationale' ? 'prompt' : s;
  } catch {
    return 'denied';
  }
}

// Removes every pending notification (except the test one) and schedules the new list.
export async function replaceAll(list) {
  if (!isNative()) return 0;
  const p = plugin();
  const pending = await p.getPending();
  const ids = (pending.notifications || []).filter((n) => n.id !== NOTIF.TEST).map((n) => ({ id: n.id }));
  if (ids.length) await p.cancel({ notifications: ids });
  if (list.length) await p.schedule({ notifications: list });
  return list.length;
}

export async function scheduleTest(title, body) {
  if (!isNative()) return false;
  await plugin().schedule({
    notifications: [{
      id: NOTIF.TEST, title, body, channelId: CHANNEL_ID,
      schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }
    }]
  });
  return true;
}
