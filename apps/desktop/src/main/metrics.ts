/**
 * 개발용 자원 사용량 기록기.
 *
 * 이 앱은 며칠씩 켜져 있으므로 "지금 얼마나 쓰는가"보다 "시간이 지나도 그대로인가"가
 * 중요하다. 그래서 한 줄씩 이어 찍어 두고 나중에 앞뒤를 견준다. 메모리가 우상향하면
 * 새는 것이고, CPU 가 가만히 있을 때도 높으면 절전이 안 듣는 것이다.
 *
 *   BUDDLING_METRICS=1    30초마다
 *   BUDDLING_METRICS=5    5초마다 (절전 단계를 바꿔가며 견줄 때)
 */

import { BrowserWindow } from 'electron'

const DEFAULT_SECONDS = 30

function startMetrics(electronApp: Electron.App) {
  const seconds = Number(process.env.BUDDLING_METRICS) || DEFAULT_SECONDS
  const startedAt = Date.now()

  const timer = setInterval(() => {
    const rows = electronApp.getAppMetrics()
    const cpu = rows.reduce((sum, row) => sum + (row.cpu?.percentCPUUsage ?? 0), 0)
    // workingSetSize 는 KB 단위다
    const megabytes = rows.reduce((sum, row) => sum + (row.memory?.workingSetSize ?? 0), 0) / 1024
    const minutes = Math.round((Date.now() - startedAt) / 60000)
    // 보이는 창만 센다 — 숨긴 창은 그리지 않으므로 CPU 를 읽을 때 헷갈리면 안 된다
    const shown = BrowserWindow.getAllWindows().filter((window) => window.isVisible()).length

    console.log(
      `[metrics] ${minutes}분 · cpu ${cpu.toFixed(1)}% · mem ${megabytes.toFixed(0)}MB` +
        ` · 보이는 창 ${shown}`,
    )
  }, seconds * 1000)

  // 이 타이머 때문에 앱이 종료되지 못하는 일이 없게 한다
  timer.unref?.()
  return { stop: () => clearInterval(timer) }
}

export { startMetrics }
