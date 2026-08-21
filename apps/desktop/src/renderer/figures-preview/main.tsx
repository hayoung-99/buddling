/**
 * 피규어 미리보기의 껍데기. 앱 동작과는 무관하고 배포본에 들어가지 않는다.
 *
 * React 가 맡는 것은 단추와 "지금 고른 동작" 까지다. 캔버스는 `startFigureStage` 가
 * 명령형으로 굴린다 — 기존 미리보기와 같은 이유다(초당 60번 도는 값을 React 에 올릴
 * 까닭이 없다).
 */

import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { startFigureStage } from './stage'
import type { FigureStage } from './stage'
import type { FigureMotion } from '../figures/motions'
import '../theme.css'

const MOTIONS: { name: FigureMotion; label: string }[] = [
  { name: 'hop', label: '폴짝' },
  { name: 'wave', label: '손 흔들기' },
  { name: 'dance', label: '춤' },
]

const button = 'font-ui text-[13px] px-4 py-[7px] rounded-full border-0 cursor-pointer'
const solid = `${button} bg-ink text-cream`
const ghost = `${button} bg-line text-ink`

function FiguresPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<FigureStage | null>(null)
  // 캔버스에서 캐릭터를 눌렀을 때 시킬 동작. 클릭 처리기가 닫힌 값을 보지 않도록 ref 로도 든다
  const [motion, setMotion] = useState<FigureMotion>('wave')
  const motionRef = useRef<FigureMotion>('wave')
  const [spinning, setSpinning] = useState(false)
  const [side, setSide] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const labels = labelsRef.current
    if (!canvas || !labels) return
    const stage = startFigureStage({
      canvas,
      labels,
      onPick: (index) => stage.playOne(index, motionRef.current),
    })
    stageRef.current = stage
    return () => {
      stageRef.current = null
      stage.dispose()
    }
  }, [])

  function playAll(name: FigureMotion) {
    setMotion(name)
    motionRef.current = name
    stageRef.current?.play(name)
  }

  function toggleSide() {
    const next = !side
    setSide(next)
    setSpinning(false)
    stageRef.current?.setYaw(next ? -Math.PI / 2 : -0.2)
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-cream text-ink font-ui overflow-hidden">
      <nav className="flex items-center gap-1.5 justify-center pt-3.5 pb-1">
        {MOTIONS.map((item) => (
          <button
            key={item.name}
            className={item.name === motion ? solid : ghost}
            onClick={() => playAll(item.name)}
          >
            {item.label}
          </button>
        ))}
        <span className="w-3" />
        <button className={side ? solid : ghost} onClick={toggleSide}>
          옆모습
        </button>
        <button
          className={spinning ? solid : ghost}
          onClick={() => {
            const next = stageRef.current?.toggleSpin() ?? false
            setSpinning(next)
          }}
        >
          회전 보기
        </button>
      </nav>
      <p className="text-center text-[11px] text-ink-soft">
        단추를 누르면 다섯이 차례로 움직이고, 캐릭터를 직접 누르면 그 한 마리만 고른 동작을
        합니다.
      </p>

      {/*
        캔버스는 자리를 잡아 주는 상자 안에 절대배치한다. flex 항목의 기본 `min-height: auto`
        는 캔버스가 자기 속성 높이 아래로 줄어드는 것을 막는데, `renderer.setSize()` 가 그
        속성을 키우고 나면 캔버스가 부풀어 아래 이름표를 창 밖으로 밀어낸다.
      */}
      <div className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block cursor-pointer" />
      </div>
      <div
        ref={labelsRef}
        className="flex shrink-0 pb-[22px] [&_div]:flex-1 [&_div]:text-center [&_.name]:text-[15px] [&_.name]:font-bold [&_.name]:tracking-[0.06em] [&_.cry]:text-[12px] [&_.cry]:text-ink-soft [&_.cry]:mt-[3px]"
      />
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<FiguresPreview />)
