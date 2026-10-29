// Gera o CSV final da Round a partir do template (sheet-template.js).

const fs = require('fs');
const path = require('path');
const { COLUMNS, toRow } = require('./sheet-template');

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(creators) {
  const lines = [COLUMNS.map((col) => csvCell(col.header)).join(',')];
  for (const c of creators) lines.push(toRow(c).map(csvCell).join(','));
  // BOM para o Excel no Windows reconhecer UTF-8 (acentos e emojis).
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Salva o CSV na pasta da Round. Devolve o caminho.
function saveCsv(dir, creators, date = new Date()) {
  const file = path.join(dir, `${path.basename(dir)}-${date.toISOString().slice(0, 10)}.csv`);
  fs.writeFileSync(file, toCsv(creators), 'utf8');
  return file;
}

module.exports = { toCsv, saveCsv };
