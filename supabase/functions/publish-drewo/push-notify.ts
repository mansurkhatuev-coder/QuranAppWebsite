export type DrewoTreeRow = {
  tree_id: string;
  name: string;
  premium: boolean;
  notifications_enabled: boolean;
};

export type PushSubRow = {
  id: number;
  tree_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function shouldSendPushForTree(
  row: DrewoTreeRow | null | undefined,
  options: { requirePremium: boolean }
): boolean {
  if (!row) return false;
  if (!row.notifications_enabled) return false;
  if (options.requirePremium && !row.premium) return false;
  return true;
}
