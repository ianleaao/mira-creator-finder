// Pasta de cada Round dentro de output/ e leitura/escrita dos arquivos dela.
//
// output/round-25-pentagon-fortress/
//   round.json        configuração da Round (criado pelo comando "new")
//   queries.json      buscas (escrito pelo Claude na sessão)
//   candidates.json   canais coletados, métricas e regras (comando "search")
//   review.md         resumo compacto para o Claude julgar (comando "search")
//   judgments.json    julgamento de cada canal (escrito pelo Claude na sessão)
//   messages.json     mensagens do Bryce (escrito pelo Claude na sessão, Fase 6)
//   round-25-pentagon-fortress-AAAA-MM-DD.csv   resultado final (comando "finalize")

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./config');

const OUTPUT_DIR = path.join(ROOT, 'output');

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const pad = (round) => String(round).padStart(2, '0');

// Nome da pasta: "round-25-pentagon" com número, ou só "pentagon" sem número.
function roundDirName(round, theme) {
  return round ? `round-${pad(round)}-${slugify(theme)}` : slugify(theme);
}

// Acha a pasta da Round pelo tema e/ou pelo número.
function findRoundDir(round = null, theme = null) {
  if (!round && !theme) throw new Error('Informe o tema (ou --round).');
  const dirs = fs.existsSync(OUTPUT_DIR)
    ? fs.readdirSync(OUTPUT_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  const slug = theme ? slugify(theme) : null;
  const matches = dirs.filter((name) => {
    if (round && theme) return name === roundDirName(round, theme);
    if (round) return name.startsWith(`round-${pad(round)}-`);
    return name === slug || new RegExp(`^round-\\d+-${slug}$`).test(name);
  });
  const label = [round ? `Round ${round}` : null, theme ? `"${theme}"` : null].filter(Boolean).join(' ');
  if (matches.length === 0) throw new Error(`Nenhuma pasta para ${label} em output/. Rode o comando "new" antes.`);
  if (matches.length > 1) {
    throw new Error(`Mais de uma pasta para ${label}: ${matches.join(', ')}. Informe o tema e o --round juntos.`);
  }
  return path.join(OUTPUT_DIR, matches[0]);
}

function readJson(file, label) {
  if (!fs.existsSync(file)) throw new Error(`Arquivo não encontrado: ${file} (${label}).`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`JSON inválido em ${file} (${label}): ${err.message}`);
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function files(dir) {
  return {
    round: path.join(dir, 'round.json'),
    queries: path.join(dir, 'queries.json'),
    candidates: path.join(dir, 'candidates.json'),
    review: path.join(dir, 'review.md'),
    judgments: path.join(dir, 'judgments.json'),
    messages: path.join(dir, 'messages.json'),
  };
}

module.exports = { OUTPUT_DIR, slugify, pad, roundDirName, findRoundDir, readJson, writeJson, files };
