import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const tsPath = path.join(root, 'ts.html');
const cssPath = path.join(root, 'ts.css');
const jsPath = path.join(root, 'ts.js');

function bail(msg) {
  process.stderr.write(String(msg || 'Failed') + '\n');
  process.exitCode = 1;
}

function extractFirstStyle(html) {
  const openIdx = html.indexOf('<style');
  if (openIdx < 0) return null;
  const lineStart = html.lastIndexOf('\n', openIdx) + 1;
  const indent = html.slice(lineStart, openIdx);
  const openEnd = html.indexOf('>', openIdx);
  if (openEnd < 0) return null;
  const closeIdx = html.indexOf('</style>', openEnd + 1);
  if (closeIdx < 0) return null;
  const css = html.slice(openEnd + 1, closeIdx);
  const replaced =
    html.slice(0, openIdx) +
    `${indent}<link rel="stylesheet" href="./ts.css">\n` +
    html.slice(closeIdx + '</style>'.length);
  return { css, html: replaced };
}

function extractMainScript(html) {
  const marker = 'const d = (q, el=document) =>';
  const markerIdx = html.indexOf(marker);
  if (markerIdx < 0) return null;

  const openIdx = html.lastIndexOf('<script', markerIdx);
  if (openIdx < 0) return null;

  const openEnd = html.indexOf('>', openIdx);
  if (openEnd < 0) return null;

  const closeIdx = html.indexOf('</script>', openEnd + 1);
  if (closeIdx < 0) return null;

  const js = html.slice(openEnd + 1, closeIdx);
  const indent = html.slice(html.lastIndexOf('\n', openIdx) + 1, openIdx);
  const replaced =
    html.slice(0, openIdx) +
    `${indent}<script src="./ts.js"></script>\n` +
    html.slice(closeIdx + '</script>'.length);

  return { js, html: replaced };
}

const html = await fs.readFile(tsPath, 'utf8').catch(() => null);
if (!html) {
  bail('Could not read ts.html');
} else if (html.includes('href="./ts.css"') || html.includes('src="./ts.js"')) {
  bail('ts.html already appears to be split (ts.css/ts.js referenced).');
} else {
  const st = extractFirstStyle(html);
  if (!st) {
    bail('Could not find a <style> block to extract.');
  } else {
    const sc = extractMainScript(st.html);
    if (!sc) {
      bail('Could not find the main inline <script> block to extract.');
    } else {
      await fs.writeFile(cssPath, st.css, 'utf8');
      await fs.writeFile(jsPath, sc.js, 'utf8');
      await fs.writeFile(tsPath, sc.html, 'utf8');
      process.stdout.write('Wrote ts.css, ts.js and updated ts.html\n');
    }
  }
}
