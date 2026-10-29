// Lógica (sem chamadas à internet) para juntar creators novos na planilha do tema.
// Regras do Ian:
//  - três seções, nesta ordem: APPROVED, MAYBE, NOT APPROVED (linhas marcadoras na coluna A);
//  - novos creators entram no fim da seção do status deles;
//  - nunca apagar linhas, nunca sobrescrever células existentes (edições à mão ficam);
//  - não repetir canal que já está na planilha (channel ID, link do YouTube ou nome);
//  - localizar tudo pelo conteúdo (channel ID ou nome), nunca por número de linha guardado.
// Índices aqui são 0 = cabeçalho, 1 = primeira linha de dados (linha 2 da planilha).

const { SECTIONS } = require('./sheet-template');
const { normalizeName, linkIds } = require('./dedupe');

const LABELS = SECTIONS.map((s) => s.label);

function columnIndex(header, title) {
  const wanted = title.toLowerCase();
  return header.findIndex((h) => String(h || '').trim().toLowerCase() === wanted);
}

// Classifica cada linha: cabeçalho, marcador de seção, creator ou vazia.
function parseSheet(values) {
  const header = values[0] || [];
  const col = {
    name: columnIndex(header, 'Name of Account'),
    status: columnIndex(header, 'Status'),
    youtube: columnIndex(header, 'YouTube'),
    channelId: columnIndex(header, 'Channel ID'),
  };
  const cell = (row, i) => (i >= 0 ? String(row[i] || '').trim() : '');

  const entries = values.map((row, index) => {
    if (index === 0) return { index, kind: 'header' };
    const filled = (row || []).some((v) => String(v || '').trim() !== '');
    if (!filled) return { index, kind: 'empty' };
    const first = String(row[0] || '').trim().toUpperCase();
    const others = row.slice(1).some((v) => String(v || '').trim() !== '');
    if (LABELS.includes(first) && !others) return { index, kind: 'marker', label: first };
    return {
      index,
      kind: 'creator',
      name: cell(row, col.name >= 0 ? col.name : 0),
      status: cell(row, col.status),
      youtube: cell(row, col.youtube),
      channelId: cell(row, col.channelId),
    };
  });
  return { header, col, entries };
}

// Chaves de quem já está na planilha: channel ID, ids do link do YouTube e nome normalizado.
function existingKeys(entries) {
  const keys = new Set();
  for (const e of entries) {
    if (e.kind !== 'creator') continue;
    if (e.channelId) keys.add(`ytid:${e.channelId}`);
    for (const id of linkIds(e.youtube)) keys.add(id);
    const name = normalizeName(e.name);
    if (name) keys.add(`name:${name}`);
  }
  return keys;
}

function creatorKeys(creator) {
  const yt = creator.platforms.youtube;
  const keys = [`ytid:${yt.channel_id}`, ...linkIds(yt.url)];
  if (yt.handle) keys.push(`yt:${normalizeName(yt.handle)}`);
  const name = normalizeName(creator.name);
  if (name) keys.push(`name:${name}`);
  return keys;
}

function isInSheet(creator, keys) {
  return creatorKeys(creator).some((k) => keys.has(k));
}

function markerIndex(entries, label) {
  const e = entries.find((x) => x.kind === 'marker' && x.label === label);
  return e ? e.index : -1;
}

// Uma linha depois da última linha não vazia.
function dataEnd(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].kind !== 'empty') return i + 1;
  }
  return 1;
}

// Primeiro marcador que falta e onde inseri-lo, ou null se os três existem.
// Planilhas antigas (sem seções) estavam ordenadas por status: o marcador entra antes
// do primeiro creator daquela seção em diante.
function nextMissingMarker(entries) {
  const order = SECTIONS.map((s) => s.status);
  for (const [i, section] of SECTIONS.entries()) {
    if (markerIndex(entries, section.label) >= 0) continue;
    const prev = i > 0 ? markerIndex(entries, SECTIONS[i - 1].label) : 0;
    const later = order.slice(i); // este status e os seguintes
    const nextMarker = entries.find((e) => e.index > prev && e.kind === 'marker');
    const firstLater = entries.find((e) => e.index > prev && e.kind === 'creator' && later.includes(e.status));
    let at = dataEnd(entries);
    if (firstLater) at = firstLater.index;
    if (nextMarker && nextMarker.index < at) at = nextMarker.index;
    return { label: section.label, status: section.status, at: Math.max(at, 1) };
  }
  return null;
}

// Onde inserir creators novos de um status: logo antes do próximo marcador, ou no fim dos dados.
function sectionInsertAt(entries, status) {
  const label = SECTIONS.find((s) => s.status === status).label;
  const start = markerIndex(entries, label);
  if (start < 0) throw new Error(`Seção ${label} não encontrada na planilha.`);
  const next = entries.find((e) => e.index > start && e.kind === 'marker');
  if (next) {
    // Antes do próximo marcador, mas depois do último creator da seção (pula linhas vazias do fim).
    let at = next.index;
    while (at - 1 > start && entries[at - 1].kind === 'empty') at -= 1;
    return at;
  }
  return Math.max(dataEnd(entries), start + 1);
}

module.exports = {
  parseSheet,
  existingKeys,
  isInSheet,
  creatorKeys,
  markerIndex,
  nextMissingMarker,
  sectionInsertAt,
  dataEnd,
  LABELS,
};
