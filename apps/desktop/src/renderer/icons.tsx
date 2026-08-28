/**
 * 창 안에서 쓰는 작은 선 아이콘들.
 *
 * 그림 자체는 lucide 세트에서 그대로 꺼내 쓴다 (기획서 "화면 속 아이콘은 갖다 쓰고,
 * 캐릭터는 직접 그린다"). 이 파일은 그 위에 크기와 굵기만 씌우는 얇은 껍데기다.
 *
 * 껍데기를 남긴 이유: 부르는 다섯 자리가 크기·굵기를 저마다 적어 두면 "같은 뜻으로
 * 같은 값" 이 다섯 군데로 흩어진다. 여기 한 곳에 두면 세트를 갈아탈 일이 생겨도
 * 아래 import 한 줄과 이 다섯 줄만 고치면 되고, 새 아이콘이 필요해졌을 때 같은
 * 세트에서 골랐는지도 이 파일만 보면 안다.
 */

import { Bell, Key, PawPrint, Settings, UsersRound } from 'lucide-react'
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

/**
 * viewBox·fill·stroke·선 끝 모양은 lucide 가 이미 똑같은 값으로 붙이므로 다시 적지
 * 않는다. 우리가 정하는 것은 크기와 굵기 둘뿐이다.
 *
 * 굵기 1.8 은 손으로 그리던 시절의 값 그대로다. lucide 의 기본값은 2 지만, 24칸짜리
 * 그림을 16px 로 줄여 그리므로 화면에 찍히는 굵기는 1.8 × 16 ÷ 24 = 1.2px 이 되어
 * 지금과 한 픽셀도 다르지 않다. 여기를 2 로 올리면 다섯이 한꺼번에 굵어진다.
 *
 * lucide 의 `size` 프로퍼티는 일부러 쓰지 않는다. 부르는 쪽이 이미 width·height 로
 * 덮어쓰고 있는데(GearIcon 은 13px), 둘을 섞으면 어느 쪽이 이기는지가 안 보인다.
 */
const base = {
  width: 16,
  height: 16,
  strokeWidth: 1.8,
}

/**
 * 원형 배지(ui.iconChip, 26px) 안에 들어가는 둘만 14px 이다.
 *
 * lucide 는 아이콘마다 24칸을 거의 꽉 채워 그린다 — 잉크가 대략 19~20칸이다. 손으로
 * 그리던 것은 15칸쯤으로 안쪽에 여유를 두고 그렸어서, 같은 16px 로 얹으면 이 둘만
 * 배지 테두리에 바짝 붙어 커 보인다. 나머지 셋은 제목줄과 글자 줄에 놓여 가두는
 * 테두리가 없으므로 그대로 둔다.
 */
const inChip = { ...base, width: 14, height: 14 }

/** 사람 둘 — "새 방 만들기" 배지 */
export function PeopleIcon(props: IconProps) {
  return <UsersRound {...inChip} {...props} />
}

/** 열쇠 — "초대코드로 참여하기" 배지 */
export function KeyIcon(props: IconProps) {
  return <Key {...inChip} {...props} />
}

/** 발바닥 — 창 제목줄, 앱 이름 옆 */
export function PawIcon(props: IconProps) {
  return <PawPrint {...base} {...props} />
}

/** 종 — 제목줄 오른쪽, 알림 창으로 가는 단추 */
export function BellIcon(props: IconProps) {
  return <Bell {...base} {...props} />
}

/** 톱니바퀴 — 맨 아래 "설정…" 앞 */
export function GearIcon(props: IconProps) {
  return <Settings {...base} {...props} />
}
