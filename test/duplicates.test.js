// Testes da checagem de duplicados no Monday (itens simulados, sem chamar a API).
const test = require('node:test');
const assert = require('node:assert');
const { applyMondayCheck, mondayEntries } = require('../src/duplicates');

function creator(name, status, { id = 'UCaaaaaaaaaaaaaaaaaaaaaa', handle = null, ig = null } = {}) {
  return {
    name,
    status,
    why: 'original why',
    notes: [],
    duplicate_check: 'Not checked yet',
    platforms: {
      youtube: { channel_id: id, handle, url: handle ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${id}` },
      instagram: { url: ig },
      tiktok: { url: null },
    },
  };
}

const ITEMS = [
  { name: 'Evgeniy Kletskin / bykletskin_', handle: 'https://www.instagram.com/bykletskin_e/', group: 'New Leads' },
  { name: 'Outlet Ridge Homestead', handle: 'https://www.tiktok.com/@outletridge_homestead', group: 'Messaged, but no reply yet' },
  { name: 'Some Prepper', handle: 'YT: https://www.youtube.com/@someprepper\nIG @someprepper_ig', group: 'Paid Only' },
];

test('nome do Monday com "/" vira vários nomes', () => {
  const names = mondayEntries(ITEMS).map((e) => e.name);
  assert.ok(names.includes('Evgeniy Kletskin'));
  assert.ok(names.includes('bykletskin_'));
});

test('duplicado por nome vira Not approved com o grupo do Monday', () => {
  const c = creator('Outlet Ridge Homestead', 'Approved');
  const found = applyMondayCheck([c], ITEMS);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(c.status, 'Not approved');
  assert.match(c.why, /Already on Monday \(Messaged, but no reply yet\)/);
  assert.strictEqual(c.duplicate_check, 'Duplicate');
});

test('duplicado por link do YouTube e grupo Paid Only', () => {
  const c = creator('Nome Diferente', 'Maybe', { handle: '@SomePrepper' });
  applyMondayCheck([c], ITEMS);
  assert.strictEqual(c.status, 'Not approved');
  assert.strictEqual(c.duplicate_check, 'Duplicate, already a paid affiliate');
});

test('duplicado pelo @ solto na Handle / Contact', () => {
  const c = creator('Outro', 'Approved', { ig: 'https://www.instagram.com/someprepper_ig/' });
  applyMondayCheck([c], ITEMS);
  assert.strictEqual(c.status, 'Not approved');
});

test('creator novo fica Clear e mantém o status', () => {
  const c = creator('Mountain Mamas Home', 'Approved', { handle: '@mountainmamashome' });
  applyMondayCheck([c], ITEMS);
  assert.strictEqual(c.status, 'Approved');
  assert.strictEqual(c.duplicate_check, 'Clear (not on Monday or outreach sheet)');
});

test('Not approved não é checado; sem Monday fica "Monday not checked"', () => {
  const na = creator('Outlet Ridge Homestead', 'Not approved');
  applyMondayCheck([na], ITEMS);
  assert.strictEqual(na.duplicate_check, 'Not checked (not approved)');
  assert.strictEqual(na.why, 'original why');
  const ok = creator('Qualquer', 'Approved');
  applyMondayCheck([ok], null);
  assert.strictEqual(ok.duplicate_check, 'Monday not checked');
  assert.strictEqual(ok.status, 'Approved');
});
