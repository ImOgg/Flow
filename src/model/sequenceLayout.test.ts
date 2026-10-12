import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { layoutSequence, lifelineTitle, SEQ, type SequenceLayout } from './sequenceLayout'
import type { InsertPos, Project } from './types'

const measure = (t: string) => t.length * 7

function setup() {
  const p = ops.emptyProject()
  const sd = ops.addDiagram(p, 'sequence', 'SD')
  const [a, b, c] = ['A', 'B', 'C'].map((n) => ops.addLifeline(p, sd, n))
  const msg = (from: string, to: string, text = 'm') => ops.insertMessage(p, sd, { from, to, text, type: 'sync' })
  const layout = () => layoutSequence(ops.getSequenceDiagram(p, sd), p, measure)
  return { p, sd, a, b, c, msg, layout }
}

describe('layoutSequence', () => {
  it('生命線等距排列，訊息依序往下、間距固定', () => {
    const { a, b, c, msg, layout } = setup()
    msg(a, b)
    msg(b, c)
    msg(c, a)
    const L = layout()
    expect(L.lifelines.map((l) => l.cx)).toEqual([0, 1, 2].map((i) => SEQ.MARGIN + i * L.col + L.col / 2))
    const ys = L.messages.map((m) => m.y)
    expect(ys[1] - ys[0]).toBe(SEQ.ROW)
    expect(ys[2] - ys[1]).toBe(SEQ.ROW)
    // 往左的訊息：從 C 區段左緣出發，到 A 第二層區段（A 已因第一則訊息有一段）的右緣
    expect(L.messages[2]).toMatchObject({
      x1: L.lifelines[2].cx - SEQ.ACT_W / 2,
      x2: L.lifelines[0].cx + SEQ.ACT_W / 2 + SEQ.ACT_STEP,
      self: false,
    })
    expect(L.lineBottom).toBeGreaterThan(ys[2])
  })

  it('自迴圈佔較高的列', () => {
    const { a, b, msg, layout } = setup()
    msg(a, a)
    msg(a, b)
    const L = layout()
    expect(L.messages[0].self).toBe(true)
    expect(L.messages[1].y - L.messages[0].y).toBe(SEQ.ROW + SEQ.SELF_H)
  })

  it('alt 多個 operand：各區段依序往下，分隔線在訊息之間', () => {
    const { p, sd, a, b, msg, layout } = setup()
    const m1 = msg(a, b)
    const alt = ops.wrapInFragment(p, sd, [m1], 'alt', 'ok')!
    ops.addOperand(p, sd, alt, 'else')
    ops.insertMessage(p, sd, { from: b, to: a, text: 'e', type: 'return' }, { container: { fragmentId: alt, operand: 1 }, index: 0 })
    const L = layout()
    const f = L.fragments[0]
    expect(f.operands.map((o) => o.guard)).toEqual(['ok', 'else'])
    const [y1, y2] = L.messages.map((m) => m.y)
    expect(f.y1).toBeLessThan(y1)
    expect(f.operands[1].y).toBeGreaterThan(y1)
    expect(f.operands[1].y).toBeLessThan(y2)
    expect(f.y2).toBeGreaterThan(y2)
    // 只涵蓋 A、B 兩欄
    expect(f.x2).toBeLessThan(L.lifelines[2].cx)
  })

  it('loop 內含 alt：alt 完整位於 loop 內', () => {
    const { p, sd, a, b, c, msg, layout } = setup()
    const m1 = msg(a, c)
    const m2 = msg(a, b)
    const alt = ops.wrapInFragment(p, sd, [m2], 'alt', 'x')!
    ops.wrapInFragment(p, sd, [m1, alt], 'loop', 'n')
    const L = layout()
    const loop = L.fragments.find((f) => f.type === 'loop')!
    const inner = L.fragments.find((f) => f.type === 'alt')!
    expect(inner.depth).toBe(loop.depth + 1)
    expect(inner.x1).toBeGreaterThan(loop.x1)
    expect(inner.x2).toBeLessThan(loop.x2)
    expect(inner.y1).toBeGreaterThan(loop.y1)
    expect(inner.y2).toBeLessThan(loop.y2)
    // 內層只涉及 A、B，所以比外層（A~C）窄
    expect(inner.x2).toBeLessThan(L.lifelines[2].cx)
  })

  it('空片段涵蓋全部生命線', () => {
    const { p, sd, a, b, msg, layout } = setup()
    const m = msg(a, b)
    const f = ops.wrapInFragment(p, sd, [m], 'opt')!
    ops.deleteItem(p, sd, m)
    ops.getSequenceDiagram(p, sd).items.push({ kind: 'fragment', id: 'e', type: 'opt', operands: [{ guard: '', items: [] }] })
    const L = layout()
    const empty = L.fragments.find((x) => x.id === 'e')!
    expect(empty.x1).toBeLessThan(L.lifelines[0].cx)
    expect(empty.x2).toBeGreaterThan(L.lifelines[2].cx)
    expect(f).toBeTruthy()
  })

  it('slots 涵蓋每個容器的頭尾，且依 y 遞增', () => {
    const { p, sd, a, b, msg, layout } = setup()
    const m1 = msg(a, b)
    msg(a, b)
    const f = ops.wrapInFragment(p, sd, [m1], 'loop')!
    const L = layout()
    const keys = L.slots.map((s) => `${s.pos.container?.fragmentId === f ? 'f' : 'top'}:${s.pos.index}`)
    expect(keys).toEqual(['top:0', 'f:0', 'f:1', 'top:1', 'top:2'])
    const ys = L.slots.map((s) => s.y)
    expect([...ys].sort((x, y) => x - y)).toEqual(ys)
  })

  it('訊息文字很長時加大欄寬', () => {
    const { a, b, msg, layout } = setup()
    msg(a, b, 'x'.repeat(60))
    expect(layout().col).toBeGreaterThan(60 * 7)
  })
})

describe('activations', () => {
  const ret = (p: Project, sd: string, from: string, to: string, pos?: InsertPos) =>
    ops.insertMessage(p, sd, { from, to, text: 'r', type: 'return' }, pos)
  const of = (L: SequenceLayout, id: string) =>
    L.activations.filter((a) => a.lifelineId === id).map(({ depth, y1, y2 }) => ({ depth, y1, y2 }))

  it('一來一回：接收端從呼叫到回傳，發送端從呼叫開始', () => {
    const { p, sd, a, b, msg, layout } = setup()
    msg(a, b)
    ret(p, sd, b, a)
    const L = layout()
    const [m1, m2] = L.messages
    expect(of(L, b)).toEqual([{ depth: 0, y1: m1.y, y2: m2.y }])
    expect(of(L, a)).toEqual([{ depth: 0, y1: m1.y, y2: m2.y + SEQ.ACT_TAIL }])
    // 箭頭連到區段邊緣
    expect(m1.x1).toBe(L.lifelines[0].cx + SEQ.ACT_W / 2)
    expect(m1.x2).toBe(L.lifelines[1].cx - SEQ.ACT_W / 2)
    expect(m2.x1).toBe(L.lifelines[1].cx - SEQ.ACT_W / 2)
  })

  it('巢狀呼叫：C 的區段落在 B 之內，B 結束在 r2', () => {
    const { p, sd, a, b, c, msg, layout } = setup()
    msg(a, b)
    msg(b, c)
    ret(p, sd, c, b)
    ret(p, sd, b, a)
    const L = layout()
    const [bAct] = of(L, b)
    const [cAct] = of(L, c)
    expect(bAct.y2).toBe(L.messages[3].y)
    expect(cAct.y1).toBeGreaterThan(bAct.y1)
    expect(cAct.y2).toBeLessThan(bAct.y2)
  })

  it('自呼叫：往右錯開一層，自迴圈回到它的邊緣', () => {
    const { p, sd, a, b, msg, layout } = setup()
    msg(a, b)
    msg(b, b)
    ret(p, sd, b, a)
    const L = layout()
    const acts = of(L, b)
    expect(acts.map((x) => x.depth)).toEqual([0, 1])
    const self = L.messages[1]
    expect(acts[1].y1).toBe(self.y + SEQ.SELF_H)
    const inner = L.activations.find((x) => x.lifelineId === b && x.depth === 1)!
    expect(inner.x).toBe(L.lifelines[1].cx - SEQ.ACT_W / 2 + SEQ.ACT_STEP)
    expect(self.x2).toBe(inner.x + SEQ.ACT_W)
    // r 回傳彈出的是內層（自呼叫）區段，外層延伸到最後相關訊息
    expect(acts[1].y2).toBe(L.messages[2].y)
    expect(acts[0].y2).toBe(L.messages[2].y + SEQ.ACT_TAIL)
  })

  it('沒有回傳：延伸到該生命線最後一則相關訊息下方', () => {
    const { a, b, c, msg, layout } = setup()
    msg(a, b)
    msg(a, c)
    msg(c, b)
    const L = layout()
    const [bAct] = of(L, b)
    expect(bAct.y2).toBe(L.messages[2].y + SEQ.ACT_TAIL)
  })

  it('不成對的回傳被忽略', () => {
    const { p, sd, a, b, layout } = setup()
    ret(p, sd, b, a)
    const L = layout()
    expect(L.activations).toEqual([])
    expect(L.messages[0]).toMatchObject({ x1: L.lifelines[1].cx, x2: L.lifelines[0].cx })
  })

  it('跨 loop 片段配對：loop 內呼叫、loop 外回傳', () => {
    const { p, sd, a, b, msg, layout } = setup()
    const m = msg(a, b)
    ops.wrapInFragment(p, sd, [m], 'loop')
    ret(p, sd, b, a)
    const L = layout()
    expect(of(L, b)).toEqual([{ depth: 0, y1: L.messages[0].y, y2: L.messages[1].y }])
  })
})

describe('Note 列', () => {
  const note = (p: Project, sd: string, over: string[], text: string, pos?: InsertPos) =>
    ops.insertNote(p, sd, over, text, pos)

  it('三行 Note 撐開列高，下方訊息往下移', () => {
    const a1 = setup()
    a1.msg(a1.a, a1.b)
    note(a1.p, a1.sd, [a1.a], 'x')
    a1.msg(a1.a, a1.b)
    const a3 = setup()
    a3.msg(a3.a, a3.b)
    note(a3.p, a3.sd, [a3.a], '1\n2\n3')
    a3.msg(a3.a, a3.b)
    const L1 = a1.layout()
    const L3 = a3.layout()
    expect(L3.notes[0].h).toBeGreaterThan(L1.notes[0].h)
    expect(L3.messages[1].y - L1.messages[1].y).toBe(L3.notes[0].h - L1.notes[0].h)
    expect(L3.messages[1].y).toBeGreaterThan(L3.notes[0].y + L3.notes[0].h)
  })

  it('水平範圍：單一生命線置中；多條從最左到最右', () => {
    const { p, sd, a, b, c, layout } = setup()
    note(p, sd, [b], 'x')
    note(p, sd, [c, a], 'x')
    const L = layout()
    const [one, many] = L.notes
    expect(one.x + one.w / 2).toBe(L.lifelines[1].cx)
    expect(many.x).toBeLessThan(L.lifelines[0].cx)
    expect(many.x + many.w).toBeGreaterThan(L.lifelines[2].cx)
  })

  it('Note 在片段內時片段寬度涵蓋它', () => {
    const { p, sd, a, c, msg, layout } = setup()
    const m = msg(a, a)
    const f = ops.wrapInFragment(p, sd, [m], 'opt')!
    note(p, sd, [c], 'x', { container: { fragmentId: f, operand: 0 }, index: 1 })
    const L = layout()
    expect(L.fragments[0].x2).toBeGreaterThan(L.lifelines[2].cx)
  })
})

describe('lifelineTitle', () => {
  it('綁定類別：名稱: 類別；名稱空白則 :類別；未綁定只顯示名稱', () => {
    const p = ops.emptyProject()
    const el = ops.addElement(p, 'class', 'AuthService')
    expect(lifelineTitle({ id: '1', name: '', elementId: el }, p)).toBe(':AuthService')
    expect(lifelineTitle({ id: '1', name: 'auth', elementId: el }, p)).toBe('auth: AuthService')
    expect(lifelineTitle({ id: '1', name: 'DB' }, p)).toBe('DB')
  })
})
