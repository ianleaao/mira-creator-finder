// Login no Google com a conta do Ian (OAuth, app para computador).
//   google-oauth-client.json  cliente OAuth baixado do Google Cloud (fora do git)
//   token.json                criado no primeiro login (fora do git)
// Escopos:
//   spreadsheets.readonly  ler a planilha principal (checagem de duplicados)
//   drive.file             criar a pasta "CREATORS FIND", subpastas e planilhas (só arquivos criados pelo app)
//
// Primeiro login: npm run google-auth

const fs = require('fs');
const http = require('http');
const path = require('path');
const { execFile } = require('child_process');
const { google } = require('googleapis');
const { ROOT } = require('../config');

const CLIENT_FILE = path.join(ROOT, 'google-oauth-client.json');
const TOKEN_FILE = path.join(ROOT, 'token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.file',
];

const fatal = (message) => Object.assign(new Error(message), { fatal: true });

function readClient() {
  if (!fs.existsSync(CLIENT_FILE)) {
    throw fatal('Arquivo google-oauth-client.json não encontrado na pasta do projeto. Veja o README (Login no Google).');
  }
  const json = JSON.parse(fs.readFileSync(CLIENT_FILE, 'utf8'));
  const client = json.installed || json.web;
  if (!client || !client.client_id || !client.client_secret) {
    throw fatal('google-oauth-client.json inválido: baixe o JSON de um cliente OAuth do tipo "App para computador".');
  }
  return client;
}

function saveToken(tokens) {
  // Mantém o refresh_token antigo se a renovação não trouxer um novo.
  const old = fs.existsSync(TOKEN_FILE) ? JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')) : {};
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...old, ...tokens }, null, 2), { encoding: 'utf8', mode: 0o600 });
}

// Cliente autenticado para usar com google.sheets / google.drive.
function getAuth() {
  const client = readClient();
  if (!fs.existsSync(TOKEN_FILE)) {
    throw fatal('Login no Google ainda não feito. Rode: npm run google-auth');
  }
  const token = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  const granted = String(token.scope || '').split(' ');
  const missing = SCOPES.filter((s) => !granted.includes(s));
  if (missing.length) {
    throw fatal('O login no Google não tem todas as permissões necessárias. Rode de novo: npm run google-auth');
  }
  const auth = new google.auth.OAuth2(client.client_id, client.client_secret);
  auth.setCredentials(token);
  auth.on('tokens', saveToken); // salva o token renovado automaticamente
  return auth;
}

function openBrowser(url) {
  // No Windows, abre o navegador padrão sem passar a URL por um shell.
  if (process.platform === 'win32') execFile('rundll32', ['url.dll,FileProtocolHandler', url]);
  else if (process.platform === 'darwin') execFile('open', [url]);
  else execFile('xdg-open', [url]);
}

// Primeiro login: abre o navegador, recebe o código num servidor local e salva o token.
async function login() {
  const client = readClient();
  const server = http.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  const auth = new google.auth.OAuth2(client.client_id, client.client_secret, redirectUri);

  const url = auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });
  console.log('Abrindo o navegador para o login no Google...');
  console.log('Se não abrir sozinho, copie este link no navegador:\n');
  console.log(url);
  console.log('');
  openBrowser(url);

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Tempo esgotado (5 minutos) esperando o login.')), 5 * 60 * 1000);
    server.on('request', (req, res) => {
      const params = new URL(req.url, redirectUri).searchParams;
      if (!params.has('code') && !params.has('error')) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      if (params.get('error')) {
        res.end('<p>Login cancelado. Pode fechar esta aba.</p>');
        clearTimeout(timer);
        reject(new Error(`Login cancelado: ${params.get('error')}`));
        return;
      }
      res.end('<p>Login concluído. Pode fechar esta aba e voltar ao terminal.</p>');
      clearTimeout(timer);
      resolve(params.get('code'));
    });
  }).finally(() => server.close());

  const { tokens } = await auth.getToken(code);
  saveToken(tokens);
  return tokens;
}

module.exports = { SCOPES, getAuth, login, CLIENT_FILE, TOKEN_FILE };

// npm run google-auth
if (require.main === module) {
  login()
    .then(() => console.log('Login salvo em token.json. Pronto.'))
    .catch((err) => {
      const { redact } = require('../config');
      console.error(`Erro: ${redact(err.message)}`);
      process.exit(1);
    });
}
