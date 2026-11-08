import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ABBREVIATE_THRESHOLD,
  collapseSpaces,
  formatAuthors,
  formatWebReference,
  normalizeDate,
  normalizeUrl,
  toHalfWidth,
  todayIso,
} from '../src/format.js';

/** 警告のうち指定した項目のものを返す。 */
function warningsFor(result, field) {
  return result.warnings.filter((warning) => warning.field === field);
}

describe('SIST 02-2007 原文の用例を再現できる', () => {
  // 原文 5.10 例1（ウェブサイト「J-STORE」に掲載された記事）
  test('例1: 全項目あり', () => {
    const result = formatWebReference({
      authors: '坂本和夫編',
      title: 'パルスレーザーアブレーションにおけるドロップレットフリー薄膜の作製技術',
      siteName: 'J-STORE',
      updated: '2005-11-01',
      url: 'http://jstore.jst.go.jp/cgi-bin/techeye/detail.cgi?techeye_id=32',
      accessed: '2006-06-23',
    });

    assert.equal(
      result.reference,
      '坂本和夫編. “パルスレーザーアブレーションにおけるドロップレットフリー薄膜の作製技術”. '
        + 'J-STORE. 2005-11-01. '
        + 'http://jstore.jst.go.jp/cgi-bin/techeye/detail.cgi?techeye_id=32, (参照 2006-06-23).'
    );
    assert.deepEqual(result.warnings, []);
  });

  // 原文 5.10 例2（著者名と更新日付がない PDF 文書）。参照日のラベルは本ツールでは常に「参照」。
  test('例2: 著者名なし・更新日なしでも区切り記号が残らない', () => {
    const result = formatWebReference({
      authors: '',
      title: 'Grants.gov Application Guide SF424 (R&R)',
      siteName: 'U.S. Department of Health and Human Services',
      updated: '',
      url: 'http://grants1.nih.gov/grants/funding/424/SF424_RR_Guide_General.pdf',
      accessed: '2006-07-01',
    });

    assert.equal(
      result.reference,
      '“Grants.gov Application Guide SF424 (R&R)”. '
        + 'U.S. Department of Health and Human Services. '
        + 'http://grants1.nih.gov/grants/funding/424/SF424_RR_Guide_General.pdf, (参照 2006-07-01).'
    );
    assert.equal(warningsFor(result, 'authors').length, 1);
    assert.equal(warningsFor(result, 'authors')[0].level, 'warn');
    assert.equal(warningsFor(result, 'updated')[0].level, 'info');
  });

  // 原文 5.10 例3（ブログ記事、著者名はハンドルネーム）
  test('例3: 題名にカンマを含んでも分割しない', () => {
    const result = formatWebReference({
      authors: 'smine',
      title: 'Wellcome Trust, Blackwell/OUP/Springerと助成研究の即時オープンアクセス提供を契約',
      siteName: 'オープンアクセスジャパン',
      updated: '2005-12-15',
      url: 'http://www.openaccessjapan.com/archives/2005/12/wellcome_trustb.html',
      accessed: '2006-05-31',
    });

    assert.equal(
      result.reference,
      'smine. “Wellcome Trust, Blackwell/OUP/Springerと助成研究の即時オープンアクセス提供を契約”. '
        + 'オープンアクセスジャパン. 2005-12-15. '
        + 'http://www.openaccessjapan.com/archives/2005/12/wellcome_trustb.html, (参照 2006-05-31).'
    );
    assert.deepEqual(result.warnings, []);
  });
});

describe('著者名の整形', () => {
  test('和文の連名は全角カンマでつなぐ（4.1.1(3)(a) 例1）', () => {
    const authors = formatAuthors('島田俊夫, 平木敬, 西田健次');
    assert.equal(authors.value, '島田俊夫，平木敬，西田健次');
    assert.equal(authors.script, 'ja');
    assert.equal(authors.names.length, 3);
  });

  test('全角カンマ・読点でも区切れる', () => {
    assert.equal(formatAuthors('島田俊夫，平木敬').value, '島田俊夫，平木敬');
    assert.equal(formatAuthors('島田俊夫、平木敬').value, '島田俊夫，平木敬');
  });

  test('欧文の連名はセミコロン区切りで受け取る（4.1.1(3)(a) 例2）', () => {
    const authors = formatAuthors('Folland, Gerald B.; Stein, Elias M.');
    assert.equal(authors.value, 'Folland, Gerald B.; Stein, Elias M.');
    assert.equal(authors.script, 'en');
    assert.equal(authors.names.length, 2);
    assert.equal(authors.commaSplitLatin, false);
  });

  test('欧文をカンマで区切ると注意を促す', () => {
    const result = formatWebReference({ authors: 'Folland, Gerald B.' });
    const infos = warningsFor(result, 'authors').filter((w) => w.level === 'info');
    assert.equal(infos.length, 1);
    assert.match(infos[0].message, /セミコロン/);
  });

  test('3名以上は「ほか」で省略できる（4.1.1(3)(b)）', () => {
    const ja = formatAuthors('島田俊夫, 平木敬, 西田健次', { abbreviate: true });
    assert.equal(ja.value, '島田俊夫ほか');
    assert.equal(ja.abbreviated, true);

    const en = formatAuthors('Folland, Gerald B.; Stein, Elias M.; Ooura, Takuya', { abbreviate: true });
    assert.equal(en.value, 'Folland, Gerald B. et al.');
  });

  test('2名のときは省略しない（「2名を超える場合」が条件）', () => {
    const authors = formatAuthors('島田俊夫, 平木敬', { abbreviate: true });
    assert.equal(authors.value, '島田俊夫，平木敬');
    assert.equal(authors.abbreviated, false);
    assert.equal(ABBREVIATE_THRESHOLD, 2);
  });

  test('空の要素や余分な区切りは落とす', () => {
    const authors = formatAuthors(' , 島田俊夫 ,, 平木敬 , ');
    assert.equal(authors.value, '島田俊夫，平木敬');
  });

  test('団体名はそのまま1件として扱う', () => {
    assert.equal(formatAuthors('文部科学省').value, '文部科学省');
  });
});

describe('日付の正規化', () => {
  test('年月日まで揃った各種表記を YYYY-MM-DD にする', () => {
    for (const input of ['2024-03-01', '2024/3/1', '2024.03.01', '2024年3月1日', '2024-3-1']) {
      const date = normalizeDate(input);
      assert.equal(date.value, '2024-03-01', `入力: ${input}`);
      assert.equal(date.status, 'full', `入力: ${input}`);
    }
  });

  test('年のみ・年月のみは partial として残す', () => {
    assert.deepEqual(
      { value: normalizeDate('2024').value, status: normalizeDate('2024').status },
      { value: '2024', status: 'partial' }
    );
    assert.deepEqual(
      { value: normalizeDate('2024年3月').value, status: normalizeDate('2024年3月').status },
      { value: '2024-03', status: 'partial' }
    );
  });

  test('存在しない日付は invalid にする', () => {
    assert.equal(normalizeDate('2024-02-30').status, 'invalid');
    assert.equal(normalizeDate('2024-13-01').status, 'invalid');
  });

  test('日付として読めない入力はそのまま残して invalid にする', () => {
    const date = normalizeDate('令和6年のはじめ');
    assert.equal(date.status, 'invalid');
    assert.equal(date.value, '令和6年のはじめ');
  });

  test('未入力は empty', () => {
    assert.equal(normalizeDate('').status, 'empty');
    assert.equal(normalizeDate('   ').status, 'empty');
    assert.equal(normalizeDate(undefined).status, 'empty');
  });

  test('todayIso はローカル時刻の YYYY-MM-DD を返す', () => {
    assert.equal(todayIso(new Date(2024, 2, 1)), '2024-03-01');
    assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('全角文字と前後の空白を含む入力', () => {
  test('全角で入力された URL と日付を半角に直す', () => {
    const result = formatWebReference({
      authors: '　文部科学省　',
      title: '　学習指導要領　',
      siteName: '　文部科学省ホームページ　',
      updated: '２０２４年３月１日',
      url: 'ｈｔｔｐｓ：／／ｗｗｗ．ｍｅｘｔ．ｇｏ．ｊｐ／ａ．ｈｔｍｌ',
      accessed: '２０２４－１１－０８',
    });

    assert.equal(
      result.reference,
      '文部科学省. “学習指導要領”. 文部科学省ホームページ. 2024-03-01. '
        + 'https://www.mext.go.jp/a.html, (参照 2024-11-08).'
    );
    assert.deepEqual(result.warnings, []);
  });

  test('前後と途中の空白を整える', () => {
    const result = formatWebReference({
      title: '  複数   の　 空白 ',
      siteName: ' サイト ',
      url: ' https://example.com/a ',
      accessed: ' 2024-11-08 ',
    });
    assert.match(result.reference, /“複数 の 空白”\. サイト\./);
    assert.match(result.reference, /https:\/\/example\.com\/a, \(参照 2024-11-08\)\.$/);
  });

  test('toHalfWidth はかな・漢字に触れない', () => {
    assert.equal(toHalfWidth('全角ＡＢＣ１２３　ｶﬅ'), '全角ABC123 ｶﬅ');
    assert.equal(collapseSpaces('　あ　 い 　'), 'あ い');
  });
});

describe('不正な URL', () => {
  test('スキームがない入力は malformed', () => {
    const url = normalizeUrl('www.example.com/page');
    assert.equal(url.status, 'malformed');
    assert.equal(url.value, 'www.example.com/page');
  });

  test('http/https 以外は unsupported-scheme', () => {
    assert.equal(normalizeUrl('ftp://example.com/a').status, 'unsupported-scheme');
    assert.equal(normalizeUrl('javascript:alert(1)').status, 'unsupported-scheme');
  });

  test('ホストのない https:// は malformed', () => {
    assert.equal(normalizeUrl('https://').status, 'malformed');
  });

  test('不正な URL でも整形結果は返し、警告を添える', () => {
    const result = formatWebReference({
      authors: '例組織',
      title: 'ページ',
      siteName: 'サイト',
      url: 'example.com',
      accessed: '2024-11-08',
    });
    assert.match(result.reference, /example\.com, \(参照 2024-11-08\)\.$/);
    const urlWarnings = warningsFor(result, 'url');
    assert.equal(urlWarnings.length, 1);
    assert.equal(urlWarnings[0].level, 'warn');
    assert.match(urlWarnings[0].message, /https:\/\//);
  });

  test('クエリやフラグメント付きの URL はそのまま保つ', () => {
    const url = 'https://example.com/a/b?x=1&y=2#sec3';
    assert.equal(normalizeUrl(url).status, 'ok');
    assert.equal(normalizeUrl(url).value, url);
  });

  test('日本語を含む URL も通す', () => {
    const url = 'https://example.com/検索?q=参考文献';
    assert.equal(normalizeUrl(url).status, 'ok');
    assert.equal(normalizeUrl(url).value, url);
  });
});

describe('長いタイトルと長い URL', () => {
  test('長いタイトルを切り詰めない', () => {
    const title = 'あ'.repeat(600);
    const result = formatWebReference({ title, siteName: 'サイト', url: 'https://example.com', accessed: '2024-11-08' });
    assert.ok(result.reference.includes(title));
    assert.equal(result.elements.title.length, 600);
  });

  test('長い URL を切り詰めない', () => {
    const url = `https://example.com/${'a'.repeat(1500)}?q=${'b'.repeat(500)}`;
    const result = formatWebReference({ title: 'ページ', siteName: 'サイト', url, accessed: '2024-11-08' });
    assert.ok(result.reference.includes(url));
    assert.equal(normalizeUrl(url).status, 'ok');
  });
});

describe('書誌要素が欠けたときの組み立て', () => {
  test('すべて未入力なら空文字を返す', () => {
    const result = formatWebReference({});
    assert.equal(result.reference, '');
    assert.ok(result.warnings.length >= 5);
  });

  test('参照日だけでは参照文献にしない（初期値の今日が入っているため）', () => {
    const result = formatWebReference({ accessed: '2024-11-08' });
    assert.equal(result.reference, '');
  });

  test('書誌要素がひとつでもあれば参照日を添える', () => {
    const result = formatWebReference({ siteName: 'サイト', accessed: '2024-11-08' });
    assert.equal(result.reference, 'サイト. (参照 2024-11-08).');
  });

  test('URL がなくても参照日は括弧付きで残す', () => {
    const result = formatWebReference({ title: 'ページ', accessed: '2024-11-08' });
    assert.equal(result.reference, '“ページ”. (参照 2024-11-08).');
  });

  test('参照日がなければ URL の後ろにカンマを残さない', () => {
    const result = formatWebReference({ title: 'ページ', url: 'https://example.com/a' });
    assert.equal(result.reference, '“ページ”. https://example.com/a.');
  });

  test('更新日のみ欠けても前後の区切りは1つだけ', () => {
    const result = formatWebReference({
      authors: '例組織',
      title: 'ページ',
      siteName: 'サイト',
      updated: '',
      url: 'https://example.com/a',
      accessed: '2024-11-08',
    });
    assert.equal(result.reference, '例組織. “ページ”. サイト. https://example.com/a, (参照 2024-11-08).');
    assert.ok(!result.reference.includes('..'));
  });

  test('参照日が年月までしかなければ警告する', () => {
    const result = formatWebReference({ title: 'ページ', url: 'https://example.com', accessed: '2024-11' });
    const accessedWarnings = warningsFor(result, 'accessed');
    assert.equal(accessedWarnings.length, 1);
    assert.equal(accessedWarnings[0].level, 'warn');
  });

  test('警告があっても整形結果は必ず文字列で返る（コピーを妨げない）', () => {
    const result = formatWebReference({ authors: '', title: '', siteName: '', url: 'bad', accessed: '' });
    assert.equal(typeof result.reference, 'string');
    assert.ok(result.warnings.length > 0);
  });
});
