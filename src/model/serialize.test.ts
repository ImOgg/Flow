import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { parseProject, serialize } from './serialize'
import type { Project } from './types'

function sample(): Project {
  const p = ops.emptyProject()
  const user = ops.addElement(p, 'class', 'User')
  const order = ops.addElement(p, 'class', 'Order')
  ops.addMember(p, user, 'attributes', { visibility: '-', name: 'name', type: 'string' })
  const cd = ops.addDiagram(p, 'class', 'CD')
  ops.addNode(p, cd, user, 10, 20)
  ops.addNode(p, cd, order, 300, 20)
  ops.addRelation(p, 'composition', order, user, cd)
  const sd = ops.addDiagram(p, 'sequence', 'SD')
  const a = ops.addLifeline(p, sd, '', user)
  const b = ops.addLifeline(p, sd, 'B')
  const m = ops.insertMessage(p, sd, { from: a, to: b, text: 'hi', type: 'sync' })
  ops.wrapInFragment(p, sd, [m], 'loop', 'n < 3')
  return p
}

describe('serialize / parseProject', () => {
  it('往返一致', () => {
    const p = sample()
    const r = parseProject(serialize(p))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.project).toEqual(p)
      expect(r.warnings).toEqual([])
    }
  })

  it('錯誤 JSON', () => {
    expect(parseProject('{oops')).toEqual({ ok: false, error: expect.stringContaining('JSON') })
  })

  it('錯誤版本', () => {
    const r = parseProject(JSON.stringify({ ...sample(), version: 2 }))
    expect(r).toEqual({ ok: false, error: expect.stringContaining('版本') })
  })

  it('結構不完整', () => {
    expect(parseProject('{"version":1}').ok).toBe(false)
    expect(parseProject('[]').ok).toBe(false)
    const bad = { ...sample(), diagrams: [{ id: 'x', type: 'class', name: 'x' }] }
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false)
  })

  it('懸空參照被略過，其餘照常載入', () => {
    const p = sample()
    const [userId] = Object.keys(p.model.elements)
    // 直接從 JSON 拿掉元素，模擬被手動編輯壞掉的檔案
    delete p.model.elements[userId]
    const r = parseProject(serialize(p))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const cd = r.project.diagrams[0]
    const sd = r.project.diagrams[1]
    expect(Object.keys(r.project.model.relations)).toHaveLength(0)
    expect(cd.type === 'class' && cd.nodes.map((n) => n.elementId)).not.toContain(userId)
    expect(cd.type === 'class' && cd.edges).toEqual([])
    expect(sd.type === 'sequence' && sd.lifelines[0].elementId).toBeUndefined()
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('端點生命線不存在的訊息被略過', () => {
    const p = sample()
    const sd = p.diagrams[1]
    if (sd.type !== 'sequence') throw new Error()
    sd.lifelines.pop()
    const r = parseProject(serialize(p))
    expect(r.ok && r.project.diagrams[1].type === 'sequence' && r.project.diagrams[1].items).toEqual([
      expect.objectContaining({ kind: 'fragment', operands: [{ guard: 'n < 3', items: [] }] }),
    ])
  })
})
