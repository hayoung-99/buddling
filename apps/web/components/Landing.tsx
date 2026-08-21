import type { Copy, Step } from '../lib/copy'
import { RELEASES_LATEST, RELEASES_PAGE } from '../lib/site'
import { DownloadButtons } from './DownloadButtons'
import { Peekers } from './Peekers'

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
            <span className="title">tap-tap</span>
            <nav>
              <a href="#characters">{copy.nav.characters}</a>
              <a href="#download">{copy.nav.download}</a>
              <a href="#faq">{copy.nav.faq}</a>
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
                <p className="needs-two">{copy.hero.needsTwo}</p>
                <div className="actions">
                  <a className="btn" href={RELEASES_LATEST} data-hero-download>
                    {copy.hero.download}
                  </a>
                  <a className="btn ghost" href="#download">
                    {copy.hero.allVersions}
                  </a>
                </div>
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
                  height={1560}
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

            {/* ── 받기 ── */}
            <section className="pane" id="download">
              <div className="pane-head">
                <div>
                  <p className="label">{copy.download.label}</p>
                  <h2>{copy.download.heading}</h2>
                </div>
                <span className="tag" data-release-tag>
                  {copy.download.latest}
                </span>
              </div>

              <div className="dl-list">
                {copy.download.rows.map((row) => (
                  <div className="dl-row" key={row.asset} data-asset={row.asset} data-label={row.label}>
                    <div>
                      <div className="name">{row.name}</div>
                      <div className="meta">{row.meta}</div>
                    </div>
                    <a className="btn" href={RELEASES_LATEST}>
                      {copy.download.button}
                    </a>
                  </div>
                ))}
              </div>

              <p className="hint">{copy.download.hint}</p>
              <p className="hint" data-pending-notice hidden>
                {copy.download.pending}
              </p>
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
          </main>

          <footer>
            <span>{copy.footer.tagline}</span>
            <nav>
              <a href="https://github.com/hayoung-99/tap-tap">{copy.footer.github}</a>
              <a href={RELEASES_PAGE}>{copy.footer.releases}</a>
              <a href={copy.other.href} hrefLang={copy.other.lang} lang={copy.other.lang}>
                {copy.other.long}
              </a>
            </nav>
          </footer>
        </div>
      </div>

      <DownloadButtons strings={copy.downloadStrings} />
    </>
  )
}
