/**
 * 캐릭터 창의 껍데기.
 *
 * React 가 여기서 하는 일은 캔버스와 오버레이 두 칸을 화면에 얹는 것뿐이고, 그 뒤로는
 * 다시 그리지 않는다. 캐릭터를 움직이는 일은 `startPet()` 이 명령형으로 맡는다.
 *
 * 이유는 `pet.ts` 맨 위에 적어 두었다 — 렌더 루프가 초당 최대 60번 도는 자리라,
 * 프레임마다 React 상태를 건드리면 절전으로 아껴 둔 것을 그대로 반납하게 된다.
 */

import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { startPet } from './pet'

function Pet() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const nameplateRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const bubble = bubbleRef.current
    const nameplate = nameplateRef.current
    if (!canvas || !bubble || !nameplate) return

    return startPet({ canvas, bubble, nameplate })
  }, [])

  return (
    <>
      <canvas id="stage" ref={canvasRef} />
      <div id="nameplate" ref={nameplateRef} />
      <div id="bubble" ref={bubbleRef} />
    </>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<Pet />)
