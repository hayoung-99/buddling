/**
 * 빼꼼 캐릭터를 화면에 들어올 때 하나씩 내보낸다. 한 번 나오면 그대로 둔다.
 *
 * 미끄러지는 일 자체는 style.css 의 transition 이 한다. 여기서는 "이제 나올
 * 때"라고 알려 주는 `is-in` 을 붙이기만 하고, 다시는 떼지 않는다. 그래서 스크롤을
 * 위로 올려도 캐릭터가 도로 숨지 않는다.
 *
 * 세로 위치는 getBoundingClientRect 가 아니라 offsetTop 으로 잰다. 캐릭터는
 * 나오기 전에 translateX 로 화면 밖에 밀려 있어서 화면 좌표로는 "안 보이는 것"과
 * "아직 안 나온 것"을 구분할 수 없다. offsetTop 은 배치 좌표라 transform 에
 * 흔들리지 않는다.
 *
 * 같은 이유로 IntersectionObserver 를 쓰지 않는다. 캐릭터는 절반쯤 화면 밖에 나가
 * 있는 것이 정상이라(그게 "빼꼼"이다) 노출 비율이 토끼·오리의 경우 50%를 넘지
 * 못한다. 어떤 문턱값을 잡아도 누구는 영영 안 걸린다.
 */

/** 화면 아래에서 이만큼 올라온 선을 넘으면 나온다. 1 이면 화면에 닿자마자. */
const TRIGGER = 0.82

const peeks = [...document.querySelectorAll('.peek')].map((el) => ({ el, top: 0 }))

/*
 * 1440px 아래에서는 캐릭터가 통째로 display:none 이라 offsetTop 이 0 으로 나온다.
 * 창을 넓히면 그때 진짜 자리가 생기므로 다시 잰다.
 */
function measure() {
  for (const peek of peeks) peek.top = peek.el.offsetTop
}

function reveal() {
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

measure()
reveal()

window.addEventListener('scroll', reveal, { passive: true })
window.addEventListener('resize', () => {
  measure()
  reveal()
})
