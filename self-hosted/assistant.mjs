const audioExtensions = new Map([
  ['audio/webm', 'webm'], ['audio/ogg', 'ogg'], ['audio/mp4', 'm4a'], ['audio/wav', 'wav'],
]);

export function supportsAudio(type) { return audioExtensions.has(type); }

export function localAssistant({ model, ollamaOrigin = 'http://127.0.0.1:11434', whisperOrigin } = {}) {
  const assistant = {};
  if (model) {
    const url = endpoint(ollamaOrigin, '/api/chat');
    assistant.complete = async (messages) => {
      const data = await request(url, {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, stream: false }),
      });
      return data.message?.content;
    };
  }
  if (whisperOrigin) {
    const url = endpoint(whisperOrigin, '/inference');
    assistant.transcribe = async (bytes, type) => {
      const body = new FormData();
      body.set('file', new Blob([bytes], { type }), `dictation.${audioExtensions.get(type)}`);
      body.set('response_format', 'json');
      body.set('language', 'auto');
      const data = await request(url, { body });
      return data.text;
    };
  }
  return assistant;
}

function endpoint(origin, path) {
  const url = new URL(origin);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('Assistant services must use an HTTP loopback origin.');
  }
  return new URL(path, url);
}

async function request(url, options) {
  const response = await fetch(url, { ...options, method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Local model service returned ${response.status}`);
  return response.json();
}
