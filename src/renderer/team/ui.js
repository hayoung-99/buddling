/**
 * 팀 목록 창과 팀 상세 창이 함께 쓰는 조각들.
 * 사용자 입력을 innerHTML 로 넣지 않으려고 작은 DOM 헬퍼를 직접 만들어 쓴다.
 */

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value)
    else if (value !== null && value !== undefined) node.setAttribute(key, value)
  }
  for (const child of [children].flat()) {
    if (child) node.append(child)
  }
  return node
}

export function createToast(element) {
  let timer = null
  return {
    show(message) {
      element.textContent = message
      element.classList.add('is-visible')
      clearTimeout(timer)
      timer = setTimeout(() => element.classList.remove('is-visible'), 1600)
    },
  }
}

/**
 * 화면을 다시 그린다.
 * 조건부로 비워둔 자리(null)를 걸러내고, 입력 중이던 칸에 커서를 되돌려 놓는다.
 */
export function createRenderer(root) {
  return function render(nodes) {
    const focused = document.activeElement
    const mark = focused?.getAttribute?.('placeholder') ?? null
    const caret = focused?.selectionStart ?? null

    root.replaceChildren(...nodes.filter(Boolean))

    if (!mark) return
    const next = root.querySelector(`input[placeholder="${CSS.escape(mark)}"]`)
    if (next) {
      next.focus()
      if (caret !== null) next.setSelectionRange(caret, caret)
    }
  }
}

/** 초대코드가 얼마나 남았는지 사람이 읽는 말로 바꾼다 */
export function inviteStatus(expiresAt, t) {
  const left = new Date(expiresAt ?? 0).getTime() - Date.now()
  if (!Number.isFinite(left) || left <= 0) return { expired: true, text: t('invite.expired') }

  const hours = Math.floor(left / 3600000)
  if (hours >= 1) return { expired: false, text: t('invite.hoursLeft', { hours }) }
  const minutes = Math.max(1, Math.floor(left / 60000))
  return { expired: false, text: t('invite.minutesLeft', { minutes }) }
}

/** 언어 고르는 칸. 목록 창 아래에 둔다. */
export function languagePicker({ languages, current, label, onPick }) {
  const select = el('select', {
    onchange: (event) => onPick(event.target.value),
  })
  for (const option of languages) {
    select.append(
      el('option', {
        value: option.code,
        text: option.name,
        selected: option.code === current ? '' : null,
      }),
    )
  }
  return el('div', { class: 'language' }, [el('span', { text: label }), select])
}

/** 비동기 동작 중에는 버튼을 잠그고, 실패하면 메시지를 남기는 실행기 */
export function createRunner({ onChange }) {
  const status = { busy: false, error: '' }

  return {
    status,
    async run(action) {
      if (status.busy) return
      status.busy = true
      status.error = ''
      onChange()
      try {
        await action()
      } catch (error) {
        status.error = error?.message ?? String(error)
      } finally {
        status.busy = false
        onChange()
      }
    },
  }
}
