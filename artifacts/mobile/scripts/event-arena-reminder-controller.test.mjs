import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['artifacts/mobile/lib/eventArenaReminders.ts'],
  bundle: true, write: false, format: 'esm', platform: 'node',
  plugins: [{
    name: 'reminder-device-fixture',
    setup(api) {
      const mocks = {
        react: `const h=globalThis.__reminderDevice;
          export const createContext=()=>({Provider:{}});
          export const createElement=(_,props)=>props;
          export const useContext=()=>null;
          export const useSyncExternalStore=(_,snapshot)=>snapshot();
          export const useEffect=(fn)=>{if(!h.started){h.started=true;fn();}};`,
        'react-native': `export const Platform={OS:'android'};
          export const AppState={addEventListener:(_,fn)=>{globalThis.__reminderDevice.foreground=fn;return {remove(){}}}};
          export const Linking={openSettings:async()=>{}};`,
        '@react-native-async-storage/async-storage': `const h=globalThis.__reminderDevice;
          export default {getItem:async k=>h.storage.get(k)??null,setItem:async(k,v)=>{h.storage.set(k,v)}};`,
        '@tanstack/react-query': `export const useQueryClient=()=>({fetchQuery:options=>options.queryFn({})});`,
        '@workspace/api-client-react': `const h=globalThis.__reminderDevice;
          export const getGetEventArenaReminderPreferenceQueryOptions=()=>({queryFn:async()=>{
            if(h.offline)throw Error('preference server offline');
            return {configured:true,enabled:h.serverEnabled};
          }});
          export const setEventArenaReminderPreference=async({enabled})=>{
            if(h.offline)throw Error('preference server offline');
            h.serverEnabled=enabled;return {enabled};
          };`,
        './installation.ts': `export const getInstallationId=async()=>'fixture-installation';`,
        './eventArenaPushRegistration.ts': `export const registerEventArenaPushDevice=async()=>false;`,
        './paperChallenge.ts': `export const getPaperChallengeReminders=()=>[
          'lightning-round-start','lightning-round-midpoint','lightning-round-final-hour'
          ].map((kind,index)=>({eventId:'lightning-fixture',kind,scheduledAtMs:Date.now()+3600000*(index+1),title:kind,body:kind}));`,
        'expo-notifications': `const h=globalThis.__reminderDevice;
          export const AndroidImportance={DEFAULT:3};
          export const SchedulableTriggerInputTypes={DATE:'date'};
          export const setNotificationChannelAsync=async()=>{h.channelReady=true};
          export const getPermissionsAsync=async()=>({granted:true,canAskAgain:true});
          export const requestPermissionsAsync=getPermissionsAsync;
          export const getAllScheduledNotificationsAsync=async()=>[...h.scheduled.values()];
          export const scheduleNotificationAsync=async request=>{
            if(request.content.data)throw Error('Failed to schedule the notification. org.json.JSONObject');
            if(h.failSchedule)throw Error('OS scheduling unavailable');
            h.scheduled.set(request.identifier,request);return request.identifier;
          };
          export const cancelScheduledNotificationAsync=async id=>{h.scheduled.delete(id);};`,
      };
      api.onResolve({ filter: /.*/ }, ({ path }) => path in mocks
        ? { path, namespace: 'device-fixture' } : null);
      api.onLoad({ filter: /.*/, namespace: 'device-fixture' }, ({ path }) =>
        ({ contents: mocks[path], loader: 'js' }));
    },
  }],
});
let instance = 0;
const preferenceKey = '@stocksense/paper_events_notifications_v1';
async function device({ offline = false, storage = new Map(), scheduled = new Map(), serverEnabled = false } = {}) {
  const harness = { offline, storage, scheduled, serverEnabled, started: false };
  globalThis.__reminderDevice = harness;
  const controller = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${instance++}`);
  const snapshot = () => controller.EventArenaRemindersProvider({ children: null }).value;
  snapshot();
  for (let i = 0; i < 100 && !snapshot().loaded; i++) {
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.equal(snapshot().loaded, true);
  return { harness, controller, snapshot };
}

test('Android toggle works after preference failure, schedules without JSONObject data, and turns off offline', async () => {
  const { harness, controller, snapshot } = await device({ offline: true });
  assert.match(snapshot().preferenceError, /preference server offline/);
  await controller.setEventArenaRemindersEnabled(true);
  assert.equal(snapshot().enabled, true);
  assert.equal(snapshot().busy, false);
  assert.equal(snapshot().scheduledCount, 3);
  assert.equal(harness.scheduled.size, 3);
  assert.equal(harness.channelReady, true);
  assert.match(snapshot().preferenceError, /Saved on this phone/);
  await controller.refreshEventArenaReminders();
  assert.equal(harness.scheduled.size, 3, 'refresh must not duplicate scheduled reminders');
  await controller.setEventArenaRemindersEnabled(false);
  assert.equal(snapshot().enabled, false);
  assert.equal(harness.scheduled.size, 0);
  assert.equal(JSON.parse(harness.storage.get(preferenceKey)).needsSync, true);
  harness.offline = false;
  await snapshot().retry();
  assert.equal(snapshot().preferenceError, '');
  assert.equal(harness.serverEnabled, false);
  assert.equal(JSON.parse(harness.storage.get(preferenceKey)).needsSync, false);
});

test('reopening preserves a pending local disable instead of restoring a stale server enable', async () => {
  const storage = new Map([[preferenceKey, JSON.stringify({ enabled: false, needsSync: true })]]);
  const { harness, snapshot } = await device({ storage, serverEnabled: true });
  assert.equal(snapshot().enabled, false);
  assert.equal(harness.serverEnabled, false);
  assert.equal(JSON.parse(storage.get(preferenceKey)).needsSync, false);
});

test('a scheduling error leaves enable retry available and never persists an enabled choice', async () => {
  const { harness, controller, snapshot } = await device();
  harness.failSchedule = true;
  await controller.setEventArenaRemindersEnabled(true);
  assert.equal(snapshot().enabled, false);
  assert.equal(snapshot().busy, false);
  assert.equal(snapshot().retryMode, 'enable');
  assert.match(snapshot().error, /OS scheduling unavailable/);
  assert.equal(harness.scheduled.size, 0);
  harness.failSchedule = false;
  await snapshot().retry();
  assert.equal(snapshot().enabled, true);
  assert.equal(harness.scheduled.size, 3);
});
