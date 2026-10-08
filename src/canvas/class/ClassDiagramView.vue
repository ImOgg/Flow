<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { nodeBox, route, type NodeBox, type Point, type Rect } from '../../model/classLayout'
import * as ops from '../../model/ops'
import type { ClassDiagram, ClassifierKind, Id, RelationKind } from '../../model/types'
import { exportPng, exportSvg } from '../../io/export'
import { useEditorStore, type ClassTool } from '../../store/editor'
import { useProjectStore } from '../../store/project'
import Canvas from '../Canvas.vue'
import Markers from '../Markers.vue'
import { measureText } from '../measure'
import { isTyping, trackPointer } from '../pointer'
import ClassNode from './ClassNode.vue'
import RelationEdge from './RelationEdge.vue'

const props = defineProps<{ diagram: ClassDiagram }>()
const store = useProjectStore()
const ed = useEditorStore()
const canvas = ref<InstanceType<typeof Canvas>>()

const CLASSIFIER_TOOLS: [ClassifierKind, string][] = [
  ['class', 'Class'],
  ['interface', 'Interface'],
  ['enum', 'Enum'],
]
const RELATION_TOOLS: [RelationKind, string][] = [
  ['association', '關聯'],
  ['generalization', '繼承'],
  ['realization', '實作'],
  ['dependency', '相依'],
  ['aggregation', '聚合'],
  ['composition', '組合'],
]
const isClassifierTool = (t: ClassTool): t is ClassifierKind => CLASSIFIER_TOOLS.some(([k]) => k === t)
const isRelationTool = (t: ClassTool): t is RelationKind => RELATION_TOOLS.some(([k]) => k === t)

// 拖曳中的暫時位移，放開才寫回 store
const drag = ref<{ ids: Set<Id>; dx: number; dy: number } | null>(null)
const linking = ref<{ sourceId: Id; kind: RelationKind; to: Point } | null>(null)

const nodes = computed(() =>
  props.diagram.nodes.flatMap((n) => {
    const el = store.project.model.elements[n.elementId]
    if (!el) return []
    const box: NodeBox = nodeBox(el, measureText)
    const off = drag.value?.ids.has(n.elementId) ? drag.value : null
    return [{ el, box, x: n.x + (off?.dx ?? 0), y: n.y + (off?.dy ?? 0) }]
  }),
)
const rects = computed(() => new Map(nodes.value.map((n) => [n.el.id, { x: n.x, y: n.y, w: n.box.w, h: n.box.h }])))

const edges = computed(() =>
  props.diagram.edges.flatMap((e) => {
    const r = store.project.model.relations[e.relationId]
    const a = r && rects.value.get(r.sourceId)
    const b = r && rects.value.get(r.targetId)
    if (!a || !b) return []
    return [{ id: r.id, kind: r.kind, points: route(a, b, r.sourceId === r.targetId) }]
  }),
)

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const nodeAt = (p: Point) =>
  [...rects.value].reverse().find(([, r]) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.[0]

function bounds(): Rect | null {
  const pts = [...rects.value.values()].flatMap((r) => [
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

function onNodeDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  const start = world(e)
  if (isRelationTool(ed.tool)) {
    const kind = ed.tool
    linking.value = { sourceId: id, kind, to: start }
    trackPointer(
      e,
      (m) => (linking.value!.to = world(m)),
      (u) => {
        const end = world(u)
        const target = nodeAt(end)
        const moved = Math.hypot(end.x - start.x, end.y - start.y) > 5
        linking.value = null
        if (!target || (target === id && !moved)) return
        const rid = store.apply((p) => ops.addRelation(p, kind, id, target, props.diagram.id))
        ed.select(rid)
        ed.tool = 'select'
      },
    )
    return
  }
  if (e.shiftKey || e.ctrlKey || e.metaKey) return ed.select(id, true)
  if (!ed.selection.includes(id)) ed.select(id)
  const ids = new Set(ed.selection.filter((s) => rects.value.has(s)))
  drag.value = { ids, dx: 0, dy: 0 }
  trackPointer(
    e,
    (m) => {
      const p = world(m)
      drag.value = { ids, dx: Math.round(p.x - start.x), dy: Math.round(p.y - start.y) }
    },
    () => {
      const d = drag.value
      drag.value = null
      if (d && (d.dx || d.dy)) store.apply((p) => ops.moveNodes(p, props.diagram.id, [...d.ids], d.dx, d.dy))
    },
  )
}

function onEdgeDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  ed.select(id, e.shiftKey || e.ctrlKey || e.metaKey)
}

function onBackgroundClick(p: Point) {
  const kind = ed.tool
  if (!isClassifierTool(kind)) return ed.clear()
  const id = store.apply((draft) => {
    const id = ops.addElement(draft, kind)
    ops.addNode(draft, props.diagram.id, id, Math.round(p.x), Math.round(p.y))
    return id
  })
  ed.select(id)
  ed.editing = { kind: 'name', id }
  ed.tool = 'select'
}

function onMarquee(r: Rect, additive: boolean) {
  const inside = [...rects.value]
    .filter(([, n]) => n.x >= r.x && n.y >= r.y && n.x + n.w <= r.x + r.w && n.y + n.h <= r.y + r.h)
    .map(([id]) => id)
  ed.selection = additive ? [...new Set([...ed.selection, ...inside])] : inside
}

/** 從模型樹拖入 */
function onDrop(e: DragEvent) {
  const id = e.dataTransfer?.getData('text/x-uml-element')
  if (!id || !store.project.model.elements[id] || rects.value.has(id)) return
  const p = canvas.value!.toWorld(e.clientX, e.clientY)
  store.apply((draft) => ops.addNode(draft, props.diagram.id, id, Math.round(p.x - 60), Math.round(p.y - 20)))
  ed.select(id)
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping()) return
  if (e.key === 'Escape') {
    ed.clear()
    ed.tool = 'select'
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selection.length) {
    const els = ed.selection.filter((id) => rects.value.has(id))
    const rels = ed.selection.filter((id) => props.diagram.edges.some((x) => x.relationId === id))
    if (!els.length && !rels.length) return
    e.preventDefault()
    store.apply((p) => ops.removeFromDiagram(p, props.diagram.id, els, rels))
    ed.clear()
  }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

function doExport(type: 'svg' | 'png') {
  const b = bounds()
  const content = canvas.value?.content
  if (!b || !content) return
  ;(type === 'svg' ? exportSvg : exportPng)(content, b, props.diagram.name)
}
const isEmpty = computed(() => !props.diagram.nodes.length)
</script>

<template>
  <div class="view">
    <div class="tools">
      <button :class="{ on: ed.tool === 'select' }" @click="ed.tool = 'select'">選取</button>
      <span class="sep" />
      <button v-for="[k, label] in CLASSIFIER_TOOLS" :key="k" :class="{ on: ed.tool === k }" @click="ed.tool = k">
        {{ label }}
      </button>
      <span class="sep" />
      <button v-for="[k, label] in RELATION_TOOLS" :key="k" :class="{ on: ed.tool === k }" @click="ed.tool = k">
        {{ label }}
      </button>
      <span class="sep" />
      <button @click="canvas?.zoomReset()">100%</button>
      <button @click="canvas?.zoomFit(bounds() ?? { x: 0, y: 0, w: 0, h: 0 })">全圖</button>
      <span class="sep" />
      <button :disabled="isEmpty" title="匯出 SVG" @click="doExport('svg')">匯出 SVG</button>
      <button :disabled="isEmpty" title="匯出 PNG" @click="doExport('png')">匯出 PNG</button>
    </div>
    <div class="hint">
      <template v-if="isClassifierTool(ed.tool)">點擊畫布放置元素</template>
      <template v-else-if="isRelationTool(ed.tool)">從來源拖曳到目標（聚合 / 組合：從整體拖到部分）</template>
      <template v-else>雙擊名稱改名、雙擊區塊新增成員（例：- name: string、+ login(id: string): bool）；Delete 從圖移除</template>
    </div>
    <div class="drop" @dragover.prevent @drop.prevent="onDrop">
      <Canvas ref="canvas" @background-click="onBackgroundClick" @marquee="onMarquee">
        <Markers />
        <RelationEdge
          v-for="e in edges"
          :key="e.id"
          :kind="e.kind"
          :points="e.points"
          :selected="ed.selection.includes(e.id)"
          @down="onEdgeDown($event, e.id)"
        />
        <ClassNode
          v-for="n in nodes"
          :key="n.el.id"
          :el="n.el"
          :box="n.box"
          :x="n.x"
          :y="n.y"
          :selected="ed.selection.includes(n.el.id)"
          @down="onNodeDown($event, n.el.id)"
        />
        <line
          v-if="linking"
          :x1="center(rects.get(linking.sourceId)!).x"
          :y1="center(rects.get(linking.sourceId)!).y"
          :x2="linking.to.x"
          :y2="linking.to.y"
          stroke="#1a73e8"
          stroke-dasharray="4 3"
          pointer-events="none"
          data-export="false"
        />
      </Canvas>
    </div>
  </div>
</template>
