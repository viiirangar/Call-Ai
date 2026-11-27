import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

const nvidiaBase = 'https://integrate.api.nvidia.com/v1';
const blocked = new BlockList();
for (const [address, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) blocked.addSubnet(address, bits, 'ipv4');

export class ProviderError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function providerVault(db, secret, transport = remoteRequest) {
  if (typeof secret !== 'string' || secret.length < 16) throw new Error('CALLAI_BYOK_SECRET must contain at least 16 characters.');
  const read = db.prepare('SELECT value FROM preferences WHERE name = ?');
  const write = db.prepare('INSERT INTO preferences (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value');
  db.prepare('INSERT OR IGNORE INTO preferences (name, value) VALUES (?, ?)').run('provider_salt', randomBytes(16).toString('hex'));
  const encryptionKey = scryptSync(secret, read.get('provider_salt').value, 32);
  const record = () => JSON.parse(read.get('remote_provider')?.value || 'null');

  return {
    info() {
      const saved = record();
      if (!saved) return null;
      const { provider, baseUrl, model } = saved;
      return { provider, baseUrl, model, keyConfigured: true };
    },
    save({ provider, baseUrl, model, apiKey }) {
      if (provider !== 'nvidia' && provider !== 'compatible') throw new ProviderError(400, 'Choisissez NVIDIA NIM ou une API compatible OpenAI.');
      model = typeof model === 'string' ? model.trim() : '';
      if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,159}$/.test(model)) throw new ProviderError(400, 'Saisissez l’identifiant exact du modèle.');
      const target = provider === 'nvidia' ? nvidiaBase : providerBase(baseUrl);
      const old = record();
      const sameTarget = old?.provider === provider && old.baseUrl === target;
      const next = { provider, baseUrl: target, model, sealed: '' };
      if (apiKey === undefined || apiKey === '') {
        if (!sameTarget) throw new ProviderError(400, 'Saisissez une clé API pour ce fournisseur.');
        next.sealed = old.sealed;
      } else {
        if (typeof apiKey !== 'string' || !/^[!-~]{1,2048}$/.test(apiKey)) throw new ProviderError(400, 'Clé API invalide.');
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
        cipher.setAAD(associatedData(next));
        next.sealed = [iv, Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]), cipher.getAuthTag()]
          .map(part => part.toString('base64url')).join('.');
      }
      write.run('remote_provider', JSON.stringify(next));
    },
    clear() { db.prepare("DELETE FROM preferences WHERE name = 'remote_provider'").run(); },
    async complete(messages) {
      const saved = record();
      if (!saved) throw new ProviderError(503, 'Configurez une clé API dans Réglages.');
      let apiKey;
      try {
        const [iv, ciphertext, tag] = saved.sealed.split('.').map(part => Buffer.from(part, 'base64url'));
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
        decipher.setAAD(associatedData(saved));
        decipher.setAuthTag(tag);
        apiKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      } catch {
        throw new ProviderError(503, 'Réenregistrez la clé API dans Réglages.');
      }
      const url = new URL(`${saved.baseUrl}/chat/completions`);
      if (saved.provider === 'nvidia' && url.href !== `${nvidiaBase}/chat/completions`) throw new ProviderError(400, 'Adresse NVIDIA invalide.');
      let result;
      try {
        result = await transport(url, apiKey, { model: saved.model, messages, stream: false });
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError(502, 'Le fournisseur IA ne répond pas. Vérifiez l’adresse et la connexion.');
      }
      const content = result?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw new ProviderError(502, 'Le modèle n’a renvoyé aucune réponse textuelle.');
      return content.trim().slice(0, 16_000);
    },
  };
}

function associatedData(config) { return Buffer.from(`${config.provider}\n${config.baseUrl}`); }

function providerBase(value) {
  let url;
  try { url = new URL(typeof value === 'string' ? value.trim() : ''); }
  catch { throw new ProviderError(400, 'Saisissez l’adresse HTTPS de l’API.'); }
  const ip = isIP(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.hostname.includes('[') || !url.hostname.includes('.') || /\.(?:local|localhost|internal)\.?$/.test(url.hostname)
      || (ip === 4 && !isPublicIPv4(url.hostname)) || url.href.length > 500) {
    throw new ProviderError(400, 'Choisissez une API HTTPS publique, sans identifiant ni paramètre dans l’adresse.');
  }
  const base = url.href.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  return base === url.origin ? `${base}/v1` : base;
}

export function isPublicIPv4(address) { return isIP(address) === 4 && !blocked.check(address, 'ipv4'); }

async function remoteRequest(url, apiKey, body) {
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIPv4(address))) {
    throw new ProviderError(400, 'L’adresse du fournisseur doit être une adresse IPv4 publique.');
  }
  const { address } = addresses[0];
  const encoded = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const call = request(url, {
      method: 'POST', family: 4, agent: false, signal: AbortSignal.timeout(120_000),
      lookup: (_host, options, callback) => options.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4),
      headers: { 'Content-Type': 'application/json', 'Content-Length': encoded.length,
        Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
    }, async (response) => {
      try {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.destroy();
          if (response.statusCode === 401 || response.statusCode === 403) throw new ProviderError(502, 'Clé API refusée par le fournisseur.');
          if (response.statusCode === 429) throw new ProviderError(502, 'Le fournisseur a atteint son quota ou sa limite de requêtes.');
          throw new ProviderError(502, `Réponse du fournisseur (${response.statusCode}). Vérifiez le modèle et l’adresse.`);
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of response) {
          size += chunk.length;
          if (size > 1024 * 1024) throw new ProviderError(502, 'Réponse du fournisseur trop volumineuse.');
          chunks.push(chunk);
        }
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) { reject(error); }
    });
    call.on('error', reject);
    call.end(encoded);
  });
}
