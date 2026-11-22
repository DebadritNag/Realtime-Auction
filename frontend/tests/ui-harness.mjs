/** Shared helpers for the offline browser tests: esbuild bundle of a React entry + headless Chrome. No network, accounts or production data. */
import { build } from '../../backend/node_modules/esbuild/lib/main.js';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';

export const root = fileURLToPath(new URL('../', import.meta.url));

const shims = {
  name: 'next-shims',
  setup(b) {
    const shim = (filter, contents) => {
      const ns = 'shim-' + filter.source.replace(/\W/g, '');
      b.onResolve({ filter }, () => ({ path: ns, namespace: ns }));
      b.onLoad({ filter: /.*/, namespace: ns }, () => ({ contents, resolveDir: root, loader: 'js' }));
    };
    shim(/^next\/link$/, 'import React from "react";export default ({href,children,prefetch,...props})=>React.createElement("a",{href,...props},children);');
    shim(/^next\/navigation$/, 'export const useRouter=()=>({push(){},replace(){},back(){}});export const usePathname=()=>"/";export const useSearchParams=()=>new URLSearchParams(globalThis.location?globalThis.location.search:"");');
  },
};

/** Bundles a TSX entry (importing from ./src and ./tests) and returns its script and stylesheet text. */
export async function bundleEntry(contents) {
  const out = await build({
    stdin: { contents, resolveDir: root, loader: 'tsx' },
    bundle: true, write: false, outfile: 'bundle.js', platform: 'browser', jsx: 'automatic',
    alias: { '@': root + 'src' }, define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' }, plugins: [shims],
    loader: { '.css': 'css' },
  });
  const js = out.outputFiles.find((f) => f.path.endsWith('.js')).text;
  const ownCss = out.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '';
  const dirs = ['.next/static/css', '.next/static/chunks'].map((d) => root + d).filter((d) => existsSync(d));
  if (!dirs.length) throw new Error('Run `npx next build` first: the tests use the compiled Tailwind stylesheet from .next/static.');
  const builtCss = dirs.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => readFileSync(dir + '/' + f, 'utf8'))).join('\n');
  return { js, css: builtCss + '\n' + ownCss };
}

export async function openPage(bundle, { origin = 'http://ui.test', viewport = { width: 1280, height: 900 }, reducedMotion } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport, ...(reducedMotion ? { reducedMotion } : {}) });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(e.message); console.error(e.message); });
  await page.route(origin + '/', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + bundle.css + '</style><body style="margin:0;background:#08090d;color:#f8fafc"><div id="root"></div><script src="/test.js"></script></body>' }));
  await page.route(origin + '/test.js', (r) => r.fulfill({ contentType: 'application/javascript', body: bundle.js }));
  await page.route(origin + '/images/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>' }));
  await page.goto(origin + '/');
  return { browser, context, page, errors };
}

export const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

export function resultsDir() {
  const dir = root + 'test-results/';
  mkdirSync(dir, { recursive: true });
  return dir;
}
