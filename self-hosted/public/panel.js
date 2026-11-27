const byId = (id) => document.getElementById(id);
const results = byId('results');
const dialog = byId('document');
const status = byId('status');
const dateFormat = new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium' });
let documentId;
let query = '';
let offset = 0;
let listRequest = 0;

function notice(message, failure = false) {
  status.textContent = message;
  status.classList.toggle('failure', failure);
}

function setView(signedIn) {
  byId('login-view').hidden = signedIn;
  byId('workspace').hidden = !signedIn;
  byId('logout').hidden = !signedIn;
  if (!signedIn) {
    listRequest++;
    if (dialog.open) dialog.close();
    byId('document-title').textContent = '';
    byId('document-text').textContent = '';
    documentId = undefined;
    results.replaceChildren();
    byId('note').reset();
    byId('pdf').reset();
    byId('search').reset();
    query = '';
  }
  document.dispatchEvent(new CustomEvent('panel-session', { detail: signedIn }));
}

async function api(path, options) {
  const response = await fetch(path, options);
  if (response.status === 204) return;
  const data = await response.json();
  if (!response.ok) {
    const failure = new Error(data.error || 'Demande impossible.');
    failure.status = response.status;
    if (response.status === 401 && path !== '/api/session') setView(false);
    throw failure;
  }
  return data;
}

function postJson(url, input) {
  return api(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
}

function onSubmit(id, action) {
  const form = byId(id);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    notice('');
    try {
      await action(form);
    } catch (error) {
      notice(error.message, true);
    } finally {
      submit.disabled = false;
    }
  });
}

onSubmit('login', async (form) => {
  try {
    await postJson('/api/session', { password: byId('password').value });
  } finally {
    form.reset();
  }
  await loadEntries();
  setView(true);
});

onSubmit('note', async (form) => {
  await postJson('/api/entries', { title: byId('note-title').value, text: byId('note-text').value });
  form.reset();
  await refreshAfterSave('Note enregistrée.');
});

onSubmit('pdf', async (form) => {
  const file = byId('pdf-file').files[0];
  if (!file) return;
  const title = file.name.replace(/\.pdf$/i, '').slice(0, 160);
  notice('Extraction du texte…');
  await api(`/api/pdfs?${new URLSearchParams({ title })}`, {
    method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file,
  });
  form.reset();
  await refreshAfterSave('Texte du PDF importé.');
});

onSubmit('search', async () => {
  query = byId('query').value.trim();
  await loadEntries();
});

byId('more').addEventListener('click', async () => {
  byId('more').disabled = true;
  try {
    await loadEntries(true);
  } catch (error) {
    notice(error.message, true);
  } finally {
    byId('more').disabled = false;
  }
});

byId('logout').addEventListener('click', async () => {
  try {
    await api('/api/session', { method: 'DELETE' });
    setView(false);
    notice('Session fermée.');
  } catch (error) {
    if (error.status === 401) setView(false);
    notice(error.message, true);
  }
});

byId('delete').addEventListener('click', async () => {
  if (!documentId || !window.confirm('Supprimer ce document de la mémoire ?')) return;
  try {
    await api(`/api/entries/${documentId}`, { method: 'DELETE' });
    dialog.close();
    await loadEntries();
    notice('Document supprimé.');
  } catch (error) {
    dialog.close();
    notice(error.message, true);
  }
});

async function refreshAfterSave(message) {
  byId('search').reset();
  query = '';
  await loadEntries();
  notice(message);
}

async function loadEntries(append = false) {
  const current = ++listRequest;
  const start = append ? offset : 0;
  const entries = await api(`/api/entries?${new URLSearchParams({ q: query, offset: String(start) })}`);
  if (current !== listRequest) return;
  if (!append) results.replaceChildren();
  results.append(...entries.map(renderEntry));
  offset = start + entries.length;
  byId('empty').hidden = results.childElementCount > 0;
  byId('more').hidden = entries.length < 50;
}

function renderEntry(entry) {
  const item = document.createElement('li');
  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'entry-title';
  title.textContent = entry.title;
  title.addEventListener('click', () => openEntry(entry.id));
  const meta = document.createElement('span');
  meta.className = 'entry-meta';
  meta.textContent = `${entry.kind === 'pdf' ? 'PDF' : 'Note'} · ${dateFormat.format(new Date(entry.created_at))}`;
  const excerpt = document.createElement('p');
  excerpt.className = 'excerpt';
  excerpt.textContent = entry.excerpt;
  item.append(title, meta, excerpt);
  return item;
}

async function openEntry(id) {
  try {
    const entry = await api(`/api/entries/${id}`);
    if (byId('workspace').hidden) return;
    documentId = entry.id;
    byId('document-title').textContent = entry.title;
    byId('document-text').textContent = entry.text;
    if (!dialog.open) dialog.showModal();
  } catch (error) {
    notice(error.message, true);
  }
}

loadEntries().then(() => setView(true)).catch((error) => {
  setView(false);
  if (error.status !== 401) notice(error.message, true);
});
