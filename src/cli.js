// Comandos de terminal. O julgamento (buscas, status, motivo, mensagens) é feito
// pelo Claude na sessão, lendo e escrevendo arquivos na pasta da Round.

const { reportKeys, redact, TEST_MODE, DAILY_QUOTA_GUARD } = require('./config');
const { newRound, runSearch, finalizeRound } = require('./pipeline');
const { findRoundDir } = require('./round');

const HELP = `Uso:
  node src/cli.js new "TEMA" [--round N] [--target N] [--red-alert] [--from AAAA-MM-DD --to AAAA-MM-DD] [--criteria "x"]
  node src/cli.js search "TEMA" [--round N] [--allow-quota N]
  node src/cli.js finalize "TEMA" [--round N]

Fluxo:
  1. new        cria a pasta da Round em output/ (ex.: output/wildfire-smoke/)
  2. (sessão)   o Claude escreve queries.json (8 a 15 buscas sobre o ASSUNTO, nunca sobre produto)
  3. search     pré-filtro, coleta e regras, em etapas: gera candidates.json e review.md
  4. (sessão)   o Claude lê o review.md e escreve judgments.json
  5. se faltarem creators válidos, repetir 3 e 4 (o search continua de onde parou)
  6. finalize   gera o CSV e atualiza a planilha do tema no Drive (mesmo tema = mesma planilha)

Opções do "new" (todas opcionais, só o tema é obrigatório):
  --round N      número da Round (entra no nome da pasta e da planilha)
  --target N     creators válidos desejados (padrão 20; no modo de teste, ${TEST_MODE.validCreators})
  --red-alert    Round de notícia: só conteúdo dentro da janela de datas
  --from/--to    janela de datas (padrão no Red Alert: últimos 30 dias)
  --criteria "x" critérios extras da Round (SOP 8.3)

Opção do "search":
  --allow-quota N  libera até N unidades de cota no dia (o alarme padrão é ${DAILY_QUOTA_GUARD})`;

function parseArgs(argv) {
  const opts = { command: argv[0], redAlert: false };
  const rest = [];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Falta o valor de ${arg}.`);
      return v;
    };
    if (arg === '--round') opts.round = Number(value());
    else if (arg === '--target') opts.target = Number(value());
    else if (arg === '--allow-quota') opts.allowQuota = Number(value());
    else if (arg === '--red-alert') opts.redAlert = true;
    else if (arg === '--from') opts.from = value();
    else if (arg === '--to') opts.to = value();
    else if (arg === '--criteria') opts.criteria = value();
    else if (arg.startsWith('--')) throw new Error(`Opção desconhecida: ${arg}`);
    else rest.push(arg);
  }
  if (!['new', 'search', 'finalize'].includes(opts.command)) {
    opts.help = true;
    return opts;
  }
  if (opts.round !== undefined && (!Number.isInteger(opts.round) || opts.round <= 0)) {
    throw new Error('--round precisa ser um número inteiro maior que zero.');
  }
  opts.theme = rest.join(' ').trim() || null;
  if (opts.allowQuota !== undefined && (!Number.isInteger(opts.allowQuota) || opts.allowQuota <= 0)) {
    throw new Error('--allow-quota precisa ser um número inteiro maior que zero.');
  }
  if (opts.command === 'new' && !opts.theme) throw new Error('Informe o tema entre aspas, ex.: "PENTAGON".');
  if (!opts.theme && !opts.round) throw new Error('Informe o tema entre aspas, ex.: "PENTAGON".');

  if (opts.command === 'new') {
    for (const key of ['target']) {
      if (opts[key] !== undefined && (!Number.isInteger(opts[key]) || opts[key] <= 0)) {
        throw new Error(`--${key} precisa ser um número inteiro maior que zero.`);
      }
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (opts.from || opts.to) {
      if (!dateRe.test(opts.from || '') || !dateRe.test(opts.to || '')) {
        throw new Error('Use --from e --to juntos, no formato AAAA-MM-DD.');
      }
      opts.window = { from: opts.from, to: opts.to };
    }
  }
  return opts;
}

function printProgress() {
  let lastStep = '';
  return (step, detail) => {
    if (step !== lastStep) {
      console.log(`\n== ${step}`);
      lastStep = step;
    }
    console.log(`   ${detail}`);
  };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Erro: ${err.message}\n\n${HELP}`);
    process.exit(1);
  }
  if (opts.help) {
    console.log(HELP);
    return;
  }

  if (opts.command === 'new') {
    const { dir, info, files } = newRound(opts);
    console.log(`${info.round ? `Round ${info.round}` : 'Round'} "${info.theme}" criada: ${dir}`);
    if (TEST_MODE.enabled) console.log(`Modo de teste: meta de ${TEST_MODE.validCreators} creators válidos (Approved ou Maybe).`);
    console.log(`Tipo: ${info.red_alert ? `Red Alert, janela ${info.window.from} a ${info.window.to}` : 'regular'}`);
    console.log(`Meta: ${info.target} creators válidos`);
    console.log(`\nPróximo passo: o Claude escreve ${files.queries} na sessão.`);
    return;
  }

  const dir = findRoundDir(opts.round || null, opts.theme);

  if (opts.command === 'search') {
    reportKeys();
    const started = Date.now();
    const { stats, files } = await runSearch(dir, printProgress(), { allowQuota: opts.allowQuota });
    console.log('\n== Resultado desta etapa');
    console.log(`   Coletados: ${stats.collected} | Pré-filtro: ${stats.prefiltered} | Menores que 10K: ${stats.small} | Já na planilha: ${stats.excluded}`);
    console.log(`   Válidos até agora: ${stats.valid} | Aguardando julgamento: ${stats.toJudge}`);
    console.log(`   Buscas restantes: ${stats.remainingQueries} | Canais na fila: ${stats.queue}`);
    console.log(`   ${files.review}`);
    console.log('\n== Cota do YouTube');
    console.log(`   Esta etapa: ${stats.unitsThisRun} unidades | Hoje: ${stats.unitsToday} (alarme em ${opts.allowQuota || DAILY_QUOTA_GUARD})`);
    console.log(`   Tempo: ${Math.round((Date.now() - started) / 1000)}s`);
    if (stats.need === 0) console.log('\nMeta de válidos já atingida: próximo passo é o finalize.');
    else if (stats.toJudge) console.log(`\nPróximo passo: o Claude julga o review.md e escreve ${files.judgments}.`);
    else console.log('\nAs buscas acabaram sem novos candidatos: escrever mais buscas no queries.json ou rodar o finalize.');
    return;
  }

  if (opts.command === 'finalize') {
    const { csvPath, sheet, counts, warnings } = await finalizeRound(dir);
    for (const w of warnings) console.log(`Aviso: ${w}`);
    console.log(`Approved: ${counts.approved} | Maybe: ${counts.maybe} | Not approved: ${counts.notApproved} | Válidos: ${counts.valid} de ${counts.target}`);
    console.log(`CSV: ${csvPath}`);
    if (sheet) {
      console.log(`Planilha ${sheet.created ? 'criada' : 'atualizada'}: ${sheet.folder}/${sheet.name}`);
      console.log(`   Adicionados: ${sheet.added.length}${sheet.added.length ? ` (${sheet.added.map((c) => `${c.name}: ${c.status}`).join('; ')})` : ''}`);
      if (sheet.skipped.length) console.log(`   Já estavam na planilha (não repetidos): ${sheet.skipped.map((c) => c.name).join('; ')}`);
      console.log(`Link: ${sheet.url}`);
    }
  }
}

main().catch((err) => {
  console.error(`\nErro: ${redact(err.message || err)}`);
  process.exit(1);
});
