/**
 * 편집 무대 — 캐릭터 한 마리를 앱 창과 **같은 카메라 구도**로 세워 둔다.
 *
 * `createStage()` 를 그대로 쓰는 것이 핵심이다. 편집기가 자기 나름의 구도를 만들면
 * 여기서 실루엣 밖으로 잘 나오던 팔이 실제 창에서는 잘리는 일이 생긴다. 값을 부위에
 * 바르는 일도 `createAnimator` 하나만 하므로, **여기서 보이는 움직임이 앱에서
 * 나오는 움직임이다.**
 *
 * 재생 중의 시각(playhead)은 이 무대가 셈한다. 애니메이터는 시간을 안으로만 굴리고
 * 밖으로 내주지 않기 때문이다. 그 값을 React 상태로 올리지 않고 콜백으로 흘리는
 * 이유는 초당 60번 도는 자리라서다 — 프레임마다 재조정을 돌릴 이유가 없다.
 *
 * **음표·먼지·인사 짝대기·하트 말풍선도 함께 띄운다.** 동작을 다듬는 도구인데 정작 그 동작을 완성하는
 * 연출이 안 보이면, 여기서 알맞아 보이던 것이 앱에서는 다르게 읽힌다. 박차는 순간을
 * 잡는 규칙도 캐릭터 창과 같은 것(`pet/takeoff.ts`)을 쓴다 — 두 벌로 두면 한쪽만
 * 고쳐져 조용히 어긋난다.
 */

import * as THREE from 'three'
import { getCharacter } from '@buddling/shared/characters'
import { createCritter, disposeCritter, scaleToStandardHeight } from '../pet/critter'
import { createStage } from '../pet/scene'
import { createAnimator, TRACK_UNITS } from '../pet/animations'
import { createNotes } from '../pet/notes'
import { createPuff } from '../pet/puff'
import { createGreet } from '../pet/greet'
import { createHeartBubble } from '../pet/heart-bubble'
import { createTakeoff } from '../pet/takeoff'
import type { TrackName } from '../pet/animations'
import type { Keyframe } from '../pet/tween'

export interface EditorStage {
  /** 캐릭터를 갈아끼운다. 갈아끼워도 지금 편집 중인 트랙은 그대로 따라간다. */
  setSpecies: (key: string) => void
  setTrack: (name: TrackName, keys: Keyframe[]) => void
  /** 재생하지 않고 그 시각의 정지 포즈를 보여 준다 */
  scrub: (name: TrackName, t: number) => void
  play: (name: TrackName) => void
  stop: () => void
  durations: () => Record<TrackName, number>
  dispose: () => void
}

export function startEditorStage({
  canvas,
  onPlayhead,
  onPlayEnd,
}: {
  canvas: HTMLCanvasElement
  /** 재생 중 매 프레임 불린다. React 상태 대신 DOM 을 직접 만지는 데 쓴다. */
  onPlayhead: (t: number) => void
  onPlayEnd: () => void
}): EditorStage {
  const stage = createStage({ canvas })

  // 편집기가 갈아끼운 트랙. 캐릭터를 바꾸면 애니메이터가 새로 생기므로 여기 들고 있다가 다시 먹인다.
  const tracks: Partial<Record<TrackName, Keyframe[]>> = {}

  let critter = createCritter(getCharacter('cat'))
  let animator = createAnimator(critter)
  let notes: ReturnType<typeof createNotes> | null = null
  let puff: ReturnType<typeof createPuff> | null = null
  let greet: ReturnType<typeof createGreet> | null = null
  let heartBubble: ReturnType<typeof createHeartBubble> | null = null
  const takeoff = createTakeoff((strength) => puff?.burst(strength))

  function mount() {
    const unit = critter.height * scaleToStandardHeight(critter)
    stage.stand.scale.setScalar(scaleToStandardHeight(critter))
    stage.stand.add(critter.root)
    animator = createAnimator(critter)
    for (const [name, keys] of Object.entries(tracks)) {
      animator.setTrack(name as TrackName, keys)
    }
    notes?.dispose()
    notes = createNotes(stage.stand, unit)
    puff?.dispose()
    puff = createPuff(stage.stand, unit)
    greet?.dispose()
    greet = createGreet(stage.stand, unit)
    heartBubble?.dispose()
    heartBubble = createHeartBubble(stage.stand, unit)
    takeoff.reset()
  }
  mount()

  /** 재생 중인 동작과 그 안에서의 시각. 재생하지 않을 때는 null 이다. */
  let playing: TrackName | null = null
  let playhead = 0

  function setSpecies(key: string) {
    const next = getCharacter(key)
    if (next.key === critter.spec.key) return
    disposeCritter(critter)
    critter = createCritter(next)
    mount()
    playing = null
  }

  function setTrack(name: TrackName, keys: Keyframe[]) {
    tracks[name] = keys
    animator.setTrack(name, keys)
  }

  function scrub(name: TrackName, t: number) {
    playing = null
    takeoff.reset()
    animator.scrub(name, t)
  }

  function play(name: TrackName) {
    playing = name
    playhead = 0
    takeoff.reset()
    animator.stop()
    animator[name]()
    // 앱에서 신호를 받았을 때와 같이, 춤에는 음표가 손 흔들기에는 짝대기가 함께 뜬다
    if (name === 'dance') notes?.burst({ count: 6 })
    if (name === 'wave') greet?.burst()
    if (name === 'shy') heartBubble?.burst()
  }

  function stop() {
    playing = null
    takeoff.reset()
    animator.stop()
  }

  function resize() {
    stage.resize()
  }
  window.addEventListener('resize', resize)

  const clock = new THREE.Clock()
  stage.renderer.setAnimationLoop(() => {
    const delta = clock.getDelta()

    if (playing) {
      playhead += delta
      const duration = animator.durations[playing]
      if (playhead >= duration) {
        playing = null
        onPlayEnd()
      } else {
        onPlayhead(playhead)
      }
    }

    animator.update(delta)
    // 스크럽으로 포즈만 보고 있을 때는 먼지가 터지지 않아야 한다
    takeoff.watch(critter.root.position.y, delta, Boolean(playing && animator.isHopping))
    notes?.update(delta)
    puff?.update(delta)
    greet?.update(delta)
    heartBubble?.update(delta)
    stage.render()
  })

  return {
    setSpecies,
    setTrack,
    scrub,
    play,
    stop,
    durations: () => animator.durations,
    dispose() {
      stage.renderer.setAnimationLoop(null)
      window.removeEventListener('resize', resize)
      notes?.dispose()
      puff?.dispose()
      greet?.dispose()
      heartBubble?.dispose()
      disposeCritter(critter)
      stage.renderer.dispose()
      stage.renderer.forceContextLoss()
    },
  }
}

/** 편집기가 처음 열릴 때 채워 넣는 값 — 지금 소스에 적혀 있는 트랙 그대로다. */
export const initialTrack = (name: TrackName): Keyframe[] =>
  TRACK_UNITS[name].map((key) => ({ ...key }))
