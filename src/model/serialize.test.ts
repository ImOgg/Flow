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
    const r = parseProject(JSON.stringify({ ...sample(), version: 3 }))
    expect(r).toEqual({ ok: false, error: expect.stringContaining('版本') })
  })

  it('結構不完整', () => {
    expect(parseProject('{"version":2}').ok).toBe(false)
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

  it('版本 1 檔案轉為版本 2，類別圖補上空的 notes / packages', () => {
    const p = sample()
    const v1 = JSON.parse(serialize(p))
    v1.version = 1
    for (const d of v1.diagrams) {
      delete d.notes
      delete d.packages
    }
    const r = parseProject(JSON.stringify(v1))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.project.version).toBe(2)
    expect(r.project).toEqual(p)
  })

  it('版本 2 缺少 notes / packages 視為結構錯誤', () => {
    const p = JSON.parse(serialize(sample()))
    delete p.diagrams[0].notes
    expect(parseProject(JSON.stringify(p)).ok).toBe(false)
  })

  it('含 Note、Package、轉折點的專案往返一致', () => {
    const p = sample()
    const cd = p.diagrams[0]
    const sd = p.diagrams[1]
    if (cd.type !== 'class' || sd.type !== 'sequence') throw new Error()
    const [user, order] = cd.nodes.map((n) => n.elementId)
    cd.edges[0].bends = [{ x: 200, y: 20 }, { x: 200, y: 100 }]
    cd.notes.push({ id: 'n1', text: '第一行\n第二行', x: 0, y: 200, links: [user, order] })
    cd.packages.push({ id: 'k1', name: 'auth', x: 0, y: 0, elementIds: [user] })
    sd.items.push({ kind: 'note', id: 'sn', text: 'hi', over: sd.lifelines.map((l) => l.id) })
    const r = parseProject(serialize(p))
    expect(r.ok && r.project).toEqual(p)
    expect(r.ok && r.warnings).toEqual([])
  })

  it('Note 連結、Package 成員、Note 覆蓋的懸空參照被略過並產生 warning', () => {
    const p = sample()
    const cd = p.diagrams[0]
    const sd = p.diagrams[1]
    if (cd.type !== 'class' || sd.type !== 'sequence') throw new Error()
    const [user] = cd.nodes.map((n) => n.elementId)
    const [a] = sd.lifelines.map((l) => l.id)
    cd.notes.push({ id: 'n1', text: '', x: 0, y: 0, links: [user, 'ghost'] })
    cd.packages.push({ id: 'k1', name: 'auth', x: 0, y: 0, elementIds: ['ghost', user] })
    sd.items.push({ kind: 'note', id: 'keep', text: 'a', over: [a, 'ghost'] })
    sd.items.push({ kind: 'note', id: 'drop', text: 'b', over: ['ghost'] })
    const r = parseProject(serialize(p))
    if (!r.ok) throw new Error(r.error)
    const rcd = r.project.diagrams[0]
    const rsd = r.project.diagrams[1]
    if (rcd.type !== 'class' || rsd.type !== 'sequence') throw new Error()
    expect(rcd.notes[0].links).toEqual([user])
    expect(rcd.packages[0].elementIds).toEqual([user])
    expect(rsd.items.filter((it) => it.kind === 'note')).toEqual([{ kind: 'note', id: 'keep', text: 'a', over: [a] }])
    expect(r.warnings).toHaveLength(4)
  })
})
