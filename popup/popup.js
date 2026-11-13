import { generateMalXml, MAL_STATUSES } from '../src/mal-xml.js';

const STATE_KEY = 'shindenExporterState_v1';
const JOB_KEY = 'shindenMatchJob_v1';

const els = {
  userBadge: document.getElementById('userBadge'),
  notShindenNotice: document.getElementById('notShindenNotice'),
  openShindenBtn: document.getElementById('openShindenBtn'),
  scrapeBtn: document.getElementById('scrapeBtn'),
  matchBtn: document.getElementById('matchBtn'),
  exportBtn: document.getElementById('exportBtn'),
  progressWrap: document.getElementById('progressWrap'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  statusMessage: document.getElementById('statusMessage'),
  debugBox: document.getElementById('debugBox'),
  summarySection: document.getElementById('summarySection'),
  statusChips: document.getElementById('statusChips'),
  onlyIssuesCheckbox: document.getElementById('onlyIssuesCheckbox'),
  matchStats: document.getElementById('matchStats'),
  listSection: document.getElementById('listSection'),
  entriesBody: document.getElementById('entriesBody'),
};

let state = {
  userName: 'ShindenUser',
  entries: [],
};

function showStatus(text, isError = false) {
  els.statusMessage.textContent = text;
  els.statusMessage.classList.toggle('error', isError);
  els.statusMessage.classList.remove('hidden');
}

function hideStatus() {
  els.statusMessage.classList.add('hidden');
  els.debugBox.classList.add('hidden');
}

function showDebug(data) {
  if (!data) {
    els.debugBox.classList.add('hidden');
    return;
  }
  els.debugBox.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  els.debugBox.classList.remove('hidden');
}

async function saveState() {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

async function loadState() {
  const data = await chrome.storage.local.get([STATE_KEY, JOB_KEY]);
  if (data[STATE_KEY] && Array.isArray(data[STATE_KEY].entries)) {
    state = data[STATE_KEY];
  }
  return data[JOB_KEY] ?? null;
}

function applyJobUi(job) {
  if (!job || job.status === 'idle') {
    els.progressWrap.classList.add('hidden');
    return;
  }

  if (job.status === 'running') {
    els.matchBtn.disabled = true;
    els.scrapeBtn.disabled = true;
    els.exportBtn.disabled = true;
    els.progressWrap.classList.remove('hidden');
    const pct = job.total > 0 ? Math.round((job.current / job.total) * 100) : 0;
    els.progressFill.style.width = `${pct}%`;
    els.progressText.textContent = `W tle: ${job.current} / ${job.total}${job.lastTitle ? ` (${job.lastTitle})` : ''}`;
    return;
  }

  els.progressWrap.classList.add('hidden');
  els.matchBtn.disabled = state.entries.length === 0;
  checkActiveTab();

  if (job.status === 'done') {
    const matchedCount = state.entries.filter((e) => e.malId > 0).length;
    showStatus(`Dopasowano ${matchedCount} z ${state.entries.length} pozycji. Możesz pobrać plik XML.`);
  } else if (job.status === 'error') {
    showStatus(`Błąd dopasowania: ${job.error || 'nieznany błąd'}`, true);
  }
}

function renderSummary() {
  const entries = state.entries;
  if (!entries.length) {
    els.summarySection.classList.add('hidden');
    els.listSection.classList.add('hidden');
    els.userBadge.classList.add('hidden');
    els.matchBtn.disabled = true;
    els.exportBtn.disabled = true;
    return;
  }

  els.userBadge.textContent = `${state.userName} (${entries.length})`;
  els.userBadge.classList.remove('hidden');
  els.matchBtn.disabled = false;

  const counts = Object.fromEntries(MAL_STATUSES.map((s) => [s, 0]));
  let matchedCount = 0;

  for (const e of entries) {
    counts[e.status] = (counts[e.status] ?? 0) + 1;
    if (e.malId && e.malId > 0) matchedCount += 1;
  }

  els.statusChips.innerHTML = '';
  for (const status of MAL_STATUSES) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${status}: ${counts[status] ?? 0}`;
    els.statusChips.appendChild(chip);
  }

  els.matchStats.textContent = `Dopasowano: ${matchedCount} / ${entries.length}`;
  els.exportBtn.disabled = matchedCount === 0;
  els.summarySection.classList.remove('hidden');
  renderTable();
}

function renderTable() {
  const onlyIssues = els.onlyIssuesCheckbox.checked;
  els.entriesBody.innerHTML = '';

  const filtered = state.entries
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => {
      if (!onlyIssues) return true;
      return !entry.malId || (entry.confidence ?? 0) < 0.75;
    });

  if (!filtered.length) {
    els.listSection.classList.add('hidden');
    return;
  }

  for (const { entry, idx } of filtered) {
    const tr = document.createElement('tr');

    // Title + matched MAL title
    const titleTd = document.createElement('td');
    const titleStrong = document.createElement('strong');
    titleStrong.textContent = entry.title;
    titleTd.appendChild(titleStrong);

    const sub = document.createElement('span');
    sub.className = 'mal-sub';
    if (!entry.malId) {
      sub.classList.add('danger');
      sub.textContent = 'Brak dopasowania (wpisz MAL ID ręcznie)';
    } else if ((entry.confidence ?? 1) < 0.75) {
      sub.classList.add('warn');
      sub.textContent = `MAL: ${entry.malTitle || 'OK'} (${Math.round(entry.confidence * 100)}%)`;
    } else {
      sub.textContent = `MAL: ${entry.malTitle || 'OK'}`;
    }
    titleTd.appendChild(sub);

    // Status + score + episodes
    const metaTd = document.createElement('td');
    const scoreText = entry.score > 0 ? `${entry.score}/10` : 'Brak';
    const epText = `${entry.watchedEpisodes ?? 0}/${entry.totalEpisodes || '?'}`;
    metaTd.textContent = `${entry.status} • ${scoreText} • ${epText}`;

    // Editable MAL ID
    const idTd = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.placeholder = 'ID';
    input.className = 'mal-id-input';
    input.value = entry.malId ? String(entry.malId) : '';
    input.addEventListener('change', async () => {
      const parsed = Number.parseInt(input.value, 10);
      state.entries[idx].malId = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      if (state.entries[idx].malId) {
        state.entries[idx].confidence = 1;
        state.entries[idx].malTitle = state.entries[idx].malTitle || 'Ręczne ID';
      }
      await saveState();
      renderSummary();
    });
    idTd.appendChild(input);

    tr.append(titleTd, metaTd, idTd);
    els.entriesBody.appendChild(tr);
  }

  els.listSection.classList.remove('hidden');
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function checkActiveTab() {
  const tab = await getActiveTab();
  const isShindenList = Boolean(tab?.url && /^https:\/\/lista\.shinden\.pl\/animelist\//i.test(tab.url));
  els.notShindenNotice.classList.toggle('hidden', isShindenList);
  els.scrapeBtn.disabled = !isShindenList;
  return tab;
}

els.openShindenBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://lista.shinden.pl/' });
});

els.onlyIssuesCheckbox.addEventListener('change', renderTable);

els.scrapeBtn.addEventListener('click', async () => {
  hideStatus();
  const tab = await getActiveTab();
  if (!tab?.id) return;

  els.scrapeBtn.disabled = true;
  els.scrapeBtn.textContent = 'Pobieranie listy...';

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_SHINDEN_LIST' });
    if (!response?.ok) {
      throw new Error(response?.error || 'Nie udało się odczytać listy ze strony.');
    }

    const { userName, entries, apiErrors, debug } = response.data;
    if (!entries.length) {
      const errDetail = apiErrors?.length ? ` (${apiErrors.join('; ')})` : '';
      showStatus(`Nie znaleziono pozycji anime na tej stronie${errDetail}.`, true);
      showDebug(debug);
    } else {
      state = { userName, entries };
      await saveState();
      showStatus(`Pobrano ${entries.length} pozycji. Teraz kliknij „2. Dopasuj do MyAnimeList”.`);
    }
    renderSummary();
  } catch (err) {
    showStatus(`Błąd pobierania: ${err.message}. Odśwież stronę Shindena i spróbuj ponownie.`, true);
  } finally {
    els.scrapeBtn.disabled = false;
    els.scrapeBtn.textContent = '1. Pobierz listę z Shindena';
  }
});

els.matchBtn.addEventListener('click', async () => {
  if (!state.entries.length) return;
  hideStatus();

  await chrome.runtime.sendMessage({
    type: 'START_MATCH_JOB',
    entries: state.entries,
    userName: state.userName,
  });
});

els.exportBtn.addEventListener('click', () => {
  const { xml, exportedCount, skippedCount } = generateMalXml(state.entries, {
    userName: state.userName,
  });

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeUser = String(state.userName || 'shinden').replace(/[^a-z0-9_-]/gi, '_');
  a.href = url;
  a.download = `shinden_to_mal_${safeUser}.xml`;
  a.click();
  URL.revokeObjectURL(url);

  const skippedInfo = skippedCount > 0 ? ` (pominięto ${skippedCount} bez MAL ID)` : '';
  showStatus(`Wyeksportowano ${exportedCount} anime${skippedInfo}. Wgraj plik na myanimelist.net/import.php.`);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes[STATE_KEY]?.newValue) {
    state = changes[STATE_KEY].newValue;
    renderSummary();
  }
  if (changes[JOB_KEY]?.newValue) {
    applyJobUi(changes[JOB_KEY].newValue);
  }
});

(async () => {
  const job = await loadState();
  await checkActiveTab();
  renderSummary();
  applyJobUi(job);
  if (job?.status === 'done' || job?.status === 'error') {
    chrome.runtime.sendMessage({ type: 'CLEAR_BADGE' }).catch(() => {});
  }
})();
