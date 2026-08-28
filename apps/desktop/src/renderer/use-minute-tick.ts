/**
 * 값을 쓰지 않고 1분마다 다시 그리게만 하는 갈고리.
 *
 * 창을 열어둔 채로 초대코드 남은 시간이나("team/TeamDetail.tsx") 알림의 "몇 분 전"이
 * ("notifications/Notifications.tsx") 굳지 않게 하려고 쓴다. 두 창이 각자 60000 을
 * 적어 두는 자리를 만들지 않으려고 여기 하나로 모았다.
 */

import { useEffect, useState } from 'react'

export function useMinuteTick() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60000)
    return () => clearInterval(timer)
  }, [])
}
