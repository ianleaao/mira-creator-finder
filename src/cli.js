// Comandos de terminal. O julgamento (buscas, status, motivo, mensagens) é feito
// pelo Claude na sessão, lendo e escrevendo arquivos na pasta da Round.

const { reportKeys, redact, TEST_MODE, DAILY_QUOTA_GUARD } = require('./config');
const { newRound, runSearch, finalizeRound, messagesBrief } = require('./pipeline');
const { findRoundDir } = require('./round');

const HELP = `Uso:
  node src/cli.js new "TEMA" [--round N] [--target N] [--red-alert] [--from AAAA-MM-DD --to AAAA-MM-DD] [--criteria "x"] [--trigger-age N] [--allow-niche "a,b"]
  node src/cli.js search "TEMA" [--round N] [--allow-quota N]
  node src/cli.js messages "TEMA" [--round N]
  node src/cli.js finalize "TEMA" [--round N]

Fluxo:
  1. new        cria a pasta da Round em output/ (ex.: output/wildfire-smoke/)
  2. (sessão)   o Claude escreve queries.json (8 a 15 buscas sobre o ASSUNTO, nunca sobre produto)
  3. search     pré-filtro, coleta e regras, em etapas: gera candidates.json e review.md
  4. (sessão)   o Claude lê o review.md e escreve judgments.json
  5. se faltarem creators válidos, repetir 3 e 4 (o search continua de onde parou)
  6. messages   resumo dos Approved (já checados no Monday) para o Claude escrever as mensagens
  7. (sessão)   o Claude escreve messages.json (roteiro do Bryce, CLAUDE.md Fase 6)
  8. finalize   revisa as mensagens, gera o CSV e atualiza a planilha do tema no Drive

Opções do "new" (todas opcionais, só o tema é obrigatório):
  --round N      número da Round (entra no nome da pasta e da planilha)
  --target N     creators válidos desejados (padrão 20; no modo de teste, ${TEST_MODE.validCreators})
  --red-alert    Round de notícia: só conteúdo dentro da janela de datas
  --from/--to    janela de datas (padrão no Red Alert: últimos 30 dias)
  --criteria "x" critérios extras da Round (SOP 8.3)
  --trigger-age N  idade máxima do vídeo-gatilho em meses (padrão 12; Red Alert usa a janela)
  --allow-niche "a,b"  nichos adjacentes liberados só nesta Round (ex.: "family,food storage")

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
    else if (arg === '--trigger-age') opts.triggerAge = Number(value());
    else if (arg === '--allow-niche') opts.allowNiche = value().split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    else if (arg.startsWith('--')) throw new Error(`Opção desconhecida: ${arg}`);
    else rest.push(arg);
  }
  if (!['new', 'search', 'finalize', 'messages'].includes(opts.command)) {
    opts.help = true;
    return opts;
  }
  if (opts.round !== undefined && (!Number.isInteger(opts.round) || opts.round <= 0)) {
    throw new Error('--round precisa ser um número inteiro maior que zero.');
  }
  opts.theme = rest.join(' ').trim() || null;
  if (opts.triggerAge !== undefined && (!Number.isInteger(opts.triggerAge) || opts.triggerAge <= 0)) {
    throw new Error('--trigger-age precisa ser um número inteiro de meses maior que zero.');
  }
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
    console.log(`Idade máxima do gatilho: ${info.red_alert ? 'janela do Red Alert' : `${info.trigger_max_age_months} meses`}${info.allowed_niches.length ? ` | Nichos liberados: ${info.allowed_niches.join(', ')}` : ''}`);
    console.log(`\nPróximo passo: o Claude escreve ${files.queries} na sessão.`);
    return;
  }

  const dir = findRoundDir(opts.round || null, opts.theme);

  if (opts.command === 'search') {
    reportKeys();
    const started = Date.now();
    const { stats, files } = await runSearch(dir, printProgress(), { allowQuota: opts.allowQuota });
    console.log('\n== Resultado desta etapa');
    console.log(`   Coletados: ${stats.collected} | Pré-filtro: ${stats.prefiltered} | Menores que 10K: ${stats.small} | Já na planilha: ${stats.excluded} | Já no Monday: ${stats.monday} | Gatilho antigo: ${stats.oldTrigger || 0}`);
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

  if (opts.command === 'messages') {
    const { file, approved, mondayChecked } = await messagesBrief(dir);
    if (!mondayChecked) console.log('Aviso: Monday não consultado (falta MONDAY_TOKEN).');
    console.log(`Approved: ${approved}`);
    console.log(`Resumo: ${file}`);
    console.log('Próximo passo: o Claude escreve as mensagens no messages.json e roda o finalize.');
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
      if (sheet.skipped.length) console.log(`   Já estavam na planilha (não repetidos): ${sheet.skipped.length}`);
      if (sheet.updated.length) {
        const byName = {};
        for (const cell of sheet.updated) {
          const c = sheet.skipped.find((x) => x.platforms.youtube.channel_id === cell.channelId);
          const name = c ? c.name : cell.channelId;
          (byName[name] = byName[name] || []).push(cell.column);
        }
        console.log(`   Atualizados: ${Object.entries(byName).map(([n, cols]) => `${n} (${cols.join(', ')})`).join('; ')}`);
      }
      for (const m of sheet.moved) console.log(`   Movido para ${m.to.toUpperCase()}: ${m.name}`);
      if (sheet.manual.length) {
        console.log(`   Não atualizados porque você editou à mão: ${sheet.manual.map((x) => `${x.name} (${x.column})`).join('; ')}`);
      }
      if (sheet.unknown.length) {
        const names = [...new Set(sheet.unknown.map((x) => x.name))];
        console.log(`   Sem registro do que o sistema escreveu (não atualizados): ${names.join('; ')}`);
      }
      if (sheet.messageCheck) {
        const mc = sheet.messageCheck;
        if (mc.ok.length) console.log(`   Mensagens conferidas na linha certa: ${mc.ok.join('; ')}`);
        for (const p of mc.problems) console.log(`   Aviso, mensagem de ${p.name}: ${p.issue}`);
      }
      console.log(`Link: ${sheet.url}`);
    }
  }
}

main().catch((err) => {
  console.error(`\nErro: ${redact(err.message || err)}`);
  process.exit(1);
});
