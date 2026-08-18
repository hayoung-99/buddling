/**
 * 바탕화면 위 캐릭터.
 *
 * 창은 투명한 사각형이라 기본적으로 클릭이 통과된다. 커서가 실제 캐릭터
 * 실루엣 위에 올라왔을 때만 메인 프로세스에 알려 마우스를 받는다.
 *
 * 이 창은 팀 하나를 담당한다 (`petApi.teamId`). 여러 팀에 속해 있으면
 * 같은 화면에 이런 창이 팀 수만큼 뜨고, 각자 자기 팀 신호에만 반응한다.
 *
 * 화면에 나타나는 신호는 서로 다르다.
 *   내가 클릭  → 움찔 + "TAP TAP!" 말풍선 (그리고 팀에 신호를 보낸다)
 *   팀원이 찌름 → 좌우로 흔드는 춤 + 떠오르는 음표 + 발밑에 찌른 사람 이름표
 *   둘이 겹치면 → 춤추면서 움찔하고 말풍선·이름이 다 보인다
 *
 * 셋을 따로 두었기 때문에 "겹칠 때"를 위한 별도 처리가 필요 없다.
 *
 * ── React 를 여기 들이지 않는 이유 ──
 *
 * 이 파일은 명령형이고, 앞으로도 그래야 한다. 아래 렌더 루프는 절전 단계에 따라 초당
 * 10~60번 돈다. 이 앱은 컴퓨터를 켠 순간부터 끌 때까지 떠 있으므로 매 프레임 하는 일이
 * 곧 사용자의 배터리다. 프레임마다 React 상태를 건드리면 그때마다 재조정이 돌아 여기서
 * 아껴 둔 것을 그대로 반납하게 된다.
 *
 * 그래서 React 는 캔버스와 오버레이 두 칸을 화면에 얹는 껍데기(`main.tsx`)로만 쓰고,
 * 그 뒤로는 이 파일이 DOM 을 직접 만진다. 말풍선과 이름표가 CSS 애니메이션인 것도
 * 같은 이유다 — 컴포지터가 알아서 돌리므로 이 루프가 관여할 일이 없다.
 */

import * as THREE from 'three'
import { getCharacter } from '../../shared/characters'
import { powerProfile } from '../../shared/power'
import type { PowerProfile } from '../../shared/power'
import type { AppState, Membership, TapPayload } from '../../shared/state'
import { createCritter, disposeCritter, scaleToStandardHeight } from './critter'
import type { Critter } from './critter'
import { createStage } from './scene'
import { createAnimator } from './animations'
import { createBubble } from './bubble'
import { createNameplate } from './nameplate'
import { createNotes } from './notes'
import { createPacer } from './pacer'

/** 내가 눌렀을 때 뜨는 말풍선 문구 */
const TAP_TEXT = 'TAP TAP!'

/** 클릭으로 인정할 최대 이동 거리(px). 이보다 많이 움직이면 "옮기기"다. */
const DRAG_THRESHOLD = 4

/** 크기 100% 일 때의 창 너비. 창 너비를 나누면 지금 배율을 알 수 있다. */
const BASE_WIDTH = 260
/** 말풍선 배율 한계 — 너무 작으면 글씨가 안 읽히고, 너무 크면 화면을 가린다 */
const BUBBLE_SCALE_RANGE = [0.55, 1.3]

interface HotZone {
  left: number
  top: number
  right: number
  bottom: number
  centerX: number
}

export interface PetElements {
  canvas: HTMLCanvasElement
  bubble: HTMLElement
  nameplate: HTMLElement
}

/**
 * 캐릭터를 띄우고 돌리기 시작한다.
 * @returns 정리 함수. 창이 살아 있는 동안에는 부를 일이 없지만, 붙인 것을 도로
 *   떼는 길을 남겨 두어야 두 번 붙는 실수가 조용히 넘어가지 않는다.
 */
export function startPet({ canvas, bubble: bubbleElement, nameplate: nameplateElement }: PetElements) {
  const bubble = createBubble(bubbleElement)
  const nameplate = createNameplate(nameplateElement)
  const stage = createStage({ canvas })

  let spec = getCharacter('cat')
  let critter: Critter | null = null
  let animator: ReturnType<typeof createAnimator> | null = null
  let hotZone: HotZone = { left: 0, top: 0, right: 0, bottom: 0, centerX: 0 }
  let interactive = false
  let pixelsPerUnit = 0
  let notes: ReturnType<typeof createNotes> | null = null
  /** 지금 쓰는 절전 프로필. 설정 창에서 바꾸면 갈아끼운다. */
  let profile: PowerProfile = powerProfile(null)

  /** 창 크기로부터 지금 캐릭터 배율을 구해 말풍선·이름표에 알려준다 */
  function syncOverlayScale() {
    const [min, max] = BUBBLE_SCALE_RANGE
    const petScale = (canvas.clientWidth || BASE_WIDTH) / BASE_WIDTH
    const scale = Math.min(max, Math.max(min, petScale))
    bubble.setScale(scale)
    nameplate.setScale(scale)
  }

  function setCharacter(key: string) {
    const next = getCharacter(key)
    if (critter && next.key === spec.key) return
    spec = next

    if (critter) disposeCritter(critter)
    critter = createCritter(spec)
    // 종마다 키가 달라도 화면에서는 같은 크기로 보이게 맞춘다.
    // (토끼는 귀 때문에 오리보다 훨씬 커서, 안 맞추면 말풍선 자리가 없어진다)
    stage.stand.scale.setScalar(scaleToStandardHeight(critter))
    stage.stand.add(critter.root)
    animator = createAnimator(critter)
    notes?.dispose()
    notes = createNotes(stage.stand, critter.height * scaleToStandardHeight(critter))
    updateHotZone()
  }

  /**
   * 캐릭터가 화면에서 차지하는 사각형을 구한다.
   * 이 영역 안에서만 마우스를 받으므로, 정확할수록 옆 바탕화면을 안 가린다.
   */
  function updateHotZone() {
    if (!critter) return
    // 춤추는 중이면 옆으로 나가 있으므로, 기본 자세로 되돌려 놓고 잰다
    critter.root.position.set(0, 0, 0)
    critter.root.scale.set(1, 1, 1)
    stage.stand.updateMatrixWorld(true)
    // 첫 프레임을 그리기 전에도 불리므로 카메라 행렬을 직접 최신화한다.
    // (안 하면 화면 좌표 변환이 어긋나 클릭 영역이 캐릭터와 따로 논다)
    stage.camera.updateMatrixWorld()

    const box = new THREE.Box3().setFromObject(critter.root)
    const width = canvas.clientWidth
    const height = canvas.clientHeight

    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity

    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).project(stage.camera)
          const screenX = ((point.x + 1) / 2) * width
          const screenY = ((1 - point.y) / 2) * height
          left = Math.min(left, screenX)
          right = Math.max(right, screenX)
          top = Math.min(top, screenY)
          bottom = Math.max(bottom, screenY)
        }
      }
    }

    const padding = 6
    hotZone = {
      left: left - padding,
      top: top - padding,
      right: right + padding,
      bottom: bottom + padding,
      centerX: (left + right) / 2,
    }
    bubble.placeAbove({ centerX: hotZone.centerX, top: hotZone.top })

    // 월드 좌표 1단위가 화면 몇 px인지. 점프 높이를 말풍선 위치로 옮길 때 쓴다.
    const project = (worldY: number) =>
      ((1 - new THREE.Vector3(0, worldY, 0).project(stage.camera).y) / 2) * height
    pixelsPerUnit = Math.abs(project(box.max.y) - project(box.max.y + 1))
  }

  const isInside = (x: number, y: number) =>
    x >= hotZone.left && x <= hotZone.right && y >= hotZone.top && y <= hotZone.bottom

  function setInteractive(next: boolean) {
    if (next === interactive) return
    interactive = next
    document.body.style.cursor = next ? 'pointer' : 'default'
    window.petApi.setInteractive(next)
  }

  // ── 클릭 / 끌어서 옮기기 ──
  let drag: { startX: number; startY: number; moved: number } | null = null

  const onMouseMove = (event: MouseEvent) => {
    if (drag) {
      drag.moved = Math.max(
        drag.moved,
        Math.hypot(event.screenX - drag.startX, event.screenY - drag.startY),
      )
      return
    }
    setInteractive(isInside(event.clientX, event.clientY))
  }

  const onMouseLeave = () => {
    if (!drag) setInteractive(false)
  }

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || !isInside(event.clientX, event.clientY)) return
    drag = { startX: event.screenX, startY: event.screenY, moved: 0 }
    window.petApi.dragStart()
  }

  const onMouseUp = (event: MouseEvent) => {
    if (!drag) return
    const wasClick = drag.moved < DRAG_THRESHOLD
    drag = null
    window.petApi.dragEnd()
    setInteractive(isInside(event.clientX, event.clientY))
    if (wasClick) tapSelf()
  }

  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault()
    if (isInside(event.clientX, event.clientY)) window.petApi.openMenu()
  }

  /** 내 캐릭터를 클릭했을 때 — 움찔하며 말풍선을 띄우고, 팀원들에게 신호를 보낸다 */
  function tapSelf() {
    animator?.twitch()
    bubble.show(TAP_TEXT)
    window.petApi.tap()
  }

  /**
   * 팀원이 나를 콕 찔렀을 때.
   *
   * 춤은 이미 추는 중이면 그냥 넘긴다. 다섯 명이 동시에 찔러도 다섯 번이 아니라
   * 한 번만 춰야 "지금 누군가 찔렀다"가 한 번의 동작으로 읽힌다.
   * 이름은 반대로 찌른 사람마다 하나씩 띄워 누가 찔렀는지 다 보이게 한다.
   */
  function tapReceived({ fromNickname }: Partial<TapPayload> = {}) {
    if (!animator?.isDancing) {
      animator?.dance()
      notes?.burst({ count: 6 })
    }
    nameplate.show(fromNickname ?? '', { centerX: hotZone.centerX, bottom: hotZone.bottom })
  }

  // 크기 조절 패널로 창 크기가 바뀌면 여기로 들어온다
  const onResize = () => {
    stage.resize()
    syncOverlayScale()
    updateHotZone()
  }

  // ── 메인 프로세스와 연결 ──
  /** 전체 상태에서 이 창이 맡은 팀의 소속 정보만 뽑는다 */
  function myMembership(state: AppState | null): Membership | null {
    return state?.memberships?.find((entry) => entry.team.id === window.petApi.teamId) ?? null
  }

  /**
   * 절전 단계를 바꾼다.
   * 해상도 상한이 달라졌을 때만 다시 그릴 준비를 한다 — 캔버스 크기가 바뀌면
   * 화면 좌표도 달라져서 클릭 영역을 다시 재야 한다.
   */
  function setPower(level: string | null) {
    const next = powerProfile(level)
    const resized = next.pixelRatioCap !== profile.pixelRatioCap
    profile = next
    if (!resized) return
    stage.resize(profile.pixelRatioCap)
    updateHotZone()
  }

  function applyState(state: AppState | null) {
    setPower(state?.power ?? null)
    const mine = myMembership(state)
    if (mine) setCharacter(mine.member.characterKey)
  }

  // ── 렌더 루프 ──
  /**
   * 규칙은 셋이다.
   *   1. 창이 안 보이면 (트레이에서 숨겼거나 컴퓨터가 잠들었으면) 아예 그리지 않는다.
   *   2. 가만히 있으면 절전 단계가 정한 만큼만 그리고, 그림자는 멈춰 세운다.
   *   3. 찔렸거나 만지는 중이면 넉넉히 그린다 — 반응이 굼떠 보이면 안 된다.
   */
  const clock = new THREE.Clock()
  const pacer = createPacer()

  /** 지금 눈에 띄게 움직이는 중인가 */
  function isBusy() {
    return Boolean(
      animator?.isDancing ||
        animator?.isTwitching ||
        animator?.isHopping ||
        notes?.count ||
        interactive ||
        drag,
    )
    // 말풍선과 이름표는 CSS 애니메이션이라 이 루프와 무관하게 부드럽게 흐른다.
  }

  function frame() {
    const busy = isBusy()
    const step = pacer.tick(clock.getDelta(), busy ? profile.activeFps : profile.idleFps)
    if (step === null) return

    stage.setShadowsLive(busy || profile.idleShadows)

    if (animator && critter) {
      animator.update(step)
      // 말풍선도 같이 떠오른다. 창 위에 닿으면 bubble 쪽에서 알아서 멈춘다.
      bubble.setLift(critter.root.position.y * stage.stand.scale.y * pixelsPerUnit)
      notes?.update(step)
    }
    stage.render()
  }

  let running = false

  function startLoop() {
    if (running) return
    running = true
    // 멈춰 있던 시간이 애니메이션에 한꺼번에 밀려들지 않도록 시계를 털어 낸다
    clock.getDelta()
    pacer.reset()
    stage.renderer.setAnimationLoop(frame)
  }

  function stopLoop() {
    if (!running) return
    running = false
    stage.renderer.setAnimationLoop(null)
  }

  /** 창이 숨겨지거나 최소화되면 브라우저가 알려 준다 */
  const onVisibilityChange = () => {
    if (document.hidden) stopLoop()
    else startLoop()
  }

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseleave', onMouseLeave)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibilityChange)

  window.petApi.onCharacter((key) => setCharacter(key))
  window.petApi.onState(applyState)
  window.petApi.onTap((payload) => tapReceived(payload))

  /** 컴퓨터가 잠들거나 화면이 잠기면 메인 프로세스가 알려 준다 */
  window.petApi.onRenderState((active) => {
    if (active && !document.hidden) startLoop()
    else stopLoop()
  })

  void window.petApi.getState().then(applyState)
  setCharacter('cat')
  syncOverlayScale()
  startLoop()

  return function stop() {
    stopLoop()
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseleave', onMouseLeave)
    window.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('contextmenu', onContextMenu)
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    notes?.dispose()
    if (critter) disposeCritter(critter)
  }
}
