import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.mjs';

const database = resolve(process.env.CALLAI_DATABASE || 'data/call-ai.sqlite');
const port = Number(process.env.CALLAI_PORT || 4400);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid CALLAI_PORT');
process.umask(0o077);
mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
const app = createApp({ database, password: process.env.CALLAI_PASSWORD, publicOrigin: process.env.CALLAI_PUBLIC_ORIGIN });
app.listen(port, '127.0.0.1', () => console.log(`Call-Ai: http://127.0.0.1:${port}`));
