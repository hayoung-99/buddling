'use client'

import { useEffect } from 'react'

/**
 * 화면 양 끝에서 캐릭터가 빼꼼 내민다. 이 앱이 바탕화면에서 하는 짓을 글을 읽기 전에
 * 먼저 보여주는 셈이다.
 *
 * 읽어 줄 내용이 없으니 화면 낭독기에서는 숨기고, **그림도 `<img>` 가 아니라 CSS 배경**
 * 으로 넣는다. 좁은 화면에서는 이 칸이 통째로 `display:none` 이라, 어차피 보이지 않을
 * 그림 400KB 를 아예 받지 않게 된다. `next/image` 로 바꾸면 이 성질을 잃는다.
 *
 * 미끄러지는 일 자체는 `globals.css` 의 transition 이 한다. 여기서는 "이제 나올
 * 때"라고 알려 주는 `is-in` 을 붙이기만 하고, 다시는 떼지 않는다. 그래서 스크롤을
 * 위로 올려도 캐릭터가 도로 숨지 않는다.
 */

/** 화면 아래에서 이만큼 올라온 선을 넘으면 나온다. 1 이면 화면에 닿자마자. */
const TRIGGER = 0.82

export function Peekers() {
  useEffect(() => {
    const peeks = [...document.querySelectorAll<HTMLElement>('.peek')].map((el) => ({
      el,
      top: 0,
    }))

    /*
     * 세로 위치는 getBoundingClientRect 가 아니라 offsetTop 으로 잰다. 캐릭터는 나오기
     * 전에 translateX 로 화면 밖에 밀려 있어서 화면 좌표로는 "안 보이는 것"과 "아직 안
     * 나온 것"을 구분할 수 없다. offsetTop 은 배치 좌표라 transform 에 흔들리지 않는다.
     *
     * 같은 이유로 IntersectionObserver 를 쓰지 않는다. 캐릭터는 절반쯤 화면 밖에 나가
     * 있는 것이 정상이라(그게 "빼꼼"이다) 노출 비율이 토끼·오리의 경우 50%를 넘지
     * 못한다. 어떤 문턱값을 잡아도 누구는 영영 안 걸린다.
     */
    const measure = () => {
      for (const peek of peeks) peek.top = peek.el.offsetTop
    }

    const reveal = () => {
      const line = window.scrollY + window.innerHeight * TRIGGER
      let left = 0
      for (const peek of peeks) {
        if (peek.el.classList.contains('is-in')) continue
        /*
         * 1440px 아래에서는 캐릭터가 display:none 이라 배치가 없다. 이때 offsetTop 은
         * 0 이므로, 걸러 내지 않으면 다섯 마리가 한꺼번에 "이미 나온 것"이 되어 버린다.
         * 그 상태로 창을 넓히면 등장 없이 통째로 떠 있게 된다.
         */
        if (peek.el.offsetParent === null) {
          left += 1
          continue
        }
        if (peek.top > line) {
          left += 1
          continue
        }
        peek.el.classList.add('is-in')
      }
      // 다 나왔으면 더 들을 일이 없다
      if (left === 0) window.removeEventListener('scroll', reveal)
    }

    const onResize = () => {
      measure()
      reveal()
    }

    measure()
    reveal()
    window.addEventListener('scroll', reveal, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', reveal)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <div className="peekers" aria-hidden="true">
      <span className="peek peek-panda from-left" />
      <span className="peek peek-bunny from-right" />
      <span className="peek peek-dog from-left" />
      <span className="peek peek-duck from-right" />
      <span className="peek peek-cat from-left" />
    </div>
  )
}
