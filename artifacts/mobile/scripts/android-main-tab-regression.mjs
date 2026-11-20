import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = process.env.ANDROID_APP_ID || 'com.meisnermethod.app';
const DEVICE_SERIAL = process.env.ANDROID_SERIAL;
const ROUNDS = Number.parseInt(process.env.ANDROID_TAB_REGRESSION_ROUNDS || '3', 10);
const UI_DUMP_PATH = '/sdcard/main-tab-regression-window.xml';

export function parseUiHierarchy(xml) {
  const nodes = [];
  for (const match of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([\w:-]+)="((?:\\.|[^"])*)"/g)) {
      attributes[attribute[1]] = attribute[2]
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
    }
    nodes.push(attributes);
  }
  return nodes;
}

export function hasTestId(node, testId) {
  const resourceId = node['resource-id'] || '';
  return resourceId === testId
    || resourceId.endsWith(`/${testId}`)
    || resourceId.endsWith(`:${testId}`)
    || node['content-desc'] === testId
    || node.text === testId;
}

export function getMainTabSwipeCoordinates(width, direction) {
  const swipeLeft = direction === 'left';
  return {
    startX: Math.round(width * (swipeLeft ? 0.84 : 0.16)),
    endX: Math.round(width * (swipeLeft ? 0.16 : 0.84)),
  };
}

const tabs = [
  { route: '/', id: 'bottom-tab-analyze', label: 'Analyze', screen: 'main-tab-scroll-analyze' },
  { route: '/picks', id: 'bottom-tab-top-picks', label: 'Top Picks', screen: 'main-tab-scroll-top-picks' },
  { route: '/paper', id: 'bottom-tab-paper', label: 'Paper Trading', screen: 'paper-content' },
  { route: '/portfolio', id: 'bottom-tab-portfolio', label: 'Portfolio', screen: 'main-tab-scroll-portfolio' },
  { route: '/event-arena', id: 'bottom-tab-event-arena', label: 'Event Arena', screen: 'event-arena-header-row' },
];

function createAdb(serial) {
  return (...args) => {
    const command = serial ? ['-s', serial, ...args] : args;
    const result = spawnSync('adb', command, { encoding: 'utf8', timeout: 30_000 });
    if (result.error) {
      if (result.error.code === 'ENOENT') {
        throw new Error('Android regression check requires adb. Install Android platform tools and connect an authorized test device.');
      }
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`adb ${command.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`);
    }
    return result.stdout;
  };
}

function findNode(nodes, testId, labels = []) {
  return nodes.find((node) => hasTestId(node, testId))
    || nodes.find((node) => labels.includes(node['content-desc']) || labels.includes(node.text));
}

function pointFromNode(node, description) {
  assert.ok(node?.bounds, `Couldn't locate ${description} in the Android accessibility tree.`);
  const bounds = node.bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  assert.ok(bounds, `Couldn't read screen bounds for ${description}: ${node.bounds}`);
  return {
    x: Math.round((Number(bounds[1]) + Number(bounds[3])) / 2),
    y: Math.round((Number(bounds[2]) + Number(bounds[4])) / 2),
  };
}

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  assert.ok(Number.isInteger(ROUNDS) && ROUNDS > 0 && ROUNDS <= 20,
    'ANDROID_TAB_REGRESSION_ROUNDS must be an integer from 1 to 20.');
  const adb = createAdb(DEVICE_SERIAL);
  const deviceLines = adb('devices').trim().split(/\r?\n/).slice(1).filter(Boolean);
  const authorizedDevices = deviceLines.filter((line) => /\bdevice\b/.test(line));
  if (DEVICE_SERIAL) {
    assert.ok(authorizedDevices.some((line) => line.startsWith(`${DEVICE_SERIAL}\t`)),
      `Android device ${DEVICE_SERIAL} is not connected and authorized.`);
  } else {
    assert.equal(authorizedDevices.length, 1,
      'Connect exactly one authorized Android device, or set ANDROID_SERIAL to select one.');
  }

  assert.match(adb('shell', 'pm', 'path', PACKAGE_NAME), /^package:/m,
    `Install the authorized test build (${PACKAGE_NAME}) before running this check.`);

  async function dumpUi() {
    adb('shell', 'uiautomator', 'dump', '--compressed', UI_DUMP_PATH);
    return parseUiHierarchy(adb('exec-out', 'cat', UI_DUMP_PATH));
  }

  async function waitFor(description, predicate, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    let lastNodes = [];
    while (Date.now() < deadline) {
      lastNodes = await dumpUi();
      if (predicate(lastNodes)) return lastNodes;
      await pause(500);
    }
    const visible = lastNodes
      .map((node) => node.text || node['content-desc'])
      .filter(Boolean)
      .slice(0, 40)
      .join(' | ');
    throw new Error(`Timed out waiting for ${description}. Visible Android UI: ${visible || '(no accessible text)'}`);
  }

  function tap(node, description) {
    const { x, y } = pointFromNode(node, description);
    adb('shell', 'input', 'tap', String(x), String(y));
  }

  async function selectTab(tab) {
    let nodes = await dumpUi();
    const button = findNode(nodes, tab.id, [tab.label]);
    assert.ok(button, `The ${tab.label} tab button isn't visible.`);
    tap(button, `${tab.label} tab`);
    nodes = await waitFor(`${tab.label} screen`, (current) =>
      current.some((node) => hasTestId(node, tab.screen)));
    const selectedButton = findNode(nodes, tab.id, [tab.label]);
    assert.ok(selectedButton, `The ${tab.label} tab disappeared after navigation.`);
    assert.equal(selectedButton.selected, 'true',
      `The ${tab.label} tab content appeared but the tab isn't marked selected.`);
    return nodes;
  }

  function selectedTab(nodes) {
    return tabs.find((tab) => findNode(nodes, tab.id, [tab.label])?.selected === 'true') ?? null;
  }

  async function swipeMainTabs(direction) {
    const sizeOutput = adb('shell', 'wm', 'size');
    const sizeMatches = [...sizeOutput.matchAll(/(?:Physical|Override) size:\s*(\d+)x(\d+)/g)];
    assert.ok(sizeMatches.length > 0, `Couldn't determine Android screen size: ${sizeOutput.trim()}`);
    const [, widthText, heightText] = sizeMatches.at(-1);
    const width = Number(widthText);
    const height = Number(heightText);
    const { startX, endX } = getMainTabSwipeCoordinates(width, direction);
    const y = Math.round(height * 0.43);
    adb('shell', 'input', 'swipe', String(startX), String(y), String(endX), String(y), '360');
  }

  async function assertTabScreen(tab) {
    const nodes = await waitFor(`${tab.label} screen`, (current) =>
      current.some((node) => hasTestId(node, tab.screen)));
    assert.equal(selectedTab(nodes)?.id, tab.id,
      `Expected ${tab.label} to be selected after navigation.`);
  }

  function paperSnapshot(nodes) {
    const account = nodes.find((node) => hasTestId(node, 'paper-current-account'));
    const buyingPower = nodes.find((node) => hasTestId(node, 'paper-account-buying-power'));
    const selectedPaperSection = nodes.find((node) =>
      /^paper-tab-/.test(node['resource-id']?.split('/').at(-1) || '')
      && node.selected === 'true');
    assert.ok(account?.text, 'Paper screen did not expose its selected account name.');
    assert.ok(buyingPower?.text, 'Paper screen did not expose its existing buying-power balance.');
    assert.ok(selectedPaperSection, 'Paper screen did not expose its selected section.');
    return {
      account: account.text,
      buyingPower: buyingPower.text,
      section: selectedPaperSection['resource-id'].split('/').at(-1),
    };
  }

  adb('shell', 'monkey', '-p', PACKAGE_NAME, '1');
  await waitFor('the app to launch', (nodes) =>
    tabs.some((tab) => findNode(nodes, tab.id, [tab.label])), 30_000);

  let nodes = await selectTab(tabs[2]);
  const startingPaper = paperSnapshot(nodes);
  const startingSection = startingPaper.section;

  for (let round = 0; round < ROUNDS; round += 1) {
    nodes = await selectTab(tabs[0]);
    // Alternate a brief, uncommitted drag with committed swipes in each direction.
    const current = selectedTab(nodes);
    assert.ok(current, 'No selected main tab was reported before the cancelled gesture.');
    const { x: centerX, y: centerY } = pointFromNode(
      nodes.find((node) => hasTestId(node, 'main-tab-swipe-boundary')),
      'main-tab swipe surface',
    );
    adb('shell', 'input', 'swipe', String(centerX), String(centerY),
      String(centerX + 28), String(centerY + 4), '260');
    await pause(500);
    nodes = await dumpUi();
    assert.equal(selectedTab(nodes)?.id, current.id, 'A cancelled short drag changed the selected tab.');

    for (let index = 0; index < tabs.length - 1; index += 1) {
      await swipeMainTabs('left');
      await assertTabScreen(tabs[index + 1]);
    }
    for (let index = tabs.length - 1; index > 0; index -= 1) {
      await swipeMainTabs('right');
      await assertTabScreen(tabs[index - 1]);
    }

    // Exercise tap selection too, rather than relying only on the gesture responder.
    for (const tab of [tabs[3], tabs[1], tabs[4], tabs[2]]) {
      nodes = await selectTab(tab);
    }
    assert.deepEqual(paperSnapshot(nodes), { ...startingPaper, section: startingSection },
      'Paper account, balance, or selected section changed during tab navigation.');
  }

  nodes = await selectTab(tabs[0]);
  const heatMapButton = findNode(nodes, 'open-heat-map', ['Open market heat map', 'Open Watch Map']);
  assert.ok(heatMapButton, 'Could not find the Analyze screen market-map control to open a detail.');
  tap(heatMapButton, 'market heat map');
  nodes = await waitFor('market heat map tiles', (current) =>
    current.some((node) => /^heat-map-open-detail-/.test(node['resource-id']?.split('/').at(-1) || '')));
  const detailTile = nodes.find((node) =>
    /^heat-map-open-detail-/.test(node['resource-id']?.split('/').at(-1) || ''));
  tap(detailTile, 'market detail tile');
  await waitFor('market detail card', (current) =>
    current.some((node) => hasTestId(node, 'heat-map-detail-modal')));
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
  nodes = await waitFor('Analyze screen after Android Back', (current) =>
    current.some((node) => hasTestId(node, 'open-heat-map')));
  assert.equal(selectedTab(nodes)?.id, tabs[0].id,
    'Android Back did not return from market details to the same tab.');

  nodes = await selectTab(tabs[2]);
  assert.deepEqual(paperSnapshot(nodes), startingPaper,
    'Paper account, balance, or selected section changed after opening and dismissing details.');

  adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await pause(1_500);
  adb('shell', 'monkey', '-p', PACKAGE_NAME, '1');
  nodes = await waitFor('Paper screen after Android background/resume', (current) =>
    current.some((node) => hasTestId(node, 'paper-content')), 30_000);
  assert.deepEqual(paperSnapshot(nodes), startingPaper,
    'Paper account, balance, or selected section changed after background/resume.');

  console.log(`Android five-tab regression passed on ${DEVICE_SERIAL || 'the connected device'} (${ROUNDS} swipe rounds).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
