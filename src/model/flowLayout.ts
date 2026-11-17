// 流程圖節點尺寸、箭頭端點貼合形狀、標籤位置與「下一步」節點位置。文字量測以參數注入
import { LINE_H, PAD_X, PAD_Y, routeWith, type Measure, type Point, type Rect } from './classLayout'
import type { FlowShape } from './types'

const MIN_W = 100
const MIN_H = 40
export const SLANT = 15
export const CAP = 8

export interface FlowBox { w: number; h: number; lines: string[] }

/** 外框尺寸：先算容納文字的文字框 w × h，再依形狀放大（菱形 2w × 2h 恰好內接文字框） */
export function flowNodeBox(node: { shape: FlowShape; text: string }, measure: Measure): FlowBox {
  const lines = node.text.split('\n')
  const w = Math.max(MIN_W, Math.ceil(Math.max(...lines.map((l) => measure(l)))) + PAD_X * 2)
  const h = Math.max(MIN_H, lines.length * LINE_H + PAD_Y * 2)
  switch (node.shape) {
    case 'process':
      return { w, h, lines }
    case 'terminal':
      return { w: w + h, h, lines }
    case 'io':
      return { w: w + SLANT * 2, h, lines }
    case 'database':
      return { w, h: h + CAP * 2, lines }
    case 'decision':
      return { w: w * 2, h: h * 2, lines }
  }
}

/** 各形狀的 SVG path（相對外框左上角） */
export function shapePath(shape: FlowShape, w: number, h: number): string {
  switch (shape) {
    case 'process':
      return `M0,0 H${w} V${h} H0 Z`
    case 'terminal': {
      const r = h / 2
      return `M${r},0 H${w - r} A${r},${r} 0 0 1 ${w - r},${h} H${r} A${r},${r} 0 0 1 ${r},0 Z`
    }
    case 'io':
      return `M${SLANT},0 H${w} L${w - SLANT},${h} H0 Z`
    case 'database': {
      const rx = w / 2
      // 外輪廓 + 頂蓋下緣弧線
      return `M0,${CAP} A${rx},${CAP} 0 0 1 ${w},${CAP} V${h - CAP} A${rx},${CAP} 0 0 1 0,${h - CAP} Z M0,${CAP} A${rx},${CAP} 0 0 0 ${w},${CAP}`
    }
    case 'decision':
      return `M${w / 2},0 L${w},${h / 2} L${w / 2},${h} L0,${h / 2} Z`
  }
}

/**
 * 外框上的端點 end 沿「adj → end」方向（水平或垂直）往內推到形狀實際邊上，線段因此維持水平 / 垂直。
 * 推不到形狀內（例如水平線高度超出菱形）時不動
 */
export function clipToShape(end: Point, adj: Point, shape: FlowShape, r: Rect): Point {
  const horizontal = adj.y === end.y && adj.x !== end.x
  const vertical = adj.x === end.x && adj.y !== end.y
  if (!horizontal && !vertical) return end
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  const sx = Math.sign(end.x - cx) || 1
  const sy = Math.sign(end.y - cy) || 1
  const sqrt0 = (v: number) => Math.sqrt(Math.max(0, v))
  switch (shape) {
    case 'process':
      return end
    case 'decision': {
      const a = r.w / 2
      const b = r.h / 2
      if (horizontal) {
        const t = 1 - Math.abs(end.y - cy) / b
        return t < 0 ? end : { x: cx + sx * a * t, y: end.y }
      }
      const t = 1 - Math.abs(end.x - cx) / a
      return t < 0 ? end : { x: end.x, y: cy + sy * b * t }
    }
    case 'io': {
      if (!horizontal) return end
      const t = (end.y - r.y) / r.h
      return { x: sx < 0 ? r.x + SLANT * (1 - t) : r.x + r.w - SLANT * t, y: end.y }
    }
    case 'database': {
      if (!vertical) return end
      const rx = r.w / 2
      const k = CAP * sqrt0(1 - ((end.x - cx) / rx) ** 2)
      return { x: end.x, y: sy < 0 ? r.y + CAP - k : r.y + r.h - CAP + k }
    }
    case 'terminal': {
      if (!horizontal) return end
      const rad = r.h / 2
      const k = sqrt0(rad * rad - (end.y - cy) ** 2)
      return { x: sx < 0 ? r.x + rad - k : r.x + r.w - rad + k, y: end.y }
    }
  }
}

export interface ShapedRect extends Rect { shape: FlowShape }

/** 流程圖箭頭的完整折線：沿用類別圖的直角繞線與轉折點，再把首末端點貼到形狀邊上 */
export function flowRoute(a: ShapedRect, b: ShapedRect, bends?: Point[], self = false): Point[] {
  const pts = routeWith(a, b, bends, self)
  const n = pts.length
  if (n < 2) return pts
  pts[0] = clipToShape(pts[0], pts[1], a.shape, a)
  pts[n - 1] = clipToShape(pts[n - 1], pts[n - 2], b.shape, b)
  return pts
}

/** 折線總長一半處的點 */
export function labelPos(points: Point[]): Point {
  const seg = points.slice(1).map((b, i) => Math.hypot(b.x - points[i].x, b.y - points[i].y))
  let rest = seg.reduce((s, v) => s + v, 0) / 2
  for (let i = 0; i < seg.length; i++) {
    if (rest <= seg[i] && seg[i] > 0) {
      const a = points[i]
      const b = points[i + 1]
      const t = rest / seg[i]
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    rest -= seg[i]
  }
  return points[0]
}

const GAP_Y = 50
const GAP_X = 40
const MARGIN = 10
const MAX_TRIES = 20

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + MARGIN && b.x < a.x + a.w + MARGIN && a.y < b.y + b.h + MARGIN && b.y < a.y + a.h + MARGIN

/** 下一步節點的左上角：來源正下方置中；與其他框（含間距）重疊就往右錯開，最多試 MAX_TRIES 次 */
export function nextNodePos(src: Rect, size: { w: number; h: number }, others: Rect[]): Point {
  let x = Math.round(src.x + src.w / 2 - size.w / 2)
  const y = src.y + src.h + GAP_Y
  for (let i = 0; i < MAX_TRIES; i++) {
    if (!others.some((o) => overlaps({ x, y, ...size }, o))) break
    x += size.w + GAP_X
  }
  return { x, y }
}

const GAP_RANK = 60
const GAP_NODE = 40
const ORIGIN = 40

/**
 * 匯入用的分層排版，回傳每個節點的左上角。nodes 的順序 = 層內順序。
 * 依節點順序 DFS 斷開回邊（含自我迴圈），在剩下的 DAG 上做最長路徑分層；BT / RL 把層的順序反過來
 */
export function layerLayout(
  nodes: { id: string; w: number; h: number }[],
  edges: { from: string; to: string }[],
  dir: 'TD' | 'LR' | 'RL' | 'BT',
): Map<string, Point> {
  const out = new Map(nodes.map((n) => [n.id, [] as string[]]))
  for (const e of edges) if (e.from !== e.to && out.has(e.to)) out.get(e.from)?.push(e.to)

  // 1 = 還在遞迴堆疊中，2 = 完成
  const state = new Map<string, 1 | 2>()
  const dag = new Map(nodes.map((n) => [n.id, [] as string[]]))
  const post: string[] = []
  const visit = (u: string) => {
    state.set(u, 1)
    for (const v of out.get(u)!) {
      const s = state.get(v)
      if (s === 1) continue
      dag.get(u)!.push(v)
      if (!s) visit(v)
    }
    state.set(u, 2)
    post.push(u)
  }
  for (const n of nodes) if (!state.has(n.id)) visit(n.id)

  // 反向後序 = DAG 的拓撲順序
  const rank = new Map(nodes.map((n) => [n.id, 0]))
  for (const u of post.reverse()) for (const v of dag.get(u)!) rank.set(v, Math.max(rank.get(v)!, rank.get(u)! + 1))

  // ponytail: 層內只照出現順序排，不做交叉最小化；箭頭交叉多時再加 barycenter 排序
  const layers: (typeof nodes)[] = []
  for (const n of nodes) (layers[rank.get(n.id)!] ??= []).push(n)
  if (dir === 'BT' || dir === 'RL') layers.reverse()

  const vertical = dir === 'TD' || dir === 'BT'
  const main = (n: { w: number; h: number }) => (vertical ? n.h : n.w)
  const cross = (n: { w: number; h: number }) => (vertical ? n.w : n.h)
  const span = (l: typeof nodes) => l.reduce((s, n) => s + cross(n), 0) + GAP_NODE * (l.length - 1)
  const widest = Math.max(0, ...layers.map(span))

  const pos = new Map<string, Point>()
  let m = 0
  for (const l of layers) {
    const thick = Math.max(...l.map(main))
    let c = (widest - span(l)) / 2
    for (const n of l) {
      const a = Math.round(ORIGIN + m + (thick - main(n)) / 2)
      const b = Math.round(ORIGIN + c)
      pos.set(n.id, vertical ? { x: b, y: a } : { x: a, y: b })
      c += cross(n) + GAP_NODE
    }
    m += thick + GAP_RANK
  }
  return pos
}
