// Testes da checagem de duplicidade (SOP 7), sem chamar Monday nem Google.
const test = require('node:test');
const assert = require('node:assert');
const d = require('../src/dedupe');

function creator(name, { handle = null, channelId = 'UCaaaaaaaaaaaaaaaaaaaaaa', ig = null } = {}) {
  return {
    name,
    platforms: {
      youtube: { channel_id: channelId, handle, url: handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${channelId}` },
      instagram: { url: ig },
      tiktok: { url: null },
    },
  };
}

test('normalizeName segue o SOP 7.4', () => {
  assert.strictEqual(d.normalizeName('Doug & Stacy'), 'dougandstacy');
  assert.strictEqual(d.normalizeName('Doug and Stacy'), 'dougandstacy');
  assert.strictEqual(d.normalizeName('The Official Prepper TV Channel'), 'prepper');
  assert.strictEqual(d.normalizeName('@City.Prepping'), 'cityprepping');
  assert.strictEqual(d.normalizeName('Canadian Prepper!'), 'canadianprepper');
  // "tv" só sai como palavra inteira
  assert.strictEqual(d.normalizeName('TVPrepper'), 'tvprepper');
});

test('acha por nome, inclusive com sufixo "(see notes)"', () => {
  const index = d.buildIndex([
    { name: 'Legally Armed America (see notes)', source: 'sheet' },
    { name: 'Doug & Stacy', source: 'monday' },
  ]);
  assert.strictEqual(d.findMatches(creator('Legally Armed America'), index).length, 1);
  assert.strictEqual(d.findMatches(creator('Doug and Stacy'), index)[0].source, 'monday');
  assert.strictEqual(d.findMatches(creator('Prepper Dawg'), index).length, 0);
});

test('"começa com" não casa nomes curtos demais', () => {
  assert.strictEqual(d.namesMatch('prep', 'prepperdawg'), false);
  assert.strictEqual(d.namesMatch('legallyarmedamerica', 'legallyarmedamericaseenotes'), true);
});

test('acha por channel ID e por handle mesmo com nome diferente', () => {
  const id = 'UCbbbbbbbbbbbbbbbbbbbbbb';
  const index = d.buildIndex([
    { name: 'Nome Antigo', links: [`https://www.youtube.com/channel/${id}`], source: 'monday' },
    { name: 'Outro Nome', links: ['@prepperdawg'], source: 'sheet' },
    { name: 'Insta Only', links: ['https://instagram.com/dougstacy'], source: 'sheet' },
  ]);
  assert.match(d.findMatches(creator('Canal Novo', { channelId: id }), index)[0].reason, /ytid/);
  assert.strictEqual(d.findMatches(creator('X', { handle: '@PrepperDawg' }), index)[0].name, 'Outro Nome');
  assert.strictEqual(d.findMatches(creator('Y', { ig: 'https://www.instagram.com/dougstacy/' }), index)[0].name, 'Insta Only');
});

test('texto do Duplicate Check segue o SOP 7.5', () => {
  const both = { monday: true, sheet: true };
  assert.strictEqual(d.duplicateText([], both), 'Clear (not on Monday or outreach sheet)');
  assert.strictEqual(d.duplicateText([{ name: 'x' }], both), 'Duplicate');
  assert.strictEqual(d.duplicateText([{ name: 'x', affiliate: 'mira' }], both), 'Duplicate, already a MIRA affiliate');
  assert.strictEqual(d.duplicateText([{ name: 'x', affiliate: 'paid' }], both), 'Duplicate, already a paid affiliate');
  assert.strictEqual(d.duplicateText([], { monday: false, sheet: true }), 'Clear on outreach sheet, Monday not checked');
});
