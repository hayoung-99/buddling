/**
 * 캐릭터 크기 조절 패널.
 *
 * 슬라이더를 움직이는 동안 바탕화면의 캐릭터가 곧바로 커지고 작아진다.
 * 창 자체는 발밑을 기준으로 커지므로 캐릭터는 제자리에 선 채 자란다.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_PERCENT = 100

/**
 * 슬라이더는 브라우저가 만드는 조각(트랙·손잡이)으로 이뤄져 있어서, 그 안쪽은
 * 가상 요소로만 닿는다. Tailwind 의 임의 변형(`[&::-webkit-…]`)이 그 자리를 맡는다.
 */
const RANGE = [
  'flex-1 min-w-0 h-[22px] appearance-none bg-transparent cursor-pointer',
  '[&::-webkit-slider-runnable-track]:h-[5px]',
  '[&::-webkit-slider-runnable-track]:rounded-[3px]',
  '[&::-webkit-slider-runnable-track]:bg-[rgba(74,63,51,0.16)]',
  '[&::-webkit-slider-thumb]:appearance-none',
  '[&::-webkit-slider-thumb]:w-[17px]',
  '[&::-webkit-slider-thumb]:h-[17px]',
  '[&::-webkit-slider-thumb]:-mt-[6px]',
  '[&::-webkit-slider-thumb]:rounded-full',
  '[&::-webkit-slider-thumb]:bg-ink',
  '[&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(74,63,51,0.4)]',
  '[&:active::-webkit-slider-thumb]:bg-accent',
].join(' ')

export function Size() {
  const [percent, setPercent] = useState(DEFAULT_PERCENT)
  const [caption, setCaption] = useState('')
  const [resetHint, setResetHint] = useState('')
  const rangeRef = useRef<HTMLInputElement>(null)

  /**
   * @param live 슬라이더를 아직 끄는 중인가.
   *   끄는 동안에는 창 크기만 바뀌고, 손을 뗐을 때 저장한 값이 다른 창들에 알려진다.
   */
  const apply = useCallback((next: number, live = false) => {
    setPercent(next)
    window.sizeApi.setScale(next / 100, live)
  }, [])

  /** 패널은 닫혔다 다시 열려도 같은 창을 재사용하므로, 열릴 때마다 값을 새로 읽는다 */
  const refresh = useCallback(async () => {
    const info = await window.sizeApi.getScale()
    setPercent(Math.round((info?.scale ?? 1) * 100))
    // 팀이 여러 개면 지금 어느 캐릭터를 조절하는 중인지 알려줘야 한다
    setCaption(info?.teamName || info?.caption || '')
    setResetHint(info?.resetHint ?? '')
  }, [])

  useEffect(() => {
    void refresh()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.sizeApi.close()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('keydown', onKeyDown)

    // 손을 뗐을 때 한 번만 알리는 일은 브라우저의 `change` 가 정확히 맡아 준다.
    // React 의 onChange 는 `input` 이라 끄는 내내 불리므로 여기만 직접 건다.
    const range = rangeRef.current
    const onCommit = () => apply(Number(range?.value ?? DEFAULT_PERCENT))
    range?.addEventListener('change', onCommit)

    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('keydown', onKeyDown)
      range?.removeEventListener('change', onCommit)
    }
  }, [apply, refresh])

  return (
    <div
      className="absolute inset-[6px] flex items-center gap-[9px] px-[12px] rounded-[22px]
        bg-card shadow-[0_6px_20px_rgba(74,63,51,0.26)]"
    >
      <span
        className="text-[11px] font-bold tracking-[0.02em] text-ink-soft flex-none max-w-[74px]
          overflow-hidden text-ellipsis whitespace-nowrap"
      >
        {caption}
      </span>
      <input
        ref={rangeRef}
        type="range"
        className={RANGE}
        min={25}
        max={200}
        step={5}
        value={percent}
        onChange={(event) => apply(Number(event.target.value), true)}
      />
      <span className="text-[12px] font-bold tabular-nums w-[38px] text-right flex-none">
        {percent}%
      </span>
      <button
        className="flex-none text-[13px] leading-none w-[24px] h-[24px] rounded-full
          bg-[rgba(74,63,51,0.09)] text-ink cursor-pointer hover:bg-[rgba(74,63,51,0.17)]"
        title={resetHint}
        onClick={() => apply(DEFAULT_PERCENT)}
      >
        ↺
      </button>
    </div>
  )
}
