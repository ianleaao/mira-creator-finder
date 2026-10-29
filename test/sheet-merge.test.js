// Testes da junção na planilha do tema (sem chamar o Google).
const test = require('node:test');
const assert = require('node:assert');
const m = require('../src/sheet-merge');

const HEADER = ['Name of Account', 'Status', 'Why', 'Supervisor Feedback', 'YouTube', 'Channel ID'];

function creator(name, id, status = 'Approved') {
  return { name, status, platforms: { youtube: { channel_id: id, handle: null, url: `https://www.youtube.com/channel/${id}` } } };
}

test('planilha antiga sem seções: marcadores entram antes de cada grupo de status', () => {
  const values = [
    HEADER,
    ['Civilian Tactical', 'Maybe', 'x'],
    ['3M', 'Not approved', 'y'],
    ['KREM 2 News', 'Not approved', 'z'],
  ];
  let parsed = m.parseSheet(values);
  assert.deepStrictEqual(m.nextMissingMarker(parsed.entries), { label: 'APPROVED', status: 'Approved', at: 1 });

  // Simula as inserções na ordem em que o sistema faz (relendo a cada passo).
  values.splice(1, 0, ['APPROVED']);
  parsed = m.parseSheet(values);
  assert.deepStrictEqual(m.nextMissingMarker(parsed.entries), { label: 'MAYBE', status: 'Maybe', at: 2 });
  values.splice(2, 0, ['MAYBE']);
  parsed = m.parseSheet(values);
  assert.deepStrictEqual(m.nextMissingMarker(parsed.entries), { label: 'NOT APPROVED', status: 'Not approved', at: 4 });
  values.splice(4, 0, ['NOT APPROVED']);
  parsed = m.parseSheet(values);
  assert.strictEqual(m.nextMissingMarker(parsed.entries), null);
  assert.deepStrictEqual(values.map((r) => r[0]),
    ['Name of Account', 'APPROVED', 'MAYBE', 'Civilian Tactical', 'NOT APPROVED', '3M', 'KREM 2 News']);
});

test('novos creators entram no fim da seção do status deles', () => {
  const values = [
    HEADER,
    ['APPROVED'],
    ['A1', 'Approved'],
    [],
    ['MAYBE'],
    ['M1', 'Maybe'],
    ['NOT APPROVED'],
    ['N1', 'Not approved'],
    ['N2', 'Not approved'],
  ];
  const { entries } = m.parseSheet(values);
  assert.strictEqual(m.sectionInsertAt(entries, 'Approved'), 3);   // depois de A1, antes da linha vazia
  assert.strictEqual(m.sectionInsertAt(entries, 'Maybe'), 6);      // antes de NOT APPROVED
  assert.strictEqual(m.sectionInsertAt(entries, 'Not approved'), 9); // fim dos dados
});

test('seção vazia recebe creators logo depois do marcador', () => {
  const values = [HEADER, ['APPROVED'], ['MAYBE'], ['NOT APPROVED']];
  const { entries } = m.parseSheet(values);
  assert.strictEqual(m.sectionInsertAt(entries, 'Approved'), 2);
  assert.strictEqual(m.sectionInsertAt(entries, 'Not approved'), 4);
});

test('status mudado à mão não move a linha nem confunde os marcadores', () => {
  const values = [HEADER, ['APPROVED'], ['A1', 'Not approved'], ['MAYBE'], ['NOT APPROVED']];
  const { entries } = m.parseSheet(values);
  assert.strictEqual(m.nextMissingMarker(entries), null);
  assert.strictEqual(m.sectionInsertAt(entries, 'Approved'), 3);
});

test('canal já na planilha é reconhecido por channel ID, link ou nome', () => {
  const values = [
    HEADER,
    ['APPROVED'],
    ['Por ID', 'Approved', '', '', '', 'UCaaaaaaaaaaaaaaaaaaaaaa'],
    ['Por Link', 'Approved', '', '', 'https://www.youtube.com/@linkhandle'],
    ['Civilian Tactical', 'Maybe'],
  ];
  const keys = m.existingKeys(m.parseSheet(values).entries);
  assert.ok(m.isInSheet(creator('Outro Nome', 'UCaaaaaaaaaaaaaaaaaaaaaa'), keys));
  const byHandle = creator('Qualquer', 'UCbbbbbbbbbbbbbbbbbbbbbb');
  byHandle.platforms.youtube.handle = '@LinkHandle';
  assert.ok(m.isInSheet(byHandle, keys));
  assert.ok(m.isInSheet(creator('Civilian Tactical', 'UCcccccccccccccccccccccc'), keys));
  assert.ok(!m.isInSheet(creator('Novo Canal', 'UCdddddddddddddddddddddd'), keys));
});

test('linha de creator cujo nome é igual a um marcador não vira marcador', () => {
  const values = [HEADER, ['Maybe', 'Approved', 'canal chamado Maybe']];
  const { entries } = m.parseSheet(values);
  assert.strictEqual(entries[1].kind, 'creator');
});
