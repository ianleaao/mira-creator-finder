// Saída no Google Drive (Fase 5), com o login OAuth do Ian (escopo drive.file).
//
// CREATORS FIND/                       pasta criada pelo próprio app (ID salvo em local-config.json)
//   WILDFIRE SMOKE/                    uma subpasta por tema, em maiúsculas
//     WILDFIRE SMOKE - 2026-10-29      UMA planilha por tema (criada só quando o tema é novo)
//
// Mesmo tema = mesma planilha: creators novos entram na seção do status deles
// (APPROVED, MAYBE, NOT APPROVED). Nunca apaga linhas nem sobrescreve células existentes.
// Com drive.file o app só enxerga o que ele mesmo criou; por isso a pasta raiz não pode ser criada à mão.

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { ROOT } = require('../config');
const { getAuth } = require('./google-auth');
const { COLUMNS, SECTIONS, STATUS_COLORS, toRowForHeader } = require('../sheet-template');
const merge = require('../sheet-merge');

const LOCAL_CONFIG = path.join(ROOT, 'local-config.json');
const ROOT_FOLDER_NAME = 'CREATORS FIND';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet';
const TAB_NAME = 'Creators';

function readLocalConfig() {
  return fs.existsSync(LOCAL_CONFIG) ? JSON.parse(fs.readFileSync(LOCAL_CONFIG, 'utf8')) : {};
}

function writeLocalConfig(cfg) {
  fs.writeFileSync(LOCAL_CONFIG, JSON.stringify(cfg, null, 2), 'utf8');
}

// Escapa aspas e barras para a busca do Drive (parâmetro q).
const escapeQuery = (text) => String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Nome da subpasta: o tema em maiúsculas, sem espaços sobrando.
function themeFolderName(theme) {
  return String(theme).replace(/\s+/g, ' ').trim().toUpperCase();
}

// Nome da planilha: "Round 25 - PENTAGON - 2026-10-29" (sem número: "PENTAGON - 2026-10-29").
function sheetBaseName(theme, round, date) {
  const prefix = round ? `Round ${String(round).padStart(2, '0')} - ` : '';
  return `${prefix}${themeFolderName(theme)} - ${date}`;
}

// Se o nome já existe na pasta, acrescenta (2), (3)...
function uniqueName(base, existing) {
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base} (${n})`)) n += 1;
  return `${base} (${n})`;
}

function clients() {
  const auth = getAuth();
  return { drive: google.drive({ version: 'v3', auth }), sheets: google.sheets({ version: 'v4', auth }) };
}

async function isAlive(drive, fileId) {
  try {
    const { data } = await drive.files.get({ fileId, fields: 'id, trashed' });
    return !data.trashed;
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 404 || status === 403) return false;
    throw err;
  }
}

// Pasta "CREATORS FIND": usa o ID salvo; se não existir mais (ou estiver na lixeira), cria de novo.
async function ensureRootFolder(drive) {
  const cfg = readLocalConfig();
  if (cfg.creatorsFindFolderId && await isAlive(drive, cfg.creatorsFindFolderId)) return cfg.creatorsFindFolderId;
  const { data } = await drive.files.create({
    requestBody: { name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: 'id',
  });
  writeLocalConfig({ ...readLocalConfig(), creatorsFindFolderId: data.id });
  return data.id;
}

async function findThemeFolder(drive, parentId, name) {
  const { data } = await drive.files.list({
    q: `name = '${escapeQuery(name)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 10,
  });
  return data.files && data.files.length ? data.files[0].id : null;
}

async function listSheets(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = '${SHEET_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(id, name, createdTime, webViewLink)',
      orderBy: 'createdTime',
      pageSize: 1000,
      pageToken,
    });
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

// Planilha existente do tema: a salva no local-config; senão, a mais antiga da pasta do tema.
async function findThemeSheet(drive, theme) {
  const key = themeFolderName(theme);
  const cfg = readLocalConfig();
  const saved = cfg.themes && cfg.themes[key];
  if (saved && await isAlive(drive, saved)) return saved;

  const rootId = await ensureRootFolder(drive);
  const folderId = await findThemeFolder(drive, rootId, key);
  if (!folderId) return null;
  const sheetsInFolder = await listSheets(drive, folderId);
  if (!sheetsInFolder.length) return null;
  const id = sheetsInFolder[0].id;
  writeLocalConfig({ ...readLocalConfig(), themes: { ...(readLocalConfig().themes || {}), [key]: id } });
  return id;
}

function hexToColor(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

// Lê a primeira aba inteira.
async function readTab(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties(title),sheets(properties(sheetId,title,gridProperties))',
  });
  const props = meta.data.sheets[0].properties;
  const quoted = `'${props.title.replace(/'/g, "''")}'`;
  const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: quoted });
  return { title: meta.data.properties.title, tab: props, quoted, values: data.values || [] };
}

async function batch(sheets, spreadsheetId, requests) {
  if (requests.length) await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
}

function insertRowsRequest(sheetId, at, count) {
  return { insertDimension: { range: { sheetId, dimension: 'ROWS', startIndex: at, endIndex: at + count }, inheritFromBefore: false } };
}

function paintRequest(sheetId, row, endCol, color, bold = false) {
  const format = { backgroundColor: hexToColor(color) };
  if (bold) format.textFormat = { bold: true };
  return {
    repeatCell: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: endCol },
      cell: { userEnteredFormat: format },
      fields: bold ? 'userEnteredFormat(backgroundColor,textFormat)' : 'userEnteredFormat.backgroundColor',
    },
  };
}

// Garante a coluna "Channel ID" no cabeçalho (só escreve numa célula de cabeçalho vazia).
async function ensureChannelIdColumn(sheets, spreadsheetId, sheet) {
  const header = sheet.values[0] || [];
  if (merge.parseSheet(sheet.values).col.channelId >= 0) return false;
  const col = header.length;
  if (col >= sheet.tab.gridProperties.columnCount) {
    await batch(sheets, spreadsheetId, [{ appendDimension: { sheetId: sheet.tab.sheetId, dimension: 'COLUMNS', length: col - sheet.tab.gridProperties.columnCount + 1 } }]);
  }
  const letter = columnLetter(col);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheet.quoted}!${letter}1`,
    valueInputOption: 'RAW',
    requestBody: { values: [['Channel ID']] },
  });
  return true;
}

function columnLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Insere os marcadores de seção que faltam (relendo a planilha a cada inserção).
async function ensureSections(sheets, spreadsheetId) {
  for (let guard = 0; guard < SECTIONS.length; guard++) {
    const sheet = await readTab(sheets, spreadsheetId);
    const { entries, header } = merge.parseSheet(sheet.values);
    const missing = merge.nextMissingMarker(entries);
    if (!missing) return;
    const width = Math.max(header.length, 1);
    await batch(sheets, spreadsheetId, [
      insertRowsRequest(sheet.tab.sheetId, missing.at, 1),
      paintRequest(sheet.tab.sheetId, missing.at, width, STATUS_COLORS[missing.status], true),
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.quoted}!A${missing.at + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[missing.label]] },
    });
  }
}

// Junta creators novos na planilha. Devolve { added: [...], skipped: [...] }.
async function mergeIntoSheet(sheets, spreadsheetId, creators) {
  let sheet = await readTab(sheets, spreadsheetId);
  await ensureChannelIdColumn(sheets, spreadsheetId, sheet);
  await ensureSections(sheets, spreadsheetId);

  sheet = await readTab(sheets, spreadsheetId);
  const keys = merge.existingKeys(merge.parseSheet(sheet.values).entries);
  const fresh = [];
  const skipped = [];
  const seen = new Set();
  for (const c of creators) {
    if (merge.isInSheet(c, keys) || seen.has(c.platforms.youtube.channel_id)) skipped.push(c);
    else {
      fresh.push(c);
      seen.add(c.platforms.youtube.channel_id);
    }
  }

  // De baixo para cima (NOT APPROVED, MAYBE, APPROVED), relendo a cada seção.
  for (const section of [...SECTIONS].reverse()) {
    const group = fresh.filter((c) => c.status === section.status);
    if (!group.length) continue;
    sheet = await readTab(sheets, spreadsheetId);
    const { entries, header } = merge.parseSheet(sheet.values);
    const at = merge.sectionInsertAt(entries, section.status);
    const rows = group.map((c) => toRowForHeader(c, header));
    await batch(sheets, spreadsheetId, [
      insertRowsRequest(sheet.tab.sheetId, at, group.length),
      ...group.map((c, i) => paintRequest(sheet.tab.sheetId, at + i, 1, STATUS_COLORS[c.status])),
    ]);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheet.quoted}!A${at + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
  }
  return { added: fresh, skipped };
}

// Cria a planilha de um tema novo (cabeçalho, larguras, seções vazias).
async function createThemeSheet(drive, sheets, { theme, round, date }) {
  const rootId = await ensureRootFolder(drive);
  const folderName = themeFolderName(theme);
  const folderId = await findThemeFolder(drive, rootId, folderName) || (await drive.files.create({
    requestBody: { name: folderName, mimeType: FOLDER_MIME, parents: [rootId] },
    fields: 'id',
  })).data.id;

  const existing = new Set((await listSheets(drive, folderId)).map((f) => f.name));
  const name = uniqueName(sheetBaseName(theme, round, date), existing);
  const created = await drive.files.create({
    requestBody: { name, mimeType: SHEET_MIME, parents: [folderId] },
    fields: 'id',
  });
  const spreadsheetId = created.data.id;

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId))' });
  const sheetId = meta.data.sheets[0].properties.sheetId;
  await batch(sheets, spreadsheetId, [
    { updateSheetProperties: { properties: { sheetId, title: TAB_NAME, gridProperties: { frozenRowCount: 1 } }, fields: 'title,gridProperties.frozenRowCount' } },
    paintRequest(sheetId, 0, COLUMNS.length, '#d9d9d9', true),
    ...COLUMNS.map((col, i) => ({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: col.width },
        fields: 'pixelSize',
      },
    })),
  ]);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNS.map((c) => c.header)] },
  });

  const cfg = readLocalConfig();
  writeLocalConfig({ ...cfg, themes: { ...(cfg.themes || {}), [folderName]: spreadsheetId } });
  return spreadsheetId;
}

// Publica a Round: usa a planilha do tema se existir; senão cria uma. Devolve o resumo.
async function publishRound({ theme, round, creators, date = new Date() }) {
  const { drive, sheets } = clients();
  let spreadsheetId = await findThemeSheet(drive, theme);
  const created = !spreadsheetId;
  if (created) spreadsheetId = await createThemeSheet(drive, sheets, { theme, round, date: date.toISOString().slice(0, 10) });

  const { added, skipped } = await mergeIntoSheet(sheets, spreadsheetId, creators);
  const { data } = await drive.files.get({ fileId: spreadsheetId, fields: 'name, webViewLink' });
  return {
    created,
    name: data.name,
    url: data.webViewLink,
    folder: `${ROOT_FOLDER_NAME}/${themeFolderName(theme)}`,
    added,
    skipped,
  };
}

// Chaves de quem já está na planilha do tema (para excluir da busca). Vazio se o tema é novo.
async function themeSheetKeys(theme) {
  const { drive, sheets } = clients();
  const spreadsheetId = await findThemeSheet(drive, theme);
  if (!spreadsheetId) return { keys: new Set(), count: 0 };
  const sheet = await readTab(sheets, spreadsheetId);
  const { entries } = merge.parseSheet(sheet.values);
  return { keys: merge.existingKeys(entries), count: entries.filter((e) => e.kind === 'creator').length };
}

module.exports = { publishRound, themeSheetKeys, sheetBaseName, themeFolderName, uniqueName, columnLetter };
