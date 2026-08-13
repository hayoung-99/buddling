/**
 * JSON 한 덩어리를 파일에 안전하게 적는다.
 *
 * 두 가지를 지킨다.
 *
 * **쓰다 죽어도 기존 파일이 깨지지 않는다.** 임시 파일에 다 쓴 뒤 이름을 바꾼다.
 * 같은 파일 시스템 안에서의 이름 바꾸기는 쪼개지지 않으므로, 어느 순간에 전원이
 * 나가도 파일은 옛 내용이거나 새 내용이지 그 중간이 아니다.
 *
 * **실패해도 던지지 않는다.** 이 앱은 컴퓨터를 켠 순간부터 끌 때까지 떠 있고,
 * 저장은 예약된 타이머 안에서 일어난다. 거기서 예외가 새어 나가면 아무도 잡지
 * 않아 메인 프로세스가 통째로 죽는다. 자리·크기를 한 번 못 적는 것보다
 * 캐릭터가 화면에서 사라지는 편이 훨씬 나쁘다.
 *
 * 폴더가 사라진 경우까지 되살려 본다. 외장 디스크를 뽑았거나, 정리 스크립트가
 * 지웠거나, 개발 중에 프로필 폴더를 통째로 날린 경우다.
 */

const fs = require('node:fs')
const path = require('node:path')

/**
 * @param {string} filePath
 * @param {unknown} value
 * @returns {{ ok: true } | { ok: false, error: Error }}
 */
function writeJsonAtomically(filePath, value) {
  const temporary = `${filePath}.tmp`
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
    fs.renameSync(temporary, filePath)
    return { ok: true }
  } catch (error) {
    // 임시 파일이 남았으면 치운다. 다음 시도가 이것 때문에 막히지는 않지만,
    // 사용자 폴더에 쓰레기를 남기지 않는다.
    try {
      fs.rmSync(temporary, { force: true })
    } catch {
      // 이것마저 안 되면 더 할 수 있는 일이 없다
    }
    return { ok: false, error }
  }
}

module.exports = { writeJsonAtomically }
