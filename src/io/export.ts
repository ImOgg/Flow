// 匯出目前的圖：複製畫布內容群組、拿掉縮放平移與 UI 專用元素，以內容邊界為 viewBox
import type { Rect } from '../model/classLayout'
import { download } from './file'

const NS = 'http://www.w3.org/2000/svg'
const PAD = 20

export function toSvgText(content: SVGGElement, bounds: Rect): string {
  const g = content.cloneNode(true) as SVGGElement
  g.removeAttribute('transform')
  g.querySelectorAll('[data-export="false"]').forEach((n) => n.remove())
  const w = Math.ceil(bounds.w + PAD * 2)
  const h = Math.ceil(bounds.h + PAD * 2)
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', String(w))
  svg.setAttribute('height', String(h))
  svg.setAttribute('viewBox', `${bounds.x - PAD} ${bounds.y - PAD} ${w} ${h}`)
  const bg = document.createElementNS(NS, 'rect')
  for (const [k, v] of Object.entries({ x: bounds.x - PAD, y: bounds.y - PAD, width: w, height: h, fill: '#fff' })) {
    bg.setAttribute(k, String(v))
  }
  svg.append(bg, g)
  return new XMLSerializer().serializeToString(svg)
}

export function exportSvg(content: SVGGElement, bounds: Rect, name: string) {
  download(new Blob([toSvgText(content, bounds)], { type: 'image/svg+xml' }), `${name}.svg`)
}

/** 以 2 倍解析度、白底輸出 PNG */
export async function exportPng(content: SVGGElement, bounds: Rect, name: string) {
  const text = toSvgText(content, bounds)
  const img = new Image()
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = img.width * 2
  canvas.height = img.height * 2
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (blob) download(blob, `${name}.png`)
}
