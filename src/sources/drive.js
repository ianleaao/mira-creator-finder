// Saída no Google Drive (Fase 5), com o login OAuth do Ian (escopo drive.file).
//
// CREATORS FIND/                      pasta criada pelo próprio app (ID salvo em local-config.json)
//   PENTAGON/                         uma subpasta por tema, em maiúsculas (reutilizada se já existir)
//     Round 25 - PENTAGON - 2026-10-29   planilha nova a cada execução, nunca sobrescreve
//
// Com drive.file o app só enxerga o que ele mesmo criou; por isso a pasta raiz não pode ser criada à mão.

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { ROOT } = require('../config');
const { getAuth } = require('./google-auth');
const { COLUMNS, STATUS_COLORS, toRow } = require('../sheet-template');

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

// Pasta "CREATORS FIND": usa o ID salvo; se não existir mais (ou estiver na lixeira), cria de novo.
async function ensureRootFolder(drive) {
  const cfg = readLocalConfig();
  if (cfg.creatorsFindFolderId) {
    try {
      const { data } = await drive.files.get({ fileId: cfg.creatorsFindFolderId, fields: 'id, trashed' });
      if (!data.trashed) return data.id;
    } catch (err) {
      const status = err.response && err.response.status;
      if (status !== 404 && status !== 403) throw err;
    }
  }
  const { data } = await drive.files.create({
    requestBody: { name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME },
    fields: 'id',
  });
  writeLocalConfig({ ...cfg, creatorsFindFolderId: data.id });
  return data.id;
}

// Subpasta do tema dentro de "CREATORS FIND": reutiliza se já existir.
async function ensureThemeFolder(drive, parentId, name) {
  const { data } = await drive.files.list({
    q: `name = '${escapeQuery(name)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 10,
  });
  if (data.files && data.files.length) return data.files[0].id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: 'id',
  });
  return created.data.id;
}

async function existingSheetNames(drive, folderId) {
  const names = new Set();
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = '${SHEET_MIME}' and trashed = false`,
      fields: 'nextPageToken, files(name)',
      pageSize: 1000,
      pageToken,
    });
    for (const f of data.files || []) names.add(f.name);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return names;
}

function hexToColor(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

// Formatação: cabeçalho em negrito e congelado, larguras do template, cor do nome por status.
function formatRequests(sheetId, creators) {
  const requests = [
    { updateSheetProperties: { properties: { sheetId, title: TAB_NAME, gridProperties: { frozenRowCount: 1 } }, fields: 'title,gridProperties.frozenRowCount' } },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: hexToColor('#d9d9d9') } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    },
  ];
  COLUMNS.forEach((col, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: col.width },
        fields: 'pixelSize',
      },
    });
  });
  creators.forEach((c, i) => {
    const color = STATUS_COLORS[c.status || ''];
    if (!color) return;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: i + 1, endRowIndex: i + 2, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { backgroundColor: hexToColor(color) } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    });
  });
  return requests;
}

// Cria a planilha da Round no Drive. Devolve { name, url, folder }.
async function createRoundSheet({ theme, round, creators, date = new Date() }) {
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const sheets = google.sheets({ version: 'v4', auth });

  const rootId = await ensureRootFolder(drive);
  const folderName = themeFolderName(theme);
  const folderId = await ensureThemeFolder(drive, rootId, folderName);

  const base = sheetBaseName(theme, round, date.toISOString().slice(0, 10));
  const name = uniqueName(base, await existingSheetNames(drive, folderId));

  // Planilha nova (nunca reaproveita uma existente).
  const created = await drive.files.create({
    requestBody: { name, mimeType: SHEET_MIME, parents: [folderId] },
    fields: 'id, webViewLink',
  });
  const spreadsheetId = created.data.id;

  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId))' });
  const sheetId = meta.data.sheets[0].properties.sheetId;

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: formatRequests(sheetId, creators) } });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${TAB_NAME}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNS.map((c) => c.header), ...creators.map(toRow)] },
  });

  return { name, url: created.data.webViewLink, folder: `${ROOT_FOLDER_NAME}/${folderName}` };
}

module.exports = { createRoundSheet, sheetBaseName, themeFolderName, uniqueName, formatRequests };
