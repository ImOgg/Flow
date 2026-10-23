import { describe, expect, it } from 'vitest'
import type { Point, Rect } from './classLayout'
import { CAP, flowNodeBox, flowRoute, labelPos, layerLayout, nextNodePos, SLANT, type ShapedRect } from './flowLayout'
import type { FlowShape } from './types'

const measure = (t: string) => t.length * 7
const SHAPES: FlowShape[] = ['process', 'decision', 'terminal', 'io', 'database']
const orthogonal = (pts: Point[]) => pts.slice(1).every((p, i) => p.x === pts[i].x || p.y === pts[i].y)

describe('flowNodeBox', () => {
  it('五種形狀的外框尺寸關係', () => {
    const base = flowNodeBox({ shape: 'process', text: 'abc' }, measure)
    const { w, h } = base
    expect(flowNodeBox({ shape: 'terminal', text: 'abc' }, measure)).toMatchObject({ w: w + h, h })
    expect(flowNodeBox({ shape: 'io', text: 'abc' }, measure)).toMatchObject({ w: w + SLANT * 2, h })
    expect(flowNodeBox({ shape: 'database', text: 'abc' }, measure)).toMatchObject({ w, h: h + CAP * 2 })
    expect(flowNodeBox({ shape: 'decision', text: 'abc' }, measure)).toMatchObject({ w: w * 2, h: h * 2 })
  })

  it('多行文字撐高、長文字撐寬', () => {
    const one = flowNodeBox({ shape: 'process', text: 'a' }, measure)
    const three = flowNodeBox({ shape: 'process', text: 'a\nb\nc' }, measure)
    expect(three.h).toBeGreaterThan(one.h)
    expect(three.lines).toEqual(['a', 'b', 'c'])
    expect(flowNodeBox({ shape: 'process', text: 'x'.repeat(30) }, measure).w).toBeGreaterThanOrEqual(210)
  })

  it('空白文字維持最小尺寸', () => {
    for (const shape of SHAPES) {
      expect(flowNodeBox({ shape, text: '' }, measure)).toMatchObject({
        w: flowNodeBox({ shape, text: 'a' }, measure).w,
        h: flowNodeBox({ shape, text: 'a' }, measure).h,
      })
    }
  })

  it('菱形內接文字框：文字框四角落在菱形內', () => {
    const text = 'x'.repeat(40)
    const t = flowNodeBox({ shape: 'process', text }, measure)
    const d = flowNodeBox({ shape: 'decision', text }, measure)
    expect(t.w / 2 / (d.w / 2) + t.h / 2 / (d.h / 2)).toBeLessThanOrEqual(1)
  })
})

/** 獨立於實作的「點在形狀內」判斷，用來驗證端點落在形狀邊上 */
function inside(shape: FlowShape, r: Rect, p: Point): boolean {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const inRect = p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
  switch (shape) {
    case 'process':
      return inRect
    case 'decision':
      return Math.abs(p.x - cx) / (r.w / 2) + Math.abs(p.y - cy) / (r.h / 2) <= 1
    case 'io': {
      const t = (p.y - r.y) / r.h
      return t >= 0 && t <= 1 && p.x >= r.x + SLANT * (1 - t) && p.x <= r.x + r.w - SLANT * t
    }
    case 'database': {
      const inEllipse = (ey: number) => ((p.x - cx) / (r.w / 2)) ** 2 + ((p.y - ey) / CAP) ** 2 <= 1
      return (inRect && p.y >= r.y + CAP && p.y <= r.y + r.h - CAP) || inEllipse(r.y + CAP) || inEllipse(r.y + r.h - CAP)
    }
    case 'terminal': {
      const rad = r.h / 2
      const inCircle = (ex: number) => Math.hypot(p.x - ex, p.y - cy) <= rad
      return (inRect && p.x >= r.x + rad && p.x <= r.x + r.w - rad) || inCircle(r.x + rad) || inCircle(r.x + r.w - rad)
    }
  }
}

/** 端點 end 在邊上：沿進入方向往內 0.5 在形狀內、往外 0.5 在形狀外 */
function onEdge(shape: FlowShape, r: Rect, end: Point, adj: Point) {
  const len = Math.hypot(end.x - adj.x, end.y - adj.y)
  const ux = (end.x - adj.x) / len
  const uy = (end.y - adj.y) / len
  return inside(shape, r, { x: end.x + ux * 0.5, y: end.y + uy * 0.5 }) && !inside(shape, r, { x: end.x - ux * 0.5, y: end.y - uy * 0.5 })
}

describe('flowRoute：端點貼合形狀', () => {
  const node = (shape: FlowShape, x: number, y: number): ShapedRect => ({ shape, x, y, ...flowNodeBox({ shape, text: '測試文字' }, measure) })
  const around: [string, number, number][] = [
    ['左', -400, 10],
    ['右', 400, -10],
    ['上', 15, -300],
    ['下', -15, 300],
  ]

  for (const shape of SHAPES) {
    for (const [dir, dx, dy] of around) {
      it(`${shape}：從${dir}方進入`, () => {
        const b = node(shape, 500, 500)
        const a = node(shape, 500 + dx, 500 + dy)
        const pts = flowRoute(a, b)
        expect(orthogonal(pts)).toBe(true)
        expect(onEdge(shape, b, pts.at(-1)!, pts.at(-2)!)).toBe(true)
        expect(onEdge(shape, a, pts[0], pts[1])).toBe(true)
      })
    }
  }

  for (const shape of SHAPES) {
    it(`${shape}：偏離中心的水平 / 垂直進入也貼在邊上`, () => {
      const b = node(shape, 500, 500)
      const cx = b.x + b.w / 2
      const cy = b.y + b.h / 2
      const h = flowRoute(node(shape, 1200, 500), b, [{ x: cx + 400, y: cy + b.h / 6 }])
      expect(h.at(-1)!.y).toBe(cy + b.h / 6)
      expect(onEdge(shape, b, h.at(-1)!, h.at(-2)!)).toBe(true)
      const v = flowRoute(node(shape, 500, 1200), b, [{ x: cx + b.w / 3, y: cy + 400 }])
      expect(v.at(-1)!.x).toBe(cx + b.w / 3)
      expect(onEdge(shape, b, v.at(-1)!, v.at(-2)!)).toBe(true)
      expect(orthogonal(h) && orthogonal(v)).toBe(true)
    })
  }

  it('有轉折點時首末段仍為水平或垂直', () => {
    const a = node('decision', 0, 0)
    const b = node('io', 400, 300)
    const pts = flowRoute(a, b, [{ x: 300, y: 50 }, { x: 300, y: 340 }])
    expect(orthogonal(pts)).toBe(true)
    expect(onEdge('io', b, pts.at(-1)!, pts.at(-2)!)).toBe(true)
  })

  it('自動路徑連到菱形時端點為頂點', () => {
    const a = node('process', 0, 0)
    const b = node('decision', 400, 0)
    const pts = flowRoute(a, b)
    // 兩框中心同高：直線進入菱形左頂點
    expect(pts.at(-1)!.x).toBeCloseTo(b.x, 5)
    expect(pts.at(-1)!.y).toBeCloseTo(b.y + b.h / 2, 5)
  })
})

describe('labelPos', () => {
  it('直線取中點', () => {
    expect(labelPos([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ x: 50, y: 0 })
  })
  it('L 形取轉角', () => {
    expect(labelPos([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])).toEqual({ x: 100, y: 0 })
  })
  it('Z 形取中段中點', () => {
    expect(labelPos([{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }])).toEqual({ x: 50, y: 50 })
  })
})

describe('nextNodePos', () => {
  const src = { x: 0, y: 0, w: 100, h: 40 }
  const size = { w: 100, h: 40 }

  it('正下方空：置中對齊、往下 50', () => {
    expect(nextNodePos(src, size, [src])).toEqual({ x: 0, y: 90 })
  })
  it('正下方被佔：往右錯開', () => {
    expect(nextNodePos(src, size, [src, { x: 0, y: 90, w: 100, h: 40 }])).toEqual({ x: 140, y: 90 })
  })
  it('連續三格被佔：落在第四格', () => {
    const others = [0, 140, 280].map((x) => ({ x, y: 90, w: 100, h: 40 }))
    expect(nextNodePos(src, size, [src, ...others])).toEqual({ x: 420, y: 90 })
  })
})

describe('layerLayout', () => {
  const box = (id: string, w = 100, h = 40) => ({ id, w, h })
  const chain = (...ids: string[]) => ids.slice(1).map((to, i) => ({ from: ids[i], to }))
  const noOverlap = (rects: Rect[]) =>
    rects.every((a, i) => rects.slice(i + 1).every((b) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y))
  const rectsOf = (nodes: { id: string; w: number; h: number }[], pos: Map<string, Point>) =>
    nodes.map((n) => ({ ...pos.get(n.id)!, w: n.w, h: n.h }))

  it('由上而下：A、B、C 依序往下，不重疊，左上角從 ORIGIN 開始', () => {
    const nodes = ['A', 'B', 'C'].map((id) => box(id))
    const pos = layerLayout(nodes, chain('A', 'B', 'C'), 'TD')
    const [a, b, c] = ['A', 'B', 'C'].map((id) => pos.get(id)!)
    expect(a.y).toBeLessThan(b.y)
    expect(b.y).toBeLessThan(c.y)
    expect(noOverlap(rectsOf(nodes, pos))).toBe(true)
    expect(Math.min(...[...pos.values()].map((p) => p.x))).toBe(40)
    expect(Math.min(...[...pos.values()].map((p) => p.y))).toBe(40)
  })

  it('由左而右：B 在 A 的右邊', () => {
    const pos = layerLayout([box('A'), box('B')], chain('A', 'B'), 'LR')
    expect(pos.get('B')!.x).toBeGreaterThan(pos.get('A')!.x + 100)
    expect(pos.get('B')!.y).toBe(pos.get('A')!.y)
  })

  it('BT、RL 方向反轉', () => {
    const nodes = [box('A'), box('B')]
    const bt = layerLayout(nodes, chain('A', 'B'), 'BT')
    const rl = layerLayout(nodes, chain('A', 'B'), 'RL')
    expect(bt.get('B')!.y).toBeLessThan(bt.get('A')!.y)
    expect(rl.get('B')!.x).toBeLessThan(rl.get('A')!.x)
  })

  it('有迴圈：回邊忽略，仍由上而下', () => {
    const nodes = ['A', 'B', 'C'].map((id) => box(id))
    const pos = layerLayout(nodes, chain('A', 'B', 'C', 'A'), 'TD')
    const [a, b, c] = ['A', 'B', 'C'].map((id) => pos.get(id)!.y)
    expect(a < b && b < c).toBe(true)
  })

  it('自我迴圈不影響分層', () => {
    const pos = layerLayout([box('A'), box('B')], [{ from: 'A', to: 'A' }, ...chain('A', 'B')], 'TD')
    expect(pos.get('A')!.y).toBe(40)
    expect(pos.get('B')!.y).toBeGreaterThan(40)
  })

  it('不同大小的節點互不重疊（同層與跨層）', () => {
    const nodes = [box('A', 200, 80), box('B', 60, 40), box('C', 300, 120), box('D', 100, 200), box('E')]
    const edges = [...chain('A', 'B'), ...chain('A', 'C'), ...chain('A', 'D'), ...chain('B', 'E'), ...chain('C', 'E')]
    for (const dir of ['TD', 'LR', 'BT', 'RL'] as const) {
      expect(noOverlap(rectsOf(nodes, layerLayout(nodes, edges, dir)))).toBe(true)
    }
  })

  it('最長路徑分層：A→C 與 A→B→C 時 C 在 B 之後', () => {
    const pos = layerLayout(['A', 'B', 'C'].map((id) => box(id)), [...chain('A', 'C'), ...chain('A', 'B', 'C')], 'TD')
    expect(pos.get('C')!.y).toBeGreaterThan(pos.get('B')!.y)
  })
})
