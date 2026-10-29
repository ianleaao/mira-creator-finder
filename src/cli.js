// Comando de terminal da Fase 1.
// Uso: node src/cli.js "Pentagon FORTRESS" --round 25 --target 20 --red-alert
// Opções: --limit N (máximo de canais coletados), --from AAAA-MM-DD --to AAAA-MM-DD (janela),
// --criteria "texto" (critérios extras da Round)

const { reportKeys, redact } = require('./config');
const { runRound } = require('./pipeline');

const HELP = `Uso: node src/cli.js "TEMA" --round N [--target N] [--limit N] [--red-alert] [--from AAAA-MM-DD --to AAAA-MM-DD]

  --round N      número da Round (obrigatório)
  --target N     quantidade alvo de creators (padrão 20)
  --limit N      máximo de canais coletados (padrão 2x o alvo)
  --red-alert    Round de notícia: só conteúdo dentro da janela de datas
  --from/--to    janela de datas (padrão no Red Alert: últimos 30 dias)
  --criteria "x" critérios extras da Round, em inglês (SOP 8.3), ex.: "creator must narrate, no gaming"`;

function parseArgs(argv) {
  const opts = { redAlert: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
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
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg.startsWith('--')) throw new Error(`Opção desconhecida: ${arg}`);
    else rest.push(arg);
  }
  opts.theme = rest.join(' ').trim();

  if (opts.help) return opts;
  if (!opts.theme) throw new Error('Informe o tema entre aspas.');
  if (!Number.isInteger(opts.round) || opts.round <= 0) throw new Error('Informe --round com um número.');
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
  return opts;
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

  reportKeys();
  console.log('');
  console.log(`Round ${opts.round}: "${opts.theme}"${opts.redAlert ? ' (Red Alert)' : ''}`);

  let lastStep = '';
  const onProgress = (step, detail) => {
    if (step !== lastStep) {
      console.log(`\n== ${step}`);
      lastStep = step;
    }
    console.log(`   ${detail}`);
  };

  const started = Date.now();
  const { creators, meta, files } = await runRound(opts, onProgress);
  const seconds = Math.round((Date.now() - started) / 1000);

  console.log('\n== Resultado');
  console.log(`   Creators salvos: ${creators.length}`);
  console.log(`   Approved: ${meta.approved} | Maybe: ${meta.maybe} | Not approved: ${meta.not_approved}`);
  console.log(`   CSV:  ${files.csvPath}`);
  console.log(`   JSON: ${files.jsonPath}`);
  console.log('\n== Custos desta execução');
  console.log(`   YouTube API: ${meta.youtube_quota_units} unidades de cota (de 10.000 grátis por dia), ${meta.youtube_api_calls} chamadas`);
  console.log(`   Claude: ${meta.claude_calls} chamada(s), cerca de US$ ${meta.claude_cost_usd.toFixed(4)}`);
  console.log(`   Tempo: ${seconds}s`);
}

main().catch((err) => {
  console.error(`\nErro: ${redact(err.message || err)}`);
  process.exit(1);
});
