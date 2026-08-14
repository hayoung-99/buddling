/**
 * 캐릭터 창의 껍데기.
 *
 * React 가 여기서 하는 일은 캔버스와 오버레이 두 칸을 화면에 얹는 것뿐이고, 그 뒤로는
 * 다시 그리지 않는다. 캐릭터를 움직이는 일은 `startPet()` 이 명령형으로 맡는다.
 *
 * 이유는 `pet.ts` 맨 위에 적어 두었다 — 렌더 루프가 초당 최대 60번 도는 자리라,
 * 프레임마다 React 상태를 건드리면 절전으로 아껴 둔 것을 그대로 반납하게 된다.
 *
 * 말풍선과 이름표의 **모양**은 여기 클래스에 있고, **언제 보일지**는 `bubble.ts` 와
 * `nameplate.ts` 가 `data-visible` 과 `animate-chip` 을 붙였다 떼며 정한다. 렌더 루프
 * 밖에서 컴포지터가 돌리는 것들이라 React 를 거칠 이유가 없다.
 */

import { useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { startPet } from './pet'
import '../theme.css'

/** 머리 위 말풍선. 크기 배율(`--bubble-scale`)은 창 크기에 맞춰 JS 가 넣는다. */
const BUBBLE = [
  'absolute origin-bottom -translate-x-1/2 -translate-y-full',
  'scale-[calc(var(--bubble-scale,1)*0.8)]',
  'px-[13px] py-[7px] rounded-card bg-card text-ink font-ui text-[13px] font-bold',
  // Tailwind 는 html 에 line-height 1.5 를 건다. 말풍선과 이름표는 그 전부터 브라우저
  // 기본값(normal)로 재어져 있어서, 그대로 두면 글자 칸이 한 줄만큼 두꺼워진다.
  'leading-[normal]',
  'tracking-[0.02em] whitespace-nowrap shadow-[0_4px_14px_rgba(74,63,51,0.22)]',
  'opacity-0 pointer-events-none',
  '[transition:opacity_140ms_ease,transform_220ms_cubic-bezier(0.2,1.4,0.5,1)]',
  'data-[visible=true]:opacity-100 data-[visible=true]:scale-[var(--bubble-scale,1)]',
  // 말풍선 아래 꼬리
  "after:content-[''] after:absolute after:left-1/2 after:-bottom-[5px]",
  'after:w-[11px] after:h-[11px] after:-ml-[5.5px] after:bg-card after:rotate-45',
  'after:rounded-[2px]',
].join(' ')

/** 발밑 이름표. 여러 장이 나란히 붙는다. */
const NAMEPLATE =
  'absolute flex gap-[5px] origin-top -translate-x-1/2 scale-[var(--nscale,1)] pointer-events-none'

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
      <canvas id="stage" ref={canvasRef} className="w-full h-full block" />
      <div id="nameplate" ref={nameplateRef} className={NAMEPLATE} />
      <div id="bubble" ref={bubbleRef} className={BUBBLE} data-visible="false" />
    </>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<Pet />)
