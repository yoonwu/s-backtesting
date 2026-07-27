#!/usr/bin/env node
/*
 * 키워드 전수 스캔.
 *
 * 씨앗 키워드에서 시작해 연관 키워드를 BFS 로 넓혀가며
 * 월 검색량 / 경쟁도 / 광고경쟁깊이를 모아 data.js 로 떨군다.
 *
 *   node scan.js --seed "에코백,파우치,크로스백" --depth 2
 *   node scan.js --seed-file seeds.txt --depth 3 --max 3000
 *
 * 키는 config.json 에서 읽는다 (config.example.json 참고).
 * 중간에 끊겨도 cache.json 에 남아 있어 다시 돌리면 이어서 간다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { keywordTool } = require('./naver-api');

const DIR = __dirname;
const CACHE_FILE = path.join(DIR, 'cache.json');
const OUT_FILE = path.join(DIR, 'data.js');

function parseArgs(argv) {
  const out = { depth: 2, max: 2000, delay: 350 };
  for (let i = 2; i < argv.length; i += 2) {
    const key = String(argv[i]).replace(/^--/, '');
    const val = argv[i + 1];
    if (key === 'seed') out.seed = val.split(',').map(s => s.trim()).filter(Boolean);
    else if (key === 'seed-file') out.seedFile = val;
    else if (key === 'depth') out.depth = Number(val);
    else if (key === 'max') out.max = Number(val);
    else if (key === 'delay') out.delay = Number(val);
    else if (key === 'fresh') { out.fresh = true; i -= 1; }
  }
  return out;
}

function loadConfig() {
  const p = path.join(DIR, 'config.json');
  if (!fs.existsSync(p)) {
    console.error('config.json 이 없습니다. config.example.json 을 복사해서 키를 채우세요.');
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  const missing = ['customerId', 'apiKey', 'secretKey'].filter(k => !cfg[k] || /여기에/.test(String(cfg[k])));
  if (missing.length) {
    console.error('config.json 에 다음 값이 비어 있습니다: ' + missing.join(', '));
    process.exit(1);
  }
  return cfg;
}

function loadCache(fresh) {
  if (fresh || !fs.existsSync(CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) { return {}; }
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  let seeds = args.seed || [];
  if (args.seedFile) {
    seeds = seeds.concat(
      fs.readFileSync(path.join(DIR, args.seedFile), 'utf8')
        .split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'))
    );
  }
  if (!seeds.length) {
    console.error('씨앗 키워드가 없습니다. --seed "에코백,파우치" 또는 --seed-file seeds.txt');
    process.exit(1);
  }

  const cfg = loadConfig();
  const cache = loadCache(args.fresh);          // 조회 완료한 힌트 묶음 -> 결과
  const found = new Map();                      // keyword -> row
  const queried = new Set(Object.keys(cache));

  // 캐시에 있는 것부터 채워 넣는다
  Object.keys(cache).forEach(function (k) {
    cache[k].forEach(function (row) { found.set(row.keyword, row); });
  });

  let frontier = seeds.map(s => s.replace(/\s+/g, ''));
  let calls = 0;

  for (let depth = 0; depth <= args.depth; depth++) {
    const todo = frontier.filter(k => !queried.has(k));
    if (!todo.length) break;

    console.log(`\n[깊이 ${depth}] 조회 대상 ${todo.length}개 (누적 수집 ${found.size}개)`);
    const nextSet = new Set();

    for (const group of chunk(todo, 5)) {
      let rows;
      try {
        rows = await keywordTool(cfg, group);
        calls += 1;
      } catch (e) {
        console.error('  실패: ' + group.join(',') + '\n  ' + e.message);
        // 호출 제한이면 잠시 쉬고 계속
        if (/429|제한/.test(e.message)) { await sleep(3000); }
        continue;
      }

      group.forEach(function (k) { queried.add(k); });
      cache[group.join(',')] = rows;
      group.forEach(function (k, i) { if (i === 0) cache[k] = rows; });

      rows.forEach(function (row) {
        if (!found.has(row.keyword)) found.set(row.keyword, row);
        nextSet.add(row.keyword);
      });

      process.stdout.write(`\r  호출 ${calls}회 / 수집 ${found.size}개`);
      if (found.size >= args.max) break;
      await sleep(args.delay);
    }

    saveCache(cache);
    if (found.size >= args.max) {
      console.log(`\n최대 수집 개수(${args.max})에 도달해 중단합니다.`);
      break;
    }

    // 다음 깊이는 검색량 상위 위주로만 확장한다 (전부 확장하면 호출이 폭발한다)
    frontier = Array.from(nextSet)
      .map(k => found.get(k))
      .filter(Boolean)
      .sort((a, b) => b.total - a.total)
      .slice(0, 60)
      .map(r => r.keyword.replace(/\s+/g, ''));
  }

  const rows = Array.from(found.values()).sort((a, b) => b.opportunity - a.opportunity);
  const payload = {
    generatedAt: new Date().toISOString(),
    seeds: seeds,
    depth: args.depth,
    apiCalls: calls,
    rows: rows
  };

  // index.html 을 file:// 로 열어도 되도록 JS 파일로 떨군다 (fetch 는 CORS 에 막힌다)
  fs.writeFileSync(OUT_FILE, 'window.KEYWORD_DATA = ' + JSON.stringify(payload) + ';\n', 'utf8');
  fs.writeFileSync(path.join(DIR, 'data.json'), JSON.stringify(payload, null, 1), 'utf8');

  console.log(`\n\n완료: 키워드 ${rows.length}개, API 호출 ${calls}회`);
  console.log('  -> ' + OUT_FILE);
  console.log('  index.html 을 브라우저로 열면 표로 볼 수 있습니다.');
}

if (require.main === module) {
  main().catch(function (e) { console.error(e); process.exit(1); });
}
