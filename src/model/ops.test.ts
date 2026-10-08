import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import type { Message, Project, SeqItem } from './types'

function setup() {
  const p = ops.emptyProject()
  const user = ops.addElement(p, 'class', 'User')
  const order = ops.addElement(p, 'class', 'Order')
  const cd1 = ops.addDiagram(p, 'class', 'CD1')
  const cd2 = ops.addDiagram(p, 'class', 'CD2')
  const sd = ops.addDiagram(p, 'sequence', 'SD')
  return { p, user, order, cd1, cd2, sd }
}

const seq = (p: Project, id: string) => ops.getSequenceDiagram(p, id)
const cls = (p: Project, id: string) => ops.getClassDiagram(p, id)
/** 依序列出訊息文字，片段以 type( ... | ... ) 表示，方便比對結構 */
const shape = (items: SeqItem[]): string =>
  items
    .map((it) =>
      it.kind === 'message' ? it.text : `${it.type}(${it.operands.map((o) => shape(o.items)).join('|')})`,
    )
    .join(' ')

describe('分類元素', () => {
  it('新增、改名、成員增刪改', () => {
    const { p, user } = setup()
    ops.renameElement(p, user, 'Member')
    ops.addMember(p, user, 'attributes', { visibility: '-', name: 'name', type: 'string' })
    ops.addMember(p, user, 'attributes', { visibility: '+', name: 'id', type: 'int' }, 0)
    ops.addMember(p, user, 'operations', { visibility: '+', name: 'login', params: '', returnType: 'bool' })
    ops.updateMember(p, user, 'attributes', 1, { visibility: '#', name: 'nick', type: 'string' })
    ops.removeMember(p, user, 'attributes', 0)
    const el = p.model.elements[user]
    expect(el.name).toBe('Member')
    expect(el.attributes).toEqual([{ visibility: '#', name: 'nick', type: 'string' }])
    expect(el.operations.map((o) => o.name)).toEqual(['login'])
  })

  it('預設名稱依種類', () => {
    const p = ops.emptyProject()
    expect(p.model.elements[ops.addElement(p, 'interface')].name).toBe('Interface')
  })
})

describe('關係與連鎖刪除', () => {
  it('刪除出現在兩張類別圖與一張循序圖的元素', () => {
    const { p, user, order, cd1, cd2, sd } = setup()
    for (const d of [cd1, cd2]) {
      ops.addNode(p, d, user, 0, 0)
      ops.addNode(p, d, order, 200, 0)
    }
    const rel = ops.addRelation(p, 'association', order, user, cd1)
    const lf = ops.addLifeline(p, sd, '', user)

    ops.deleteElement(p, user)

    expect(p.model.elements[user]).toBeUndefined()
    expect(p.model.relations[rel]).toBeUndefined()
    for (const d of [cd1, cd2]) {
      expect(cls(p, d).nodes.map((n) => n.elementId)).toEqual([order])
      expect(cls(p, d).edges).toEqual([])
    }
    const l = seq(p, sd).lifelines.find((x) => x.id === lf)!
    expect(l).toBeDefined()
    expect(l.elementId).toBeUndefined()
  })

  it('刪除關係會移除所有圖上的邊', () => {
    const { p, user, order, cd1, cd2 } = setup()
    for (const d of [cd1, cd2]) {
      ops.addNode(p, d, user, 0, 0)
      ops.addNode(p, d, order, 200, 0)
    }
    const rel = ops.addRelation(p, 'generalization', order, user, cd1)
    ops.addNode(p, cd2, order, 0, 0) // 已存在：不重複
    expect(cls(p, cd2).nodes).toHaveLength(2)
    ops.deleteRelation(p, rel)
    expect(cls(p, cd1).edges).toEqual([])
  })
})

describe('圖操作', () => {
  it('刪除圖不影響模型', () => {
    const { p, user, cd1 } = setup()
    ops.addNode(p, cd1, user, 0, 0)
    ops.deleteDiagram(p, cd1)
    expect(p.diagrams.some((d) => d.id === cd1)).toBe(false)
    expect(p.model.elements[user]).toBeDefined()
  })

  it('自動顯示既有關係', () => {
    const { p, user, order, cd1, cd2 } = setup()
    ops.addNode(p, cd1, user, 0, 0)
    ops.addNode(p, cd1, order, 200, 0)
    const rel = ops.addRelation(p, 'association', order, user, cd1)
    ops.addNode(p, cd2, user, 0, 0)
    expect(cls(p, cd2).edges).toEqual([])
    ops.addNode(p, cd2, order, 200, 0)
    expect(cls(p, cd2).edges).toEqual([{ relationId: rel }])
  })

  it('從圖移除只動該圖，並連帶移除接在節點上的邊', () => {
    const { p, user, order, cd1, cd2 } = setup()
    for (const d of [cd1, cd2]) {
      ops.addNode(p, d, user, 0, 0)
      ops.addNode(p, d, order, 200, 0)
    }
    const rel = ops.addRelation(p, 'association', order, user, cd1)
    ops.addNode(p, cd2, user, 0, 0)
    ops.removeFromDiagram(p, cd1, [user])
    expect(cls(p, cd1).nodes.map((n) => n.elementId)).toEqual([order])
    expect(cls(p, cd1).edges).toEqual([])
    expect(p.model.elements[user]).toBeDefined()
    expect(p.model.relations[rel]).toBeDefined()
    expect(cls(p, cd2).nodes).toHaveLength(2)
  })

  it('只移除邊', () => {
    const { p, user, order, cd1 } = setup()
    ops.addNode(p, cd1, user, 0, 0)
    ops.addNode(p, cd1, order, 200, 0)
    const rel = ops.addRelation(p, 'association', order, user, cd1)
    ops.removeFromDiagram(p, cd1, [], [rel])
    expect(cls(p, cd1).edges).toEqual([])
    expect(cls(p, cd1).nodes).toHaveLength(2)
  })

  it('移動多個節點與改名', () => {
    const { p, user, order, cd1 } = setup()
    ops.addNode(p, cd1, user, 0, 0)
    ops.addNode(p, cd1, order, 100, 50)
    ops.moveNodes(p, cd1, [user, order], 10, -5)
    expect(cls(p, cd1).nodes.map((n) => [n.x, n.y])).toEqual([[10, -5], [110, 45]])
    ops.renameDiagram(p, cd1, 'X')
    expect(cls(p, cd1).name).toBe('X')
  })
})

describe('循序圖', () => {
  function seqSetup() {
    const s = setup()
    const a = ops.addLifeline(s.p, s.sd, 'A')
    const b = ops.addLifeline(s.p, s.sd, 'B')
    const msg = (text: string, pos?: Parameters<typeof ops.insertMessage>[3]) =>
      ops.insertMessage(s.p, s.sd, { from: a, to: b, text, type: 'sync' }, pos)
    return { ...s, a, b, msg }
  }

  it('生命線改名、重排、刪除連帶刪除訊息', () => {
    const { p, sd, a, b, msg } = seqSetup()
    const c = ops.addLifeline(p, sd, 'C')
    ops.renameLifeline(p, sd, a, 'Client')
    ops.moveLifeline(p, sd, c, 0)
    expect(seq(p, sd).lifelines.map((l) => l.name)).toEqual(['C', 'Client', 'B'])
    msg('m1')
    const m2 = msg('m2')
    ops.wrapInFragment(p, sd, [m2], 'loop')
    ops.insertMessage(p, sd, { from: c, to: c, text: 'self', type: 'sync' })
    ops.deleteLifeline(p, sd, b)
    expect(shape(seq(p, sd).items)).toBe('loop() self')
    expect(seq(p, sd).lifelines.map((l) => l.id)).toEqual([c, a])
  })

  it('ensureLifeline 依名稱或綁定類別名比對，找不到則新增', () => {
    const { p, sd, user, a } = seqSetup()
    const bound = ops.addLifeline(p, sd, '', user)
    expect(ops.ensureLifeline(p, sd, 'A')).toBe(a)
    expect(ops.ensureLifeline(p, sd, 'User')).toBe(bound)
    const db = ops.ensureLifeline(p, sd, 'DB')
    expect(seq(p, sd).lifelines.at(-1)!.id).toBe(db)
  })

  it('ensureLifeline 接受「名稱: 類別」寫法，新增時綁定既有類別', () => {
    const { p, sd, user } = seqSetup()
    const a = ops.addLifeline(p, sd, 'a', user)
    const anon = ops.addLifeline(p, sd, '', user)
    expect(ops.ensureLifeline(p, sd, 'a: User')).toBe(a)
    expect(ops.ensureLifeline(p, sd, ':User')).toBe(anon)
    const b = ops.ensureLifeline(p, sd, 'b: User')
    expect(seq(p, sd).lifelines.find((l) => l.id === b)).toMatchObject({ name: 'b', elementId: user })
    const c = ops.ensureLifeline(p, sd, 'c: Nope')
    expect(seq(p, sd).lifelines.find((l) => l.id === c)).toEqual({ id: c, name: 'c' })
  })

  it('插入、刪除、移動訊息', () => {
    const { p, sd, msg } = seqSetup()
    const m1 = msg('m1')
    msg('m2')
    msg('m3')
    const d = seq(p, sd)
    msg('new', ops.posAfter(d, m1)!)
    expect(shape(d.items)).toBe('m1 new m2 m3')
    ops.moveItem(p, sd, m1, { container: null, index: 3 })
    expect(shape(d.items)).toBe('new m2 m1 m3')
    ops.deleteItem(p, sd, m1)
    expect(shape(d.items)).toBe('new m2 m3')
    const m3 = d.items[2] as Message
    ops.updateMessage(p, sd, m3.id, { text: 'renamed', type: 'return' })
    expect(d.items[2]).toMatchObject({ text: 'renamed', type: 'return' })
  })

  it('巢狀片段內插入，解除片段後順序不變', () => {
    const { p, sd, msg } = seqSetup()
    const m1 = msg('m1')
    const m2 = msg('m2')
    const m3 = msg('m3')
    msg('m4')
    const alt = ops.wrapInFragment(p, sd, [m2, m3], 'alt', 'ok')!
    ops.addOperand(p, sd, alt)
    const loop = ops.wrapInFragment(p, sd, [m1, alt], 'loop', 'retry < 3')!
    const d = seq(p, sd)
    expect(shape(d.items)).toBe('loop(m1 alt(m2 m3|)) m4')

    msg('x', ops.posAfter(d, m2)!)
    msg('e', { container: { fragmentId: alt, operand: 1 }, index: 0 })
    expect(shape(d.items)).toBe('loop(m1 alt(m2 x m3|e)) m4')

    ops.setGuard(p, sd, alt, 1, 'else')
    ops.deleteItem(p, sd, alt)
    expect(shape(d.items)).toBe('loop(m1 m2 x m3 e) m4')
    ops.deleteItem(p, sd, loop)
    expect(shape(d.items)).toBe('m1 m2 x m3 e m4')
  })

  it('包成片段只接受同一層連續項目', () => {
    const { p, sd, msg } = seqSetup()
    const m1 = msg('m1')
    msg('m2')
    const m3 = msg('m3')
    expect(ops.wrapInFragment(p, sd, [m1, m3], 'opt')).toBeNull()
    const f = ops.wrapInFragment(p, sd, [m3], 'opt')!
    const inner = (seq(p, sd).items[2] as { operands: { items: SeqItem[] }[] }).operands[0].items[0]
    expect(ops.wrapInFragment(p, sd, [m1, inner.id], 'opt')).toBeNull()
    expect(f).toBeTruthy()
  })

  it('片段不能移進自己裡面', () => {
    const { p, sd, msg } = seqSetup()
    const m1 = msg('m1')
    const f = ops.wrapInFragment(p, sd, [m1], 'loop')!
    ops.moveItem(p, sd, f, { container: { fragmentId: f, operand: 0 }, index: 0 })
    expect(shape(seq(p, sd).items)).toBe('loop(m1)')
  })

  it('訊息可移進片段', () => {
    const { p, sd, msg } = seqSetup()
    const m1 = msg('m1')
    const m2 = msg('m2')
    const f = ops.wrapInFragment(p, sd, [m1], 'loop')!
    ops.moveItem(p, sd, m2, { container: { fragmentId: f, operand: 0 }, index: 0 })
    expect(shape(seq(p, sd).items)).toBe('loop(m2 m1)')
  })
})
