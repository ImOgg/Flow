<script setup lang="ts">
// 流程圖箭頭：直角折線、實心箭頭，標籤畫在折線一半處並墊白底
import { computed } from 'vue'
import { LINE_H, pathOf, type Point } from '../../model/classLayout'
import { labelPos } from '../../model/flowLayout'
import { measureText } from '../measure'

const props = defineProps<{ points: Point[]; label: string; selected: boolean }>()
const emit = defineEmits<{ down: [e: PointerEvent]; edit: [] }>()

const d = computed(() => pathOf(props.points))
const pos = computed(() => labelPos(props.points))
const labelW = computed(() => measureText(props.label) + 8)
</script>

<template>
  <g @pointerdown="emit('down', $event)" @dblclick.stop="emit('edit')">
    <path :d="d" fill="none" stroke="transparent" stroke-width="10" data-export="false" />
    <path
      :d="d"
      fill="none"
      :stroke="selected ? '#1a73e8' : '#333'"
      :stroke-width="selected ? 2 : 1"
      marker-end="url(#m-filled)"
    />
    <template v-if="label">
      <rect :x="pos.x - labelW / 2" :y="pos.y - LINE_H / 2" :width="labelW" :height="LINE_H" fill="#fff" />
      <text
        :x="pos.x"
        :y="pos.y"
        text-anchor="middle"
        dominant-baseline="central"
        :fill="selected ? '#1a73e8' : '#333'"
        xml:space="preserve"
      >{{ label }}</text>
    </template>
  </g>
</template>
