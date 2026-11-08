/**
 * SIST 02-2007「参照文献の書き方」5.10 ウェブサイト, ウェブページ, ブログ に基づく整形処理。
 *
 * このファイルは UI から独立した純粋関数だけを置く（node --test で検証する）。
 * DOM には触れないこと。
 *
 * 根拠にした箇所（SIST 02-2007 原文）:
 *   5.10        ウェブサイト／ウェブページの書式と用例
 *   4.1.1(3)    複数著者名の列記と省略
 *   4.1.3       著者が不明の場合は標題から書き始める
 *   4.3.4(4)(b) オンライン文献の出版日付・更新日付の表記
 *   4.4.5       入手日付（参照日付）の表記
 */

/**
 * 書誌要素の区切り。
 *
 * 原文の「書式」表記は全角ピリオド「．」だが、同じ 5.10 の用例（例1〜例3）および
 * 他節の和文用例はいずれも半角ピリオド＋半角空白で書かれている。
 * 実際の参照文献リストに書く形を優先し、用例に合わせる。
 */
export const ELEMENT_SEPARATOR = '. ';

/** 和文著者名の連名区切り（4.1.1(3)(a) 例1「島田俊夫，平木敬，西田健次」）。 */
export const JA_AUTHOR_SEPARATOR = '，';

/** 欧文著者名の連名区切り（4.1.1(3)(a) 例2「Folland, Gerald B.; Stein, Elias M.」）。 */
export const EN_AUTHOR_SEPARATOR = '; ';

/** 参照日付のラベル（4.4.5 例1「(参照 1999-12-31)」）。 */
export const ACCESS_LABEL = '参照';

/** 題名を囲む引用符（5.10 書式および用例）。 */
export const QUOTE_OPEN = '“';
export const QUOTE_CLOSE = '”';

/** 3名を超える著者を「ほか」で省略できる下限（4.1.1(3)(b)「著者が2名を超える場合」）。 */
export const ABBREVIATE_THRESHOLD = 2;

const JAPANESE_RE = /[぀-ゟ゠-ヿ㐀-䶿一-鿿豈-﫿]/;

/** 全角英数記号を半角に、全角空白を半角空白に直す。かな・漢字には触れない。 */
export function toHalfWidth(value) {
  return String(value ?? '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}

/** 前後の空白を落とし、連続する空白を半角空白1つにまとめる。 */
export function collapseSpaces(value) {
  return String(value ?? '')
    .replace(/[\s　]+/g, ' ')
    .trim();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function isRealDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * 日付を YYYY-MM-DD に正規化する。入力は自由記述を許す。
 *
 * status は次のいずれか。
 *   'empty'   未入力
 *   'full'    年月日まで確定（value は YYYY-MM-DD）
 *   'partial' 年のみ／年月のみ（value は YYYY または YYYY-MM）
 *   'invalid' 日付として読み取れない（value は入力をそのまま整えたもの）
 */
export function normalizeDate(raw) {
  const cleaned = collapseSpaces(toHalfWidth(raw));
  const compact = cleaned.replace(/\s+/g, '');
  if (!compact) return { value: '', status: 'empty', input: '' };

  const ymd = compact.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (!isRealDate(year, month, day)) {
      return { value: cleaned, status: 'invalid', input: cleaned };
    }
    return { value: `${ymd[1]}-${pad2(month)}-${pad2(day)}`, status: 'full', input: cleaned };
  }

  const ym = compact.match(/^(\d{4})[-/.年](\d{1,2})月?$/);
  if (ym) {
    const month = Number(ym[2]);
    if (month < 1 || month > 12) {
      return { value: cleaned, status: 'invalid', input: cleaned };
    }
    return { value: `${ym[1]}-${pad2(month)}`, status: 'partial', input: cleaned };
  }

  const yearOnly = compact.match(/^(\d{4})年?$/);
  if (yearOnly) {
    return { value: yearOnly[1], status: 'partial', input: cleaned };
  }

  return { value: cleaned, status: 'invalid', input: cleaned };
}

/**
 * URL を点検する。入力はそのまま保ち、正規化はしない
 * （アドレス欄に見えているとおりを参照文献に書けるようにするため）。
 *
 * status は 'empty' | 'ok' | 'unsupported-scheme' | 'malformed'。
 */
export function normalizeUrl(raw) {
  const text = toHalfWidth(raw).replace(/[\s　]+/g, '');
  if (!text) return { value: '', status: 'empty' };

  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    return { value: text, status: 'malformed' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { value: text, status: 'unsupported-scheme' };
  }
  return { value: text, status: 'ok' };
}

/**
 * 著者名を整形する。
 *
 * 入力はカンマ区切り（「,」「，」「、」）。欧文で「姓, 名」のようにカンマを含む場合は
 * セミコロン（「;」「；」）区切りを使う。セミコロンが1つでもあればそちらを優先する。
 */
export function formatAuthors(raw, options = {}) {
  const { abbreviate = false } = options;
  const text = String(raw ?? '');
  const usesSemicolon = /[;；]/.test(text);
  const delimiter = usesSemicolon ? /[;；]/ : /[,，、]/;

  const names = text
    .split(delimiter)
    .map((name) => collapseSpaces(name))
    .filter((name) => name.length > 0);

  if (names.length === 0) {
    return { value: '', names: [], script: 'none', abbreviated: false, commaSplitLatin: false };
  }

  const script = names.some((name) => JAPANESE_RE.test(name)) ? 'ja' : 'en';
  const separator = script === 'ja' ? JA_AUTHOR_SEPARATOR : EN_AUTHOR_SEPARATOR;
  const shouldAbbreviate = abbreviate && names.length > ABBREVIATE_THRESHOLD;

  let value;
  if (shouldAbbreviate) {
    value = script === 'ja' ? `${names[0]}ほか` : `${names[0]} et al.`;
  } else {
    value = names.join(separator);
  }

  return {
    value,
    names,
    script,
    abbreviated: shouldAbbreviate,
    commaSplitLatin: !usesSemicolon && script === 'en' && names.length > 1,
  };
}

function buildWarnings({ authors, title, siteName, updated, url, accessed }) {
  const warnings = [];
  const add = (field, level, message) => warnings.push({ field, level, message });

  if (!authors.value) {
    add(
      'authors',
      'warn',
      '著者名がありません。ページの筆者名、または運営している組織名（会社名・官公庁名・大学名など）を確認してください。'
        + '見つからない場合、SIST 02-2007 では著者を省略してタイトルから書き始めます。'
    );
  }
  if (authors.commaSplitLatin) {
    add(
      'authors',
      'info',
      '欧文の著者名で「姓, 名」のようにカンマを使う場合は、著者同士の区切りにセミコロン（;）を使ってください。'
        + '例: Folland, Gerald B.; Stein, Elias M.'
    );
  }

  if (!title) {
    add('title', 'warn', 'ページのタイトルがありません。ブラウザのタブに表示される見出しや、ページ上部の大見出しを確認してください。');
  }

  if (!siteName) {
    add('siteName', 'warn', 'サイト名がありません。ページ上部のロゴや、サイトのトップページの名称を確認してください。');
  }

  if (updated.status === 'empty') {
    add(
      'updated',
      'info',
      '更新日がありません。ページの下部や記事の日付表示を確認してください。記載が見つからない場合は、省略したままで構いません。'
    );
  } else if (updated.status === 'partial') {
    add(
      'updated',
      'info',
      `更新日を「${updated.value}」として扱いました。年月日まで分かる場合は 2000-02-02 の形式で入力してください。`
    );
  } else if (updated.status === 'invalid') {
    add(
      'updated',
      'warn',
      `更新日「${updated.input}」を日付として読み取れませんでした。入力をそのまま出力しています。`
        + 'SIST 02-2007 では 2000-02-02 の形式で記述します。'
    );
  }

  if (url.status === 'empty') {
    add('url', 'warn', 'URLがありません。ブラウザのアドレス欄をそのまま貼り付けてください。');
  } else if (url.status === 'unsupported-scheme') {
    add('url', 'warn', 'URLが http:// または https:// で始まっていません。アドレス欄の表示をそのまま貼り付けてください。');
  } else if (url.status === 'malformed') {
    add('url', 'warn', 'URLとして読み取れません。「https://」から始まっているか、余分な文字が混じっていないか確認してください。');
  }

  if (accessed.status === 'empty') {
    add('accessed', 'warn', '参照日がありません。そのページを見た日を 2006-06-23 の形式で入力してください。');
  } else if (accessed.status !== 'full') {
    add(
      'accessed',
      'warn',
      `参照日「${accessed.input}」を年月日として読み取れませんでした。SIST 02-2007 の参照日付は 2006-06-23 のように年月日まで記述します。`
    );
  }

  return warnings;
}

/**
 * ウェブページの参照文献を1件整形する。
 *
 * 未入力の書誌要素は、区切り記号も含めて出力から落とす（4.1.3、および 5.10 例2 に倣う）。
 *
 * @param {object} input
 * @param {string} [input.authors]   著者名／組織名。カンマ区切りで複数可
 * @param {string} [input.title]     ページのタイトル
 * @param {string} [input.siteName]  サイト名
 * @param {string} [input.updated]   更新日（自由記述）
 * @param {string} [input.url]       URL
 * @param {string} [input.accessed]  参照日（自由記述）
 * @param {boolean} [input.abbreviateAuthors] 3名以上を「ほか」で省略するか
 * @returns {{reference: string, warnings: Array<{field: string, level: string, message: string}>, elements: object}}
 */
export function formatWebReference(input = {}) {
  const authors = formatAuthors(input.authors, { abbreviate: input.abbreviateAuthors });
  const title = collapseSpaces(input.title);
  const siteName = collapseSpaces(input.siteName);
  const updated = normalizeDate(input.updated);
  const url = normalizeUrl(input.url);
  const accessed = normalizeDate(input.accessed);

  const segments = [];
  if (authors.value) segments.push(authors.value);
  if (title) segments.push(`${QUOTE_OPEN}${title}${QUOTE_CLOSE}`);
  if (siteName) segments.push(siteName);
  if (updated.value) segments.push(updated.value);

  const accessPart = accessed.value ? `(${ACCESS_LABEL} ${accessed.value})` : '';
  if (url.value && accessPart) {
    segments.push(`${url.value}, ${accessPart}`);
  } else if (url.value) {
    segments.push(url.value);
  } else if (accessPart) {
    segments.push(accessPart);
  }

  // 参照日は初期値として今日が入っているため、それだけでは参照文献として成立しない。
  // 書誌要素がひとつも入っていない間は空文字を返す。
  const hasBibliographicContent = Boolean(
    authors.value || title || siteName || updated.value || url.value
  );
  const reference =
    hasBibliographicContent && segments.length > 0 ? `${segments.join(ELEMENT_SEPARATOR)}.` : '';

  return {
    reference,
    warnings: buildWarnings({ authors, title, siteName, updated, url, accessed }),
    elements: { authors, title, siteName, updated, url, accessed },
  };
}

/** 今日の日付を YYYY-MM-DD（ローカル時刻）で返す。参照日の初期値に使う。 */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}
