import assert from 'node:assert/strict';
import test from 'node:test';
import {
  readEventArenaReminderPreference,
  saveEventArenaReminderPreference,
} from '../eventArenaReminderPreference.ts';

test('legacy choices remain readable and invalid choices fail explicitly', () => {
  assert.deepEqual(readEventArenaReminderPreference('true'), { enabled: true, needsSync: false, configured: true });
  assert.equal(readEventArenaReminderPreference('false').enabled, false);
  assert.equal(readEventArenaReminderPreference(null).configured, false);
  assert.throws(() => readEventArenaReminderPreference('{"enabled":"yes"}'));
});

for (const enabled of [true, false]) {
  test(`a server outage preserves the ${enabled ? 'enabled' : 'disabled'} local choice and survives restart`, async () => {
    let stored: string | null = null;
    const save = async (value: string) => { stored = value; };
    const notice = await saveEventArenaReminderPreference({
      enabled, save, sync: async () => { throw new Error('server offline'); },
    });
    assert.match(notice, /Saved on this phone.*server offline/);
    const restarted = readEventArenaReminderPreference(stored);
    assert.equal(restarted.enabled, enabled);
    assert.equal(restarted.needsSync, true);
    const synced: boolean[] = [];
    assert.equal(await saveEventArenaReminderPreference({
      enabled: restarted.enabled, save, sync: async (choice) => { synced.push(choice); },
    }), '');
    assert.deepEqual(synced, [enabled]);
    assert.equal(readEventArenaReminderPreference(stored).needsSync, false);
  });
}

test('a local write failure never syncs an unpersisted choice to the server', async () => {
  let synced = false;
  await assert.rejects(saveEventArenaReminderPreference({
    enabled: true,
    save: async () => { throw new Error('storage full'); },
    sync: async () => { synced = true; },
  }), /storage full/);
  assert.equal(synced, false);
});
