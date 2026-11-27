const chatForm = byId('chat-form');
const chatInput = byId('chat-input');
const chatMessages = byId('chat-messages');
const chatMic = byId('chat-mic');
const currentStatus = byId('chat-status');
let voiceEnabled = false;
let sessionVersion = 0;
let activeRecording;

for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => showSection(button.dataset.view));
}
for (const button of document.querySelectorAll('[data-suggestion]')) {
  button.addEventListener('click', () => {
    chatInput.value = button.dataset.suggestion;
    chatInput.focus();
  });
}

document.addEventListener('panel-session', (event) => {
  sessionVersion++;
  if (event.detail) {
    showSection('assistant');
    loadAssistant();
  } else {
    cancelRecording();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    voiceEnabled = false;
    currentStatus.textContent = '';
    chatForm.reset();
    showMessages([]);
  }
});
if (!byId('workspace').hidden) loadAssistant();

function showSection(section) {
  document.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === section;
    byId(`${button.dataset.view}-view`).hidden = !active;
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (section !== 'assistant') cancelRecording();
}

async function loadAssistant() {
  const version = sessionVersion;
  try {
    const state = await api('/api/assistant');
    if (version !== sessionVersion) return;
    voiceEnabled = state.voice;
    const remote = state.provider === 'nvidia' || state.provider === 'compatible';
    byId('assistant-state').textContent = remote ? 'Modèle distant configuré' : (state.chat ? 'Modèle local configuré' : 'Modèle à connecter');
    byId('settings-model').textContent = remote ? 'Config. BYOK depuis l’app Android' : (state.chat ? 'Configuré sur le serveur' : 'Configuration requise');
    byId('settings-whisper').textContent = state.voice ? 'Configuré sur le serveur' : 'Configuration requise sur le serveur';
    byId('reply-language').value = state.language;
    showMessages(state.messages);
  } catch (error) {
    if (version === sessionVersion) byId('assistant-state').textContent = error.message;
  }
}

onSubmit('assistant-preferences', async () => {
  await api('/api/assistant/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: byId('reply-language').value }) });
  notice('Langue enregistrée.');
});

onSubmit('chat-form', async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  const version = sessionVersion;
  const bubble = messageElement({ role: 'user', text });
  chatMessages.append(bubble);
  refreshMessages();
  chatInput.value = '';
  currentStatus.textContent = 'L’assistant prépare sa réponse…';
  try {
    const { reply } = await postJson('/api/assistant/chat', { text });
    if (version !== sessionVersion) return;
    chatMessages.append(messageElement(reply));
    refreshMessages();
    currentStatus.textContent = '';
  } catch (error) {
    if (version !== sessionVersion) return;
    bubble.remove();
    chatInput.value = [text, chatInput.value].filter(Boolean).join('\n').slice(0, 4000);
    refreshMessages();
    currentStatus.textContent = error.message;
  }
});

function showMessages(messages) {
  chatMessages.replaceChildren(...messages.map(messageElement));
  refreshMessages();
}

function refreshMessages() {
  const empty = chatMessages.childElementCount === 0;
  chatMessages.hidden = empty;
  byId('chat-welcome').hidden = !empty;
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function messageElement({ role, text }) {
  const bubble = document.createElement('article');
  bubble.className = `message ${role === 'user' ? 'user' : 'assistant'}`;
  const label = document.createElement('small');
  label.textContent = role === 'user' ? 'Vous' : 'Assistant';
  const content = document.createElement('p');
  content.dir = 'auto';
  content.textContent = text;
  bubble.append(label, content);
  if (role === 'assistant' && 'speechSynthesis' in window) {
    const listen = document.createElement('button');
    listen.type = 'button';
    listen.className = 'quiet listen';
    listen.textContent = 'Écouter en français';
    listen.addEventListener('click', () => {
      const voice = speechSynthesis.getVoices().find(item => item.localService && item.lang.toLowerCase().startsWith('fr'));
      if (!voice) {
        currentStatus.textContent = 'Installez une voix française hors ligne sur l’appareil.';
        return;
      }
      const speech = new SpeechSynthesisUtterance(text);
      speech.voice = voice;
      speech.lang = voice.lang;
      speechSynthesis.cancel();
      speechSynthesis.speak(speech);
    });
    bubble.append(listen);
  }
  return bubble;
}

chatMic.addEventListener('click', async () => {
  if (activeRecording) {
    stopRecording(activeRecording);
    return;
  }
  if (!voiceEnabled) {
    currentStatus.textContent = 'Configurez Whisper sur le serveur pour utiliser le micro.';
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    currentStatus.textContent = 'Pour le micro, ouvrez le panneau en HTTPS dans un navigateur compatible.';
    return;
  }
  chatMic.disabled = true;
  const version = sessionVersion;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (version !== sessionVersion || byId('assistant-view').hidden) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    const recorder = new MediaRecorder(stream);
    const recording = { recorder, stream, chunks: [], version };
    recorder.addEventListener('dataavailable', ({ data }) => { if (data.size) recording.chunks.push(data); });
    recorder.addEventListener('stop', () => transcribe(recording), { once: true });
    recorder.addEventListener('error', () => {
      cancelRecording();
      currentStatus.textContent = 'Impossible d’enregistrer le son.';
    }, { once: true });
    recorder.start();
    recording.timer = setTimeout(() => stopRecording(recording), 20_000);
    activeRecording = recording;
    chatMic.textContent = 'Arrêter';
    chatMic.setAttribute('aria-pressed', 'true');
    currentStatus.textContent = 'Enregistrement en cours…';
  } catch {
    stream?.getTracks().forEach(track => track.stop());
    currentStatus.textContent = 'Impossible d’ouvrir le micro. Vérifiez les autorisations du navigateur.';
  } finally {
    chatMic.disabled = false;
  }
});

function stopRecording(recording) {
  clearTimeout(recording.timer);
  if (recording.recorder.state !== 'inactive') recording.recorder.stop();
  recording.stream.getTracks().forEach(track => track.stop());
  chatMic.textContent = 'Micro';
  chatMic.setAttribute('aria-pressed', 'false');
}

function cancelRecording() {
  if (!activeRecording) return;
  activeRecording.cancelled = true;
  stopRecording(activeRecording);
  activeRecording = undefined;
  currentStatus.textContent = '';
}

async function transcribe(recording) {
  if (activeRecording === recording) activeRecording = undefined;
  if (recording.cancelled || recording.version !== sessionVersion) return;
  const type = recording.recorder.mimeType.split(';')[0] || recording.chunks[0]?.type.split(';')[0];
  const audio = new Blob(recording.chunks, { type });
  chatMic.disabled = true;
  currentStatus.textContent = 'Transcription sur le serveur…';
  try {
    const { text } = await api('/api/assistant/audio', { method: 'POST', headers: { 'Content-Type': audio.type }, body: audio });
    if (recording.version !== sessionVersion) return;
    chatInput.value = [chatInput.value.trim(), text].filter(Boolean).join('\n').slice(0, 4000);
    currentStatus.textContent = 'Relisez le texte puis envoyez votre message.';
    if (!byId('assistant-view').hidden) chatInput.focus();
  } catch (error) {
    if (recording.version === sessionVersion) currentStatus.textContent = error.message;
  } finally {
    chatMic.disabled = false;
  }
}
