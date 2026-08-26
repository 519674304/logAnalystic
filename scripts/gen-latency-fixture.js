// 生成冒烟时延分析用的顺序 fixture 日志。
// 每个请求严格按 5 阶段顺序输出（prepare→dispatch→subprocess→join→finalize），
// start/end 在日志里按时间顺序相邻出现，供顺序配对计算真实时延。
//
// 输出：docs/project/smoke/fixture/sample-latency.log
const fs = require('fs')
const path = require('path')

const lineNoStart = 20675

const APPS = {
  order: 'A00010/com.demo.app/Order',
  workerB: 'B00020/com.demo.app/BWorker',
  workerD: 'D00040/com.demo.app/DWorker',
}
const PIDS = { order: 32033, workerB: 33001, workerD: 35002 }

// 每个请求各阶段的 ms 间隔（prepare / rpc调度 / 子进程处理 / 汇总 / 收尾）
const requests = [
  { prep: 40, rpc: 10, sub: 30, join: 5, fin: 10 }, // 95ms  正常
  { prep: 55, rpc: 25, sub: 80, join: 12, fin: 20 }, // 192ms 正常
  { prep: 50, rpc: 120, sub: 60, join: 15, fin: 25 }, // 270ms 调度偏慢
  { prep: 45, rpc: 30, sub: 250, join: 20, fin: 30 }, // 375ms 子进程最慢
  { prep: 60, rpc: 40, sub: 90, join: 18, fin: 22 }, // 230ms 正常
]

function formatTs(baseSec, ms) {
  const sec = String(baseSec % 60).padStart(2, '0')
  const milli = String(ms % 1000).padStart(3, '0')
  return `2026-07-05 10:00:${sec}.${milli}`
}

let lineNo = lineNoStart
const lines = []

requests.forEach((profile, index) => {
  const t = (ms) => formatTs(index, ms)
  const line = (ms, pid, app, message) => {
    lines.push(`${lineNo},${t(ms)} ${pid} ${pid} I ${app}: ${message}`)
    lineNo += 1
  }

  const recv = profile.prep + profile.rpc
  const prepDone = recv + Math.floor(profile.sub * 0.3)
  const subEnd = recv + profile.sub
  const joinEnd = subEnd + profile.join
  const finEnd = joinEnd + profile.fin

  line(0, PIDS.order, APPS.order, 'request started')
  line(profile.prep, PIDS.order, APPS.order, 'start parallel subprocesses')
  line(recv, PIDS.workerB, APPS.workerB, 'subprocess received, sequence=0')
  line(prepDone, PIDS.workerB, APPS.workerB, 'preparation completed')
  line(subEnd, PIDS.workerB, APPS.workerB, 'subprocess completed')
  line(joinEnd, PIDS.order, APPS.order, 'all subprocesses completed')
  line(finEnd, PIDS.workerD, APPS.workerD, 'request completed successfully')
})

const outDir = path.join(__dirname, '..', 'docs', 'project', 'smoke', 'fixture')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'sample-latency.log')
fs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8')
console.log(`wrote ${lines.length} lines -> ${outFile}`)
