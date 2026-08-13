/**
 * 메뉴바 트레이 아이콘(PNG)을 코드로 생성한다.
 *
 * 이미지 에셋을 저장소에 바이너리로 넣지 않기 위해 필요할 때 그려서 쓴다.
 * macOS 템플릿 이미지 규칙(검정 + 알파, 파일명 *Template.png)을 따르므로
 * 다크/라이트 메뉴바 양쪽에서 알아서 반전된다.
 *
 *   node scripts/make-tray-icon.js
 */

const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const OUT_DIR = path.join(__dirname, '..', 'assets')

/** 고양이 머리 실루엣: 원 하나 + 삼각 귀 둘. 좌표는 0~1 정규화. */
function coverage(u, v) {
  // 머리
  const dx = (u - 0.5) / 0.36
  const dy = (v - 0.58) / 0.34
  if (dx * dx + dy * dy <= 1) return true

  // 귀 (좌우 삼각형)
  for (const side of [-1, 1]) {
    const baseX = 0.5 + side * 0.24
    const localX = (u - baseX) / 0.17
    const localY = (v - 0.3) / 0.3
    if (localY >= 0 && localY <= 1 && Math.abs(localX) <= 1 - localY) return true
  }
  return false
}

function render(size) {
  const SAMPLES = 4 // 계단 현상을 줄이기 위한 슈퍼샘플링
  const pixels = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const u = (x + (sx + 0.5) / SAMPLES) / size
          const v = (y + (sy + 0.5) / SAMPLES) / size
          if (coverage(u, v)) hits += 1
        }
      }
      const offset = (y * size + x) * 4
      pixels[offset] = 0
      pixels[offset + 1] = 0
      pixels[offset + 2] = 0
      pixels[offset + 3] = Math.round((hits / (SAMPLES * SAMPLES)) * 255)
    }
  }
  return pixels
}

function encodePng(size, pixels) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0 // 필터 타입: None
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([length, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return crc ^ 0xffffffff
}

fs.mkdirSync(OUT_DIR, { recursive: true })
for (const [size, name] of [
  [22, 'trayTemplate.png'],
  [44, 'trayTemplate@2x.png'],
]) {
  const file = path.join(OUT_DIR, name)
  fs.writeFileSync(file, encodePng(size, render(size)))
  console.log(`wrote ${file}`)
}
