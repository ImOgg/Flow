import { describe, expect, it } from 'vitest'
import { nodeBox, route, type Point, type Rect } from './classLayout'
import type { Classifier } from './types'

const measure = (t: string) => t.length * 7
const box = (x: number, y: number): Rect => ({ x, y, w: 100, h: 60 })
const orthogonal = (pts: Point[]) => pts.slice(1).every((p, i) => p.x === pts[i].x || p.y === pts[i].y)

describe('route', () => {
  it('右方：從右邊出、左邊進', () => {
    const pts = route(box(0, 0), box(300, 40))
    expect(pts[0]).toEqual({ x: 100, y: 30 })
    expect(pts.at(-1)).toEqual({ x: 300, y: 70 })
    expect(pts).toHaveLength(4)
    expect(orthogonal(pts)).toBe(true)
  })

  it('左方：從左邊出、右邊進', () => {
    const pts = route(box(300, 0), box(0, 0))
    expect(pts).toEqual([{ x: 300, y: 30 }, { x: 100, y: 30 }])
  })

  it('下方：從下邊出、上邊進', () => {
    const pts = route(box(0, 0), box(30, 300))
    expect(pts[0]).toEqual({ x: 50, y: 60 })
    expect(pts.at(-1)).toEqual({ x: 80, y: 300 })
    expect(orthogonal(pts)).toBe(true)
  })

  it('上方：從上邊出、下邊進', () => {
    const pts = route(box(0, 300), box(0, 0))
    expect(pts).toEqual([{ x: 50, y: 300 }, { x: 50, y: 60 }])
  })

  it('自我迴圈起訖都在框邊上且為直角', () => {
    const a = box(0, 0)
    const pts = route(a, a, true)
    expect(pts[0].x).toBe(100)
    expect(pts.at(-1)!.y).toBe(0)
    expect(orthogonal(pts)).toBe(true)
  })
})

describe('nodeBox', () => {
  const el = (over: Partial<Classifier>): Classifier => ({
    id: '1', kind: 'class', name: 'User', attributes: [], operations: [], ...over,
  })

  it('class 有兩個區塊，內容越多越高', () => {
    const empty = nodeBox(el({}), measure)
    const filled = nodeBox(el({ attributes: [{ visibility: '+', name: 'a', type: 'int' }] }), measure)
    expect(empty.sections.map((s) => s.list)).toEqual(['attributes', 'operations'])
    expect(filled.h).toBeGreaterThan(empty.h)
  })

  it('interface / enum 有標記，enum 只有一個區塊', () => {
    expect(nodeBox(el({ kind: 'interface' }), measure).header[0].text).toBe('«interface»')
    const e = nodeBox(el({ kind: 'enum' }), measure)
    expect(e.header[0].text).toBe('«enumeration»')
    expect(e.sections).toHaveLength(1)
  })

  it('寬度依最長文字且有最小寬度', () => {
    expect(nodeBox(el({}), measure).w).toBe(120)
    expect(nodeBox(el({ name: 'X'.repeat(40) }), measure).w).toBe(40 * 7 + 20)
  })
})
