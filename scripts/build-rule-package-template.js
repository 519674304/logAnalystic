// 零依赖、跨平台替代 build-rule-package-template.ps1：
// 把 docs/project/templates/rule-package-template 下的 TOML 打包为 stored zip（无压缩），
// 并复制导入说明到 public/templates。不依赖 PowerShell，可在 Windows / macOS / Linux 运行。
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const root = path.resolve(__dirname, '..')
const templateSource = path.join(root, 'docs', 'project', 'templates', 'rule-package-template')
const templateDirectory = path.join(root, 'public', 'templates')
const templateArchive = path.join(templateDirectory, 'rule-package-template.zip')
const guideSource = path.join(root, 'docs', 'project', 'templates', 'rule-package-import-guide.md')
const guideOutput = path.join(templateDirectory, 'rule-package-import-guide.md')

function fail(message) {
  throw new Error(message)
}

if (!fs.existsSync(templateSource) || !fs.statSync(templateSource).isDirectory()) {
  fail(`规则包模板源目录不存在：${templateSource}`)
}
if (!fs.existsSync(guideSource) || !fs.statSync(guideSource).isFile()) {
  fail(`规则包导入说明源文件不存在：${guideSource}`)
}

fs.mkdirSync(templateDirectory, { recursive: true })
fs.copyFileSync(guideSource, guideOutput)

// 收集模板目录下所有文件（不含子目录），统一放到 zip 根目录。
const files = fs
  .readdirSync(templateSource)
  .map((name) => path.join(templateSource, name))
  .filter((full) => fs.statSync(full).isFile())
  .sort()
  .map((full) => ({ name: path.basename(full), data: fs.readFileSync(full) }))

// 手工构建 stored zip（无压缩）：local header + central directory + EOCD。
const localParts = []
const centralParts = []
let offset = 0

for (const file of files) {
  const nameBuffer = Buffer.from(file.name, 'utf8')
  const crc = zlib.crc32(file.data) >>> 0
  const size = file.data.length

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0) // local file header signature
  local.writeUInt16LE(20, 4) // version needed
  local.writeUInt16LE(0, 6) // general purpose flags
  local.writeUInt16LE(0, 8) // compression method: 0 = stored
  local.writeUInt16LE(0, 10) // mod time
  local.writeUInt16LE(0x21, 12) // mod date: 1980-01-01
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(size, 18) // compressed size
  local.writeUInt32LE(size, 22) // uncompressed size
  local.writeUInt16LE(nameBuffer.length, 26)
  local.writeUInt16LE(0, 28) // extra field length
  localParts.push(local, nameBuffer, file.data)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0) // central directory header signature
  central.writeUInt16LE(20, 4) // version made by
  central.writeUInt16LE(20, 6) // version needed
  central.writeUInt16LE(0, 8) // flags
  central.writeUInt16LE(0, 10) // method
  central.writeUInt16LE(0, 12) // mod time
  central.writeUInt16LE(0x21, 14) // mod date
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(size, 20)
  central.writeUInt32LE(size, 24)
  central.writeUInt16LE(nameBuffer.length, 28)
  central.writeUInt16LE(0, 30) // extra field length
  central.writeUInt16LE(0, 32) // file comment length
  central.writeUInt16LE(0, 34) // disk number start
  central.writeUInt16LE(0, 36) // internal attributes
  central.writeUInt32LE(0, 38) // external attributes
  central.writeUInt32LE(offset, 42) // local header offset
  centralParts.push(central, nameBuffer)

  offset += local.length + nameBuffer.length + size
}

const centralBuffer = Buffer.concat(centralParts)
const centralOffset = offset
const centralSize = centralBuffer.length

const eocd = Buffer.alloc(22)
eocd.writeUInt32LE(0x06054b50, 0) // end of central directory signature
eocd.writeUInt16LE(0, 4) // number of this disk
eocd.writeUInt16LE(0, 6) // disk where central directory starts
eocd.writeUInt16LE(files.length, 8) // entries on this disk
eocd.writeUInt16LE(files.length, 10) // total entries
eocd.writeUInt32LE(centralSize, 12)
eocd.writeUInt32LE(centralOffset, 16)
eocd.writeUInt16LE(0, 20) // comment length

const archive = Buffer.concat([...localParts, centralBuffer, eocd])
fs.writeFileSync(templateArchive, archive)

console.log(`已生成 ${templateArchive}（${files.length} 个文件）`)
