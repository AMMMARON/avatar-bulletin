import { mkdir, readFile, writeFile } from 'node:fs/promises';

const dictionary = JSON.parse(await readFile('scripts/english.json', 'utf8'));
const out = 'public/en/';
await mkdir(out, { recursive: true });
// Translate only authored source at build time. Incoming scripts, credentials,
// catalog names and source excerpts never enter this replacement pass.
const phrase = /[\u0600-\u06ff][\u0600-\u06ff A-Za-z0-9…«»·–،.؟:|/%()\-]*/gu;
for (const name of ['index.html','watch.html','data.js','studio.js','views.js','visuals.js','viewer.js']) {
  let source = await readFile('public/' + name, 'utf8');
  source = source.replace(phrase, match => {
    const key = match.trimEnd();
    return Object.hasOwn(dictionary, key) ? dictionary[key] + match.slice(key.length) : match;
  });
  source = source.replaceAll('lang="ar" dir="rtl"', 'lang="en" dir="ltr"')
    .replaceAll('src="/studio.js"', 'src="/en/studio.js"')
    .replaceAll('src="/viewer.js"', 'src="/en/viewer.js"')
    .replaceAll('href="/watch.html"', 'href="/en/watch.html"')
    .replaceAll('href="/"', 'href="/en/index.html"')
    .replaceAll('ar-SA-u-ca-gregory', 'en-GB').replaceAll("'ar-SA'", "'en-GB'")
    .replace(/data-language href="[^"]+" lang="en" hreflang="en">English/g,
      'data-language href="/' + (name === 'watch.html' ? 'watch.html' : 'index.html') + '?lang=ar" lang="ar" hreflang="ar">العربية');
  if (name === 'data.js') {
    source = "import { systemMessage } from './messages.js';\n" + source
      .replace('payload.error ||', 'systemMessage(payload.error) ||')
      .replace('return payload;', "if (action === 'director') payload.reason = systemMessage(payload.reason);\n  return payload;");
  }
  await writeFile(out + name, source);
}
await writeFile(out + 'messages.js',
  'const labels = ' + JSON.stringify(dictionary) + ';\n' +
  `export function systemMessage(text) {
  if (!text || labels[text]) return labels[text] ?? text;
  if (text.startsWith('قيمة غير صحيحة في ')) {
    const field = text.slice('قيمة غير صحيحة في '.length);
    return 'Invalid value for ' + (labels[field] ?? field) + '.';
  }
  if (text.startsWith('تحقق من ') && text.endsWith(' وطوله.')) {
    const field = text.slice('تحقق من '.length, -' وطوله.'.length);
    return 'Check the value and length of ' + (labels[field] ?? field) + '.';
  }
  return text;
}\n`);
