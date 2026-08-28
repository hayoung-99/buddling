// electron 패키지는 처음 require 될 때 바이너리를 내려받아 압축을 푼다. start:both 는
// electron 프로세스를 두 개 동시에 띄우므로, 아직 안 받아져 있으면 두 프로세스가 같은
// 압축 풀기를 동시에 시도해 "File exists" 오류로 깨진다. 그러면 다음 실행에서도 반쯤
// 풀린 dist/ 가 남아 있어 같은 오류가 계속 난다. 그래서 electron 을 띄우는 모든 명령보다
// 앞서 이 스크립트를 한 프로세스로 먼저 돌려, 필요하면 내려받고 확인까지 마친다.
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const electronDir = path.join(__dirname, '..', '..', '..', 'node_modules', 'electron')

function checkInstalled() {
  const result = spawnSync(process.execPath, ['-e', "require('electron')"], {
    cwd: electronDir,
    stdio: 'inherit'
  })
  return result.status === 0
}

if (checkInstalled()) {
  process.exit(0)
}

// 반쯤 풀린 바이너리가 남아 있으면 새로 받아도 같은 자리에서 또 걸린다. 압축을 다시
// 풀 수 있도록 그 결과물만 지우고(패키지 자체나 lockfile 은 건드리지 않는다) 한 번 더 받는다.
console.log('electron 바이너리가 깨져 있어 다시 받습니다...')
fs.rmSync(path.join(electronDir, 'dist'), { recursive: true, force: true })
fs.rmSync(path.join(electronDir, 'path.txt'), { force: true })

if (!checkInstalled()) {
  console.error('electron 바이너리를 다시 받는 데도 실패했습니다. node_modules/electron 을 지우고 npm ci 를 다시 돌려 보세요.')
  process.exit(1)
}
