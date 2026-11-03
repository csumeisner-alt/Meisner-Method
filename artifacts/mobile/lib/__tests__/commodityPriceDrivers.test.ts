import assert from 'node:assert/strict';
import test from 'node:test';
import { getCommodityPriceDrivers } from '../commodityPriceDrivers.ts';

const SUPPORTED_COMMODITY_SYMBOLS = [
  'GC=F',
  'SI=F',
  'CL=F',
  'NG=F',
  'HG=F',
  'ZC=F',
  'ZW=F',
  'ZS=F',
  'KC=F',
  'CT=F',
  'SB=F',
  'PL=F',
  'PA=F',
  'LE=F',
  'HE=F',
];

test('every supported commodity has distinct up and down price drivers', () => {
  for (const symbol of SUPPORTED_COMMODITY_SYMBOLS) {
    const drivers = getCommodityPriceDrivers(symbol);
    assert.ok(drivers?.up.trim(), `${symbol} needs a price-up explanation`);
    assert.ok(drivers?.down.trim(), `${symbol} needs a price-down explanation`);
    assert.notEqual(drivers?.up, drivers?.down);
  }
});

test('oil drivers explain supply disruption risk without promising a price move', () => {
  const drivers = getCommodityPriceDrivers('CL=F');
  assert.match(drivers?.up ?? '', /Conflict, sanctions, or shipping disruptions/);
  assert.match(drivers?.up ?? '', /can/);
  assert.match(drivers?.down ?? '', /Demand slowdowns, rising inventories/);
});

test('unknown symbols do not receive a misleading generic commodity explanation', () => {
  assert.equal(getCommodityPriceDrivers('NEW=F'), null);
});
