<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Point, Rect } from '../../model/classLayout'
import * as ops from '../../model/ops'
import { parseMessage } from '../../model/quickInput'
import { layoutSequence, SEQ, type FragmentBox, type MessageBox } from '../../model/sequenceLayout'
import type { FragmentType, Id, InsertPos, SequenceDiagram } from '../../model/types'
import { exportPng, exportSvg } from '../../io/export'
import { useEditorStore } from '../../store/editor'
import { useProjectStore } from '../../store/project'
import Canvas from '../Canvas.vue'
import InlineInput from '../InlineInput.vue'
import Markers from '../Markers.vue'
import { measureText } from '../measure'
import { isTyping, trackPointer } from '../pointer'

const props = defineProps<{ diagram: SequenceDiagram }>()
const store = useProjectStore()
const ed = useEditorStore()
const canvas = ref<InstanceType<typeof Canvas>>()
const { HEAD_TOP, HEAD_H, MARGIN, SELF_H } = SEQ

const L = computed(() => layoutSequence(props.diagram, store.project, measureText))
const dId = () => props.diagram.id
const world = (e: PointerEvent) => canvas.value!.toWorld(e.clientX, e.clientY)
const isSelected = (id: Id) => ed.selection.includes(id)
const lifelineIds = computed(() => new Set(props.diagram.lifelines.map((l) => l.id)))

// ---------- 生命線：選取、水平拖曳重排 ----------
const headDrag = ref<{ id: Id; dx: number } | null>(null)

function lifelineIndexAt(x: number) {
  const n = props.diagram.lifelines.length
  return Math.max(0, Math.min(n - 1, Math.round((x - MARGIN - L.value.col / 2) / L.value.col)))
}

function onHeadDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  ed.select(id, e.shiftKey || e.ctrlKey)
  const start = world(e).x
  trackPointer(
    e,
    (m) => (headDrag.value = { id, dx: world(m).x - start }),
    () => {
      const d = headDrag.value
      headDrag.value = null
      if (!d || Math.abs(d.dx) < 5) return
      const from = props.diagram.lifelines.findIndex((l) => l.id === id)
      const to = lifelineIndexAt(L.value.lifelines[from].cx + d.dx)
      if (to !== from) store.apply((p) => ops.moveLifeline(p, dId(), id, to))
    },
  )
}

// ---------- 訊息：選取、垂直拖曳重排 ----------
const msgDrag = ref<{ id: Id; y: number } | null>(null)

function onMessageDown(e: PointerEvent, id: Id) {
  if (e.button !== 0) return
  e.stopPropagation()
  ed.select(id, e.shiftKey || e.ctrlKey)
  const startY = world(e).y
  trackPointer(
    e,
    (m) => (msgDrag.value = { id, y: world(m).y }),
    () => {
      const d = msgDrag.value
      msgDrag.value = null
      if (!d || Math.abs(d.y - startY) < 5) return
      const pos = nearestSlot(d.y)
      if (pos && !isSamePlace(id, pos)) store.apply((p) => ops.moveItem(p, dId(), id, pos))
    },
  )
}

function nearestSlot(y: number): InsertPos | null {
  let best: { d: number; pos: InsertPos } | null = null
  for (const s of L.value.slots) {
    const d = Math.abs(s.y - y)
    if (!best || d < best.d) best = { d, pos: s.pos }
  }
  return best?.pos ?? null
}

function isSamePlace(id: Id, pos: InsertPos) {
  const hit = ops.findItem(props.diagram.items, id)
  const same = hit?.container?.fragmentId === pos.container?.fragmentId && hit?.container?.operand === pos.container?.operand
  return !!hit && same && (pos.index === hit.index || pos.index === hit.index + 1)
}

// ---------- 片段 ----------
const labelW = (f: FragmentBox) => measureText(f.type, true) + 16

function operandBottom(f: FragmentBox, i: number) {
  return i + 1 < f.operands.length ? f.operands[i + 1].y : f.y2
}

function onOperandDown(e: PointerEvent, f: FragmentBox, operand: number) {
  if (e.button !== 0) return
  e.stopPropagation()
  ed.select(f.id, e.shiftKey || e.ctrlKey)
  ed.operand = { fragmentId: f.id, operand }
}

function wrap(type: FragmentType) {
  const items = ed.selection.filter((id) => ops.findItem(props.diagram.items, id))
  if (!items.length) return
  // 先在副本上試，失敗就不產生復原紀錄
  if (!ops.wrapInFragment(structuredClone(store.project), dId(), items, type)) {
    alert('請選取同一層中連續的訊息')
    return
  }
  const id = store.apply((p) => ops.wrapInFragment(p, dId(), items, type))!
  ed.select(id)
  ed.editing = { kind: 'guard', id, operand: 0 }
}

const selectedFragment = computed(() => {
  if (ed.selection.length !== 1) return null
  const hit = ops.findItem(props.diagram.items, ed.selection[0])
  return hit?.item.kind === 'fragment' ? hit.item : null
})

function addOperand() {
  const f = selectedFragment.value
  if (!f) return
  store.apply((p) => ops.addOperand(p, dId(), f.id))
  ed.editing = { kind: 'guard', id: f.id, operand: f.operands.length }
}

function unwrap() {
  const f = selectedFragment.value
  if (f) store.apply((p) => ops.deleteItem(p, dId(), f.id))
  ed.clear()
}

// ---------- 新增 ----------
function addLifeline() {
  const id = store.apply((p) => ops.addLifeline(p, dId(), 'Lifeline'))
  ed.select(id)
  ed.editing = { kind: 'lifeline', id }
}

/** 快速輸入的插入位置：選取的區段末端 > 選取項目之後 > 最後 */
function insertPos(): InsertPos | undefined {
  const o = ed.operand
  if (o) {
    const hit = ops.findItem(props.diagram.items, o.fragmentId)
    if (hit?.item.kind === 'fragment') return { container: o, index: hit.item.operands[o.operand].items.length }
  }
  const last = ed.selection.at(-1)
  return (last && ops.posAfter(props.diagram, last)) || undefined
}

const quick = ref('')
const quickError = ref(false)
function submitQuick() {
  const m = parseMessage(quick.value)
  if (!m) {
    quickError.value = true
    return
  }
  const pos = insertPos()
  const id = store.apply((p) => {
    const from = ops.ensureLifeline(p, dId(), m.from)
    const to = ops.ensureLifeline(p, dId(), m.to)
    return ops.insertMessage(p, dId(), { from, to, text: m.text, type: m.type }, pos)
  })
  ed.select(id) // 下一則接在這則之後
  quick.value = ''
}

/** 從模型樹拖入：新增綁定該類別的生命線，位置依放開的欄 */
function onDrop(e: DragEvent) {
  const elementId = e.dataTransfer?.getData('text/x-uml-element')
  if (!elementId || !store.project.model.elements[elementId]) return
  const x = canvas.value!.toWorld(e.clientX, e.clientY).x
  const index = Math.max(0, Math.min(props.diagram.lifelines.length, Math.round((x - MARGIN) / L.value.col)))
  const id = store.apply((p) => ops.addLifeline(p, dId(), '', elementId, index))
  ed.select(id)
}

// ---------- 選取與刪除 ----------
function onMarquee(r: Rect, additive: boolean) {
  const inside = (x1: number, x2: number, y1: number, y2: number) =>
    Math.min(x1, x2) >= r.x && Math.max(x1, x2) <= r.x + r.w && y1 >= r.y && y2 <= r.y + r.h
  const ids = [
    ...L.value.messages.filter((m) => inside(m.x1, m.self ? m.x1 + 30 : m.x2, m.y, m.self ? m.y + SELF_H : m.y)).map((m) => m.id),
    ...L.value.lifelines.filter((l) => inside(l.cx - l.headW / 2, l.cx + l.headW / 2, HEAD_TOP, HEAD_TOP + HEAD_H)).map((l) => l.id),
  ]
  ed.selection = additive ? [...new Set([...ed.selection, ...ids])] : ids
}

function onKeyDown(e: KeyboardEvent) {
  if (isTyping()) return
  if (e.key === 'Escape') ed.clear()
  else if ((e.key === 'Delete' || e.key === 'Backspace') && ed.selection.length) {
    e.preventDefault()
    const sel = [...ed.selection]
    store.apply((p) => {
      for (const id of sel) {
        if (lifelineIds.value.has(id)) ops.deleteLifeline(p, dId(), id)
        else ops.deleteItem(p, dId(), id) // 片段：解除，內容保留
      }
    })
    ed.clear()
  }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))

// ---------- 行內編輯 ----------
const editing = computed(() => {
  const e = ed.editing
  return e && (e.kind === 'lifeline' || e.kind === 'message' || e.kind === 'guard') ? e : null
})
const stopEditing = () => (ed.editing = null)

const editBox = computed((): (Point & { w: number; initial: string; submit: (t: string) => boolean }) | null => {
  const e = editing.value
  if (!e) return null
  if (e.kind === 'lifeline') {
    const i = props.diagram.lifelines.findIndex((l) => l.id === e.id)
    if (i < 0) return null
    const box = L.value.lifelines[i]
    return {
      x: box.cx - 80,
      y: HEAD_TOP + 6,
      w: 160,
      initial: props.diagram.lifelines[i].name,
      submit: (t) => {
        // 綁定類別的生命線可以沒有名稱
        if (!t.trim() && !props.diagram.lifelines[i].elementId) return false
        if (t.trim() !== props.diagram.lifelines[i].name) store.apply((p) => ops.renameLifeline(p, dId(), e.id, t.trim()))
        return true
      },
    }
  }
  if (e.kind === 'message') {
    const m = L.value.messages.find((x) => x.id === e.id)
    const hit = ops.findItem(props.diagram.items, e.id)
    if (!m || hit?.item.kind !== 'message') return null
    const initial = hit.item.text
    return {
      x: m.self ? m.x1 + 36 : (m.x1 + m.x2) / 2 - 100,
      y: m.y - 26,
      w: 200,
      initial,
      submit: (t) => {
        if (t !== initial) store.apply((p) => ops.updateMessage(p, dId(), e.id, { text: t.trim() }))
        return true
      },
    }
  }
  const f = L.value.fragments.find((x) => x.id === e.id)
  const op = f?.operands[e.operand]
  if (!f || !op) return null
  return {
    x: e.operand === 0 ? f.x1 + labelW(f) + 6 : f.x1 + 6,
    y: op.y + 4,
    w: 200,
    initial: op.guard,
    submit: (t) => {
      if (t !== op.guard) store.apply((p) => ops.setGuard(p, dId(), f.id, e.operand, t.trim()))
      return true
    },
  }
})

// ---------- 匯出 ----------
const isEmpty = computed(() => !props.diagram.lifelines.length)
function doExport(type: 'svg' | 'png') {
  const content = canvas.value?.content
  if (isEmpty.value || !content) return
  ;(type === 'svg' ? exportSvg : exportPng)(content, { x: 0, y: 0, w: L.value.width, h: L.value.height }, props.diagram.name)
}

const messagePath = (m: MessageBox) =>
  m.self ? `M${m.x1},${m.y} h30 v${SELF_H} h-30` : `M${m.x1},${m.y} L${m.x2},${m.y}`
const headX = (id: Id, cx: number) => cx + (headDrag.value?.id === id ? headDrag.value.dx : 0)
</script>

<template>
  <div class="view">
    <div class="tools">
      <button @click="addLifeline">新增生命線</button>
      <input
        v-model="quick"
        class="quick"
        :class="{ error: quickError }"
        placeholder="A -> B: login()　或　B --> A: ok　（Enter 新增）"
        @input="quickError = false"
        @keydown.enter="submitQuick"
      />
      <span class="sep" />
      <button :disabled="!ed.selection.length" @click="wrap('alt')">包成 alt</button>
      <button :disabled="!ed.selection.length" @click="wrap('loop')">包成 loop</button>
      <button :disabled="!ed.selection.length" @click="wrap('opt')">包成 opt</button>
      <button :disabled="!selectedFragment" @click="addOperand">新增區段</button>
      <button :disabled="!selectedFragment" @click="unwrap">解除片段</button>
      <span class="sep" />
      <button @click="canvas?.zoomReset()">100%</button>
      <button @click="canvas?.zoomFit({ x: 0, y: 0, w: L.width, h: L.height })">全圖</button>
      <span class="sep" />
      <button :disabled="isEmpty" @click="doExport('svg')">匯出 SVG</button>
      <button :disabled="isEmpty" @click="doExport('png')">匯出 PNG</button>
    </div>
    <div class="hint">
      新訊息插入在選取的訊息之後（點片段區段則加到該區段末尾）；雙擊可編輯文字；拖曳訊息上下重排、拖曳生命線標題左右重排；Delete 刪除（片段為解除）
    </div>
    <div class="drop" @dragover.prevent @drop.prevent="onDrop">
      <Canvas ref="canvas" @background-click="ed.clear()" @marquee="onMarquee">
        <Markers />
        <!-- 生命線虛線 -->
        <line
          v-for="l in L.lifelines"
          :key="`line-${l.id}`"
          :x1="headX(l.id, l.cx)"
          :x2="headX(l.id, l.cx)"
          :y1="L.lineTop"
          :y2="L.lineBottom"
          stroke="#555"
          stroke-dasharray="6 4"
        />
        <!-- 組合片段 -->
        <g v-for="f in L.fragments" :key="f.id">
          <rect
            v-for="(o, i) in f.operands"
            :key="`hit-${i}`"
            :x="f.x1"
            :y="o.y"
            :width="f.x2 - f.x1"
            :height="operandBottom(f, i) - o.y"
            fill="transparent"
            data-export="false"
            @pointerdown="onOperandDown($event, f, i)"
            @dblclick.stop="ed.editing = { kind: 'guard', id: f.id, operand: i }"
          />
          <rect
            :x="f.x1"
            :y="f.y1"
            :width="f.x2 - f.x1"
            :height="f.y2 - f.y1"
            fill="none"
            :stroke="isSelected(f.id) ? '#1a73e8' : '#555'"
            :stroke-width="isSelected(f.id) ? 2 : 1"
            pointer-events="none"
          />
          <path
            :d="`M${f.x1},${f.y1} h${labelW(f)} v12 l-6,6 h${-(labelW(f) - 6)} z`"
            fill="#fff"
            stroke="#555"
            pointer-events="none"
          />
          <text :x="f.x1 + 6" :y="f.y1 + 13" font-weight="bold" pointer-events="none">{{ f.type }}</text>
          <template v-for="(o, i) in f.operands" :key="`op-${i}`">
            <line
              v-if="i > 0"
              :x1="f.x1"
              :x2="f.x2"
              :y1="o.y"
              :y2="o.y"
              stroke="#555"
              stroke-dasharray="6 4"
              pointer-events="none"
            />
            <text
              v-if="o.guard"
              :x="i === 0 ? f.x1 + labelW(f) + 8 : f.x1 + 8"
              :y="o.y + 16"
              pointer-events="none"
            >
              [{{ o.guard }}]
            </text>
            <rect
              v-if="ed.operand?.fragmentId === f.id && ed.operand.operand === i"
              :x="f.x1 + 2"
              :y="o.y + 2"
              :width="f.x2 - f.x1 - 4"
              :height="operandBottom(f, i) - o.y - 4"
              fill="rgba(26,115,232,0.06)"
              pointer-events="none"
              data-export="false"
            />
          </template>
        </g>
        <!-- 生命線標題 -->
        <g
          v-for="l in L.lifelines"
          :key="`head-${l.id}`"
          @pointerdown="onHeadDown($event, l.id)"
          @dblclick.stop="ed.editing = { kind: 'lifeline', id: l.id }"
        >
          <rect
            :x="headX(l.id, l.cx) - l.headW / 2"
            :y="HEAD_TOP"
            :width="l.headW"
            :height="HEAD_H"
            fill="#fff"
            :stroke="isSelected(l.id) ? '#1a73e8' : '#333'"
            :stroke-width="isSelected(l.id) ? 2 : 1"
          />
          <text
            :x="headX(l.id, l.cx)"
            :y="HEAD_TOP + HEAD_H / 2"
            text-anchor="middle"
            dominant-baseline="central"
            font-weight="bold"
          >
            {{ l.title }}
          </text>
        </g>
        <!-- 訊息 -->
        <g
          v-for="m in L.messages"
          :key="m.id"
          @pointerdown="onMessageDown($event, m.id)"
          @dblclick.stop="ed.editing = { kind: 'message', id: m.id }"
        >
          <path :d="messagePath(m)" fill="none" stroke="transparent" stroke-width="12" data-export="false" />
          <path
            :d="messagePath(m)"
            fill="none"
            :stroke="isSelected(m.id) ? '#1a73e8' : '#333'"
            :stroke-width="isSelected(m.id) ? 2 : 1"
            :stroke-dasharray="m.type === 'return' ? '6 4' : undefined"
            :marker-end="m.type === 'return' ? 'url(#m-open)' : 'url(#m-filled)'"
          />
          <text
            :x="m.self ? m.x1 + 36 : (m.x1 + m.x2) / 2"
            :y="m.self ? m.y + SELF_H / 2 + 4 : m.y - 6"
            :text-anchor="m.self ? 'start' : 'middle'"
          >
            {{ m.text }}
          </text>
        </g>
        <!-- 拖曳中的訊息落點提示 -->
        <line
          v-if="msgDrag"
          :x1="MARGIN"
          :x2="L.width - MARGIN"
          :y1="msgDrag.y"
          :y2="msgDrag.y"
          stroke="#1a73e8"
          stroke-dasharray="4 3"
          pointer-events="none"
          data-export="false"
        />
        <InlineInput
          v-if="editing && editBox"
          :key="`${editing.kind}-${editing.id}-${'operand' in editing ? editing.operand : ''}`"
          :x="editBox.x"
          :y="editBox.y"
          :w="editBox.w"
          :initial="editBox.initial"
          :submit="editBox.submit"
          @close="stopEditing"
        />
      </Canvas>
    </div>
  </div>
</template>

<style scoped>
.quick {
  width: 320px;
  font: inherit;
  padding: 2px 6px;
}
.quick.error {
  border-color: #d93025;
  background: #fce8e6;
}
</style>
