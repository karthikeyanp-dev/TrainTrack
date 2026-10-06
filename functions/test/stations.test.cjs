const { test } = require('node:test');
const assert = require('node:assert/strict');
const { searchStations } = require('../lib/shared/bookingRequest.js');

test('station search suggests canonical codes for common spelling mistakes', () => {
  assert.ok(searchStations('Coimbathore').some(station => station.code === 'CBE'));
  assert.ok(searchStations('New Dehli').some(station => station.code === 'NDLS'));
  assert.ok(searchStations('Chhatrapati Shivaji').some(station => station.code === 'CSMT'));
});

test('city search keeps distinct boarding stations visible', () => {
  const chennai = searchStations('Chennai').map(station => station.code);
  assert.ok(chennai.includes('MAS'));
  assert.ok(chennai.includes('MS'));
  assert.ok(chennai.includes('TBM'));
});

test('Tamil and old city aliases resolve to selectable station suggestions', () => {
  assert.ok(searchStations('கோவை').some(station => station.code === 'CBE'));
  assert.ok(searchStations('Bangalore').some(station => station.code === 'SBC'));
});
