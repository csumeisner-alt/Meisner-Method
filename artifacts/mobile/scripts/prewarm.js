#!/usr/bin/env node
/**
 * Pre-warms the Metro bundle after the dev server starts.
 * Run in background alongside `expo start` so the bundle is compiled
 * and cached before the user scans the QR code in Expo Go.
 *
 * Usage: node scripts/prewarm.js &
 */

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 18115;
const POLL_INTERVAL = 3000; // ms between readiness checks
const MAX_WAIT = 60000;     // give Metro up to 60s to start
const start = Date.now();

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers, timeout: 120000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getBundleUrl() {
  const res = await get(`http://localhost:${PORT}`, {
    'expo-platform': 'android',
    'Accept': 'multipart/mixed,application/expo+json,application/json',
  });
  const m = res.body.match(/"url":"(https?:\/\/[^"]+entry\.bundle[^"]+)"/);
  return m ? m[1] : null;
}

async function waitForMetro() {
  while (Date.now() - start < MAX_WAIT) {
    try {
      const res = await get(`http://localhost:${PORT}`);
      if (res.status === 200) return true;
    } catch (_) { /* not ready yet */ }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  return false;
}

async function main() {
  console.log('[prewarm] Waiting for Metro to start...');
  const ready = await waitForMetro();
  if (!ready) {
    console.log('[prewarm] Metro did not start in time, skipping prewarm.');
    return;
  }

  console.log('[prewarm] Metro is up. Fetching manifest...');
  let bundleUrl;
  try {
    bundleUrl = await getBundleUrl();
  } catch (e) {
    console.log('[prewarm] Could not get manifest:', e.message);
    return;
  }

  if (!bundleUrl) {
    console.log('[prewarm] No bundle URL found in manifest.');
    return;
  }

  console.log('[prewarm] Building Android bundle (this may take ~45s the first time)...');
  const t = Date.now();
  try {
    await get(bundleUrl);
    console.log(`[prewarm] Bundle ready in ${((Date.now() - t) / 1000).toFixed(1)}s — scan the QR code now!`);
  } catch (e) {
    console.log('[prewarm] Bundle build failed:', e.message);
  }
}

main();
