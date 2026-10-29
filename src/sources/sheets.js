// Leitura da planilha principal "Potential New Affiliates on Instagram, YouTube and TikTok".
// Somente leitura (escopo spreadsheets.readonly). Nunca escreve nada nela.

const { google } = require('googleapis');
const { getAuth } = require('./google-auth');

// Aceita o ID puro ou a URL completa da planilha.
function sheetIdFrom(value) {
  const match = String(value || '').match(/\/spreadsheets\/d\/([\w-]+)/);
  return match ? match[1] : String(value || '').trim();
}

function friendlyError(err, id) {
  const status = err.response && err.response.status;
  if (status === 404) return new Error(`Planilha não encontrada (ID ${id}). Confira o MAIN_SHEET_ID.`);
  if (status === 403) return new Error('Sem acesso à planilha principal com a conta do login no Google.');
  return err;
}

// Lê todas as abas da planilha: [{ title, rows: [[célula, ...], ...] }].
async function readAllTabs(spreadsheetId) {
  const id = sheetIdFrom(spreadsheetId);
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'properties(title),sheets(properties(title))' });
    const titles = meta.data.sheets.map((s) => s.properties.title);
    const quoted = titles.map((t) => `'${t.replace(/'/g, "''")}'`);
    const values = await sheets.spreadsheets.values.batchGet({ spreadsheetId: id, ranges: quoted });
    return {
      title: meta.data.properties.title,
      tabs: titles.map((title, i) => ({ title, rows: values.data.valueRanges[i].values || [] })),
    };
  } catch (err) {
    throw friendlyError(err, id);
  }
}

module.exports = { readAllTabs, sheetIdFrom };
