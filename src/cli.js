// Comandos de terminal. O julgamento (buscas, status, motivo, mensagens) é feito
// pelo Claude na sessão, lendo e escrevendo arquivos na pasta da Round.

const { reportKeys, redact } = require('./config');
const { newRound, runSearch, finalizeRound } = require('./pipeline');
const { findRoundDir } = require('./round');

const HELP = `Uso:
  node src/cli.js new "TEMA" --round N [--target N] [--limit N] [--red-alert] [--from AAAA-MM-DD --to AAAA-MM-DD] [--criteria "x"]
  node src/cli.js search --round N [--theme "TEMA"]
  node src/cli.js finalize --round N [--theme "TEMA"]

Fluxo:
  1. new        cria output/round-NN-tema/ com o round.json
  2. (sessão)   o Claude escreve queries.json
  3. search     busca no YouTube, métricas e regras: gera candidates.json e review.md
  4. (sessão)   o Claude lê o review.md e escreve judgments.json
  5. finalize   junta tudo e gera o CSV (usa messages.json se existir)

Opções do "new":
  --round N      número da Round (obrigatório)
  --target N     quantidade alvo de creators (padrão 20)
  --limit N      máximo de canais coletados (padrão 2x o alvo)
  --red-alert    Round de notícia: só conteúdo dentro da janela de datas
  --from/--to    janela de datas (padrão no Red Alert: últimos 30 dias)
  --criteria "x" critérios extras da Round (SOP 8.3)

Opção do "search" e "finalize":
  --theme "TEMA" só se houver mais de uma pasta com o mesmo número de Round`;

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
    else if (arg === '--limit') opts.limit = Number(value());
    else if (arg === '--red-alert') opts.redAlert = true;
    else if (arg === '--from') opts.from = value();
    else if (arg === '--to') opts.to = value();
    else if (arg === '--criteria') opts.criteria = value();
    else if (arg === '--theme') opts.theme = value();
    else if (arg.startsWith('--')) throw new Error(`Opção desconhecida: ${arg}`);
    else rest.push(arg);
  }
  if (!['new', 'search', 'finalize'].includes(opts.command)) {
    opts.help = true;
    return opts;
  }
  if (!Number.isInteger(opts.round) || opts.round <= 0) throw new Error('Informe --round com um número.');

  if (opts.command === 'new') {
    opts.theme = rest.join(' ').trim();
    if (!opts.theme) throw new Error('Informe o tema entre aspas.');
    for (const key of ['target', 'limit']) {
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
    console.log(`Round ${info.round} criada: ${dir}`);
    console.log(`Tipo: ${info.red_alert ? `Red Alert, janela ${info.window.from} a ${info.window.to}` : 'regular'}`);
    console.log(`Alvo: ${info.target} | Máximo de canais coletados: ${info.limit}`);
    console.log(`\nPróximo passo: o Claude escreve ${files.queries} na sessão.`);
    return;
  }

  const dir = findRoundDir(opts.round, opts.theme);

  if (opts.command === 'search') {
    reportKeys();
    const started = Date.now();
    const { meta, files } = await runSearch(dir, printProgress());
    console.log('\n== Resultado');
    console.log(`   Canais coletados: ${meta.to_judge + meta.failed_by_rules}`);
    console.log(`   Para julgar: ${meta.to_judge} | Reprovados por regra: ${meta.failed_by_rules}`);
    console.log(`   ${files.candidates}`);
    console.log(`   ${files.review}`);
    console.log('\n== Custos desta execução');
    console.log(`   YouTube API: ${meta.youtube_quota_units} unidades de cota (de 10.000 grátis por dia), ${meta.youtube_api_calls} chamadas`);
    console.log(`   Tempo: ${Math.round((Date.now() - started) / 1000)}s`);
    console.log(`\nPróximo passo: o Claude lê o review.md e escreve ${files.judgments} na sessão.`);
    return;
  }

  if (opts.command === 'finalize') {
    const { csvPath, counts, warnings } = finalizeRound(dir);
    for (const w of warnings) console.log(`Aviso: ${w}`);
    console.log(`Approved: ${counts.approved} | Maybe: ${counts.maybe} | Not approved: ${counts.notApproved}`);
    console.log(`CSV: ${csvPath}`);
  }
}

main().catch((err) => {
  console.error(`\nErro: ${redact(err.message || err)}`);
  process.exit(1);
});
