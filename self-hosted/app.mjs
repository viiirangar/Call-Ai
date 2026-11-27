import { execFile } from 'node:child_process';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

const run = promisify(execFile);
const sessionSeconds = 8 * 60 * 60;
const textLimit = 500_000;
const pdfLimit = 10 * 1024 * 1024;
const assets = new Map([
  ['/', ['text/html; charset=utf-8', 'index.html']],
  ['/panel.js', ['text/javascript; charset=utf-8', 'panel.js']],
  ['/panel.css', ['text/css; charset=utf-8', 'panel.css']],
]);

export function createApp({ password, database, publicOrigin, extractPdf = extractPdfText }) {
  if (typeof password !== 'string' || password.length < 16 || password.length > 1024) {
    throw new Error('CALLAI_PASSWORD must contain 16 to 1024 characters.');
  }
  if (publicOrigin) {
    const origin = new URL(publicOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) {
      throw new Error('CALLAI_PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash.');
    }
  }
  const staticFiles = new Map([...assets].map(([path, [type, file]]) => [path, {
    type, contents: readFileSync(new URL(`./public/${file}`, import.meta.url)),
  }]));
  const passwordDigest = digest(password);
  const sessions = new Map();
  let failedLogins = 0;
  let loginWindowEnd = 0;
  const db = new DatabaseSync(database);
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, title TEXT NOT NULL,
      text TEXT NOT NULL, normalized TEXT NOT NULL, created_at TEXT NOT NULL
    ) STRICT;
  `);
  const insert = db.prepare('INSERT INTO entries (kind, title, text, normalized, created_at) VALUES (?, ?, ?, ?, ?)');
  const list = db.prepare(`SELECT id, kind, title, substr(text, 1, 280) AS excerpt, created_at
    FROM entries WHERE instr(normalized, ?) > 0 ORDER BY id DESC LIMIT 50 OFFSET ?`);
  const detail = db.prepare('SELECT id, kind, title, text, created_at FROM entries WHERE id = ?');
  const remove = db.prepare('DELETE FROM entries WHERE id = ?');

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const localOrigin = `http://127.0.0.1:${server.address().port}`;
    const origin = publicOrigin || localOrigin;
    try {
      const url = new URL(request.url, localOrigin);
      const { pathname } = url;
      const method = request.method;
      const asset = staticFiles.get(pathname);
      if (method === 'GET' && asset) {
        response.writeHead(200, { 'Content-Type': asset.type });
        return response.end(asset.contents);
      }
      if (!pathname.startsWith('/api/')) throw new HttpError(404, 'Page introuvable.');
      if (method !== 'GET' && request.headers.origin !== origin) throw new HttpError(403, 'Origine non autorisée.');

      if (pathname === '/api/session' && method === 'POST') {
        const now = Date.now();
        if (now >= loginWindowEnd) {
          loginWindowEnd = now + 60_000;
          failedLogins = 0;
        }
        if (failedLogins >= 12) throw new HttpError(429, 'Patientez une minute avant de réessayer.');
        const input = await jsonBody(request, 8 * 1024);
        if (typeof input.password !== 'string' || !timingSafeEqual(passwordDigest, digest(input.password))) {
          failedLogins++;
          throw new HttpError(401, 'Mot de passe incorrect.');
        }
        for (const [token, expiry] of sessions) if (expiry <= now) sessions.delete(token);
        if (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
        const token = randomBytes(32).toString('hex');
        sessions.set(token, now + sessionSeconds * 1000);
        response.setHeader('Set-Cookie', cookie(token, sessionSeconds, !!publicOrigin));
        return send(response, 204);
      }

      const token = /(?:^|;\s*)call_ai_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
      if (!token || !(sessions.get(token) > Date.now())) throw new HttpError(401, 'Connectez-vous au panneau.');
      if (pathname === '/api/session' && method === 'DELETE') {
        sessions.delete(token);
        response.setHeader('Set-Cookie', cookie('', 0, !!publicOrigin));
        return send(response, 204);
      }
      if (pathname === '/api/entries' && method === 'GET') {
        const query = normalize((url.searchParams.get('q') || '').slice(0, 160).trim());
        const offset = Math.min(1_000_000, Math.max(0, Number.parseInt(url.searchParams.get('offset'), 10) || 0));
        return send(response, 200, list.all(query, offset));
      }
      if (pathname === '/api/entries' && method === 'POST') {
        const input = await jsonBody(request, 4 * 1024 * 1024);
        return save(response, 'note', input.title, input.text, insert);
      }
      if (pathname === '/api/pdfs' && method === 'POST') {
        const title = checkedText(url.searchParams.get('title'), 160, 'Titre requis (160 caractères maximum).');
        if (request.headers['content-type'] !== 'application/pdf') throw new HttpError(415, 'Choisissez un PDF.');
        const bytes = await readBody(request, pdfLimit);
        if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new HttpError(400, 'Fichier PDF invalide.');
        const text = await extractPdf(bytes);
        return save(response, 'pdf', title, text, insert);
      }
      const id = /^\/api\/entries\/([1-9]\d{0,14})$/.exec(pathname)?.[1];
      if (id && method === 'GET') {
        const row = detail.get(Number(id));
        if (!row) throw new HttpError(404, 'Document introuvable.');
        return send(response, 200, row);
      }
      if (id && method === 'DELETE') {
        if (!remove.run(Number(id)).changes) throw new HttpError(404, 'Document introuvable.');
        return send(response, 204);
      }
      throw new HttpError(404, 'Page introuvable.');
    } catch (error) {
      if (error instanceof HttpError) return send(response, error.status, { error: error.message });
      console.error(error);
      return send(response, 500, { error: 'Le serveur n’a pas pu traiter la demande.' });
    }
  });
  server.on('close', () => db.close());
  return server;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function digest(text) {
  return createHash('sha256').update(text).digest();
}

function normalize(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

function cookie(token, seconds, secure) {
  return `call_ai_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
}

function send(response, status, payload) {
  response.statusCode = status;
  if (payload === undefined) return response.end();
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  return response.end(JSON.stringify(payload));
}

function checkedText(input, limit, message) {
  if (typeof input !== 'string' || !input.trim() || input.length > limit) throw new HttpError(400, message);
  return input.trim();
}

function save(response, kind, rawTitle, rawText, insert) {
  const title = checkedText(rawTitle, 160, 'Titre requis (160 caractères maximum).');
  const text = checkedText(rawText, textLimit, 'Texte vide ou trop long. Les PDF scannés nécessitent un OCR.');
  const result = insert.run(kind, title, text, normalize(`${title}\n${text}`), new Date().toISOString());
  return send(response, 201, { id: Number(result.lastInsertRowid) });
}

async function readBody(request, limit) {
  if (Number(request.headers['content-length']) > limit) {
    request.resume();
    throw new HttpError(413, 'Fichier ou texte trop volumineux.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > limit) {
      request.resume();
      throw new HttpError(413, 'Fichier ou texte trop volumineux.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

async function jsonBody(request, limit) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) throw new HttpError(415, 'Format JSON requis.');
  const bytes = await readBody(request, limit);
  try {
    const input = JSON.parse(bytes);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    return input;
  } catch {
    throw new HttpError(400, 'Données invalides.');
  }
}

export async function extractPdfText(bytes) {
  const directory = await mkdtemp(join(tmpdir(), 'call-ai-pdf-'));
  try {
    const input = join(directory, 'document.pdf');
    await writeFile(input, bytes, { mode: 0o600 });
    const { stdout } = await run('pdftotext', ['-enc', 'UTF-8', '-nopgbrk', input, '-'], {
      cwd: directory, timeout: 15_000, maxBuffer: 2 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(503, 'Installez Poppler sur le serveur pour importer les PDF.');
    throw new HttpError(422, 'Impossible de lire ce PDF. Vérifiez qu’il contient du texte et qu’il est déverrouillé.');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
