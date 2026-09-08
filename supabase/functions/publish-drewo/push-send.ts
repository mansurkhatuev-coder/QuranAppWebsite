import webpush from 'npm:web-push@3.6.7';
import { buildAdditionNotification, type PersonRef } from './added-people.ts';
import {
  shouldSendPushForTree,
  type DrewoTreeRow,
  type PushSubRow,
} from './push-notify.ts';

export function configureWebPushFromEnv(env: {
  publicKey?: string;
  privateKey?: string;
  subject?: string;
}): boolean {
  const publicKey = env.publicKey || '';
  const privateKey = env.privateKey || '';
  const subject = env.subject || 'mailto:drewo@waydean.ru';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export type NotifyResult = {
  attempted: number;
  sent: number;
  removedEndpoints: string[];
  skippedReason?: string;
};

/**
 * Send one notification to all subscriptions. Never throws for per-endpoint failures.
 * `deleteEndpoint` removes dead subs (404/410).
 */
export async function notifyAddedPeople(options: {
  tree: DrewoTreeRow;
  added: PersonRef[];
  subscriptions: PushSubRow[];
  baseUrl: string;
  requirePremium: boolean;
  deleteEndpoint: (endpoint: string) => Promise<void>;
}): Promise<NotifyResult> {
  if (!shouldSendPushForTree(options.tree, { requirePremium: options.requirePremium })) {
    return { attempted: 0, sent: 0, removedEndpoints: [], skippedReason: 'tree-disabled' };
  }
  if (!options.added.length) {
    return { attempted: 0, sent: 0, removedEndpoints: [], skippedReason: 'no-additions' };
  }
  const payload = buildAdditionNotification(options.tree.name, options.added, options.baseUrl);
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
  });
  const removed: string[] = [];
  let sent = 0;
  for (const sub of options.subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        body
      );
      sent += 1;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        removed.push(sub.endpoint);
        try {
          await options.deleteEndpoint(sub.endpoint);
        } catch {
          /* ignore delete errors */
        }
      }
    }
  }
  return {
    attempted: options.subscriptions.length,
    sent,
    removedEndpoints: removed,
  };
}
