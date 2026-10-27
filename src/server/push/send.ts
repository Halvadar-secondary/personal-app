import webpush from "web-push";

export type PushMessage = { title: string; body: string; url: string };

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** Sends one notification; "gone" when the device unsubscribed (404/410). */
export type PushSender = (
  sub: PushTarget,
  msg: PushMessage,
) => Promise<"ok" | "gone">;

/** Web Push with the VAPID keys from the environment; null when unset. */
export function webPushSender(): PushSender | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  const vapidDetails = { subject, publicKey, privateKey };
  return async (sub, msg) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(msg),
        { vapidDetails, TTL: 60 * 60 },
      );
      return "ok";
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      throw e;
    }
  };
}
