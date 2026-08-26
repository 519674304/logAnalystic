// 生成固定格式示例日志，用于规模烟测（默认 5MB）。
// 用法: node scripts/gen-sample-log.js [MB] [输出路径]
//   默认输出 docs/project/smoke/sample-log-<MB>mb.log
//
// 注意：本脚本先把整份内容攒进内存再一次性写出，适合 5MB/30MB 这类小档；
// 500MB/2GB 档需改为流式写入，勿直接复用本脚本。
const fs = require('fs');
const path = require('path');

const MB = Number(process.argv[2]) || 5;
const OUT = process.argv[3] ||
  path.join(__dirname, '..', 'docs', 'project', 'smoke', `sample-log-${MB}mb.log`);

const TARGET = MB * 1024 * 1024;

// 应用前缀 -> 进程/线程 ID，与 smoke/sample-log-small.log 保持一致
const APPS = [
  { prefix: 'A00010', pid: 32033, tag: 'Order' },
  { prefix: 'B00020', pid: 33001, tag: 'BWorker' },
  { prefix: 'C00030', pid: 34001, tag: 'CWorker' },
  { prefix: 'D00040', pid: 35002, tag: 'DWorker' },
];
const PKG = 'com.demo.app';

const LEVELS = ['I', 'I', 'I', 'I', 'W', 'E'];

const MSGS = [
  'request started',
  'start parallel subprocesses',
  'subprocess received, sequence=',
  'preparation completed',
  'subprocess completed',
  'all subprocesses completed',
  'request completed successfully',
  'timeout waiting for subprocess',
  'retry subprocess, attempt=',
  'deserialize payload failed',
  'cache miss, fallback to source',
  'connection established',
  'connection closed',
  'flushing buffer, size=',
  'skip empty message',
  'heartbeat',
];

// 确定性伪随机（LCG），保证每次生成内容一致、可复现
let seed = 42;
function rnd() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function pad(n, w) {
  return String(n).padStart(w, '0');
}

// 起始时间戳 2026-07-05 10:00:00.000，每行推进 1~800ms
let t = Date.parse('2026-07-05T10:00:00Z');
let lineNo = 20675;
let bytes = 0;
let count = 0;

const lines = [];
while (bytes < TARGET) {
  const d = new Date(t);
  const stamp =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ` +
    `${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}.` +
    `${pad(d.getUTCMilliseconds(), 3)}`;

  const app = pick(APPS);
  const level = pick(LEVELS);
  let msg = pick(MSGS);
  if (msg.endsWith('=')) {
    msg += String(Math.floor(rnd() * 1000));
  }

  const line =
    `${lineNo},${stamp} ${app.pid} ${app.pid} ${level} ${app.prefix}/${PKG}/${app.tag}: ${msg}\n`;

  lines.push(line);
  bytes += Buffer.byteLength(line, 'utf8');
  count += 1;
  lineNo += 1;
  t += 1 + Math.floor(rnd() * 800);
}

fs.writeFileSync(OUT, lines.join(''));
console.log(`wrote ${count} lines, ${(bytes / 1024 / 1024).toFixed(2)} MB -> ${OUT}`);
