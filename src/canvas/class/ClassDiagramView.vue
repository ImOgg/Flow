<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  nodeBox,
  noteBox,
  packageAt,
  packageBox,
  PKG_TAB_H,
  routeWith,
  moveSegment,
  type NodeBox,
  type Point,
  type Rect,
} from '../../model/classLayout'
import * as ops from '../../model/ops'
import type { ClassDiagram, ClassifierKind, Id, RelationKind } from '../../model/types'
import { exportPng, exportSvg } from '../../io/export'
import { useEditorStore, type ClassTool } from '../../store/editor'
import { useProjectStore } from '../../store/project'
import Canvas from '../Canvas.vue'
import InlineInput from '../InlineInput.vue'
import Markers from '../Markers.vue'
import { measureText } from '../measure'
import NoteShape from '../NoteShape.vue'
import { isTyping, trackPointer } from '../pointer'
import ClassNode from './ClassNode.vue'
import RelationEdge from './RelationEdge.vue'

const props = defineProps<{ diagram: ClassDiagram }>()
const store = useProjectStore()
const ed = useEditorStore()
const canvas = ref<InstanceType<typeof Canvas>>()
const dId = () => props.diagram.id

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

// 拖曳中的暫時位移，放開才寫回 store。ids 可混合節點、Note、套件
const drag = ref<{ ids: Set<Id>; dx: number; dy: number } | null>(null)
const linking = ref<{ sourceId: Id; kind: RelationKind | 'noteLink'; to: Point } | null>(null)
// 拖曳線段中的轉折點預覽
// shallowRef：bends 會直接寫進專案，不能是響應式 Proxy（structuredClone 無法複製）
const bendDrag = shallowRef<{ id: Id; bends: Point[] } | null>(null)

/** 正在跟著拖曳移動的節點：直接選取的，加上被拖曳套件的成員 */
const movingNodes = computed(() => {
  const d = drag.value
  const s = new Set(d?.ids)
  if (d) for (const k of props.diagram.packages) if (d.ids.has(k.id)) k.elementIds.forEach((el) => s.add(el))
  return s
})
const shift = <T extends Point>(o: T, moving: boolean): T =>
  moving && drag.value ? { ...o, x: o.x + drag.value.dx, y: o.y + drag.value.dy } : o

const nodes = computed(() =>
  props.diagram.nodes.flatMap((n) => {
    const el = store.project.model.elements[n.elementId]
    if (!el) return []
    const box: NodeBox = nodeBox(el, measureText)
    return [{ el, box, base: n, ...shift({ x: n.x, y: n.y }, movingNodes.value.has(n.elementId)) }]
  }),
)
const rects = computed(() => new Map(nodes.value.map((n) => [n.el.id, { x: n.x, y: n.y, w: n.box.w, h: n.box.h }])))

/** 直接拖曳中的節點（不含跟著套件移動的成員） */
const draggedNodes = computed(() => {
  const d = drag.value
  if (!d) return new Set<Id>()
  const viaPackage = new Set(props.diagram.packages.filter((k) => d.ids.has(k.id)).flatMap((k) => k.elementIds))
  return new Set([...d.ids].filter((id) => rects.value.has(id) && !viaPackage.has(id)))
})
/**
 * 套件框計算用：直接拖曳中的節點仍以原位置計入，框在放開前不變，
 * 放開時以這個框判斷加入 / 離開（成員小幅移動不會被擠出去，往邊緣拖可把框撐大）
 */
const pkgRects = computed(() => {
  const m = new Map(rects.value)
  for (const n of nodes.value) {
    if (draggedNodes.value.has(n.el.id)) m.set(n.el.id, { ...m.get(n.el.id)!, x: n.base.x, y: n.base.y })
  }
  return m
})

const notes = computed(() =>
  props.diagram.notes.map((n) => {
    const box = noteBox(n.text, measureText)
    return { note: n, box, ...shift({ x: n.x, y: n.y }, !!drag.value?.ids.has(n.id)) }
  }),
)
const noteRects = computed(() => new Map(notes.value.map((n) => [n.note.id, { x: n.x, y: n.y, w: n.box.w, h: n.box.h }])))

/** 套件：shifted 為套用拖曳位移後的資料，box 由成員撐開 */
const packages = computed(() =>
  props.diagram.packages.map((k) => {
    const shifted = shift(k, !!drag.value?.ids.has(k.id))
    return { pkg: k, shifted, box: packageBox(shifted, pkgRects.value), tabW: measureText(k.name, true) + 16 }
  }),
)

const edges = computed(() =>
  props.diagram.edges.flatMap((e) => {
    const r = store.project.model.relations[e.relationId]
    const a = r && rects.value.get(r.sourceId)
    const b = r && rects.value.get(r.targetId)
    if (!a || !b) return []
    const bends = bendDrag.value?.id === r.id ? bendDrag.value.bends : e.bends
    return [{ id: r.id, kind: r.kind, points: routeWith(a, b, bends, r.sourceId === r.targetId) }]
  }),
)

const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

const noteLinks = computed(() =>
  notes.value.flatMap((n) =>
    n.note.links.flatMap((el) => {
      const r = rects.value.get(el)
      if (!r) return []
      return [{ id: ops.noteLinkId(n.note.id, el), from: center(noteRects.value.get(n.note.id)!), to: center(r) }]
    }),
  ),
)

const linkFrom = computed(() => {
  const id = linking.value?.sourceId
  const r = id && (rects.value.get(id) ?? noteRects.value.get(id))
  return r ? center(r) : null
})

const nodeAt = (p: Point) =>
  [...rects.value].reverse().find(([, r]) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.[0]

/** 選取中、或正在拉關係的來源 / 游標下的目標，都用選取框標示 */
const highlighted = (id: Id) =>
  ed.selection.includes(id) || (!!linking.value && (linking.value.sourceId === id || nodeAt(linking.value.to) === id))

function bounds(): Rect | null {
  const boxes = [...rects.value.values(), ...noteRects.value.values(), ...packages.value.map((k) => k.box)]
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

/** 拉關係（從節點）或註解連結（從 Note） */
function startLinking(e: PointerEvent, id: Id, kind: RelationKind | 'noteLink') {
  const start = world(e)
  linking.value = { sourceId: id, kind, to: start }
  trackPointer(
    e,
    (m) => (linking.value!.to = world(m)),
    (u) => {
      const end = world(u)
      const target = nodeAt(end)
      const moved = Math.hypot(end.x - start.x, end.y - start.y) > 5
      linking.value = null
      if (kind === 'noteLink') {
        if (!target) return
        store.apply((p) => ops.linkNote(p, dId(), id, target))
        ed.select(ops.noteLinkId(id, target))
      } else {
        if (!target || (target === id && !moved)) return
        ed.select(store.apply((p) => ops.addRelation(p, kind, id, target, dId())))
      }
      ed.tool = 'select'
    },
  )
}

/** 節點、Note、套件標籤共用：選取並拖曳移動 */
function onItemDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  const tool = ed.tool
  if (isRelationTool(tool) || tool === 'noteLink') {
    if (tool === 'noteLink' ? noteRects.value.has(id) : rects.value.has(id)) startLinking(e, id, tool)
    return
  }
  if (e.shiftKey || e.ctrlKey || e.metaKey) return ed.select(id, true)
  if (!ed.selection.includes(id)) ed.select(id)
  const movable = new Set([...rects.value.keys(), ...noteRects.value.keys(), ...props.diagram.packages.map((k) => k.id)])
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
        ops.moveItems(p, dId(), [...d.ids], d.dx, d.dy)
        for (const [el, k] of membership) ops.setPackageMembership(p, dId(), el, k)
      })
    },
  )
}

/** 直接被拖的節點放開時，中心落在哪個套件框（以拖曳前的框判斷）就屬於哪個套件 */
function membershipChanges(): [Id, Id | null][] {
  const pkgs = packages.value.map((k) => k.shifted)
  return [...draggedNodes.value].flatMap((id): [Id, Id | null][] => {
    const target = packageAt(center(rects.value.get(id)!), pkgs, pkgRects.value)
    const current = props.diagram.packages.find((k) => k.elementIds.includes(id))?.id ?? null
    return target === current ? [] : [[id, target]]
  })
}

function onEdgeDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  ed.select(id, e.shiftKey || e.ctrlKey || e.metaKey)
}

/** 每段中點的控制點（零長度的段略過） */
function segmentHandles(points: Point[]) {
  return points.slice(1).flatMap((b, i) => {
    const a = points[i]
    if (a.x === b.x && a.y === b.y) return []
    return [{ i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, cursor: a.y === b.y ? 'ns-resize' : 'ew-resize' }]
  })
}

/** 拖曳連線的第 i 段沿垂直方向平移（規則見 moveSegment），放開時一次寫入 */
function onSegmentDown(e: PointerEvent, id: Id, i: number) {
  if (e.button !== 0) return
  e.stopPropagation()
  const pts = edges.value.find((x) => x.id === id)?.points
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
      if (b) store.apply((p) => ops.setEdgeBends(p, dId(), id, b.bends))
    },
  )
}

function resetEdge(id: Id) {
  if (props.diagram.edges.find((e) => e.relationId === id)?.bends) {
    store.apply((p) => ops.resetEdgeBends(p, dId(), id))
  }
}

function onBackgroundClick(p: Point) {
  const tool = ed.tool
  const x = Math.round(p.x)
  const y = Math.round(p.y)
  if (tool === 'note') {
    const id = store.apply((draft) => ops.addNote(draft, dId(), x, y))
    ed.select(id)
    ed.editing = { kind: 'note', id }
  } else if (tool === 'package') {
    const id = store.apply((draft) => ops.addPackage(draft, dId(), x, y))
    ed.select(id)
    ed.editing = { kind: 'package', id }
  } else if (isClassifierTool(tool)) {
    const id = store.apply((draft) => {
      const id = ops.addElement(draft, tool)
      ops.addNode(draft, dId(), id, x, y)
      return id
    })
    ed.select(id)
    ed.editing = { kind: 'name', id }
  } else {
    // 套件在最底層且框內不攔截指標（讓框選可從框內開始），點框內空白處在這裡選取套件
    const k = tool === 'select' ? packageAt(p, props.diagram.packages, rects.value) : null
    return k ? ed.select(k) : ed.clear()
  }
  ed.tool = 'select'
}

function onMarquee(r: Rect, additive: boolean) {
  const inside = [...rects.value, ...noteRects.value]
    .filter(([, n]) => n.x >= r.x && n.y >= r.y && n.x + n.w <= r.x + r.w && n.y + n.h <= r.y + r.h)
    .map(([id]) => id)
  ed.selection = additive ? [...new Set([...ed.selection, ...inside])] : inside
}

/** 從模型樹拖入 */
function onDrop(e: DragEvent) {
  const id = e.dataTransfer?.getData('text/x-uml-element')
  if (!id || !store.project.model.elements[id] || rects.value.has(id)) return
  const p = canvas.value!.toWorld(e.clientX, e.clientY)
  store.apply((draft) => ops.addNode(draft, dId(), id, Math.round(p.x - 60), Math.round(p.y - 20)))
  ed.select(id)
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping()) return
  if (e.key === 'Escape') {
    ed.clear()
    ed.tool = 'select'
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selection.length) {
    const known = new Set([
      ...rects.value.keys(),
      ...noteRects.value.keys(),
      ...props.diagram.edges.map((x) => x.relationId),
      ...props.diagram.packages.map((k) => k.id),
      ...noteLinks.value.map((l) => l.id),
    ])
    const ids = ed.selection.filter((id) => known.has(id))
    if (!ids.length) return
    e.preventDefault()
    store.apply((p) => ops.removeFromDiagram(p, dId(), ids))
    ed.clear()
  }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

// ---------- Note / 套件的行內編輯 ----------
const editBox = computed(() => {
  const e = ed.editing
  if (e?.kind === 'note') {
    const n = notes.value.find((x) => x.note.id === e.id)
    if (!n) return null
    const initial = n.note.text
    return {
      key: `note-${e.id}`,
      x: n.x,
      y: n.y,
      w: Math.max(n.box.w, 200),
      initial,
      multiline: true,
      placeholder: '註解文字（Shift+Enter 換行）',
      submit: (t: string) => {
        if (t.trim() !== initial) store.apply((p) => ops.setNoteText(p, dId(), e.id, t.trim()))
        return true
      },
    }
  }
  if (e?.kind === 'package') {
    const k = packages.value.find((x) => x.pkg.id === e.id)
    if (!k) return null
    const initial = k.pkg.name
    return {
      key: `package-${e.id}`,
      x: k.box.x,
      y: k.box.y,
      w: 160,
      initial,
      multiline: false,
      placeholder: '',
      submit: (t: string) => {
        if (!t.trim()) return false
        if (t.trim() !== initial) store.apply((p) => ops.renamePackage(p, dId(), e.id, t.trim()))
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
const isEmpty = computed(() => !props.diagram.nodes.length && !props.diagram.notes.length && !props.diagram.packages.length)
</script>

<template>
  <div class="view">
    <div class="tools">
      <button :class="{ on: ed.tool === 'select' }" @click="ed.tool = 'select'">選取</button>
      <span class="sep" />
      <button v-for="[k, label] in CLASSIFIER_TOOLS" :key="k" :class="{ on: ed.tool === k }" @click="ed.tool = k">
        {{ label }}
      </button>
      <button :class="{ on: ed.tool === 'package' }" @click="ed.tool = 'package'">Package</button>
      <span class="sep" />
      <button v-for="[k, label] in RELATION_TOOLS" :key="k" :class="{ on: ed.tool === k }" @click="ed.tool = k">
        {{ label }}
      </button>
      <span class="sep" />
      <button :class="{ on: ed.tool === 'note' }" @click="ed.tool = 'note'">Note</button>
      <button :class="{ on: ed.tool === 'noteLink' }" @click="ed.tool = 'noteLink'">註解連結</button>
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
      <template v-else-if="ed.tool === 'note'">點擊畫布放置註解</template>
      <template v-else-if="ed.tool === 'noteLink'">從 Note 拖曳到要說明的元素</template>
      <template v-else-if="ed.tool === 'package'">點擊畫布放置套件；把類別拖進框內加入、拖出框外離開</template>
      <template v-else>
        雙擊名稱改名、雙擊區塊新增成員（例：- name: string、+ login(id: string): bool）；選取連線後拖曳控制點調整路徑、雙擊連線重設；拖曳套件標籤整組移動；Delete 從圖移除
      </template>
    </div>
    <div
      class="drop"
      :class="{ linking: isRelationTool(ed.tool) || ed.tool === 'noteLink' }"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <Canvas ref="canvas" @background-click="onBackgroundClick" @marquee="onMarquee">
        <Markers />
        <!-- 套件：最底層，只有標籤攔截指標 -->
        <g v-for="k in packages" :key="k.pkg.id">
          <rect
            :x="k.box.x"
            :y="k.box.y + PKG_TAB_H"
            :width="k.box.w"
            :height="k.box.h - PKG_TAB_H"
            fill="none"
            :stroke="ed.selection.includes(k.pkg.id) ? '#1a73e8' : '#333'"
            :stroke-width="ed.selection.includes(k.pkg.id) ? 2 : 1"
            pointer-events="none"
          />
          <g
            class="pkg-tab"
            @pointerdown="onItemDown($event, k.pkg.id)"
            @dblclick.stop="ed.editing = { kind: 'package', id: k.pkg.id }"
          >
            <rect
              :x="k.box.x"
              :y="k.box.y"
              :width="k.tabW"
              :height="PKG_TAB_H"
              fill="#fff"
              :stroke="ed.selection.includes(k.pkg.id) ? '#1a73e8' : '#333'"
              :stroke-width="ed.selection.includes(k.pkg.id) ? 2 : 1"
            />
            <text
              :x="k.box.x + 8"
              :y="k.box.y + PKG_TAB_H / 2"
              dominant-baseline="central"
              font-weight="bold"
              pointer-events="none"
            >
              {{ k.pkg.name }}
            </text>
          </g>
        </g>
        <RelationEdge
          v-for="e in edges"
          :key="e.id"
          :kind="e.kind"
          :points="e.points"
          :selected="ed.selection.includes(e.id)"
          @down="onEdgeDown($event, e.id)"
          @reset="resetEdge(e.id)"
        />
        <!-- 註解連結 -->
        <g v-for="l in noteLinks" :key="l.id" @pointerdown="onEdgeDown($event, l.id)">
          <line :x1="l.from.x" :y1="l.from.y" :x2="l.to.x" :y2="l.to.y" stroke="transparent" stroke-width="10" data-export="false" />
          <line
            :x1="l.from.x"
            :y1="l.from.y"
            :x2="l.to.x"
            :y2="l.to.y"
            :stroke="ed.selection.includes(l.id) ? '#1a73e8' : '#333'"
            :stroke-width="ed.selection.includes(l.id) ? 2 : 1"
            stroke-dasharray="4 3"
          />
        </g>
        <ClassNode
          v-for="n in nodes"
          :key="n.el.id"
          :el="n.el"
          :box="n.box"
          :x="n.x"
          :y="n.y"
          :selected="highlighted(n.el.id)"
          @down="onItemDown($event, n.el.id)"
        />
        <NoteShape
          v-for="n in notes"
          :key="n.note.id"
          :x="n.x"
          :y="n.y"
          :w="n.box.w"
          :h="n.box.h"
          :lines="n.box.lines"
          :selected="highlighted(n.note.id)"
          @down="onItemDown($event, n.note.id)"
          @edit="ed.editing = { kind: 'note', id: n.note.id }"
        />
        <!-- 選取中連線的線段控制點：畫在最上層，避免靠近邊框的短線段被類別框蓋住 -->
        <template v-for="e in edges" :key="`handles-${e.id}`">
          <template v-if="ed.selection.includes(e.id)">
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
              @pointerdown="onSegmentDown($event, e.id, h.i)"
              @dblclick.stop="resetEdge(e.id)"
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
.linking {
  cursor: crosshair;
}
.pkg-tab {
  cursor: move;
}
</style>
