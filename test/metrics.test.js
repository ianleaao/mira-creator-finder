// Testes das métricas. Rodar com: npm test
const test = require('node:test');
const assert = require('node:assert');
const m = require('../src/metrics');

const NOW = new Date('2026-10-28T12:00:00Z');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

test('parseViews aceita números e textos do YouTube', () => {
  assert.strictEqual(m.parseViews(1234), 1234);
  assert.strictEqual(m.parseViews('12 thousand views'), 12000);
  assert.strictEqual(m.parseViews('12K views'), 12000);
  assert.strictEqual(m.parseViews('1.2M views'), 1200000);
  assert.strictEqual(m.parseViews('1,234 views'), 1234);
  assert.strictEqual(m.parseViews('3.4 million views'), 3400000);
  assert.strictEqual(m.parseViews('No views'), 0);
  assert.strictEqual(m.parseViews('1 view'), 1);
  assert.strictEqual(m.parseViews(undefined), null);
  assert.strictEqual(m.parseViews('abc'), null);
});

test('formatCount usa K e M', () => {
  assert.strictEqual(m.formatCount(950), '950');
  assert.strictEqual(m.formatCount(1234), '1.2K');
  assert.strictEqual(m.formatCount(12345), '12K');
  assert.strictEqual(m.formatCount(184000), '184K');
  assert.strictEqual(m.formatCount(999999), '1M');
  assert.strictEqual(m.formatCount(1200000), '1.2M');
  assert.strictEqual(m.formatCount(15400000), '15M');
  assert.strictEqual(m.formatCount(null), '');
});

test('averageViews pula vídeos com menos de 7 dias e agendados, depois pega 10', () => {
  const videos = [
    { publishedAt: daysAgo(2), views: 99999 },              // muito novo: pula
    { publishedAt: daysAgo(1), views: 5, upcoming: true },  // agendado: pula
  ];
  for (let i = 0; i < 12; i++) videos.push({ publishedAt: daysAgo(10 + i), views: 1000 });
  const r = m.averageViews(videos, NOW);
  assert.strictEqual(r.count, 10);
  assert.strictEqual(r.average, 1000);
  assert.strictEqual(r.viral, null);
});

test('averageViews exclui um único viral acima de 5x a mediana', () => {
  const videos = [];
  for (let i = 0; i < 9; i++) videos.push({ publishedAt: daysAgo(10 + i), views: 1000 });
  videos.push({ title: 'Viral', publishedAt: daysAgo(30), views: 50000 });
  const r = m.averageViews(videos, NOW);
  assert.strictEqual(r.count, 9);
  assert.strictEqual(r.average, 1000);
  assert.strictEqual(r.viral.title, 'Viral');
});

test('averageViews não exclui quando há dois virais', () => {
  const videos = [];
  for (let i = 0; i < 8; i++) videos.push({ publishedAt: daysAgo(10 + i), views: 1000 });
  videos.push({ publishedAt: daysAgo(30), views: 50000 });
  videos.push({ publishedAt: daysAgo(31), views: 60000 });
  const r = m.averageViews(videos, NOW);
  assert.strictEqual(r.count, 10);
  assert.strictEqual(r.viral, null);
});

test('averageViews sem vídeos devolve null', () => {
  assert.strictEqual(m.averageViews([], NOW).average, null);
});

test('ratio views/inscritos segue as faixas do SOP', () => {
  assert.strictEqual(m.viewsToSubsRatio(10000, 100000).label, 'Good');
  assert.strictEqual(m.viewsToSubsRatio(5000, 100000).label, 'Acceptable');
  assert.strictEqual(m.viewsToSubsRatio(2000, 100000).label, 'Weak');
  assert.strictEqual(m.formatRatio(m.viewsToSubsRatio(5000, 100000)), '5.0% (Acceptable)');
  assert.strictEqual(m.formatRatio(null), 'Not verified');
});

test('atividade pelo último upload', () => {
  assert.strictEqual(m.activity(daysAgo(30), NOW).label, 'Active');
  assert.strictEqual(m.activity(daysAgo(31), NOW).label, 'Attention');
  assert.strictEqual(m.activity(daysAgo(90), NOW).label, 'Attention');
  assert.strictEqual(m.activity(daysAgo(91), NOW).label, 'Inactive');
  assert.strictEqual(m.activity(null, NOW).label, 'Not verified');
});
