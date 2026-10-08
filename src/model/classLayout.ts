// 類別圖框尺寸與連線路徑。文字量測以參數注入，方便在沒有 DOM 的測試環境使用
import type { Classifier, Id, Package, Point } from './types'
import { formatAttribute, formatOperation } from './quickInput'

export type Measure = (text: string, bold?: boolean) => number
export type { Point }
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

export const NOTE_PAD = 8
export const NOTE_FOLD = 10
const NOTE_MIN_W = 60

export interface NoteBox { w: number; h: number; lines: string[] }

/** 註解框尺寸：依換行拆行，寬容得下最長一行（含右上折角），空白時維持一行高的最小尺寸 */
export function noteBox(text: string, measure: Measure): NoteBox {
  const lines = text.split('\n')
  const widest = Math.max(...lines.map((l) => measure(l)))
  return {
    w: Math.max(NOTE_MIN_W, Math.ceil(widest) + NOTE_PAD * 2 + NOTE_FOLD),
    h: lines.length * LINE_H + NOTE_PAD * 2,
    lines,
  }
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

const inRange = (v: number, lo: number, len: number) => v >= lo && v <= lo + len

/**
 * 從框 r 連到第一個轉折點 q 的起始段（回傳邊框上的點，必要時再補一個轉折）：
 * q 在框的上下方向（含剛好落在上 / 下邊框線上）→ 從上 / 下邊框垂直出發；在左右方向 → 從左 / 右邊框水平出發；
 * 斜角 → 從較遠那一軸的側邊出發再轉直角
 */
function attach(r: Rect, q: Point): Point[] {
  const c = center(r)
  const sideX = q.x >= c.x ? r.x + r.w : r.x
  const sideY = q.y >= c.y ? r.y + r.h : r.y
  // 轉折點常會剛好落在邊框線（或其延長線）上：y 等於上 / 下邊界時不算「左右方向」，否則線會沿著邊框走
  const aboveOrBelow = q.y <= r.y || q.y >= r.y + r.h
  if (inRange(q.x, r.x, r.w) && aboveOrBelow) return [{ x: q.x, y: sideY }]
  if (q.y > r.y && q.y < r.y + r.h) return [{ x: sideX, y: q.y }]
  const gapX = Math.max(r.x - q.x, q.x - r.x - r.w)
  const gapY = Math.max(r.y - q.y, q.y - r.y - r.h)
  return gapX >= gapY
    ? [{ x: sideX, y: c.y }, { x: q.x, y: c.y }]
    : [{ x: c.x, y: sideY }, { x: c.x, y: q.y }]
}

/** 有轉折點時：中間轉折點固定，兩端每次依框的位置重算；沒有則沿用自動路徑 */
export function routeWith(a: Rect, b: Rect, bends?: Point[], self = false): Point[] {
  if (!bends?.length) return route(a, b, self)
  return [...attach(a, bends[0]), ...bends, ...attach(b, bends[bends.length - 1]).reverse()]
}

/** 去掉重複點與共線的中間點 */
export function simplify(pts: Point[]): Point[] {
  const out: Point[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    const prev = out[out.length - 2]
    if (prev && last && ((prev.x === last.x && last.x === p.x) || (prev.y === last.y && last.y === p.y))) out.pop()
    out.push(p)
  }
  return out
}

const SNAP = 6

/**
 * 把折線 pts 的第 i 段沿垂直方向平移 d，回傳要存的轉折點。
 * 邊框上的端點不存：首末段被拖時，移動後的端點成為轉折點，邊框上的新端點由 routeWith 重算（箭頭沿邊框滑動）。
 * 與隔一段的平行線段相差 SNAP 以內時對齊，讓多出來的小折角被合併掉
 */
export function moveSegment(pts: Point[], i: number, d: number): Point[] {
  const key = pts[i].y === pts[i + 1].y ? 'y' : 'x'
  let v = pts[i][key] + d
  for (const j of [i - 2, i + 2]) {
    const a = pts[j]
    const b = pts[j + 1]
    if (a && b && a[key] === b[key] && Math.abs(a[key] - v) <= SNAP) v = a[key]
  }
  const moved = pts.map((p, j) => (j === i || j === i + 1 ? { ...p, [key]: v } : p))
  return simplify(moved.slice(i === 0 ? 0 : 1, i === pts.length - 2 ? moved.length : -1))
}

// ---------- 套件框 ----------

export const PKG_PAD = 16
export const PKG_TAB_H = 22
const PKG_MIN_W = 160
const PKG_MIN_H = 100

/** 套件框 = {x, y, 最小尺寸} 與所有成員框（外擴邊距、上方留標籤高度）的聯集 */
export function packageBox(k: Package, rects: Map<Id, Rect>): Rect {
  let x1 = k.x
  let y1 = k.y
  let x2 = k.x + PKG_MIN_W
  let y2 = k.y + PKG_MIN_H
  for (const id of k.elementIds) {
    const r = rects.get(id)
    if (!r) continue
    x1 = Math.min(x1, r.x - PKG_PAD)
    y1 = Math.min(y1, r.y - PKG_PAD - PKG_TAB_H)
    x2 = Math.max(x2, r.x + r.w + PKG_PAD)
    y2 = Math.max(y2, r.y + r.h + PKG_PAD)
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/** 點落在哪個套件框內；重疊時取最上層（陣列後者） */
export function packageAt(p: Point, packages: Package[], rects: Map<Id, Rect>): Id | null {
  for (let i = packages.length - 1; i >= 0; i--) {
    const r = packageBox(packages[i], rects)
    if (inRange(p.x, r.x, r.w) && inRange(p.y, r.y, r.h)) return packages[i].id
  }
  return null
}

export const pathOf = (pts: Point[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')
