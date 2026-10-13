import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useProjectStore } from '../store/project'
import { flowNodeBox, nextNodePos } from './flowLayout'
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
      it.kind === 'message' ? it.text : it.kind === 'note' ? `note(${it.text})` : `${it.type}(${it.operands.map((o) => shape(o.items)).join('|')})`,
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

  it('含流程圖的專案執行 deleteElement 不出錯', () => {
    const { p, user } = setup()
    const fc = ops.addDiagram(p, 'flowchart', 'FC')
    expect(() => ops.deleteElement(p, user)).not.toThrow()
    expect(ops.getFlowchart(p, fc)).toMatchObject({ nodes: [], edges: [], subgraphs: [] })
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
    ops.removeFromDiagram(p, cd1, [rel])
    expect(cls(p, cd1).edges).toEqual([])
    expect(cls(p, cd1).nodes).toHaveLength(2)
  })

  it('移動多個節點與改名', () => {
    const { p, user, order, cd1 } = setup()
    ops.addNode(p, cd1, user, 0, 0)
    ops.addNode(p, cd1, order, 100, 50)
    ops.moveItems(p, cd1, [user, order], 10, -5)
    expect(cls(p, cd1).nodes.map((n) => [n.x, n.y])).toEqual([[10, -5], [110, 45]])
    ops.renameDiagram(p, cd1, 'X')
    expect(cls(p, cd1).name).toBe('X')
  })
})

describe('類別圖 Note', () => {
  function withNote() {
    const s = setup()
    for (const d of [s.cd1, s.cd2]) {
      ops.addNode(s.p, d, s.user, 0, 0)
      ops.addNode(s.p, d, s.order, 200, 0)
    }
    const n1 = ops.addNote(s.p, s.cd1, 0, 200)
    const n2 = ops.addNote(s.p, s.cd2, 0, 200)
    for (const [d, n] of [[s.cd1, n1], [s.cd2, n2]]) {
      ops.linkNote(s.p, d, n, s.user)
      ops.linkNote(s.p, d, n, s.order)
      ops.linkNote(s.p, d, n, s.user) // 重複連結不重複記錄
    }
    return { ...s, n1, n2 }
  }

  it('新增、改文字、連結；不能連到圖上沒有的元素', () => {
    const { p, cd1, n1, user, order } = withNote()
    ops.setNoteText(p, cd1, n1, 'a')
    ops.linkNote(p, cd1, n1, 'ghost')
    expect(cls(p, cd1).notes).toEqual([{ id: n1, text: 'a', x: 0, y: 200, links: [user, order] }])
  })

  it('取消連結與刪除 Note', () => {
    const { p, cd1, n1, user, order } = withNote()
    ops.removeFromDiagram(p, cd1, [ops.noteLinkId(n1, user)])
    expect(cls(p, cd1).notes[0].links).toEqual([order])
    expect(cls(p, cd1).nodes).toHaveLength(2)
    ops.removeFromDiagram(p, cd1, [n1])
    expect(cls(p, cd1).notes).toEqual([])
  })

  it('連結的元素從圖移除後連結消失、Note 保留', () => {
    const { p, cd1, cd2, user, order } = withNote()
    ops.removeFromDiagram(p, cd1, [user])
    expect(cls(p, cd1).notes[0].links).toEqual([order])
    expect(cls(p, cd2).notes[0].links).toEqual([user, order])
  })

  it('從模型刪除元素後所有圖的連結消失', () => {
    const { p, cd1, cd2, user, order } = withNote()
    ops.deleteElement(p, user)
    for (const d of [cd1, cd2]) expect(cls(p, d).notes[0].links).toEqual([order])
  })

  it('Class 與 Note 一起移動', () => {
    const { p, cd1, n1, user } = withNote()
    ops.moveItems(p, cd1, [user, n1], 5, 7)
    expect(cls(p, cd1).nodes.map((n) => [n.x, n.y])).toEqual([[5, 7], [200, 0]])
    expect(cls(p, cd1).notes.map((n) => [n.x, n.y])).toEqual([[5, 207]])
  })
})

describe('類別圖套件', () => {
  function withPackage() {
    const s = setup()
    ops.addNode(s.p, s.cd1, s.user, 0, 0)
    ops.addNode(s.p, s.cd1, s.order, 200, 0)
    const k1 = ops.addPackage(s.p, s.cd1, -20, -40)
    const k2 = ops.addPackage(s.p, s.cd1, 500, 0)
    ops.setPackageMembership(s.p, s.cd1, s.user, k1)
    return { ...s, k1, k2 }
  }
  const members = (p: Project, d: string) => cls(p, d).packages.map((k) => k.elementIds)

  it('新增與改名', () => {
    const { p, cd1, k1 } = withPackage()
    ops.renamePackage(p, cd1, k1, 'auth')
    expect(cls(p, cd1).packages[0]).toMatchObject({ id: k1, name: 'auth', x: -20, y: -40 })
  })

  it('一個元素只屬一個套件；null 離開', () => {
    const { p, cd1, k2, user } = withPackage()
    ops.setPackageMembership(p, cd1, user, k2)
    expect(members(p, cd1)).toEqual([[], [user]])
    ops.setPackageMembership(p, cd1, user, null)
    expect(members(p, cd1)).toEqual([[], []])
  })

  it('移動套件連同成員；成員同時被選取時只移動一次', () => {
    const { p, cd1, k1, user, order } = withPackage()
    ops.moveItems(p, cd1, [k1, user], 100, 0)
    expect(cls(p, cd1).nodes.map((n) => n.x)).toEqual([100, 200])
    expect(cls(p, cd1).packages[0].x).toBe(80)
    ops.moveItems(p, cd1, [k1, order], 10, 0)
    expect(cls(p, cd1).nodes.map((n) => n.x)).toEqual([110, 210])
  })

  it('成員從圖移除後離開套件', () => {
    const { p, cd1, user } = withPackage()
    ops.removeFromDiagram(p, cd1, [user])
    expect(members(p, cd1)).toEqual([[], []])
  })

  it('刪除套件保留成員', () => {
    const { p, cd1, k1 } = withPackage()
    ops.removeFromDiagram(p, cd1, [k1])
    expect(cls(p, cd1).packages).toHaveLength(1)
    expect(cls(p, cd1).nodes.map((n) => [n.x, n.y])).toEqual([[0, 0], [200, 0]])
  })
})

describe('連線轉折點', () => {
  it('設定與重設', () => {
    const { p, user, order, cd1 } = setup()
    ops.addNode(p, cd1, user, 0, 0)
    ops.addNode(p, cd1, order, 200, 0)
    const rel = ops.addRelation(p, 'association', order, user, cd1)
    ops.setEdgeBends(p, cd1, rel, [{ x: 1, y: 2 }])
    expect(cls(p, cd1).edges).toEqual([{ relationId: rel, bends: [{ x: 1, y: 2 }] }])
    ops.resetEdgeBends(p, cd1, rel)
    expect(cls(p, cd1).edges).toEqual([{ relationId: rel }])
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

  it('Note 插入、改文字、重排、刪除', () => {
    const { p, sd, a, b, msg } = seqSetup()
    const m1 = msg('m1')
    const n = ops.insertNote(p, sd, [a, b], 'n', ops.posAfter(seq(p, sd), m1)!)
    msg('m2')
    ops.setSeqNoteText(p, sd, n, 'x')
    expect(shape(seq(p, sd).items)).toBe('m1 note(x) m2')
    ops.moveItem(p, sd, n, { container: null, index: 0 })
    expect(shape(seq(p, sd).items)).toBe('note(x) m1 m2')
    ops.deleteItem(p, sd, n)
    expect(shape(seq(p, sd).items)).toBe('m1 m2')
  })

  it('刪除覆蓋的生命線：只剩其餘生命線；全部刪除則 Note 刪除', () => {
    const { p, sd, a, b } = seqSetup()
    const m = ops.insertNote(p, sd, [a], 'only-a')
    ops.wrapInFragment(p, sd, [m], 'opt')
    ops.insertNote(p, sd, [a, b], 'ab')
    ops.deleteLifeline(p, sd, b)
    expect(seq(p, sd).items.at(-1)).toMatchObject({ kind: 'note', over: [a] })
    ops.deleteLifeline(p, sd, a)
    expect(shape(seq(p, sd).items)).toBe('opt()')
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

describe('流程圖', () => {
  const measure = (t: string) => t.length * 7
  function fc() {
    const p = ops.emptyProject()
    const d = ops.addDiagram(p, 'flowchart', 'FC')
    const f = () => ops.getFlowchart(p, d)
    return { p, d, f }
  }

  it('刪除節點連帶刪除所有相連箭頭（含自我迴圈），其餘保留', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'process', 0, 0)
    const b = ops.addFlowNode(p, d, 'decision', 0, 100)
    const c = ops.addFlowNode(p, d, 'terminal', 0, 200)
    ops.addFlowEdge(p, d, a, b)
    ops.addFlowEdge(p, d, b, c, '是')
    ops.addFlowEdge(p, d, b, b)
    const keep = ops.addFlowEdge(p, d, a, c)
    ops.removeFlowItems(p, d, [b])
    expect(f().nodes.map((n) => n.id)).toEqual([a, c])
    expect(f().edges.map((e) => e.id)).toEqual([keep])
  })

  it('刪除節點後從子圖成員移除，子圖保留', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'process', 0, 0)
    const b = ops.addFlowNode(p, d, 'process', 0, 100)
    const g = ops.addSubgraph(p, d, 0, 0)
    ops.setSubgraphMembership(p, d, a, g)
    ops.setSubgraphMembership(p, d, b, g)
    ops.removeFlowItems(p, d, [a])
    expect(f().subgraphs).toEqual([expect.objectContaining({ id: g, nodeIds: [b] })])
  })

  it('刪除箭頭只移除箭頭', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'process', 0, 0)
    const e = ops.addFlowEdge(p, d, a, a)
    ops.removeFlowItems(p, d, [e])
    expect([f().nodes.length, f().edges.length]).toEqual([1, 0])
  })

  it('切換形狀保留文字、位置與箭頭', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'process', 10, 20, '審核')
    const b = ops.addFlowNode(p, d, 'process', 0, 100)
    const c = ops.addFlowNode(p, d, 'process', 0, 200)
    ops.addFlowEdge(p, d, b, a)
    ops.addFlowEdge(p, d, a, c)
    ops.setFlowNodeShape(p, d, a, 'decision')
    expect(f().nodes[0]).toEqual({ id: a, shape: 'decision', text: '審核', x: 10, y: 20 })
    expect(f().edges).toHaveLength(2)
  })

  it('文字與標籤修改', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'io', 0, 0)
    const e = ops.addFlowEdge(p, d, a, a, '是')
    ops.setFlowNodeText(p, d, a, '輸入\n金額')
    ops.setFlowEdgeLabel(p, d, e, '通過')
    expect(f().nodes[0].text).toBe('輸入\n金額')
    expect(f().edges[0].label).toBe('通過')
  })

  it('設定與重設轉折點', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'process', 0, 0)
    const b = ops.addFlowNode(p, d, 'process', 300, 0)
    const e = ops.addFlowEdge(p, d, a, b)
    ops.setFlowEdgeBends(p, d, e, [{ x: 150, y: 0 }, { x: 150, y: 80 }])
    expect(f().edges[0].bends).toHaveLength(2)
    ops.resetFlowEdgeBends(p, d, e)
    expect('bends' in f().edges[0]).toBe(false)
  })

  it('子圖改名；一個節點只屬一個子圖，null 表示離開', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'process', 0, 0)
    const g1 = ops.addSubgraph(p, d, 0, 0)
    const g2 = ops.addSubgraph(p, d, 300, 0)
    ops.renameSubgraph(p, d, g1, '後端')
    ops.setSubgraphMembership(p, d, a, g1)
    ops.setSubgraphMembership(p, d, a, g2)
    expect(f().subgraphs.map((g) => [g.title, g.nodeIds])).toEqual([['後端', []], ['子圖', [a]]])
    ops.setSubgraphMembership(p, d, a, null)
    expect(f().subgraphs.flatMap((g) => g.nodeIds)).toEqual([])
  })

  it('移動子圖連同成員；成員同時被選取時不重複位移', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'process', 0, 0)
    const b = ops.addFlowNode(p, d, 'process', 0, 100)
    const out = ops.addFlowNode(p, d, 'process', 500, 0)
    const g = ops.addSubgraph(p, d, -20, -40)
    ops.setSubgraphMembership(p, d, a, g)
    ops.setSubgraphMembership(p, d, b, g)
    ops.moveFlowItems(p, d, [g, a], 100, 10)
    expect(f().nodes.map((n) => [n.x, n.y])).toEqual([[100, 10], [100, 110], [500, 0]])
    expect(f().subgraphs[0]).toMatchObject({ x: 80, y: -30 })
    expect(out).toBeTruthy()
  })

  it('刪除子圖保留成員位置', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'process', 30, 40)
    const g = ops.addSubgraph(p, d, 0, 0)
    ops.setSubgraphMembership(p, d, a, g)
    ops.removeFlowItems(p, d, [g])
    expect(f().subgraphs).toEqual([])
    expect(f().nodes).toEqual([expect.objectContaining({ id: a, x: 30, y: 40 })])
  })

  it('addNextNode：空白處理節點、箭頭指向新節點、位置符合 nextNodePos', () => {
    const { p, d, f } = fc()
    const a = ops.addFlowNode(p, d, 'terminal', 0, 0, '開始')
    const n1 = ops.addNextNode(p, d, a, measure)!
    const src = f().nodes[0]
    const srcBox = flowNodeBox(src, measure)
    const size = flowNodeBox({ shape: 'process', text: '' }, measure)
    const node1 = f().nodes.find((n) => n.id === n1)!
    expect(node1).toMatchObject({ shape: 'process', text: '' })
    expect({ x: node1.x, y: node1.y }).toEqual(nextNodePos({ ...src, ...srcBox }, size, [{ ...src, ...srcBox }]))
    expect(f().edges).toEqual([expect.objectContaining({ from: a, to: n1, label: '' })])
    // 正下方已被 n1 佔住：第二個往右錯開
    const n2 = ops.addNextNode(p, d, a, measure)!
    const node2 = f().nodes.find((n) => n.id === n2)!
    expect(node2.y).toBe(node1.y)
    expect(node2.x).toBeGreaterThan(node1.x + size.w)
  })

  it('addNextNode 在單一 store.apply 內完成：一次 undo 同時移除節點與箭頭', () => {
    setActivePinia(createPinia())
    const s = useProjectStore()
    const { d, a } = s.apply((p) => {
      const d = ops.addDiagram(p, 'flowchart', 'FC')
      return { d, a: ops.addFlowNode(p, d, 'process', 0, 0) }
    })
    s.apply((p) => ops.addNextNode(p, d, a, measure))
    expect(ops.getFlowchart(s.project, d).nodes).toHaveLength(2)
    s.undo()
    const f = ops.getFlowchart(s.project, d)
    expect([f.nodes.length, f.edges.length]).toEqual([1, 0])
  })
})
