<script setup lang="ts">
import { computed } from 'vue'
import { LINE_H, PAD_X, PAD_Y, type NodeBox } from '../../model/classLayout'
import { formatAttribute, formatOperation, parseAttribute, parseOperation } from '../../model/quickInput'
import * as ops from '../../model/ops'
import type { Classifier } from '../../model/types'
import { useEditorStore } from '../../store/editor'
import { useProjectStore } from '../../store/project'
import InlineInput from '../InlineInput.vue'

const props = defineProps<{ el: Classifier; box: NodeBox; x: number; y: number; selected: boolean }>()
const emit = defineEmits<{ down: [e: PointerEvent] }>()

const store = useProjectStore()
const ed = useEditorStore()

const editing = computed(() => {
  const e = ed.editing
  return e && (e.kind === 'name' || e.kind === 'member') && e.id === props.el.id ? e : null
})

function editName() {
  ed.editing = { kind: 'name', id: props.el.id }
}

function editMember(list: 'attributes' | 'operations', index: number) {
  ed.editing = { kind: 'member', id: props.el.id, list, index }
}

function submitName(text: string) {
  const name = text.trim()
  if (!name) return false
  if (name !== props.el.name) store.apply((p) => ops.renameElement(p, props.el.id, name))
  return true
}

function memberText(list: 'attributes' | 'operations', index: number) {
  if (index < 0) return ''
  if (list === 'operations') return formatOperation(props.el.operations[index])
  const a = props.el.attributes[index]
  return props.el.kind === 'enum' ? a.name : formatAttribute(a)
}

/** 空字串＝刪除該成員；解析失敗回傳 false 讓輸入框標紅 */
function submitMember(text: string) {
  const e = editing.value
  if (e?.kind !== 'member') return true
  const { list, index } = e
  const id = props.el.id
  if (!text.trim()) {
    if (index >= 0) store.apply((p) => ops.removeMember(p, id, list, index))
    return true
  }
  if (text === memberText(list, index)) return true
  if (list === 'operations') {
    const op = parseOperation(text)
    if (!op) return false
    store.apply((p) => (index < 0 ? ops.addMember(p, id, list, op) : ops.updateMember(p, id, list, index, op)))
  } else {
    const attr = parseAttribute(text)
    if (!attr) return false
    store.apply((p) => (index < 0 ? ops.addMember(p, id, list, attr) : ops.updateMember(p, id, list, index, attr)))
  }
  return true
}

function stopEditing() {
  if (editing.value) ed.editing = null
}

const placeholder = computed(() => {
  const e = editing.value
  if (e?.kind !== 'member') return ''
  if (props.el.kind === 'enum') return 'VALUE'
  return e.list === 'attributes' ? '- name: string' : '+ login(id: string): bool'
})

const editY = computed(() => {
  const e = editing.value
  if (!e) return 0
  if (e.kind === 'name') return props.box.headerH - LINE_H - PAD_Y - 3
  const sec = props.box.sections.find((s) => s.list === e.list)!
  return e.index < 0 ? sec.y + sec.h - 2 : sec.y + PAD_Y + e.index * LINE_H - 3
})
</script>

<template>
  <g :transform="`translate(${x} ${y})`" @pointerdown="emit('down', $event)">
    <rect :width="box.w" :height="box.h" fill="#fff" stroke="#333" />
    <!-- 標題區 -->
    <rect :width="box.w" :height="box.headerH" fill="transparent" @dblclick.stop="editName" />
    <text
      v-for="(l, i) in box.header"
      :key="i"
      :x="box.w / 2"
      :y="PAD_Y + (i + 0.5) * LINE_H"
      text-anchor="middle"
      dominant-baseline="central"
      :font-weight="l.bold ? 'bold' : 'normal'"
      pointer-events="none"
    >
      {{ l.text }}
    </text>
    <!-- 屬性 / 操作區 -->
    <g v-for="s in box.sections" :key="s.list">
      <line :x1="0" :x2="box.w" :y1="s.y" :y2="s.y" stroke="#333" />
      <rect :y="s.y" :width="box.w" :height="s.h" fill="transparent" @dblclick.stop="editMember(s.list, -1)" />
      <g v-for="(t, i) in s.lines" :key="i" @dblclick.stop="editMember(s.list, i)">
        <rect :y="s.y + PAD_Y + i * LINE_H" :width="box.w" :height="LINE_H" fill="transparent" />
        <text :x="PAD_X" :y="s.y + PAD_Y + (i + 0.5) * LINE_H" dominant-baseline="central">{{ t }}</text>
      </g>
    </g>
    <rect
      v-if="selected"
      x="-3"
      y="-3"
      :width="box.w + 6"
      :height="box.h + 6"
      fill="none"
      stroke="#1a73e8"
      stroke-width="2"
      pointer-events="none"
      data-export="false"
    />
    <InlineInput
      v-if="editing?.kind === 'name'"
      :key="'name'"
      :x="2"
      :y="editY"
      :w="Math.max(box.w - 4, 160)"
      :initial="el.name"
      :submit="submitName"
      @close="stopEditing"
    />
    <InlineInput
      v-else-if="editing?.kind === 'member'"
      :key="`${editing.list}${editing.index}`"
      :x="2"
      :y="editY"
      :w="Math.max(box.w - 4, 220)"
      :initial="memberText(editing.list, editing.index)"
      :placeholder="placeholder"
      :keep-open="editing.index < 0"
      :submit="submitMember"
      @close="stopEditing"
    />
  </g>
</template>
