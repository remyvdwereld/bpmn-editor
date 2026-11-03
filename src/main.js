import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule,
  CamundaPlatformPropertiesProviderModule
} from 'bpmn-js-properties-panel';
import CamundaBehaviorsModule from 'camunda-bpmn-js-behaviors/lib/camunda-platform';
import camundaModdleDescriptor from 'camunda-bpmn-moddle/resources/camunda.json';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
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
    CamundaBehaviorsModule
  ],
  moddleExtensions: { camunda: camundaModdleDescriptor }
});

let filename = 'nieuw-diagram.bpmn';
let dirty = false;

function setFilename(name) {
  filename = name;
  $('filename').textContent = name;
}

function setDirty(value) {
  dirty = value;
  $('filename').classList.toggle('dirty', value);
}

function showError(message) {
  const el = $('error');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => (el.hidden = true), 6000);
}

async function openDiagram(xml, name) {
  try {
    const { warnings } = await modeler.importXML(xml);
    if (warnings.length) console.warn('Import-waarschuwingen:', warnings);
    modeler.get('canvas').zoom('fit-viewport', 'auto');
    setFilename(name);
    setDirty(false);
  } catch (err) {
    console.error(err);
    showError(`Kon "${name}" niet openen: ${err.message}`);
  }
}

function confirmDiscard() {
  return !dirty || confirm('Er zijn niet-opgeslagen wijzigingen. Doorgaan?');
}

async function openFile(file) {
  if (!file || !confirmDiscard()) return;
  await openDiagram(await file.text(), file.name);
}

function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

const baseName = () => filename.replace(/\.(bpmn|xml)$/i, '');

async function saveBpmn() {
  const { xml } = await modeler.saveXML({ format: true });
  download(xml, `${baseName()}.bpmn`, 'application/xml');
  setDirty(false);
}

async function saveSvg() {
  const { svg } = await modeler.saveSVG();
  download(svg, `${baseName()}.svg`, 'image/svg+xml');
}

// Toolbar
$('btn-new').addEventListener('click', () => {
  if (confirmDiscard()) openDiagram(emptyDiagram, 'nieuw-diagram.bpmn');
});
$('btn-open').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => {
  openFile(e.target.files[0]);
  e.target.value = '';
});
$('btn-save').addEventListener('click', saveBpmn);
$('btn-svg').addEventListener('click', saveSvg);

// Ctrl/Cmd+S en Ctrl/Cmd+O
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 's') { e.preventDefault(); saveBpmn(); }
  if (key === 'o') { e.preventDefault(); $('file-input').click(); }
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
  openFile(e.dataTransfer.files[0]);
});

// Wijzigingen bijhouden
modeler.on('commandStack.changed', () => setDirty(true));
window.addEventListener('beforeunload', (e) => {
  if (dirty) e.preventDefault();
});

openDiagram(emptyDiagram, 'nieuw-diagram.bpmn');
