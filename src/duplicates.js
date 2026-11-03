// Checagem de duplicados no Monday (Fase 3), só para creators Approved e Maybe.
// Compara pelo nome do influenciador (coluna Item, inclusive cada parte separada por "/")
// e pelos links e @ da coluna "Handle / Contact". Usa a normalização do SOP 7.4 (dedupe.js).

const { buildIndex, findMatches, duplicateText } = require('./dedupe');

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;
const AT_RE = /(?:^|\s)(@[\w.]{2,})/g;

// Grupos do board que indicam afiliado existente (SOP 7.5).
const PAID_GROUPS = ['paid only'];

// Itens do Monday no formato de entradas do índice de duplicados.
function mondayEntries(items) {
  const entries = [];
  for (const item of items) {
    const text = String(item.handle || '');
    const links = [
      ...(text.match(URL_RE) || []),
      ...[...text.matchAll(AT_RE)].map((m) => m[1]),
    ];
    const group = String(item.group || '').toLowerCase();
    const affiliate = PAID_GROUPS.includes(group) ? 'paid' : null;
    // "Evgeniy Kletskin / bykletskin_": o nome inteiro e cada parte entram como nomes.
    const names = [item.name, ...String(item.name).split('/').map((p) => p.trim())].filter(Boolean);
    for (const name of [...new Set(names)]) {
      entries.push({ name, links, source: 'monday', detail: item.group, mondayName: item.name, affiliate });
    }
  }
  return entries;
}

// Aplica a checagem nos creators (altera os objetos). items = itens do Monday, ou null se não houve leitura.
// Devolve a lista de duplicados encontrados.
function applyMondayCheck(creators, items) {
  const found = [];
  const index = items ? buildIndex(mondayEntries(items)) : null;
  for (const c of creators) {
    if (c.status !== 'Approved' && c.status !== 'Maybe') {
      c.duplicate_check = 'Not checked (not approved)';
      continue;
    }
    if (!index) {
      c.duplicate_check = 'Monday not checked';
      continue;
    }
    const matches = findMatches(c, index);
    // As planilhas do tema já foram usadas como exclusão na busca: contam como checadas.
    c.duplicate_check = duplicateText(matches, { monday: true, sheet: true });
    if (!matches.length) continue;

    const m = matches[0];
    const how = m.reason === 'name' ? 'by name' : 'by link';
    c.previous_status = c.status;
    c.status = 'Not approved';
    c.why = `Already on Monday (${m.detail}): "${m.mondayName}", matched ${how}`;
    c.notes.push(`Monday duplicate check: was ${c.previous_status} before the check`);
    found.push({ name: c.name, mondayName: m.mondayName, group: m.detail, how, previous: c.previous_status });
  }
  return found;
}

module.exports = { mondayEntries, applyMondayCheck };
