// Leitura do board do Monday "Affiliate Partnership Tracking" (somente leitura).
// Usado na checagem de duplicados: nome do influenciador (coluna Item) e o link
// ou @ da coluna "Handle / Contact".

const { requireKey } = require('../config');

const API_URL = 'https://api.monday.com/v2';
const API_VERSION = '2024-10';
const HANDLE_COLUMN_TITLE = 'Handle / Contact';
const PAGE_SIZE = 500;

async function query(text, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: requireKey('MONDAY_TOKEN'),
      'API-Version': API_VERSION,
    },
    body: JSON.stringify({ query: text, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.errors || data.error_message || !res.ok) {
    const detail = data.errors ? data.errors.map((e) => e.message).join('; ') : data.error_message || `HTTP ${res.status}`;
    throw Object.assign(new Error(`Erro na API do Monday: ${detail}`), { fatal: /not authenticated|unauthorized/i.test(detail) });
  }
  return data.data;
}

// Nome do board, grupos e colunas (para conferência).
async function boardInfo(boardId = requireKey('MONDAY_BOARD_ID')) {
  const data = await query(`query ($id: [ID!]) { boards(ids: $id) { name items_count groups { id title } columns { id title type } } }`, { id: [boardId] });
  if (!data.boards.length) throw new Error(`Board ${boardId} não encontrado no Monday.`);
  return data.boards[0];
}

// Todos os itens do board (todos os grupos), com paginação por cursor.
// Devolve [{ name, handle, group }].
async function readAllItems(boardId = requireKey('MONDAY_BOARD_ID')) {
  const info = await boardInfo(boardId);
  const handleCol = info.columns.find((c) => c.title.trim().toLowerCase() === HANDLE_COLUMN_TITLE.toLowerCase());
  if (!handleCol) throw new Error(`Coluna "${HANDLE_COLUMN_TITLE}" não encontrada no board ${info.name}.`);

  const fields = `cursor items { name group { title } column_values(ids: ["${handleCol.id}"]) { text } }`;
  const items = [];
  let page = (await query(`query ($id: [ID!]) { boards(ids: $id) { items_page(limit: ${PAGE_SIZE}) { ${fields} } } }`, { id: [boardId] }))
    .boards[0].items_page;
  for (;;) {
    for (const it of page.items) {
      items.push({ name: it.name, handle: (it.column_values[0] && it.column_values[0].text) || '', group: it.group ? it.group.title : '' });
    }
    if (!page.cursor) break;
    page = (await query(`query ($cursor: String!) { next_items_page(limit: ${PAGE_SIZE}, cursor: $cursor) { ${fields} } }`, { cursor: page.cursor }))
      .next_items_page;
  }
  return { board: info.name, items };
}

module.exports = { boardInfo, readAllItems, HANDLE_COLUMN_TITLE };
