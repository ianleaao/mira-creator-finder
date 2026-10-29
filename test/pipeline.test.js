// Testes da montagem dos creators e do CSV, com dados falsos (sem chamar APIs).
const test = require('node:test');
const assert = require('node:assert');
const { buildCreator, extractContact } = require('../src/pipeline');
const { toRow, toCsv, slugify } = require('../src/output');
const { cleanQueries } = require('../src/brief');
const { durationSeconds } = require('../src/youtube');

const NOW = new Date('2026-10-28T12:00:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

const channel = {
  channelId: 'UCabc123',
  title: 'Prepper Dawg',
  handle: '@prepperdawg',
  description: 'Prepping for families. Business: hello@prepperdawg.com\nhttps://instagram.com/prepperdawg\nhttps://linktr.ee/prepperdawg',
  subscribers: 50000,
  subscribersHidden: false,
  videoCount: 300,
};

function video(i, views, extra = {}) {
  return { videoId: `v${i}`, title: `Video ${i}`, description: '', url: `https://www.youtube.com/watch?v=v${i}`,
    publishedAt: daysAgo(8 + i), upcoming: false, views, ...extra };
}

test('buildCreator calcula métricas e preenche o formato do SOP 17', () => {
  const longVideos = Array.from({ length: 12 }, (_, i) => video(i, 6000));
  const collected = { longVideos, shortVideos: [], lastUpload: daysAgo(8), shortsSource: 'playlist' };
  const matches = [{ videoId: 'v0', title: 'Pentagon FORTRESS explained', publishedAt: daysAgo(8), query: 'q' }];
  const c = buildCreator({ round: 25, channel, collected, matches, now: NOW });

  assert.strictEqual(c.platforms.youtube.avg_video_views, 6000);
  assert.strictEqual(c.platforms.youtube.avg_shorts_views, null);
  assert.strictEqual(c.metrics.views_to_subs_ratio.label, 'Good');
  assert.strictEqual(c.metrics.activity, 'Active');
  assert.strictEqual(c.contact.email, 'hello@prepperdawg.com');
  assert.strictEqual(c.platforms.instagram.url, 'https://instagram.com/prepperdawg');
  assert.strictEqual(c.contact.best_method, 'Email');
  assert.strictEqual(c.real_first_name.value, null);

  const row = toRow(c);
  assert.strictEqual(row['YouTube'], 'https://www.youtube.com/@prepperdawg');
  assert.strictEqual(row['YouTube Subscribers'], '50K');
  assert.strictEqual(row['Avg Video Views'], '6K');
  assert.strictEqual(row['Avg Shorts Views'], 'No Shorts');
  assert.strictEqual(row['Views/Subs Ratio'], '12% (Good)');
  assert.strictEqual(row['Activity'], 'Active (8 days)');
  assert.strictEqual(row['Instagram Followers'], 'Not verified');
  assert.match(row['Trigger Content'], /Pentagon FORTRESS explained \| https:\/\/www\.youtube\.com\/watch\?v=v0 \| 2026-10-20/);
});

test('extractContact só usa e-mail de vídeos quando ele se repete', () => {
  const noEmail = { ...channel, description: 'No contact here' };
  const once = extractContact(noEmail, [{ description: 'sponsor@brand.com' }, { description: 'nothing' }]);
  assert.strictEqual(once.email, null);
  assert.strictEqual(once.bestMethod, null);
  const twice = extractContact(noEmail, [{ description: 'me@creator.com' }, { description: 'Contact me@creator.com' }]);
  assert.strictEqual(twice.email, 'me@creator.com');
});

test('canal com inscritos ocultos fica Not verified', () => {
  const hidden = { ...channel, subscribers: null, subscribersHidden: true };
  const collected = { longVideos: [video(1, 500)], shortVideos: [], lastUpload: daysAgo(9), shortsSource: 'playlist' };
  const row = toRow(buildCreator({ round: 1, channel: hidden, collected, matches: [], now: NOW }));
  assert.strictEqual(row['YouTube Subscribers'], 'Not verified');
  assert.strictEqual(row['Views/Subs Ratio'], 'Not verified');
});

test('CSV escapa vírgulas e aspas', () => {
  const collected = { longVideos: [], shortVideos: [], lastUpload: null, shortsSource: 'playlist' };
  const c = buildCreator({ round: 1, channel: { ...channel, title: 'Doug & Stacy, "Off Grid"' }, collected, matches: [], now: NOW });
  const csv = toCsv([c]);
  assert.ok(csv.startsWith('﻿Name of Account,Status,'));
  assert.ok(csv.includes('"Doug & Stacy, ""Off Grid"""'));
});

test('cleanQueries remove site: e youtube e duplicadas', () => {
  assert.deepStrictEqual(
    cleanQueries(['"Pentagon FORTRESS" youtube', 'site:tiktok.com fortress pentagon', '"pentagon fortress"']),
    ['"Pentagon FORTRESS"', 'fortress pentagon'],
  );
});

test('slugify e duração ISO', () => {
  assert.strictEqual(slugify('Pentagon FORTRESS'), 'pentagon-fortress');
  assert.strictEqual(slugify('Família & Preparação!'), 'familia-preparacao');
  assert.strictEqual(durationSeconds('PT1H2M3S'), 3723);
  assert.strictEqual(durationSeconds('PT45S'), 45);
});
