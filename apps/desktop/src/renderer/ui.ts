/**
 * 여러 창에서 되풀이되는 유틸리티 묶음.
 *
 * 예전에는 `team.css` 가 `button`·`input` 같은 **요소 이름**으로 한꺼번에 칠했다.
 * 유틸리티로 옮기면 그 칠이 저절로 따라오지 않으므로, 버튼과 글자 칸이 나올 때마다
 * 같은 줄을 다시 적게 된다. 그래서 이름을 붙여 여기 모아 둔다.
 *
 * `@apply` 로 컴포넌트 클래스를 만들지 않은 이유: 그러면 결국 이름만 Tailwind 인
 * 스타일시트가 하나 더 생긴다. 문자열로 두면 어떤 유틸리티가 걸리는지 그대로 보이고,
 * 한 곳에서만 손보면 된다는 점도 같다.
 *
 * 숫자를 대괄호로 적은 곳이 많은데 일부러다. 이 화면들은 11·13·14·18px 처럼 Tailwind
 * 기본 눈금에 없는 값으로 다듬어져 있어서, 가까운 눈금으로 반올림하면 그만큼 화면이
 * 달라진다. 색과 반지름처럼 뜻이 있는 값만 `theme.css` 에서 이름으로 부른다.
 */

/** 크림색 바탕 위 어두운 버튼 */
export const button =
  'font-bold rounded-field px-[18px] py-[11px] bg-button-primary text-cream cursor-pointer ' +
  'transition-[transform,opacity] duration-100 active:scale-[0.975] ' +
  'disabled:opacity-45 disabled:cursor-default'

/**
 * 테두리만 있는 버튼.
 *
 * 비활성 스타일만은 `button`(채운 버튼)과 맞춘다 — 투명 배경에 옅은 테두리 위에
 * 그냥 opacity 를 낮추면 테두리와 글자가 거의 안 보이는 수준까지 흐려져서, 채운
 * 버튼의 "칠해진 채로 흐려진" 느낌과 달리 아예 지워진 것처럼 읽힌다.
 */
export const buttonGhost =
  'font-bold rounded-field px-[18px] py-[11px] bg-transparent text-ink border-[1.5px] border-line ' +
  'cursor-pointer transition-[transform,opacity] duration-100 active:scale-[0.975] ' +
  'disabled:bg-button-primary disabled:text-cream disabled:border-transparent disabled:opacity-45 ' +
  'disabled:cursor-default'

/** 줄 안에 끼워 넣는 작은 알약 버튼 */
export const buttonTiny =
  'font-bold rounded-full px-[12px] py-[6px] text-[12px] bg-ink text-cream cursor-pointer ' +
  'transition-[transform,opacity] duration-100 active:scale-[0.975] ' +
  'disabled:opacity-45 disabled:cursor-default'

export const buttonTinyGhost =
  'font-bold rounded-full px-[12px] py-[6px] text-[12px] bg-transparent text-ink ' +
  'border-[1.5px] border-line cursor-pointer transition-[transform,opacity] duration-100 ' +
  'active:scale-[0.975] disabled:opacity-45 disabled:cursor-default'

/**
 * 글자를 넣는 칸. 선택할 수 있어야 하므로 창 전체의 select-none 을 되돌린다.
 *
 * 여백을 떼어 둔 이유: 같은 성질의 유틸리티를 두 번 붙이면 **클래스에 적은 순서가 아니라
 * 만들어진 CSS 의 순서**가 이긴다. `input` 뒤에 `px-…` 를 덧붙이는 식으로는 어느 쪽이
 * 이길지 알 수 없어서, 좁은 칸은 아예 다른 이름으로 둔다.
 */
const inputBase =
  'w-full border-[1.5px] border-line rounded-field bg-card text-ink ' +
  'outline-none select-text focus:border-accent'

export const input = `${inputBase} px-[14px] py-[11px]`

/** 제자리에서 고쳐 쓸 때처럼 줄 안에 끼워 넣는 좁은 칸 */
export const inputCompact = `${inputBase} px-[12px] py-[8px]`

/** 바탕이 없는 조용한 버튼 (맨 아래 "설정…" · "팀 나가기") */
export const buttonQuiet =
  'text-ink-soft bg-transparent text-[12px] font-semibold p-[6px] cursor-pointer ' +
  'transition-opacity duration-100 disabled:opacity-45'

/** 창 맨 위 제목줄. 이 줄을 잡아 창을 끈다. */
export const titlebar =
  'drag-region sticky top-0 z-10 h-[44px] flex items-center justify-center bg-cream ' +
  'text-[13px] font-extrabold tracking-[0.12em] text-ink'

/** 제목줄 아래 본문 */
export const main = 'px-[22px] pt-[6px] pb-[28px]'

export const h1 = 'font-display font-bold text-[22px] tracking-[0em]'
export const h2 = 'text-[12px] font-bold tracking-[0.1em] text-ink-soft mb-[10px]'
export const lead = 'text-ink-soft mt-[6px]'
export const section = 'mt-[20px]'

/** 온보딩 섹션 제목 줄 — 원형 아이콘 배지 + 라벨. ui.h2 는 TeamDetail 등 다른 화면에서도
 *  그대로 쓰이므로 건드리지 않고, 이 조합은 온보딩에서만 쓴다. */
export const sectionHeading = 'flex items-center gap-[8px] mb-[10px]'
export const iconChip =
  'flex-none w-[26px] h-[26px] rounded-chip flex items-center justify-center text-ink'
export const sectionLabel = 'text-[15px] font-bold tracking-[0.02em] text-ink'
/** 섹션 제목 아래, 입력칸 위에 두는 한 줄 설명 */
export const sectionDescription = 'text-[12px] text-ink-soft mb-[10px]'
export const label = 'block text-[12px] font-bold text-ink-soft mb-[6px]'
export const errorLine = 'text-danger text-[13px] mt-[12px] min-h-[20px]'
export const footer = 'mt-[26px] text-center'
export const quota = 'text-[12px] font-bold text-ink-soft tabular-nums'
export const quotaNote = 'mt-[18px] text-center text-[12px] text-ink-soft'
export const loading = 'py-[40px] text-center text-ink-soft'

/** 목록 한 줄. 팀 목록과 설정 목록이 같은 생김새를 쓴다. */
export const row =
  'flex items-center gap-[12px] w-full px-[14px] py-[10px] rounded-row bg-card ' +
  'border-[1.5px] border-transparent text-ink text-left cursor-pointer hover:border-line'
export const rowMain = 'flex-1 min-w-0 flex flex-col gap-[2px]'
export const rowName = 'text-[15px] font-extrabold truncate'
export const rowSub = 'text-[12px] font-semibold text-ink-soft'
export const rowArrow = 'flex-none text-[20px] text-ink-soft'
export const rowList = 'mt-[16px] flex flex-col gap-[8px]'

/** 안내 상자 안의 파일 이름·명령어 */
export const code =
  'font-code text-[12px] bg-[rgba(74,63,51,0.08)] px-[5px] py-px rounded-[5px] select-text'

/** 설정 상세 화면의 안내 한 줄 */
export const hint = 'mt-[8px] mb-[14px] text-[12px] leading-[1.6] text-ink-soft'
