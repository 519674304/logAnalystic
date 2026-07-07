const fs = require('fs')
const path = require('path')
const toml = require('toml')

const repoRoot = path.resolve(__dirname, '..')
const baselines = [
  path.join(repoRoot, 'docs', 'project', 'baselines', 'business-rules.example.toml')
]

let ok = true
baselines.forEach(f => {
  if (!fs.existsSync(f)) {
    console.error('MISSING:', f)
    ok = false
    return
  }
  try {
    const txt = fs.readFileSync(f, 'utf8')
    toml.parse(txt)
    console.log('OK:', f)
  } catch (e) {
    console.error('PARSE ERROR', f, e.message)
    ok = false
  }
})

if (!ok) process.exit(2)
console.log('All baseline checks passed')
