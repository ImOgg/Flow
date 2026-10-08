// 循序圖排版：座標完全由生命線順序與訊息順序推算，不存在檔案裡
import { noteBox, type Measure } from './classLayout'
import type { FragmentType, Id, InsertPos, Lifeline, Message, Project, SeqItem, SeqNote, SequenceDiagram } from './types'

export const SEQ = {
  MARGIN: 40,
  MIN_COL: 140,
  HEAD_TOP: 20,
  HEAD_H: 36,
  ROW: 36,
  SELF_H: 20,
  FRAG_PAD: 10,
  INSET: 10,
  /** Note 列上下留白 */
  NOTE_GAP: 6,
  /** 執行區段寬、每深一層往右錯開的距離、未關閉時的下緣 */
  ACT_W: 10,
  ACT_STEP: 5,
  ACT_TAIL: 12,
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
export interface NoteRow { id: Id; x: number; y: number; w: number; h: number; lines: string[] }
/** 執行區段：x 為左緣 */
export interface Activation { lifelineId: Id; depth: number; x: number; y1: number; y2: number }
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
  notes: NoteRow[]
  activations: Activation[]
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
  const { MARGIN, MIN_COL, HEAD_TOP, HEAD_H, ROW, SELF_H, FRAG_PAD, INSET, NOTE_GAP } = SEQ
  const titles = d.lifelines.map((l) => lifelineTitle(l, p))
  const idx = new Map(d.lifelines.map((l, i) => [l.id, i]))

  // 欄寬：容得下最長標題，以及每則訊息文字平均分攤到跨越的欄數
  let col: number = MIN_COL
  for (const t of titles) col = Math.max(col, measure(t, true) + 40)
  const noteSpan = (n: SeqNote): [number, number] | null => {
    const is = n.over.flatMap((id) => idx.get(id) ?? [])
    return is.length ? [Math.min(...is), Math.max(...is)] : null
  }
  const eachLeaf = (items: SeqItem[], f: (m: Message | SeqNote) => void) => {
    for (const it of items) {
      if (it.kind === 'fragment') for (const o of it.operands) eachLeaf(o.items, f)
      else f(it)
    }
  }
  eachLeaf(d.items, (it) => {
    if (it.kind === 'message') {
      const span = Math.abs((idx.get(it.to) ?? 0) - (idx.get(it.from) ?? 0)) || 1
      col = Math.max(col, measure(it.text) / span + 30)
      return
    }
    const s = noteSpan(it)
    if (s) col = Math.max(col, (noteBox(it.text, measure).w + 20) / (s[1] - s[0] + 1))
  })
  const cx = (i: number) => MARGIN + i * col + col / 2

  const messages: MessageBox[] = []
  const notes: NoteRow[] = []
  /** 依上下順序記錄訊息的兩端，供 activation 掃描 */
  const flat: { box: MessageBox; from: Id; to: Id }[] = []
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
        const box: MessageBox = { id: it.id, y, x1: cx(f), x2: cx(t), self, type: it.type, text: it.text }
        messages.push(box)
        flat.push({ box, from: it.from, to: it.to })
        cursor += ROW + (self ? SELF_H : 0)
        lo = Math.min(lo, f, t)
        hi = Math.max(hi, f, t)
        return
      }
      if (it.kind === 'note') {
        const s = noteSpan(it)
        if (!s) return
        const nb = noteBox(it.text, measure)
        const mid = (cx(s[0]) + cx(s[1])) / 2
        const w = Math.max(nb.w, cx(s[1]) - cx(s[0]) + 60)
        notes.push({ id: it.id, x: mid - w / 2, y: cursor + NOTE_GAP, w, h: nb.h, lines: nb.lines })
        cursor += Math.max(ROW, nb.h + NOTE_GAP * 2)
        lo = Math.min(lo, s[0])
        hi = Math.max(hi, s[1])
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
  const activations = activate(flat, new Map(d.lifelines.map((l, i) => [l.id, cx(i)])))

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
    notes,
    activations,
    fragments,
    slots,
    lineTop: HEAD_TOP + HEAD_H,
    lineBottom,
    width: MARGIN * 2 + Math.max(1, d.lifelines.length) * col,
    height: lineBottom + MARGIN,
  }
}

/**
 * 依訊息上下順序計算執行區段（忽略片段邊界），並把訊息端點改到區段邊緣。
 * 每條生命線一個堆疊：同步訊息讓接收端推入一段（發送端沒有時先替它開一段）；回傳訊息彈出發送端最上層
 */
function activate(flat: { box: MessageBox; from: Id; to: Id }[], cxOf: Map<Id, number>): Activation[] {
  const { ACT_W, ACT_STEP, ACT_TAIL, SELF_H } = SEQ
  const all: Activation[] = []
  const stacks = new Map<Id, Activation[]>()
  const lastY = new Map<Id, number>()
  const stack = (id: Id) => stacks.get(id) ?? stacks.set(id, []).get(id)!
  const left = (id: Id, depth: number) => cxOf.get(id)! - ACT_W / 2 + depth * ACT_STEP
  const open = (id: Id, y: number) => {
    const s = stack(id)
    const a: Activation = { lifelineId: id, depth: s.length, x: left(id, s.length), y1: y, y2: NaN }
    s.push(a)
    all.push(a)
  }
  /** 生命線目前最上層區段朝向 toRight 的邊緣；沒有區段時為生命線中心 */
  const edge = (id: Id, toRight: boolean) => {
    const d = stack(id).length - 1
    return d < 0 ? cxOf.get(id)! : left(id, d) + (toRight ? ACT_W : 0)
  }

  for (const { box, from, to } of flat) {
    const right = box.self || cxOf.get(to)! > cxOf.get(from)!
    const back = box.self ? box.y + SELF_H : box.y
    if (box.type === 'sync') {
      if (!stack(from).length) open(from, box.y)
      box.x1 = edge(from, right)
      open(to, back)
      box.x2 = edge(to, box.self || !right)
    } else {
      box.x1 = edge(from, right)
      const top = stack(from).pop()
      if (top) top.y2 = box.y
      box.x2 = edge(to, box.self || !right)
    }
    lastY.set(from, box.y)
    lastY.set(to, back)
  }
  for (const a of all) if (Number.isNaN(a.y2)) a.y2 = Math.max(a.y1, lastY.get(a.lifelineId)!) + ACT_TAIL
  return all
}
