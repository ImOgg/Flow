// 循序圖排版：座標完全由生命線順序與訊息順序推算，不存在檔案裡
import type { Measure } from './classLayout'
import type { FragmentType, Id, InsertPos, Lifeline, Message, Project, SeqItem, SequenceDiagram } from './types'

export const SEQ = {
  MARGIN: 40,
  MIN_COL: 140,
  HEAD_TOP: 20,
  HEAD_H: 36,
  ROW: 36,
  SELF_H: 20,
  FRAG_PAD: 10,
  INSET: 10,
} as const

export interface LifelineBox { id: Id; title: string; cx: number; headW: number }
export interface MessageBox {
  id: Id
  /** 箭頭的 y；自迴圈則為出發點，回到 y + SELF_H */
  y: number
  x1: number
  x2: number
  self: boolean
  type: Message['type']
  text: string
}
export interface OperandBox { index: number; y: number; guard: string }
export interface FragmentBox {
  id: Id
  type: FragmentType
  depth: number
  x1: number
  x2: number
  y1: number
  y2: number
  operands: OperandBox[]
}
/** 項目之間可插入的位置，用於拖曳重排 */
export interface Slot { y: number; pos: InsertPos }

export interface SequenceLayout {
  col: number
  lifelines: LifelineBox[]
  messages: MessageBox[]
  fragments: FragmentBox[]
  slots: Slot[]
  lineTop: number
  lineBottom: number
  width: number
  height: number
}

/** 綁定類別時顯示 `名稱: 類別名`（名稱可空），否則顯示名稱 */
export function lifelineTitle(l: Lifeline, p: Project): string {
  const cls = l.elementId ? p.model.elements[l.elementId]?.name : undefined
  return cls === undefined ? l.name : `${l.name}: ${cls}`.replace(/^: /, ':')
}

export function layoutSequence(d: SequenceDiagram, p: Project, measure: Measure): SequenceLayout {
  const { MARGIN, MIN_COL, HEAD_TOP, HEAD_H, ROW, SELF_H, FRAG_PAD, INSET } = SEQ
  const titles = d.lifelines.map((l) => lifelineTitle(l, p))
  const idx = new Map(d.lifelines.map((l, i) => [l.id, i]))

  // 欄寬：容得下最長標題，以及每則訊息文字平均分攤到跨越的欄數
  let col: number = MIN_COL
  for (const t of titles) col = Math.max(col, measure(t, true) + 40)
  const eachMessage = (items: SeqItem[], f: (m: Message) => void) => {
    for (const it of items) {
      if (it.kind === 'message') f(it)
      else for (const o of it.operands) eachMessage(o.items, f)
    }
  }
  eachMessage(d.items, (m) => {
    const span = Math.abs((idx.get(m.to) ?? 0) - (idx.get(m.from) ?? 0)) || 1
    col = Math.max(col, measure(m.text) / span + 30)
  })
  const cx = (i: number) => MARGIN + i * col + col / 2

  const messages: MessageBox[] = []
  const fragments: FragmentBox[] = []
  const slots: Slot[] = []
  let cursor = HEAD_TOP + HEAD_H + 20

  /** 回傳這段項目涉及的生命線索引範圍 */
  const walk = (items: SeqItem[], container: InsertPos['container'], depth: number): [number, number] => {
    let lo = Infinity
    let hi = -Infinity
    items.forEach((it, i) => {
      slots.push({ y: cursor, pos: { container, index: i } })
      if (it.kind === 'message') {
        const f = idx.get(it.from)
        const t = idx.get(it.to)
        if (f === undefined || t === undefined) return
        const self = f === t
        const y = cursor + 24
        messages.push({ id: it.id, y, x1: cx(f), x2: cx(t), self, type: it.type, text: it.text })
        cursor += ROW + (self ? SELF_H : 0)
        lo = Math.min(lo, f, t)
        hi = Math.max(hi, f, t)
        return
      }
      const box: FragmentBox = { id: it.id, type: it.type, depth, x1: 0, x2: 0, y1: cursor, y2: 0, operands: [] }
      fragments.push(box)
      cursor += ROW
      let flo = Infinity
      let fhi = -Infinity
      it.operands.forEach((o, oi) => {
        if (oi > 0) {
          box.operands.push({ index: oi, y: cursor, guard: o.guard })
          cursor += ROW
        } else {
          box.operands.push({ index: 0, y: box.y1, guard: o.guard })
        }
        const [a, b] = walk(o.items, { fragmentId: it.id, operand: oi }, depth + 1)
        flo = Math.min(flo, a)
        fhi = Math.max(fhi, b)
      })
      cursor += FRAG_PAD
      box.y2 = cursor
      cursor += FRAG_PAD
      // 空片段涵蓋全部生命線
      if (flo > fhi) [flo, fhi] = [0, Math.max(0, d.lifelines.length - 1)]
      box.x1 = MARGIN + flo * col + 8 + depth * INSET
      box.x2 = MARGIN + (fhi + 1) * col - 8 - depth * INSET
      lo = Math.min(lo, flo)
      hi = Math.max(hi, fhi)
    })
    slots.push({ y: cursor, pos: { container, index: items.length } })
    return [lo, hi]
  }
  walk(d.items, null, 0)

  const lineBottom = cursor + 20
  return {
    col,
    lifelines: d.lifelines.map((l, i) => ({
      id: l.id,
      title: titles[i],
      cx: cx(i),
      headW: Math.min(col - 16, measure(titles[i], true) + 24),
    })),
    messages,
    fragments,
    slots,
    lineTop: HEAD_TOP + HEAD_H,
    lineBottom,
    width: MARGIN * 2 + Math.max(1, d.lifelines.length) * col,
    height: lineBottom + MARGIN,
  }
}
