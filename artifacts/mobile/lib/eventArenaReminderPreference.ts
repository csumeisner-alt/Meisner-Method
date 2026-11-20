export function readEventArenaReminderPreference(raw: string | null) {
  if (raw === 'true' || raw === 'false' || raw === null) {
    return { enabled: raw === 'true', needsSync: false, configured: raw !== null };
  }
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object'
    || typeof (value as { enabled?: unknown }).enabled !== 'boolean'
    || typeof (value as { needsSync?: unknown }).needsSync !== 'boolean') {
    throw new Error('The saved Event Arena notification preference is invalid.');
  }
  return { ...(value as { enabled: boolean; needsSync: boolean }), configured: true };
}

export async function saveEventArenaReminderPreference(args: {
  enabled: boolean;
  save: (value: string) => Promise<void>;
  sync: (enabled: boolean) => Promise<void>;
}): Promise<string> {
  // One atomic record preserves both the user's choice and a durable sync retry.
  await args.save(JSON.stringify({ enabled: args.enabled, needsSync: true }));
  try {
    await args.sync(args.enabled);
    await args.save(JSON.stringify({ enabled: args.enabled, needsSync: false }));
    return '';
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Saved on this phone, but could not sync the Event Arena preference: ${detail} Retry to sync.`;
  }
}
