/**
 * 개발용 미리보기의 껍데기. 앱 동작과는 무관하다 — 배포본에 들어가지 않는다.
 *
 * 두 모드가 있다.
 *   나란히 보기 — 5종을 한 줄로 세워 비율·색을 본다 (캡처 스크립트가 쓴다)
 *   편집        — 한 마리를 크게 놓고 키프레임을 슬라이더로 다듬는다
 *
 * React 가 맡는 것은 패널의 폼 상태까지다. 캔버스는 `startGallery`·`startEditorStage`
 * 가 명령형으로 굴리고, **재생 중의 시각은 React 를 거치지 않고 DOM 을 직접 만진다** —
 * 초당 60번 도는 값이라 그때마다 재조정을 돌릴 이유가 없다.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CHARACTERS } from '@buddling/shared/characters'
import {
  DANCE_CYCLES,
  HOP_COUNT,
  TRACK_FIELDS,
  buildDanceTimeline,
  buildHopTimeline,
  trackDuration,
} from '../pet/animations'
import type { TrackName } from '../pet/animations'
import type { EasingName, Keyframe } from '../pet/tween'
import { PET_BASE_SIZE } from '../../main/pet-size'
import { startGallery } from './gallery'
import { startEditorStage, initialTrack } from './editor-stage'
import type { EditorStage } from './editor-stage'
import {
  EASING_NAMES,
  insertKeyAt,
  neutralWarnings,
  removeKey,
  round4,
  serializeTrack,
  timeBounds,
} from './keyframes'
import '../theme.css'

const TRACKS: { name: TrackName; label: string; constant: string }[] = [
  { name: 'hop', label: '폴짝', constant: 'HOP_UNIT' },
  { name: 'dance', label: '춤', constant: 'DANCE_UNIT' },
  { name: 'twitch', label: '움찔', constant: 'TWITCH_UNIT' },
  { name: 'wave', label: '손 흔들기', constant: 'WAVE_UNIT' },
  { name: 'shy', label: '수줍음', constant: 'SHY_UNIT' },
  { name: 'sulk', label: '앙탈', constant: 'SULK_UNIT' },
  { name: 'doze', label: '잠들기', constant: 'DOZE_UNIT' },
  { name: 'wake', label: '깨어나기', constant: 'WAKE_UNIT' },
]

/**
 * 양끝이 중립이 아닌 것이 **정상**인 트랙.
 *
 * 잠들기는 웅크린 자세에서 멈추고 깨어나기는 그 자세에서 시작한다. 자는 것은 한 번
 * 하고 마는 동작이 아니라 상태라서 그렇다. 아래 경고는 유닛을 이어 붙이는 폴짝·춤의
 * 이음매를 지키라고 있는 것이므로, 이 둘에는 띄우지 않는다.
 */
const HOLDS_POSE = new Set<TrackName>(['doze', 'wake'])

/**
 * 필드마다 슬라이더가 훑는 범위 [최소, 최대, 눈금].
 *
 * 지금 소스에 적힌 값보다 넉넉하게 잡았다 — 다듬는 일은 대개 지금보다 조금 더 밀거나
 * 당겨 보는 것이라, 딱 맞게 잡으면 끝에서 막힌다. 그래도 모자라면 옆의 숫자 칸에
 * 직접 적을 수 있다.
 */
const RANGE: Record<string, [number, number, number]> = {
  x: [-1.5, 1.5, 0.01],
  y: [-0.5, 1.5, 0.01],
  tilt: [-0.6, 0.6, 0.005],
  arm: [-1.5, 1.5, 0.01],
  spread: [-1.5, 1.5, 0.01],
  step: [-1, 1, 0.01],
  sx: [0.5, 1.5, 0.01],
  sy: [0.5, 1.5, 0.01],
  armOne: [-0.5, 3.5, 0.01],
  shoulder: [-0.5, 1.5, 0.01],
  // 잠들기·깨어나기. duck 과 ears 는 기지개에서 음수가 된다 (고개를 젖히고 귀를 세운다)
  curl: [0, 1.2, 0.01],
  duck: [-0.6, 1.2, 0.01],
  ears: [-0.6, 1.2, 0.01],
  shut: [0, 1, 0.01],
  reach: [0, 1.2, 0.01],
}
const rangeOf = (field: string) => RANGE[field] ?? [-2, 2, 0.01]

const button = 'font-ui text-[13px] px-4 py-[7px] rounded-full border-0 cursor-pointer'
const solid = `${button} bg-ink text-cream`
const ghost = `${button} bg-line text-ink`
const panelLabel = 'text-[11px] uppercase tracking-[0.09em] text-ink-soft'

// ────────────────────────────────── 나란히 보기 ──────────────────────────────────

function Gallery() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const galleryRef = useRef<ReturnType<typeof startGallery> | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const labels = labelsRef.current
    if (!canvas || !labels) return
    const gallery = startGallery({ canvas, labels })
    galleryRef.current = gallery
    return () => {
      galleryRef.current = null
      gallery.dispose()
    }
  }, [])

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/*
        캔버스는 자리를 잡아 주는 상자 안에 절대배치한다. flex 항목의 기본
        `min-height: auto` 는 **캔버스가 자기 속성 높이 아래로 줄어드는 것을 막는데**,
        `renderer.setSize()` 가 그 속성을 키우고 나면 캔버스가 부풀어 아래 이름표를
        창 밖으로 밀어낸다. 실제로 그렇게 밀려나 이름표가 안 보인 적이 있다.
      */}
      <div className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
      </div>
      <div
        ref={labelsRef}
        className="flex shrink-0 pb-[22px] [&_div]:flex-1 [&_div]:text-center [&_.name]:text-[15px] [&_.name]:font-bold [&_.name]:tracking-[0.06em] [&_.cry]:text-[12px] [&_.cry]:text-ink-soft [&_.cry]:mt-[3px]"
      />
      <div className="absolute top-[58px] left-1/2 -translate-x-1/2 flex gap-2">
        <button className={solid} onClick={() => galleryRef.current?.play('dance')}>
          전부 춤!
        </button>
        <button className={ghost} onClick={() => galleryRef.current?.play('hop')}>
          폴짝
        </button>
        <button className={ghost} onClick={() => galleryRef.current?.play('wave')}>
          손 흔들기
        </button>
        <button className={ghost} onClick={() => galleryRef.current?.toggleSpin()}>
          회전 보기
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────── 편집 ────────────────────────────────────

function Editor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const headRef = useRef<HTMLInputElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const stageRef = useRef<EditorStage | null>(null)

  const [track, setTrack] = useState<TrackName>('wave')
  const [tracks, setTracks] = useState<Record<TrackName, Keyframe[]>>(() => ({
    hop: initialTrack('hop'),
    dance: initialTrack('dance'),
    twitch: initialTrack('twitch'),
    wave: initialTrack('wave'),
    shy: initialTrack('shy'),
    sulk: initialTrack('sulk'),
    doze: initialTrack('doze'),
    wake: initialTrack('wake'),
  }))
  const [memos, setMemos] = useState<Record<TrackName, Record<number, string>>>({
    hop: {},
    dance: {},
    twitch: {},
    wave: {},
    shy: {},
    sulk: {},
    doze: {},
    wake: {},
  })
  const [selected, setSelected] = useState(0)
  const [species, setSpecies] = useState(CHARACTERS[0].key)
  const [at, setAt] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [output, setOutput] = useState<string | null>(null)

  const keys = tracks[track]
  const fields = TRACK_FIELDS[track]
  const unitEnd = trackDuration(keys)
  const key = keys[Math.min(selected, keys.length - 1)]
  const warnings = useMemo(
    () => (HOLDS_POSE.has(track) ? [] : neutralWarnings(keys, fields)),
    [keys, fields, track],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const stage = startEditorStage({
      canvas,
      // 재생 중에는 React 를 거치지 않고 눈금과 시계를 직접 민다
      onPlayhead: setHead,
      onPlayEnd: () => setPlaying(false),
    })
    stageRef.current = stage
    return () => {
      stageRef.current = null
      stage.dispose()
    }
  }, [])

  /**
   * 눈금과 시계를 민다.
   *
   * 스크럽 바는 **비제어**다. 재생 중에는 무대가 매 프레임 이 두 DOM 을 직접 만지는데,
   * 같은 입력을 React 가 함께 붙들고 있으면 프레임마다 재조정이 돌거나 제어·비제어를
   * 오가며 값이 튄다.
   */
  function setHead(t: number) {
    if (headRef.current) headRef.current.value = String(t)
    if (clockRef.current) clockRef.current.textContent = `${t.toFixed(2)}s`
  }

  /** 무대에 지금 트랙을 먹이고 그 시각의 포즈를 보여 준다 */
  function show(nextKeys: Keyframe[], t: number, name: TrackName = track) {
    setHead(t)
    const stage = stageRef.current
    if (!stage) return
    stage.setTrack(name, nextKeys)
    stage.scrub(name, t)
  }

  useEffect(() => {
    stageRef.current?.setSpecies(species)
    show(keys, at)
    // 캐릭터를 바꾸면 애니메이터가 새로 생기므로 지금 포즈를 다시 먹인다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species])

  function edit(nextKeys: Keyframe[], t = at) {
    setTracks((current) => ({ ...current, [track]: nextKeys }))
    setPlaying(false)
    setAt(t)
    show(nextKeys, t)
  }

  function selectKey(index: number) {
    setSelected(index)
    const t = keys[index].t as number
    setPlaying(false)
    setAt(t)
    show(keys, t)
  }

  function setField(field: string, value: number) {
    edit(keys.map((item, index) => (index === selected ? { ...item, [field]: round4(value) } : item)))
  }

  /** `ease` 는 이름이라 숫자와 같은 길로 보내면 안 된다 — 반올림하면 NaN 이 된다. */
  function setEase(name: EasingName) {
    edit(keys.map((item, index) => (index === selected ? { ...item, ease: name } : item)))
  }

  function moveKey(value: number) {
    const { min, max } = timeBounds(keys, selected)
    const t = round4(Math.min(max, Math.max(min, value)))
    const next = keys.map((item, index) => (index === selected ? { ...item, t } : item))
    edit(next, t)
  }

  function switchTrack(name: TrackName) {
    setTrack(name)
    setSelected(0)
    setAt(0)
    setPlaying(false)
    setOutput(null)
    show(tracks[name], 0, name)
  }

  function play() {
    setPlaying(true)
    setOutput(null)
    stageRef.current?.play(track)
  }

  function stop() {
    setPlaying(false)
    stageRef.current?.stop()
    show(keys, at)
  }

  const constant = TRACKS.find((item) => item.name === track)?.constant ?? 'UNIT'
  // 폴짝과 춤은 유닛을 여러 번 이어 붙여 재생한다. 무대에 물어보면 첫 그림에서는
  // 아직 무대가 없어 못 받으므로 여기서 같은 셈을 한다.
  const timelineEnd = useMemo(() => {
    if (track === 'hop') return buildHopTimeline(HOP_COUNT, keys).duration
    if (track === 'dance') return buildDanceTimeline(DANCE_CYCLES, keys).duration
    return unitEnd
  }, [track, keys, unitEnd])

  return (
    <div className="flex-1 flex min-h-0">
      {/* ── 왼쪽: 무대와 스크럽 바 ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="relative flex-1 min-h-0">
          {/* 나란히 보기와 같은 이유로 절대배치한다 — 위 Gallery 의 주석 참고 */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />
          {/*
            진짜 캐릭터 창의 테두리. 카메라 구도가 앱과 같고 세로 화각이 고정이라,
            같은 가로세로비의 네모를 가운데 겹쳐 놓으면 그 안이 곧 창에 보이는 것이다.
            **이게 없으면 팔이 창 밖으로 나가는지 알 수 없다** — 편집기 캔버스는
            가로가 훨씬 넓어서 무엇이든 다 들어와 보인다.
          */}
          <div
            aria-hidden
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-x border-dashed border-line-strong pointer-events-none"
            style={{ aspectRatio: `${PET_BASE_SIZE.width} / ${PET_BASE_SIZE.height}` }}
          />
          <span className="absolute bottom-2 left-1/2 translate-x-[120px] text-[11px] text-ink-soft pointer-events-none">
            ↤ 캐릭터 창 폭
          </span>
        </div>

        <div className="px-6 pb-4 pt-2 flex items-start gap-3">
          <button className={`${solid} shrink-0`} onClick={playing ? stop : play}>
            {playing ? '■ 멈춤' : '▶ 재생'}
          </button>

          {/* 눈금과 키 마커는 같은 상자를 써야 자리가 맞는다 */}
          <div className="flex-1 min-w-0">
            <input
              ref={headRef}
              type="range"
              className="w-full accent-ink block"
              min={0}
              max={unitEnd}
              step={0.005}
              defaultValue={0}
              onChange={(event) => {
                const t = Number(event.target.value)
                setPlaying(false)
                setAt(t)
                show(keys, t)
              }}
            />
            <div className="relative h-4">
              {keys.map((item, index) => (
                <button
                  key={index}
                  title={`${index}번 키 · ${(item.t as number).toFixed(2)}s`}
                  onClick={() => selectKey(index)}
                  className={`absolute top-0 -translate-x-1/2 w-2.5 h-2.5 rotate-45 border-0 cursor-pointer p-0 ${
                    index === selected ? 'bg-accent' : 'bg-line-strong'
                  }`}
                  style={{ left: `${((item.t as number) / unitEnd) * 100}%` }}
                />
              ))}
            </div>
            <div className="text-[11px] text-ink-soft mt-1">
              유닛 한 벌 {unitEnd.toFixed(2)}초
              {timelineEnd > unitEnd + 1e-6 && (
                <> · 재생은 이어 붙인 {timelineEnd.toFixed(2)}초 전체</>
              )}
            </div>
          </div>

          <span ref={clockRef} className="font-code text-[12px] w-14 text-right shrink-0 pt-1">
            0.00s
          </span>
        </div>
      </div>

      {/* ── 오른쪽: 패널 ── */}
      <aside className="w-[380px] shrink-0 border-l border-line overflow-y-auto p-5 flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <div className={panelLabel}>동작</div>
          <div className="flex flex-wrap gap-1.5">
            {TRACKS.map((item) => (
              <button
                key={item.name}
                className={item.name === track ? solid : ghost}
                onClick={() => switchTrack(item.name)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <div className={panelLabel}>캐릭터</div>
          <div className="flex flex-wrap gap-1.5">
            {CHARACTERS.map((spec) => (
              <button
                key={spec.key}
                className={spec.key === species ? solid : ghost}
                onClick={() => setSpecies(spec.key)}
              >
                {spec.name}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-soft leading-snug">
            종마다 비율이 달라서, 한 종에서 읽히는 동작이 다른 종에서는 실루엣에 묻히거나
            창 밖으로 나갑니다. 다섯을 다 넘겨 보세요.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <div className={panelLabel}>
            {selected}번 키 · {keys.length}개 중
          </div>

          <Row label="t (초)">
            <Slide
              value={key.t as number}
              min={timeBounds(keys, selected).min}
              max={timeBounds(keys, selected).max}
              step={0.005}
              onChange={moveKey}
            />
          </Row>

          {fields.map((field) => {
            const [min, max, step] = rangeOf(field)
            return (
              <Row key={field} label={field}>
                <Slide
                  value={key[field] as number}
                  min={min}
                  max={max}
                  step={step}
                  onChange={(value) => setField(field, value)}
                />
              </Row>
            )
          })}

          <Row label="ease">
            <select
              className="flex-1 font-code text-[12px] bg-card border border-line rounded-field px-2 py-1"
              value={(key.ease as EasingName) ?? 'easeInOutQuad'}
              onChange={(event) => setEase(event.target.value as EasingName)}
            >
              {EASING_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </Row>

          <Row label="메모">
            <input
              className="flex-1 font-ui text-[12px] bg-card border border-line rounded-field px-2 py-1"
              placeholder="뽑을 때 // 주석으로 붙습니다"
              value={memos[track][selected] ?? ''}
              onChange={(event) =>
                setMemos((current) => ({
                  ...current,
                  [track]: { ...current[track], [selected]: event.target.value },
                }))
              }
            />
          </Row>

          <div className="flex gap-1.5 mt-1">
            <button className={ghost} onClick={() => edit(insertKeyAt(keys, fields, at))}>
              지금 자리에 키 꽂기
            </button>
            <button
              className={ghost}
              onClick={() => {
                edit(removeKey(keys, selected))
                setSelected((index) => Math.max(0, index - 1))
              }}
            >
              키 지우기
            </button>
          </div>
          <p className="text-[11px] text-ink-soft leading-snug">
            첫 키와 마지막 키는 지워지지 않습니다. 꽂은 키는 그 시각의 보간값을 갖지만,
            휘는 곡선은 반씩 나뉘며 조금 완만해집니다.
          </p>
        </section>

        {warnings.length > 0 && (
          <p className="text-[12px] bg-warn text-warn-ink rounded-card px-3 py-2 leading-snug">
            양끝이 중립이 아닙니다 — <b>{warnings.join(' · ')}</b>. 이어 붙였을 때 이음매가
            튈 수 있습니다.
          </p>
        )}

        <section className="flex flex-col gap-2">
          <button className={solid} onClick={() => setOutput(serializeTrack(constant, keys, fields, memos[track]))}>
            뽑아내기
          </button>
          {output && (
            <>
              <textarea
                readOnly
                className="font-code text-[11px] leading-relaxed bg-card border border-line rounded-card p-3 h-52 resize-none"
                value={output}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button className={ghost} onClick={() => void navigator.clipboard.writeText(output)}>
                복사
              </button>
              <p className="text-[11px] text-ink-soft leading-snug">
                <code>renderer/pet/animations.ts</code> 의 <code>{constant}</code> 자리에
                통째로 붙여 넣으세요. 키와 키 사이에 홀로 서서 구간을 나누던 주석
                (<code>{'// ── 왼쪽으로 ──'}</code>)은 여기 담기지 않으니 붙여 넣은 뒤
                다시 적어 주세요.
              </p>
            </>
          )}
        </section>
      </aside>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-code text-[12px] w-20 shrink-0">{label}</span>
      {children}
    </label>
  )
}

/** 슬라이더와 숫자 칸 한 쌍. 범위 밖의 값이 필요하면 숫자 칸에 직접 적는다. */
function Slide({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <>
      <input
        type="range"
        className="flex-1 accent-ink min-w-0"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        className="w-[72px] shrink-0 font-code text-[12px] bg-card border border-line rounded-field px-2 py-1"
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </>
  )
}

// ──────────────────────────────────── 껍데기 ────────────────────────────────────

function Preview() {
  // 주소 끝의 `#editor` 로 편집 모드를 바로 열 수 있다. 캡처 스크립트가 그 길로 연다.
  const [mode, setMode] = useState<'gallery' | 'editor'>(
    location.hash === '#editor' ? 'editor' : 'gallery',
  )

  return (
    <div className="relative w-full h-full flex flex-col bg-cream text-ink font-ui overflow-hidden">
      <nav className="flex gap-1.5 justify-center pt-3.5 pb-1">
        <button className={mode === 'gallery' ? solid : ghost} onClick={() => setMode('gallery')}>
          나란히 보기
        </button>
        <button className={mode === 'editor' ? solid : ghost} onClick={() => setMode('editor')}>
          키프레임 편집
        </button>
      </nav>
      {mode === 'gallery' ? <Gallery /> : <Editor />}
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<Preview />)
