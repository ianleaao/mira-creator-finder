// Carrega o .env e informa quais chaves e arquivos estão faltando.
// Nunca imprime o valor de nenhuma chave, só o nome.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });

// Cada chave e a parte do sistema que depende dela.
const KEYS = {
  YOUTUBE_API_KEY: 'busca de canais e coleta de vídeos no YouTube',
  APIFY_TOKEN: 'TikTok e Instagram via Apify (Fase 7)',
  MONDAY_TOKEN: 'checagem de duplicidade no Monday',
  MONDAY_BOARD_ID: 'checagem de duplicidade no Monday',
  MAIN_SHEET_ID: 'checagem de duplicidade na planilha principal',
  APP_PASSWORD: 'senha de acesso da interface web (Fase 4)',
};

// Modo de teste: o limite é de RESULTADOS, não de buscas. Usa as 8 a 15 buscas do SOP
// e para quando tiver `validCreators` creators válidos (Approved ou Maybe) ou quando
// as buscas acabarem. Só desligar (enabled: false) quando o Ian aprovar o sistema.
const TEST_MODE = {
  enabled: true,
  validCreators: 3,
};

// Alarme de cota do YouTube: o search para e avisa antes de passar deste total
// de unidades no dia (o dia da cota vira à meia-noite do horário do Pacífico).
// Para passar do limite, o Ian precisa liberar (search --allow-quota N).
const DAILY_QUOTA_GUARD = 2000;

// Arquivos locais (fora do git) e a parte do sistema que depende deles.
const FILES = {
  'google-oauth-client.json': 'login no Google (planilha principal e Drive)',
  'token.json': 'login no Google já feito (rode npm run google-auth)',
};

function has(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() !== '';
}

function hasFile(name) {
  return fs.existsSync(path.join(ROOT, name));
}

function missingKeys() {
  return Object.keys(KEYS).filter((name) => !has(name));
}

// Mostra no terminal o que está faltando.
function reportKeys() {
  const missing = missingKeys();
  const missingFiles = Object.keys(FILES).filter((name) => !hasFile(name));
  if (missing.length === 0 && missingFiles.length === 0) {
    console.log('Todas as chaves e arquivos estão configurados.');
    return missing;
  }
  if (missing.length) {
    console.log('Chaves faltando no .env (o sistema segue funcionando sem estas partes):');
    for (const name of missing) console.log(`  - ${name}: afeta ${KEYS[name]}`);
  }
  if (missingFiles.length) {
    console.log('Arquivos faltando na pasta do projeto:');
    for (const name of missingFiles) console.log(`  - ${name}: afeta ${FILES[name]}`);
  }
  return missing;
}

// Para etapas que não funcionam sem a chave: lança um erro claro com o nome dela.
function requireKey(name) {
  if (!has(name)) {
    throw Object.assign(
      new Error(`Chave ${name} não configurada no .env. Necessária para ${KEYS[name] || 'esta etapa'}.`),
      { fatal: true },
    );
  }
  return process.env[name].trim();
}

// Remove de um texto qualquer valor de chave do .env (para mensagens de erro e logs).
function redact(text) {
  let out = String(text);
  for (const name of Object.keys(KEYS)) {
    const value = process.env[name];
    if (has(name) && value.trim().length >= 8) {
      out = out.split(value.trim()).join('***');
    }
  }
  // Por garantia, esconde parâmetros "key=" em URLs e tokens OAuth.
  return out
    .replace(/([?&](?:key|access_token|code)=)[^&\s"']+/gi, '$1***')
    .replace(/(ya29\.)[\w-]+/g, '$1***');
}

module.exports = { ROOT, KEYS, FILES, TEST_MODE, DAILY_QUOTA_GUARD, has, hasFile, missingKeys, reportKeys, requireKey, redact };

// Permite rodar direto: npm run check-env
if (require.main === module) {
  reportKeys();
}
