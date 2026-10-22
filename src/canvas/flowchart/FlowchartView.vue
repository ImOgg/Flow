<script setup lang="ts">
// 流程圖畫布：節點、箭頭與標籤、子圖框。互動比照類別圖（見 design D2：先不抽共用畫布）
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { moveSegment, packageAt, packageBox, PKG_MIN_H, PKG_MIN_W, PKG_TAB_H, type Frame, type Point, type Rect } from '../../model/classLayout'
import { flowNodeBox, flowRoute, labelPos, type ShapedRect } from '../../model/flowLayout'
import * as ops from '../../model/ops'
import type { FlowchartDiagram, FlowShape, Id, Subgraph } from '../../model/types'
import { exportPng, exportSvg } from '../../io/export'
import { useEditorStore } from '../../store/editor'
import { useProjectStore } from '../../store/project'
import Canvas from '../Canvas.vue'
import InlineInput from '../InlineInput.vue'
import Markers from '../Markers.vue'
import { measureText } from '../measure'
import { isTyping, trackPointer } from '../pointer'
import FlowEdge from './FlowEdge.vue'
import FlowNode from './FlowNode.vue'

const props = defineProps<{ diagram: FlowchartDiagram }>()
const store = useProjectStore()
const ed = useEditorStore()
const canvas = ref<InstanceType<typeof Canvas>>()
const dId = () => props.diagram.id

const SHAPE_TOOLS: [FlowShape, string][] = [
  ['process', '處理'],
  ['decision', '判斷'],
  ['terminal', '開始 / 結束'],
  ['io', '輸入 / 輸出'],
  ['database', '資料庫'],
]
const isShapeTool = (t: string): t is FlowShape => SHAPE_TOOLS.some(([k]) => k === t)

// 拖曳中的暫時位移，放開才寫回 store。ids 可混合節點與子圖
const drag = ref<{ ids: Set<Id>; dx: number; dy: number } | null>(null)
const linking = ref<{ sourceId: Id; to: Point } | null>(null)
// shallowRef：bends 會直接寫進專案，不能是響應式 Proxy（structuredClone 無法複製）
const bendDrag = shallowRef<{ id: Id; bends: Point[] } | null>(null)

const frame = (g: Subgraph): Frame => ({ id: g.id, x: g.x, y: g.y, w: g.w, h: g.h, ids: g.nodeIds })

/** 正在跟著拖曳移動的節點：直接選取的，加上被拖曳子圖的成員 */
const movingNodes = computed(() => {
  const d = drag.value
  const s = new Set(d?.ids)
  if (d) for (const g of props.diagram.subgraphs) if (d.ids.has(g.id)) g.nodeIds.forEach((n) => s.add(n))
  return s
})
const shift = <T extends Point>(o: T, moving: boolean): T =>
  moving && drag.value ? { ...o, x: o.x + drag.value.dx, y: o.y + drag.value.dy } : o

const nodes = computed(() =>
  props.diagram.nodes.map((n) => ({
    node: n,
    box: flowNodeBox(n, measureText),
    ...shift({ x: n.x, y: n.y }, movingNodes.value.has(n.id)),
  })),
)
const rects = computed(
  () => new Map<Id, ShapedRect>(nodes.value.map((n) => [n.node.id, { shape: n.node.shape, x: n.x, y: n.y, w: n.box.w, h: n.box.h }])),
)

/** 直接拖曳中的節點（不含跟著子圖移動的成員） */
const draggedNodes = computed(() => {
  const d = drag.value
  if (!d) return new Set<Id>()
  const viaSubgraph = new Set(props.diagram.subgraphs.filter((g) => d.ids.has(g.id)).flatMap((g) => g.nodeIds))
  return new Set([...d.ids].filter((id) => rects.value.has(id) && !viaSubgraph.has(id)))
})
/** 子圖框計算用：直接拖曳中的節點仍以原位置計入，框在放開前不變（同類別圖套件） */
const sgRects = computed(() => {
  const m = new Map<Id, Rect>(rects.value)
  for (const n of nodes.value) {
    if (draggedNodes.value.has(n.node.id)) m.set(n.node.id, { ...m.get(n.node.id)!, x: n.node.x, y: n.node.y })
  }
  return m
})

const subgraphs = computed(() =>
  props.diagram.subgraphs.map((g) => {
    const moved = shift(g, !!drag.value?.ids.has(g.id))
    const shifted = resize.value?.id === g.id ? { ...moved, w: resize.value.w, h: resize.value.h } : moved
    return { sg: g, shifted, box: packageBox(frame(shifted), sgRects.value), tabW: measureText(g.title, true) + 16 }
  }),
)

const edges = computed(() =>
  props.diagram.edges.flatMap((e) => {
    const a = rects.value.get(e.from)
    const b = rects.value.get(e.to)
    if (!a || !b) return []
    const bends = bendDrag.value?.id === e.id ? bendDrag.value.bends : e.bends
    return [{ edge: e, points: flowRoute(a, b, bends, e.from === e.to) }]
  }),
)

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

const linkFrom = computed(() => {
  const r = linking.value && rects.value.get(linking.value.sourceId)
  return r ? center(r) : null
})

const nodeAt = (p: Point) =>
  [...rects.value].reverse().find(([, r]) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.[0]

const highlighted = (id: Id) =>
  ed.selection.includes(id) || (!!linking.value && (linking.value.sourceId === id || nodeAt(linking.value.to) === id))

/** 只選取一個節點 / 一條箭頭時的對象，供提示列操作 */
const selectedNode = computed(() =>
  ed.selection.length === 1 ? props.diagram.nodes.find((n) => n.id === ed.selection[0]) : undefined,
)
const selectedEdge = computed(() =>
  ed.selection.length === 1 ? props.diagram.edges.find((e) => e.id === ed.selection[0]) : undefined,
)

function bounds(): Rect | null {
  const boxes = [...rects.value.values(), ...subgraphs.value.map((g) => g.box)]
  const pts = boxes.flatMap((r) => [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
  ])
  for (const e of edges.value) pts.push(...e.points)
  if (!pts.length) return null
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

const world = (e: PointerEvent) => canvas.value!.toWorld(e.clientX, e.clientY)

/** 箭頭工具：從節點拖到節點，放開後進入標籤編輯；拖到空白處不建立 */
function startLinking(e: PointerEvent, id: Id) {
  const start = world(e)
  linking.value = { sourceId: id, to: start }
  trackPointer(
    e,
    (m) => (linking.value!.to = world(m)),
    (u) => {
      const end = world(u)
      const target = nodeAt(end)
      const moved = Math.hypot(end.x - start.x, end.y - start.y) > 5
      linking.value = null
      if (!target || (target === id && !moved)) return
      const eid = store.apply((p) => ops.addFlowEdge(p, dId(), id, target))
      ed.select(eid)
      ed.editing = { kind: 'edgeLabel', id: eid }
      ed.tool = 'select'
    },
  )
}

/** 節點與子圖標題共用：選取並拖曳移動 */
function onItemDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  if (ed.tool === 'edge') {
    if (rects.value.has(id)) startLinking(e, id)
    return
  }
  if (e.shiftKey || e.ctrlKey || e.metaKey) return ed.select(id, true)
  if (!ed.selection.includes(id)) ed.select(id)
  const movable = new Set([...rects.value.keys(), ...props.diagram.subgraphs.map((g) => g.id)])
  const ids = new Set(ed.selection.filter((s) => movable.has(s)))
  const start = world(e)
  drag.value = { ids, dx: 0, dy: 0 }
  trackPointer(
    e,
    (m) => {
      const p = world(m)
      drag.value = { ids, dx: Math.round(p.x - start.x), dy: Math.round(p.y - start.y) }
    },
    () => {
      const d = drag.value
      const membership = d && (d.dx || d.dy) ? membershipChanges() : []
      drag.value = null
      if (!d || (!d.dx && !d.dy)) return
      store.apply((p) => {
        ops.moveFlowItems(p, dId(), [...d.ids], d.dx, d.dy)
        for (const [n, g] of membership) ops.setSubgraphMembership(p, dId(), n, g)
      })
    },
  )
}

/** 直接被拖的節點放開時，中心落在哪個子圖框（以拖曳前的框判斷）就屬於哪個子圖 */
function membershipChanges(): [Id, Id | null][] {
  const frames = subgraphs.value.map((g) => frame(g.shifted))
  return [...draggedNodes.value].flatMap((id): [Id, Id | null][] => {
    const target = packageAt(center(rects.value.get(id)!), frames, sgRects.value)
    const current = props.diagram.subgraphs.find((g) => g.nodeIds.includes(id))?.id ?? null
    return target === current ? [] : [[id, target]]
  })
}

function onEdgeDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  ed.select(id, e.shiftKey || e.ctrlKey || e.metaKey)
}

function editEdgeLabel(id: Id) {
  ed.select(id)
  ed.editing = { kind: 'edgeLabel', id }
}

/** 每段中點的控制點（零長度的段略過） */
function segmentHandles(points: Point[]) {
  return points.slice(1).flatMap((b, i) => {
    const a = points[i]
    if (a.x === b.x && a.y === b.y) return []
    return [{ i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, cursor: a.y === b.y ? 'ns-resize' : 'ew-resize' }]
  })
}

/** 拖曳箭頭的第 i 段沿垂直方向平移（規則見 moveSegment），放開時一次寫入 */
function onSegmentDown(e: PointerEvent, id: Id, i: number) {
  if (e.button !== 0) return
  e.stopPropagation()
  const pts = edges.value.find((x) => x.edge.id === id)?.points
  if (!pts) return
  const horizontal = pts[i].y === pts[i + 1].y
  const start = world(e)
  trackPointer(
    e,
    (m) => {
      const w = world(m)
      const d = Math.round(horizontal ? w.y - start.y : w.x - start.x)
      bendDrag.value = d ? { id, bends: moveSegment(pts, i, d) } : null
    },
    () => {
      const b = bendDrag.value
      bendDrag.value = null
      if (b) store.apply((p) => ops.setFlowEdgeBends(p, dId(), id, b.bends))
    },
  )
}

// ---------- 子圖調整大小 ----------
// 拖曳把手中的預覽大小（同 bendDrag 用 shallowRef）
const resize = shallowRef<{ id: Id; w: number; h: number } | null>(null)

/** 只選取一個子圖時才顯示右下角把手 */
const resizable = computed(() =>
  ed.selection.length === 1 ? subgraphs.value.find((x) => x.sg.id === ed.selection[0]) : undefined,
)

/** 把手拖到哪裡，最小寬高就是游標到錨點 (x, y) 的距離（不小於預設）；放開一次寫入 */
function onResizeDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  const k = props.diagram.subgraphs.find((x) => x.id === id)
  if (!k) return
  trackPointer(
    e,
    (m) => {
      const p = world(m)
      resize.value = { id, w: Math.max(PKG_MIN_W, Math.round(p.x - k.x)), h: Math.max(PKG_MIN_H, Math.round(p.y - k.y)) }
    },
    () => {
      const r = resize.value
      resize.value = null
      if (r && (r.w !== k.w || r.h !== k.h)) store.apply((p) => ops.setSubgraphSize(p, dId(), id, r.w, r.h))
    },
  )
}

function resetSize(id: Id) {
  const k = props.diagram.subgraphs.find((x) => x.id === id)
  if (k?.w !== undefined || k?.h !== undefined) store.apply((p) => ops.resetSubgraphSize(p, dId(), id))
}

function resetEdge(id: Id) {
  store.apply((p) => ops.resetFlowEdgeBends(p, dId(), id))
}

function setShape(id: Id, shape: FlowShape) {
  if (props.diagram.nodes.find((n) => n.id === id)?.shape !== shape) {
    store.apply((p) => ops.setFlowNodeShape(p, dId(), id, shape))
  }
}

function onBackgroundClick(p: Point) {
  const tool = ed.tool
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  if (isShapeTool(tool)) {
    const id = store.apply((draft) => ops.addFlowNode(draft, dId(), tool, x, y))
    ed.select(id)
    ed.editing = { kind: 'flowNode', id }
  } else if (tool === 'subgraph') {
    const id = store.apply((draft) => ops.addSubgraph(draft, dId(), x, y))
    ed.select(id)
    ed.editing = { kind: 'subgraph', id }
  } else {
    // 子圖在最底層且框內不攔截指標（讓框選可從框內開始），點框內空白處在這裡選取子圖
    const g = tool === 'select' ? packageAt(p, props.diagram.subgraphs.map(frame), rects.value) : null
    return g ? ed.select(g) : ed.clear()
  }
  ed.tool = 'select'
}

function onMarquee(r: Rect, additive: boolean) {
  const inside = [...rects.value]
    .filter(([, n]) => n.x >= r.x && n.y >= r.y && n.x + n.w <= r.x + r.w && n.y + n.h <= r.y + r.h)
    .map(([id]) => id)
  ed.selection = additive ? [...new Set([...ed.selection, ...inside])] : inside
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping()) return
  if (e.key === 'Escape') {
    ed.clear()
    ed.tool = 'select'
  } else if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
    // 只在選取恰為一個節點且未在編輯時攔截，其餘維持瀏覽器預設
    const from = selectedNode.value?.id
    if (!from || ed.editing) return
    e.preventDefault()
    const id = store.apply((p) => ops.addNextNode(p, dId(), from, measureText))
    if (!id) return
    ed.select(id)
    ed.editing = { kind: 'flowNode', id }
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selection.length) {
    const known = new Set([
      ...rects.value.keys(),
      ...props.diagram.edges.map((x) => x.id),
      ...props.diagram.subgraphs.map((g) => g.id),
    ])
    const ids = ed.selection.filter((id) => known.has(id))
    if (!ids.length) return
    e.preventDefault()
    store.apply((p) => ops.removeFlowItems(p, dId(), ids))
    ed.clear()
  }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

// ---------- 行內編輯：節點文字、箭頭標籤、子圖標題 ----------
const editBox = computed(() => {
  const e = ed.editing
  if (e?.kind === 'flowNode') {
    const n = nodes.value.find((x) => x.node.id === e.id)
    if (!n) return null
    const initial = n.node.text
    return {
      key: `node-${e.id}`,
      x: n.x,
      y: n.y,
      w: Math.max(n.box.w, 160),
      initial,
      multiline: true,
      placeholder: '節點文字（Shift+Enter 換行）',
      submit: (t: string) => {
        if (t.trim() !== initial) store.apply((p) => ops.setFlowNodeText(p, dId(), e.id, t.trim()))
        return true
      },
    }
  }
  if (e?.kind === 'edgeLabel') {
    const x = edges.value.find((x) => x.edge.id === e.id)
    if (!x) return null
    const pos = labelPos(x.points)
    const initial = x.edge.label
    return {
      key: `edge-${e.id}`,
      x: pos.x - 60,
      y: pos.y - 11,
      w: 120,
      initial,
      multiline: false,
      placeholder: '標籤（可留空）',
      submit: (t: string) => {
        if (t.trim() !== initial) store.apply((p) => ops.setFlowEdgeLabel(p, dId(), e.id, t.trim()))
        return true
      },
    }
  }
  if (e?.kind === 'subgraph') {
    const g = subgraphs.value.find((x) => x.sg.id === e.id)
    if (!g) return null
    const initial = g.sg.title
    return {
      key: `subgraph-${e.id}`,
      x: g.box.x,
      y: g.box.y,
      w: 160,
      initial,
      multiline: false,
      placeholder: '',
      submit: (t: string) => {
        if (!t.trim()) return false
        if (t.trim() !== initial) store.apply((p) => ops.renameSubgraph(p, dId(), e.id, t.trim()))
        return true
      },
    }
  }
  return null
})

function doExport(type: 'svg' | 'png') {
  const b = bounds()
  const content = canvas.value?.content
  if (!b || !content) return
  ;(type === 'svg' ? exportSvg : exportPng)(content, b, props.diagram.name)
}
const isEmpty = computed(() => !props.diagram.nodes.length && !props.diagram.subgraphs.length)
</script>

<template>
  <div class="view">
    <div class="tools">
      <button :class="{ on: ed.tool === 'select' }" @click="ed.tool = 'select'">選取</button>
      <span class="sep" />
      <button v-for="[k, label] in SHAPE_TOOLS" :key="k" :class="{ on: ed.tool === k }" @click="ed.tool = k">
        {{ label }}
      </button>
      <span class="sep" />
      <button :class="{ on: ed.tool === 'edge' }" @click="ed.tool = 'edge'">箭頭</button>
      <button :class="{ on: ed.tool === 'subgraph' }" @click="ed.tool = 'subgraph'">子圖</button>
      <span class="sep" />
      <button @click="canvas?.zoomReset()">100%</button>
      <button @click="canvas?.zoomFit(bounds() ?? { x: 0, y: 0, w: 0, h: 0 })">全圖</button>
      <span class="sep" />
      <button :disabled="isEmpty" title="匯出 SVG" @click="doExport('svg')">匯出 SVG</button>
      <button :disabled="isEmpty" title="匯出 PNG" @click="doExport('png')">匯出 PNG</button>
    </div>
    <div class="hint">
      <template v-if="isShapeTool(ed.tool)">點擊畫布放置節點</template>
      <template v-else-if="ed.tool === 'edge'">從來源節點拖曳到目標節點，放開後輸入標籤（可留空）</template>
      <template v-else-if="ed.tool === 'subgraph'">點擊畫布放置子圖；把節點拖進框內加入、拖出框外離開</template>
      <template v-else-if="selectedNode">
        形狀：
        <button
          v-for="[k, label] in SHAPE_TOOLS"
          :key="k"
          :class="{ on: selectedNode.shape === k }"
          @click="setShape(selectedNode.id, k)"
        >
          {{ label }}
        </button>
        　Tab 建立下一步；雙擊編輯文字；Delete 刪除
      </template>
      <template v-else-if="selectedEdge">
        <button v-if="selectedEdge.bends" @click="resetEdge(selectedEdge.id)">重設路徑</button>
        拖曳控制點調整路徑；雙擊箭頭編輯標籤；Delete 刪除
      </template>
      <template v-else>
        雙擊節點編輯文字（Shift+Enter 換行）；選取節點按 Tab 建立下一步；雙擊箭頭編輯標籤；拖曳子圖標題整組移動、拖曳右下角把手調整大小（雙擊把手重設）；Delete 刪除
      </template>
    </div>
    <div class="drop" :class="{ linking: ed.tool === 'edge' }">
      <Canvas ref="canvas" @background-click="onBackgroundClick" @marquee="onMarquee">
        <Markers />
        <!-- 子圖：最底層，只有標題攔截指標 -->
        <g v-for="g in subgraphs" :key="g.sg.id">
          <rect
            :x="g.box.x"
            :y="g.box.y + PKG_TAB_H"
            :width="g.box.w"
            :height="g.box.h - PKG_TAB_H"
            fill="none"
            :stroke="ed.selection.includes(g.sg.id) ? '#1a73e8' : '#333'"
            :stroke-width="ed.selection.includes(g.sg.id) ? 2 : 1"
            pointer-events="none"
          />
          <g
            class="pkg-tab"
            @pointerdown="onItemDown($event, g.sg.id)"
            @dblclick.stop="ed.editing = { kind: 'subgraph', id: g.sg.id }"
          >
            <rect
              :x="g.box.x"
              :y="g.box.y"
              :width="g.tabW"
              :height="PKG_TAB_H"
              fill="#fff"
              :stroke="ed.selection.includes(g.sg.id) ? '#1a73e8' : '#333'"
              :stroke-width="ed.selection.includes(g.sg.id) ? 2 : 1"
            />
            <text
              :x="g.box.x + 8"
              :y="g.box.y + PKG_TAB_H / 2"
              dominant-baseline="central"
              font-weight="bold"
              pointer-events="none"
            >
              {{ g.sg.title }}
            </text>
          </g>
        </g>
        <FlowEdge
          v-for="e in edges"
          :key="e.edge.id"
          :points="e.points"
          :label="e.edge.label"
          :selected="ed.selection.includes(e.edge.id)"
          @down="onEdgeDown($event, e.edge.id)"
          @edit="editEdgeLabel(e.edge.id)"
        />
        <FlowNode
          v-for="n in nodes"
          :key="n.node.id"
          :shape="n.node.shape"
          :x="n.x"
          :y="n.y"
          :w="n.box.w"
          :h="n.box.h"
          :lines="n.box.lines"
          :selected="highlighted(n.node.id)"
          @down="onItemDown($event, n.node.id)"
          @edit="ed.editing = { kind: 'flowNode', id: n.node.id }"
        />
        <!-- 選取中子圖的調整大小把手 -->
        <rect
          v-if="resizable"
          :x="resizable.box.x + resizable.box.w - 4"
          :y="resizable.box.y + resizable.box.h - 4"
          width="8"
          height="8"
          fill="#fff"
          stroke="#1a73e8"
          style="cursor: nwse-resize"
          data-export="false"
          @pointerdown="onResizeDown($event, resizable.sg.id)"
          @dblclick.stop="resetSize(resizable.sg.id)"
        />
        <!-- 選取中箭頭的線段控制點：畫在最上層，避免靠近節點的短線段被蓋住 -->
        <template v-for="e in edges" :key="`handles-${e.edge.id}`">
          <template v-if="ed.selection.includes(e.edge.id)">
            <rect
              v-for="h in segmentHandles(e.points)"
              :key="h.i"
              :x="h.x - 4"
              :y="h.y - 4"
              width="8"
              height="8"
              fill="#fff"
              stroke="#1a73e8"
              :style="{ cursor: h.cursor }"
              data-export="false"
              @pointerdown="onSegmentDown($event, e.edge.id, h.i)"
            />
          </template>
        </template>
        <line
          v-if="linking && linkFrom"
          :x1="linkFrom.x"
          :y1="linkFrom.y"
          :x2="linking.to.x"
          :y2="linking.to.y"
          stroke="#1a73e8"
          stroke-dasharray="4 3"
          pointer-events="none"
          data-export="false"
        />
        <InlineInput
          v-if="editBox"
          :key="editBox.key"
          :x="editBox.x"
          :y="editBox.y"
          :w="editBox.w"
          :initial="editBox.initial"
          :placeholder="editBox.placeholder"
          :multiline="editBox.multiline"
          :submit="editBox.submit"
          @close="ed.editing = null"
        />
      </Canvas>
    </div>
  </div>
</template>

<style scoped>
/* 與類別圖相同的游標規則 */
.linking {
  cursor: crosshair;
}
.pkg-tab {
  cursor: move;
}
</style>
