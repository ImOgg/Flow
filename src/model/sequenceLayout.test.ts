import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { layoutSequence, lifelineTitle, SEQ } from './sequenceLayout'

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
    expect(L.messages[2]).toMatchObject({ x1: L.lifelines[2].cx, x2: L.lifelines[0].cx, self: false })
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

describe('lifelineTitle', () => {
  it('綁定類別：名稱: 類別；名稱空白則 :類別；未綁定只顯示名稱', () => {
    const p = ops.emptyProject()
    const el = ops.addElement(p, 'class', 'AuthService')
    expect(lifelineTitle({ id: '1', name: '', elementId: el }, p)).toBe(':AuthService')
    expect(lifelineTitle({ id: '1', name: 'auth', elementId: el }, p)).toBe('auth: AuthService')
    expect(lifelineTitle({ id: '1', name: 'DB' }, p)).toBe('DB')
  })
})
