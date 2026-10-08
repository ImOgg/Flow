import { describe, expect, it } from 'vitest'
import { moveSegment, noteBox, nodeBox, packageAt, packageBox, PKG_PAD, route, routeWith, simplify, type Point, type Rect } from './classLayout'
import type { Classifier, Package } from './types'

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

describe('routeWith', () => {
  const a = box(0, 0) // x 0~100, y 0~60
  const b = box(400, 300)
  const onBorder = (r: Rect, p: Point) =>
    ((p.x === r.x || p.x === r.x + r.w) && p.y >= r.y && p.y <= r.y + r.h) ||
    ((p.y === r.y || p.y === r.y + r.h) && p.x >= r.x && p.x <= r.x + r.w)

  it('沒有轉折點時與 route 相同', () => {
    expect(routeWith(a, b, undefined)).toEqual(route(a, b))
    expect(routeWith(a, b, [])).toEqual(route(a, b))
  })

  it.each<[string, Point[]]>([
    ['水平方向', [{ x: 250, y: 30 }, { x: 250, y: 330 }]],
    ['垂直方向', [{ x: 50, y: 200 }, { x: 450, y: 200 }]],
    ['斜角方向', [{ x: 250, y: 150 }, { x: 600, y: 150 }]],
  ])('轉折點在框的%s：端點在邊框上且每段皆水平或垂直', (_, bends) => {
    const pts = routeWith(a, b, bends)
    expect(onBorder(a, pts[0])).toBe(true)
    expect(onBorder(b, pts.at(-1)!)).toBe(true)
    expect(orthogonal(pts)).toBe(true)
    for (const q of bends) expect(pts).toContainEqual(q)
  })

  it('元素移動後轉折點不變，端點仍在邊框上', () => {
    const bends = [{ x: 250, y: 30 }, { x: 250, y: 330 }]
    const moved = box(0, 100)
    const pts = routeWith(moved, b, bends)
    expect(pts.slice(-bends.length - 1, -1)).toEqual(bends)
    expect(onBorder(moved, pts[0])).toBe(true)
    expect(orthogonal(pts)).toBe(true)
  })
})

describe('moveSegment', () => {
  const child = box(0, 300) // 下方的子類別
  const parent = box(200, 0) // 上方的父類別：下邊 y = 60

  it('左右拖動連到上下邊框的最後一段：箭頭沿下邊滑動，仍垂直進入框', () => {
    const pts = routeWith(child, parent, [{ x: 50, y: 180 }, { x: 250, y: 180 }])
    expect(pts.at(-1)).toEqual({ x: 250, y: 60 })
    const i = pts.length - 2
    const bends = moveSegment(pts, i, 30)
    const after = routeWith(child, parent, bends)
    expect(after.at(-1)).toEqual({ x: 280, y: 60 })
    expect(after.at(-2)!.x).toBe(280) // 最後一段垂直，不是沿著邊框橫走
    expect(orthogonal(after)).toBe(true)
  })

  it('轉折點在下邊框的延長線上（框被移開後）：不沿著邊框走', () => {
    const moved = box(270, 0) // 父類別往右移，轉折點 (250, 60) 落在下邊框延長線上
    const pts = routeWith(child, moved, [{ x: 50, y: 180 }, { x: 250, y: 180 }, { x: 250, y: 60 }])
    expect(orthogonal(pts)).toBe(true)
    const [p, q] = pts.slice(-2)
    // 最後一段從左邊水平進入，不是貼著下邊框
    expect(q).toEqual({ x: 270, y: 30 })
    expect(p.y).toBe(30)
  })

  it('左右拖動連到左右邊框的第一段：起點沿右邊滑動', () => {
    const a = box(0, 0)
    const b = box(300, 200)
    const pts = route(a, b) // 從 a 右邊水平出發
    const bends = moveSegment(pts, 0, 10)
    const after = routeWith(a, b, bends)
    expect(after[0]).toEqual({ x: 100, y: 40 })
    expect(orthogonal(after)).toBe(true)
  })

  it('與隔一段的平行段相差 6 以內時對齊，小折角被合併', () => {
    // 三段水平線，中間那段離第一段只差 4
    const pts = [{ x: 0, y: 100 }, { x: 50, y: 100 }, { x: 50, y: 104 }, { x: 100, y: 104 }, { x: 100, y: 200 }]
    expect(moveSegment(pts, 2, 0)).toEqual([{ x: 50, y: 100 }, { x: 100, y: 100 }])
    // 差超過 6 不吸附
    expect(moveSegment(pts, 2, 10)).toContainEqual({ x: 50, y: 114 })
  })
})

describe('simplify', () => {
  it('合併共線點與重複點', () => {
    const pts = [
      { x: 100, y: 30 },
      { x: 150, y: 30 },
      { x: 150, y: 30 },
      { x: 250, y: 30 },
      { x: 250, y: 100 },
      { x: 250, y: 330 },
      { x: 400, y: 330 },
    ]
    expect(simplify(pts)).toEqual([{ x: 100, y: 30 }, { x: 250, y: 30 }, { x: 250, y: 330 }, { x: 400, y: 330 }])
  })
})

describe('noteBox', () => {
  it('多行：高容得下所有行、寬容得下最長一行', () => {
    const one = noteBox('ab', measure)
    const three = noteBox('ab\nabcdefghijklmnop\nc', measure)
    expect(three.lines).toEqual(['ab', 'abcdefghijklmnop', 'c'])
    expect(three.h - one.h).toBe(2 * 18)
    expect(three.w).toBeGreaterThan(16 * 7)
  })
  it('空白維持最小尺寸', () => {
    expect(noteBox('', measure)).toMatchObject({ w: noteBox('a', measure).w, h: noteBox('a', measure).h })
  })
})

describe('packageBox / packageAt', () => {
  const pkg = (over: Partial<Package>): Package => ({ id: 'k', name: 'k', x: 0, y: 0, elementIds: [], ...over })
  const rects = new Map([['u', box(300, 300)], ['o', box(1000, 0)]])

  it('空套件最小尺寸', () => {
    expect(packageBox(pkg({}), rects)).toMatchObject({ x: 0, y: 0, w: 160, h: 100 })
  })

  it('成員撐大框，完整包住成員', () => {
    const r = packageBox(pkg({ elementIds: ['u'] }), rects)
    expect(r.x).toBe(0)
    expect(r.x + r.w).toBe(400 + PKG_PAD)
    expect(r.y + r.h).toBe(360 + PKG_PAD)
  })

  it('點在成員撐開的範圍內也算在套件內', () => {
    const k = pkg({ elementIds: ['u'] })
    expect(packageAt({ x: 350, y: 330 }, [k], rects)).toBe('k')
    expect(packageAt({ x: 1050, y: 30 }, [k], rects)).toBeNull()
  })

  it('重疊時取最上層', () => {
    const lower = pkg({ id: 'lower' })
    const upper = pkg({ id: 'upper', x: 50, y: 50 })
    expect(packageAt({ x: 60, y: 60 }, [lower, upper], rects)).toBe('upper')
    expect(packageAt({ x: 10, y: 10 }, [lower, upper], rects)).toBe('lower')
    expect(packageAt({ x: 900, y: 900 }, [lower, upper], rects)).toBeNull()
  })
})
