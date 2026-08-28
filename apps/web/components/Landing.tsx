import type { Copy, Step } from '../lib/copy'
import { BRAND, DOWNLOAD_PATHS, RELEASES_LATEST } from '../lib/site'
import { DownloadButtons } from './DownloadButtons'
import { Peekers } from './Peekers'
import { SiteFooter } from './SiteFooter'

/**
 * 랜딩 한 장. 마크업은 여기 한 벌뿐이고 나라말은 `copy` 로 들어온다.
 *
 * 클래스 이름은 예전 `site/style.css` 를 그대로 쓴다 — 스타일시트를 손대지 않고 옮기는
 * 것이 이 작업의 안전망이다. 화면이 달라졌다면 그건 옮기다 흘린 것이지 의도가 아니다.
 *
 * **여기는 서버 컴포넌트다.** 자바스크립트가 필요한 것은 아래 둘뿐이고 각자 파일이
 * 따로 있다 — 빼꼼 등장(`Peekers`)과 받기 단추(`DownloadButtons`). 랜딩 본문에
 * `'use client'` 를 들이면 지금 지키고 있는 자바스크립트 예산이 무너진다.
 */
/** 조각을 마크업으로. 맨 문장이 필요한 곳(구조화 데이터)은 `stepText` 가 맡는다. */
function renderStep(step: Step) {
  return step.map((part, index) =>
    typeof part === 'string' ? part : <strong key={index}>{part.strong}</strong>,
  )
}

export function Landing({ copy }: { copy: Copy }) {
  // 버전 히스토리는 이제 별도 화면이다 — 그 화면의 나라말 주소로 보낸다.
  const downloadHref = copy.locale === 'en' ? DOWNLOAD_PATHS.en : DOWNLOAD_PATHS.ko

  return (
    <>
      <a className="skip" href="#main">
        {copy.skipToContent}
      </a>

      <Peekers />

      <div className="stage">
        <div className="window">
          {/* 시그니처: 창 크롬. 이 앱이 어디 사는지를 한 글자도 읽기 전에 알려 준다. */}
          <header className="titlebar">
            <svg className="lights" viewBox="0 0 56 12" aria-hidden="true" focusable="false">
              <circle cx="6" cy="6" r="6" fill="#ff5f57" />
              <circle cx="26" cy="6" r="6" fill="#febc2e" />
              <circle cx="46" cy="6" r="6" fill="#28c840" />
            </svg>
            <span className="title">{BRAND}</span>
            <nav>
              <a href={downloadHref}>{copy.nav.download}</a>
              <a
                className="lang"
                href={copy.other.href}
                hrefLang={copy.other.lang}
                lang={copy.other.lang}
              >
                {copy.other.short}
              </a>
            </nav>
          </header>

          <main id="main">
            {/* ── 히어로 ── */}
            <section className="pane hero">
              <div>
                <h1>
                  {copy.hero.lead}
                  <br />
                  <em>{copy.hero.emphasis}</em>
                  {copy.hero.tail}
                </h1>
                <p className="lead">{copy.hero.sub}</p>
                <div className="actions">
                  <a className="btn" href={RELEASES_LATEST} data-hero-download>
                    {copy.hero.download}
                  </a>
                </div>
                {/*
                  받기 버튼 **바로 아래**다. 경고 이야기가 두 판 아래에만 있으면,
                  누르는 순간 페이지를 떠나는 사람에게는 없는 것과 같다.
                */}
                <p className="note">
                  {copy.hero.warns} <a href="#install">{copy.hero.warnsLink}</a>
                </p>
                <p className="note">{copy.hero.note}</p>
              </div>
            </section>

            {/* 창 모서리를 밟고 선다. 이 한 장이 컨셉을 다 설명한다. */}
            <img
              className="escapee"
              src="/assets/hero-cat.webp"
              alt={copy.hero.imageAlt}
              width={760}
              height={900}
              fetchPriority="high"
            />

            {/*
              받고 나면 뭐가 열리는지 보여 주는 판. 이 안에서 유일하게 배경이 다르고
              라벨 → 제목 → 본문 순서를 따르지 않는다. 판이 전부 같은 리듬이면
              스크롤이 지루해지므로, 한 곳만 일부러 어긋나게 둔다.
            */}
            <section className="pane shot-pane">
              <div className="app-frame">
                <img
                  className="app-shot"
                  src={copy.locale === 'en' ? '/assets/team-window-en.webp' : '/assets/team-window.webp'}
                  alt={copy.shot.imageAlt}
                  width={800}
                  height={1400}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="shot-copy">
                <h2>
                  {copy.shot.headingTop}
                  <br />
                  {copy.shot.headingBottom}
                </h2>
                <p>{copy.shot.body}</p>
              </div>
            </section>

            {/* ── 캐릭터 ── */}
            <section className="pane" id="characters">
              <p className="label">{copy.characters.label}</p>
              <h2>{copy.characters.heading}</h2>
              <p className="sub">{copy.characters.sub}</p>
              <img
                className="strip"
                src="/assets/characters.webp"
                alt={copy.characters.imageAlt}
                width={1760}
                height={460}
                loading="lazy"
                decoding="async"
              />
              <dl className="facts">
                {copy.characters.facts.map((fact) => (
                  <div key={fact.term}>
                    <dt>{fact.term}</dt>
                    <dd>{fact.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {/* ── 처음 열 때 ── */}
            <section className="pane" id="install">
              <p className="label">{copy.install.label}</p>
              <h2>{copy.install.heading}</h2>
              <p className="sub">{copy.install.sub}</p>

              <div className="guides">
                <div id="guide-macos">
                  <h3>{copy.install.macos.title}</h3>
                  <ol>
                    {copy.install.macos.steps.map((step, index) => (
                      // 순서가 곧 내용이라 index 를 열쇠로 써도 흔들리지 않는다
                      <li key={index}>{renderStep(step)}</li>
                    ))}
                  </ol>
                </div>
                <div id="guide-windows">
                  <h3>{copy.install.windows.title}</h3>
                  <ol>
                    {copy.install.windows.steps.map((step, index) => (
                      <li key={index}>{renderStep(step)}</li>
                    ))}
                  </ol>
                  <p className="hint">{copy.install.windows.hint}</p>
                </div>
              </div>
            </section>

            {/* ── 궁금한 것 ── */}
            <section className="pane" id="faq">
              <p className="label">{copy.faq.label}</p>
              <h2>{copy.faq.heading}</h2>
              <div className="qa-list">
                {copy.faq.items.map((item) => (
                  <div className="qa" key={item.id} id={item.id}>
                    <h3>{item.question}</h3>
                    <p>{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>
            {/*
              ── 해 보면 ──

              이 제품의 단 하나뿐인 마법이 여기까지 **글자로만** 있었다. 화면 둘을
              나란히 놓고 그 일이 실제로 일어나는 것을 보여 준다.

              맨 끝에 두는 것은 두 가지를 한 번에 하기 위해서다 — 읽고 내려온 사람이
              마지막으로 보는 것이 약속이 아니라 **그 약속이 지켜지는 장면**이고,
              그 자리에 받기 단추가 다시 있다. 그 전까지는 꼬리말 앞 3,000px 동안
              누를 것이 하나도 없었다.

              움직임은 CSS 뿐이다. 자바스크립트는 한 줄도 늘지 않았고, 화면에 들어올 때
              한 번 시작해 세 번 돌고 멈춘다 (`Peekers` 가 붙이는 `is-in` 을 함께 쓴다).
            */}
            <section className="pane try" id="try">
              <p className="label">{copy.try.label}</p>
              <h2>{copy.try.heading}</h2>
              <p className="sub">{copy.try.sub}</p>

              <div className="duo" data-reveal>
                <figure className="duo-screen">
                  <span className="duo-glass">
                    <img
                      src="/assets/duo-cat.webp"
                      alt={copy.try.altMine}
                      width={320}
                      height={380}
                      loading="lazy"
                      decoding="async"
                    />
                    {/* 누르는 순간에 번지는 동그라미. 뜻은 위 캡션이 지고, 이건 몸짓만 한다 */}
                    <span className="duo-tap" aria-hidden="true" />
                  </span>
                  <figcaption>{copy.try.mine}</figcaption>
                </figure>

                <span className="duo-arrow" aria-hidden="true" />

                <figure className="duo-screen">
                  <span className="duo-glass">
                    <img
                      className="duo-dancer"
                      src="/assets/duo-bunny.webp"
                      alt={copy.try.altTheirs}
                      width={320}
                      height={380}
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                  <figcaption>{copy.try.theirs}</figcaption>
                </figure>
              </div>

              <div className="actions">
                <a className="btn" href={downloadHref}>
                  {copy.try.cta}
                </a>
              </div>
            </section>
          </main>

          <SiteFooter copy={copy} />
        </div>
      </div>

      <DownloadButtons strings={copy.downloadStrings} />
    </>
  )
}
