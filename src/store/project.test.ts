import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import * as ops from '../model/ops'
import { UNDO_LIMIT, useProjectStore } from './project'

beforeEach(() => setActivePinia(createPinia()))

describe('project store', () => {
  it('apply 標記 dirty，undo / redo 交換快照', () => {
    const s = useProjectStore()
    const id = s.apply((p) => ops.addElement(p, 'class', 'A'))
    expect(s.dirty).toBe(true)
    s.apply((p) => ops.renameElement(p, id, 'B'))
    s.undo()
    expect(s.project.model.elements[id].name).toBe('A')
    s.redo()
    expect(s.project.model.elements[id].name).toBe('B')
  })

  it('復原跨圖刪除', () => {
    const s = useProjectStore()
    const { el, cd1, cd2, sd } = s.apply((p) => {
      const el = ops.addElement(p, 'class', 'User')
      const other = ops.addElement(p, 'class', 'Order')
      const cd1 = ops.addDiagram(p, 'class', '1')
      const cd2 = ops.addDiagram(p, 'class', '2')
      const sd = ops.addDiagram(p, 'sequence', 's')
      for (const d of [cd1, cd2]) {
        ops.addNode(p, d, el, 0, 0)
        ops.addNode(p, d, other, 100, 0)
      }
      ops.addRelation(p, 'association', other, el, cd1)
      ops.addLifeline(p, sd, '', el)
      return { el, cd1, cd2, sd }
    })
    const before = structuredClone(s.project)
    s.apply((p) => ops.deleteElement(p, el))
    expect(s.project.model.elements[el]).toBeUndefined()
    s.undo()
    expect(s.project).toEqual(before)
    expect(ops.getClassDiagram(s.project, cd1).edges).toHaveLength(1)
    expect(ops.getClassDiagram(s.project, cd2).nodes).toHaveLength(2)
    expect(ops.getSequenceDiagram(s.project, sd).lifelines[0].elementId).toBe(el)
  })

  it('新操作清除 redo', () => {
    const s = useProjectStore()
    s.apply((p) => ops.addElement(p, 'class'))
    s.undo()
    expect(s.canRedo).toBe(true)
    s.apply((p) => ops.addElement(p, 'enum'))
    expect(s.canRedo).toBe(false)
  })

  it(`復原上限 ${UNDO_LIMIT} 筆`, () => {
    const s = useProjectStore()
    const id = s.apply((p) => ops.addElement(p, 'class', '0'))
    for (let i = 1; i <= UNDO_LIMIT + 10; i++) s.apply((p) => ops.renameElement(p, id, String(i)))
    let n = 0
    while (s.canUndo) {
      s.undo()
      n++
    }
    expect(n).toBe(UNDO_LIMIT)
    expect(s.project.model.elements[id].name).toBe(String(10))
  })

  it('fn 拋出例外時狀態不變', () => {
    const s = useProjectStore()
    expect(() => s.apply((p) => ops.renameElement(p, 'missing', 'x'))).toThrow()
    expect(s.canUndo).toBe(false)
    expect(s.dirty).toBe(false)
  })

  it('load 清空紀錄並清除 dirty', () => {
    const s = useProjectStore()
    s.apply((p) => ops.addElement(p, 'class'))
    s.load(ops.emptyProject(), 'a.uml.json')
    expect(s.canUndo).toBe(false)
    expect(s.dirty).toBe(false)
    expect(s.fileName).toBe('a.uml.json')
  })
})
