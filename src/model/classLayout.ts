// 類別圖框尺寸與連線路徑。文字量測以參數注入，方便在沒有 DOM 的測試環境使用
import type { Classifier } from './types'
import { formatAttribute, formatOperation } from './quickInput'

export type Measure = (text: string, bold?: boolean) => number
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export const LINE_H = 18
export const PAD_X = 10
export const PAD_Y = 4
const MIN_W = 120
const EMPTY_SECTION_H = 12

export interface HeaderLine { text: string; bold: boolean }
export interface Section { list: 'attributes' | 'operations'; y: number; h: number; lines: string[] }
export interface NodeBox { w: number; h: number; header: HeaderLine[]; headerH: number; sections: Section[] }

export function nodeBox(el: Classifier, measure: Measure): NodeBox {
  const header: HeaderLine[] = []
  if (el.kind !== 'class') header.push({ text: el.kind === 'interface' ? '«interface»' : '«enumeration»', bold: false })
  header.push({ text: el.name, bold: true })
  const headerH = header.length * LINE_H + PAD_Y * 2

  const raw: Pick<Section, 'list' | 'lines'>[] =
    el.kind === 'enum'
      ? [{ list: 'attributes', lines: el.attributes.map((a) => a.name) }]
      : [
          { list: 'attributes', lines: el.attributes.map(formatAttribute) },
          { list: 'operations', lines: el.operations.map(formatOperation) },
        ]
  let y = headerH
  const sections = raw.map((s) => {
    const h = s.lines.length ? s.lines.length * LINE_H + PAD_Y * 2 : EMPTY_SECTION_H
    const sec = { ...s, y, h }
    y += h
    return sec
  })

  const widest = Math.max(
    ...header.map((l) => measure(l.text, l.bold)),
    ...raw.flatMap((s) => s.lines.map((t) => measure(t))),
  )
  return { w: Math.max(MIN_W, Math.ceil(widest) + PAD_X * 2), h: y, header, headerH, sections }
}

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** 直角折線：水平距離較大走左右邊、否則走上下邊，最多兩個轉折；a === b 時畫自我迴圈 */
export function route(a: Rect, b: Rect, self = false): Point[] {
  if (self) {
    const x = a.x + a.w
    const top = a.y
    return [
      { x, y: top + a.h / 4 },
      { x: x + 30, y: top + a.h / 4 },
      { x: x + 30, y: top - 20 },
      { x: x - a.w / 4, y: top - 20 },
      { x: x - a.w / 4, y: top },
    ]
  }
  const ca = center(a)
  const cb = center(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const s = { x: dx >= 0 ? a.x + a.w : a.x, y: ca.y }
    const e = { x: dx >= 0 ? b.x : b.x + b.w, y: cb.y }
    if (s.y === e.y) return [s, e]
    const mx = (s.x + e.x) / 2
    return [s, { x: mx, y: s.y }, { x: mx, y: e.y }, e]
  }
  const s = { x: ca.x, y: dy >= 0 ? a.y + a.h : a.y }
  const e = { x: cb.x, y: dy >= 0 ? b.y : b.y + b.h }
  if (s.x === e.x) return [s, e]
  const my = (s.y + e.y) / 2
  return [s, { x: s.x, y: my }, { x: e.x, y: my }, e]
}

export const pathOf = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
