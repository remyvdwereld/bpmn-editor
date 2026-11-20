import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
  CamundaPlatformPropertiesProviderModule
} from 'bpmn-js-properties-panel';
import CamundaBehaviorsModule from 'camunda-bpmn-js-behaviors/lib/camunda-platform';
import camundaModdleDescriptor from 'camunda-bpmn-moddle/resources/camunda.json';
import lintModule from 'bpmn-js-bpmnlint';
import bpmnlintConfig from '../.bpmnlintrc';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import 'bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css';
import './style.css';

import emptyDiagram from './empty.bpmn?raw';

const $ = (id) => document.getElementById(id);

const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties' },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    CamundaPlatformPropertiesProviderModule,
    CamundaBehaviorsModule,
    lintModule
  ],
  linting: { bpmnlint: bpmnlintConfig, active: false },
  moddleExtensions: { camunda: camundaModdleDescriptor }
});

// File System Access API (Chrome/Edge): direct bewerken en opslaan van lokale bestanden.
// In andere browsers vallen we terug op openen via <input> en opslaan als download.
const fsSupported = 'showOpenFilePicker' in window;
const BPMN_TYPES = [{ description: 'BPMN-diagram', accept: { 'application/xml': ['.bpmn', '.xml'] } }];
const MAX_RECENT = 10;

let filename = 'nieuw-diagram.bpmn';
let dirty = false;
let fileHandle = null; // gekoppeld bestand op schijf, of null
let lastModified = 0;  // om externe wijzigingen te detecteren vóór het opslaan
let ignoredModified = 0; // externe versie waarvoor de gebruiker "negeren" koos
let saving = false;

function setFilename(name) {
  filename = name;
  const el = $('filename');
  el.textContent = name;
  el.title = fileHandle
    ? 'Gekoppeld aan het bestand op schijf: Opslaan schrijft direct naar dit bestand'
    : 'Niet gekoppeld aan een bestand';
  document.title = `${name} – BPMN Editor`;
}

function setDirty(value) {
  dirty = value;
  $('filename').classList.toggle('dirty', value);
  if (!$('reload-banner').hidden) renderReloadBanner();
}

function showError(message) {
  const el = $('error');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => (el.hidden = true), 6000);
}

const isAbort = (err) => err?.name === 'AbortError';

async function openDiagram(xml, name, handle = null, modified = 0, { keepViewport = false } = {}) {
  try {
    const canvas = modeler.get('canvas');
    const { x, y, width, height } = canvas.viewbox();
    const { warnings } = await modeler.importXML(xml);
    if (warnings.length) console.warn('Import-waarschuwingen:', warnings);
    if (keepViewport) canvas.viewbox({ x, y, width, height });
    else canvas.zoom('fit-viewport', 'auto');
    fileHandle = handle;
    lastModified = modified;
    ignoredModified = 0;
    hideReloadBanner();
    setFilename(name);
    setDirty(false);
    return true;
  } catch (err) {
    console.error(err);
    showError(`Kon "${name}" niet openen: ${err.message}`);
    return false;
  }
}

function confirmDiscard() {
  return !dirty || confirm('Er zijn niet-opgeslagen wijzigingen. Doorgaan?');
}

// Fallback: bestand zonder handle (alleen lezen, opslaan wordt een download)
async function openFile(file) {
  if (!file) return;
  await openDiagram(await file.text(), file.name);
}

async function ensurePermission(handle, mode) {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

async function openHandle(handle) {
  try {
    const file = await handle.getFile();
    if (await openDiagram(await file.text(), file.name, handle, file.lastModified)) {
      await addRecent(handle);
    }
  } catch (err) {
    if (err?.name === 'NotFoundError') {
      showError(`"${handle.name}" bestaat niet meer op deze locatie.`);
      await removeRecent(handle);
    } else {
      console.error(err);
      showError(`Kon "${handle.name}" niet openen: ${err.message}`);
    }
  }
}

async function openWithPicker() {
  if (!confirmDiscard()) return;
  if (!fsSupported) return $('file-input').click();
  try {
    const [handle] = await window.showOpenFilePicker({ id: 'bpmn', types: BPMN_TYPES });
    await openHandle(handle);
  } catch (err) {
    if (!isAbort(err)) showError(`Openen mislukt: ${err.message}`);
  }
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const baseName = () => filename.replace(/\.(bpmn|xml)$/i, '');

async function writeToHandle(handle) {
  const { xml } = await modeler.saveXML({ format: true });
  saving = true; // voorkom dat de eigen schrijfactie als externe wijziging gezien wordt
  try {
    const writable = await handle.createWritable();
    await writable.write(xml);
    await writable.close();
    lastModified = (await handle.getFile()).lastModified;
  } finally {
    saving = false;
  }
  ignoredModified = 0;
  hideReloadBanner();
  setDirty(false);
}

async function saveBpmn() {
  if (!fileHandle) return saveBpmnAs();
  try {
    if (!(await ensurePermission(fileHandle, 'readwrite'))) {
      showError('Geen toestemming om naar het bestand te schrijven. Gebruik "Opslaan als…".');
      return;
    }
    const current = await fileHandle.getFile();
    if (lastModified && current.lastModified !== lastModified &&
        !confirm(`"${current.name}" is buiten de editor gewijzigd. Toch overschrijven?`)) {
      return;
    }
    await writeToHandle(fileHandle);
  } catch (err) {
    console.error(err);
    showError(`Opslaan mislukt: ${err.message}. Probeer "Opslaan als…".`);
  }
}

async function saveBpmnAs() {
  if (!fsSupported) {
    const { xml } = await modeler.saveXML({ format: true });
    download(xml, `${baseName()}.bpmn`, 'application/xml');
    setDirty(false);
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      id: 'bpmn',
      suggestedName: `${baseName()}.bpmn`,
      types: BPMN_TYPES
    });
    await writeToHandle(handle);
    fileHandle = handle;
    setFilename(handle.name);
    await addRecent(handle);
  } catch (err) {
    if (!isAbort(err)) {
      console.error(err);
      showError(`Opslaan mislukt: ${err.message}`);
    }
  }
}

async function saveSvg() {
  const { svg } = await modeler.saveSVG();
  download(svg, `${baseName()}.svg`, 'image/svg+xml');
}

// Recente bestanden: handles worden bewaard in IndexedDB (alleen Chrome/Edge)
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('bpmn-editor', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', mode);
      const request = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { db.close(); resolve(request.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}

async function getRecent() {
  try {
    return (await idb('readonly', (s) => s.get('recent'))) ?? [];
  } catch (err) {
    console.warn('Recente bestanden niet beschikbaar:', err);
    return [];
  }
}

async function setRecent(list) {
  try {
    await idb('readwrite', (s) => s.put(list, 'recent'));
  } catch (err) {
    console.warn('Recente bestanden niet opgeslagen:', err);
  }
  renderRecent(list);
}

async function withoutHandle(list, handle) {
  const result = [];
  for (const entry of list) {
    if (!(await entry.handle.isSameEntry(handle))) result.push(entry);
  }
  return result;
}

async function addRecent(handle) {
  const list = await withoutHandle(await getRecent(), handle);
  list.unshift({ name: handle.name, handle, openedAt: Date.now() });
  await setRecent(list.slice(0, MAX_RECENT));
}

async function removeRecent(handle) {
  await setRecent(await withoutHandle(await getRecent(), handle));
}

const dateFormat = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' });

function renderRecent(list) {
  const ul = $('recent-list');
  ul.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'menu-empty';
    li.textContent = 'Nog geen recente bestanden';
    ul.append(li);
  }
  for (const entry of list) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.name;
    const small = document.createElement('small');
    small.textContent = dateFormat.format(entry.openedAt);
    button.append(small);
    button.addEventListener('click', () => openRecent(entry));
    const li = document.createElement('li');
    li.append(button);
    ul.append(li);
  }
  $('btn-recent-clear').hidden = !list.length;
}

async function openRecent(entry) {
  $('recent-menu').open = false;
  if (!confirmDiscard()) return;
  try {
    // Na een herstart van de browser moet toestemming opnieuw gevraagd worden
    if (!(await ensurePermission(entry.handle, 'readwrite'))) return;
  } catch (err) {
    showError(`Geen toegang tot "${entry.name}": ${err.message}`);
    return;
  }
  await openHandle(entry.handle);
}

if (fsSupported) {
  $('recent-menu').hidden = false;
  $('btn-recent-clear').addEventListener('click', () => {
    $('recent-menu').open = false;
    setRecent([]);
  });
  document.addEventListener('click', (e) => {
    const menu = $('recent-menu');
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  getRecent().then(renderRecent);
}

// Toolbar
$('btn-new').addEventListener('click', () => {
  if (confirmDiscard()) openDiagram(emptyDiagram, 'nieuw-diagram.bpmn');
});
$('btn-open').addEventListener('click', openWithPicker);
$('file-input').addEventListener('change', (e) => {
  openFile(e.target.files[0]);
  e.target.value = '';
});
$('btn-save').addEventListener('click', saveBpmn);
$('btn-save-as').addEventListener('click', saveBpmnAs);
$('btn-svg').addEventListener('click', saveSvg);

// Ctrl/Cmd+S, Ctrl/Cmd+Shift+S en Ctrl/Cmd+O
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 's') { e.preventDefault(); e.shiftKey ? saveBpmnAs() : saveBpmn(); }
  if (key === 'o') { e.preventDefault(); openWithPicker(); }
});

// Drag & drop
const canvasEl = $('canvas');
let dragDepth = 0;
canvasEl.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  dragDepth++;
  canvasEl.classList.add('dragging');
});
canvasEl.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) { dragDepth = 0; canvasEl.classList.remove('dragging'); }
});
canvasEl.addEventListener('dragover', (e) => e.preventDefault());
canvasEl.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  canvasEl.classList.remove('dragging');

  const item = [...e.dataTransfer.items].find((i) => i.kind === 'file');
  if (!item) return;
  // Beide moeten synchroon in de drop-handler opgevraagd worden
  const file = item.getAsFile();
  const handlePromise = fsSupported && item.getAsFileSystemHandle
    ? item.getAsFileSystemHandle().catch(() => null)
    : Promise.resolve(null);

  handlePromise.then((handle) => {
    if (!confirmDiscard()) return;
    if (handle?.kind === 'file') openHandle(handle);
    else openFile(file);
  });
});

// Externe wijzigingen detecteren: periodiek (alleen als het tabblad zichtbaar is)
// en direct bij terugkeer naar het tabblad. Leest alleen de wijzigingsdatum.
const WATCH_INTERVAL = 2000;
let checking = false;

function renderReloadBanner() {
  const banner = $('reload-banner');
  banner.classList.toggle('conflict', dirty);
  $('reload-text').textContent = dirty
    ? `"${filename}" is ook buiten de editor gewijzigd.`
    : `"${filename}" is gewijzigd op schijf.`;
  $('btn-reload').textContent = dirty ? 'Herladen en mijn wijzigingen weggooien' : 'Herladen';
  $('btn-reload-ignore').textContent = dirty ? 'Mijn versie houden' : 'Negeren';
  banner.hidden = false;
}

function hideReloadBanner() {
  $('reload-banner').hidden = true;
}

async function checkForExternalChange() {
  const handle = fileHandle;
  if (!handle || checking || saving || document.hidden) return;
  checking = true;
  try {
    const { lastModified: modified } = await handle.getFile();
    if (handle !== fileHandle || saving) return; // intussen ander bestand geopend of opgeslagen
    if (modified !== lastModified && modified !== ignoredModified) renderReloadBanner();
  } catch (err) {
    // Bijv. tijdelijk weg tijdens een atomic save door een andere editor; volgende keer opnieuw
    console.debug('Controle op externe wijziging mislukt:', err);
  } finally {
    checking = false;
  }
}

async function reloadFromDisk() {
  const handle = fileHandle;
  if (!handle) return;
  try {
    const file = await handle.getFile();
    await openDiagram(await file.text(), file.name, handle, file.lastModified, { keepViewport: true });
  } catch (err) {
    console.error(err);
    showError(`Herladen mislukt: ${err.message}`);
  }
}

async function ignoreExternalChange() {
  hideReloadBanner();
  try {
    // Bij de volgende externe wijziging komt de melding terug.
    // lastModified blijft ongewijzigd, zodat Opslaan nog vraagt om te overschrijven.
    ignoredModified = (await fileHandle.getFile()).lastModified;
  } catch {
    ignoredModified = 0;
  }
}

if (fsSupported) {
  $('btn-reload').addEventListener('click', reloadFromDisk);
  $('btn-reload-ignore').addEventListener('click', ignoreExternalChange);
  setInterval(checkForExternalChange, WATCH_INTERVAL);
  document.addEventListener('visibilitychange', checkForExternalChange);
  window.addEventListener('focus', checkForExternalChange);
}

// Wijzigingen bijhouden
modeler.on('commandStack.changed', () => setDirty(true));
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

openDiagram(emptyDiagram, 'nieuw-diagram.bpmn');
