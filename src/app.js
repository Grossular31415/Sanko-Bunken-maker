/**
 * 画面の組み立てと入出力。
 * 整形の規則そのものは format.js に置き、このファイルには持ち込まない。
 */
import { formatWebReference, todayIso } from './format.js';

const FIELD_IDS = ['authors', 'title', 'siteName', 'updated', 'url', 'accessed'];
const EMPTY_MESSAGE = '上の欄に入力すると、ここに整形結果が出ます。';
const LEVEL_LABEL = { warn: '確認', info: '補足' };
const COPY_STATUS_MS = 2600;

const form = document.getElementById('ref-form');
const abbreviateInput = document.getElementById('abbreviate');
const resultEl = document.getElementById('result');
const warningsEl = document.getElementById('warnings');
const copyButton = document.getElementById('copy');
const copyStatus = document.getElementById('copy-status');
const clearButton = document.getElementById('clear');

const inputs = {};
for (const id of FIELD_IDS) {
  inputs[id] = document.getElementById(id);
}

let copyStatusTimer = 0;

function setCopyStatus(message) {
  window.clearTimeout(copyStatusTimer);
  copyStatus.textContent = message;
  if (message) {
    copyStatusTimer = window.setTimeout(() => {
      copyStatus.textContent = '';
    }, COPY_STATUS_MS);
  }
}

function readForm() {
  const values = { abbreviateAuthors: abbreviateInput.checked };
  for (const id of FIELD_IDS) {
    values[id] = inputs[id].value;
  }
  return values;
}

function renderWarnings(warnings, hasReference) {
  warningsEl.replaceChildren();

  if (warnings.length === 0) {
    if (!hasReference) return;
    const note = document.createElement('p');
    note.className = 'all-clear';
    note.textContent = '不足している項目は見つかりませんでした。';
    warningsEl.append(note);
    return;
  }

  const list = document.createElement('ul');
  for (const warning of warnings) {
    const item = document.createElement('li');
    item.className = `level-${warning.level}`;

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = `${LEVEL_LABEL[warning.level] ?? '確認'}:`;

    item.append(tag, document.createTextNode(warning.message));
    list.append(item);
  }
  warningsEl.append(list);
}

function render() {
  const { reference, warnings } = formatWebReference(readForm());
  const hasReference = reference.length > 0;

  resultEl.textContent = hasReference ? reference : EMPTY_MESSAGE;
  resultEl.classList.toggle('is-empty', !hasReference);

  // 警告があってもコピーは妨げない。結果が空のときだけ押せないようにする。
  copyButton.disabled = !hasReference;

  renderWarnings(warnings, hasReference);
  setCopyStatus('');
}

/** クリップボードへ書き込む。Clipboard API が使えない環境では選択とコピーで代替する。 */
async function writeToClipboard(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 下の方法を試す
    }
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  document.body.append(area);
  area.select();
  area.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

async function handleCopy() {
  const { reference } = formatWebReference(readForm());
  if (!reference) return;

  const copied = await writeToClipboard(reference);
  setCopyStatus(copied ? 'コピーしました' : 'コピーできませんでした。結果を選択してコピーしてください。');
}

function handleClear() {
  for (const id of FIELD_IDS) {
    inputs[id].value = '';
  }
  abbreviateInput.checked = false;
  inputs.accessed.value = todayIso();
  render();
  inputs.authors.focus();
}

inputs.accessed.value = todayIso();

form.addEventListener('input', render);
form.addEventListener('change', render);
form.addEventListener('submit', (event) => event.preventDefault());
copyButton.addEventListener('click', handleCopy);
clearButton.addEventListener('click', handleClear);

render();
