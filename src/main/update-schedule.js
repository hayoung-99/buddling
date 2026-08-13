/**
 * 새 버전을 언제 확인할지 정한다.
 *
 * 규칙은 하나다 — **아침에 하루 한 번.**
 *
 * 왜 "몇 시간마다"가 아닌가:
 *   이 앱은 컴퓨터를 켠 순간부터 끌 때까지 떠 있다. 일정 간격으로 확인하면
 *   일하는 도중에 "새 버전을 받았어요" 줄이 불쑥 뜬다. 하던 일을 끊는다.
 *   하루를 시작할 때 한 번 알려주면 그때 처리하고 넘어갈 수 있다.
 *
 * 왜 긴 타이머 하나가 아닌가:
 *   노트북은 뚜껑을 닫으면 잠든다. "20시간 뒤에 깨워줘"는 그 사이 잠든 시간만큼
 *   밀리거나 아예 어긋난다. 그래서 짧게 자주 깨어나 "지금이 그때인가"만 본다.
 *   하는 일은 날짜 비교 한 번이라 사실상 공짜다.
 *
 * 컴퓨터를 하루 종일 꺼 뒀다가 밤에 켜면 그때 확인한다. 아침을 놓쳤다고
 * 건너뛰면 영영 확인하지 않는 사람이 생긴다. "아침 전에는 보지 않는다"가
 * 정확한 규칙이다.
 */

/** 이 시각(로컬)이 지나야 확인한다 */
const CHECK_HOUR = 9

/** 얼마나 자주 깨어나 "지금인가"를 볼지 */
const TICK_MS = 30 * 60 * 1000

/** 로컬 시각 기준 'YYYY-MM-DD'. 날짜가 바뀌었는지만 보면 되므로 이 정도면 충분하다. */
function dayKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 지금 확인해야 하는가.
 *
 * @param {Date} now
 * @param {string|null} lastCheckedDay 마지막으로 확인한 날 ('YYYY-MM-DD')
 */
function isDue(now, lastCheckedDay) {
  if (now.getHours() < CHECK_HOUR) return false
  return dayKey(now) !== lastCheckedDay
}

/**
 * 아침이 되면 한 번 불러준다.
 *
 * 마지막으로 확인한 날은 밖에서 읽고 쓴다 — 앱을 껐다 켜도 하루 한 번을
 * 지키려면 어딘가 남아 있어야 하는데, 그 어딘가를 이 파일이 알 필요는 없다.
 *
 * @param {{
 *   onDue: () => void,
 *   readLastDay: () => string|null,
 *   writeLastDay: (day: string) => void,
 *   now?: () => Date,
 *   tickMs?: number,
 * }} options
 * @returns {{ stop: () => void, tick: () => void }}
 */
function startMorningSchedule({
  onDue,
  readLastDay,
  writeLastDay,
  now = () => new Date(),
  tickMs = TICK_MS,
}) {
  let stopped = false

  const tick = () => {
    if (stopped) return
    const at = now()
    if (!isDue(at, readLastDay())) return

    // 부르기 전에 적어 둔다. 확인이 실패하더라도 오늘은 더 조르지 않는다.
    writeLastDay(dayKey(at))
    onDue()
  }

  // 켜자마자 한 번 본다. 어제 켜 두고 밤을 넘긴 컴퓨터라면 이미 아침이다.
  tick()

  const timer = setInterval(tick, tickMs)
  // 이 타이머 때문에 앱이 종료되지 못하는 일이 없게 한다
  timer.unref?.()

  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
    tick,
  }
}

module.exports = { CHECK_HOUR, dayKey, isDue, startMorningSchedule }
