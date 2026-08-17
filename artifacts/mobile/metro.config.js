const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Persist the Metro transform cache across workflow restarts.
// Without this, every restart does a full 45-second cold build.
// The cache lives in the project dir (persists in Replit), not /tmp.
config.cacheVersion = 'v1';
config.cacheStores = ({ FileStore }) => [
  new FileStore({ root: path.join(__dirname, '.metro-cache') }),
];

module.exports = config;
