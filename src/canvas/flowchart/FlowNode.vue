<script setup lang="ts">
// 流程圖節點：依形狀畫外框，多行文字置中
import { computed } from 'vue'
import { LINE_H } from '../../model/classLayout'
import { shapePath } from '../../model/flowLayout'
import type { FlowShape } from '../../model/types'

const props = defineProps<{ shape: FlowShape; x: number; y: number; w: number; h: number; lines: string[]; selected: boolean }>()
const emit = defineEmits<{ down: [e: PointerEvent]; edit: [] }>()

const d = computed(() => shapePath(props.shape, props.w, props.h))
const top = computed(() => props.h / 2 - (props.lines.length * LINE_H) / 2)
</script>

<template>
  <g :transform="`translate(${x} ${y})`" @pointerdown="emit('down', $event)" @dblclick.stop="emit('edit')">
    <path :d="d" fill="#fff" :stroke="selected ? '#1a73e8' : '#333'" :stroke-width="selected ? 2 : 1" />
    <text
      v-for="(t, i) in lines"
      :key="i"
      :x="w / 2"
      :y="top + (i + 0.5) * LINE_H"
      text-anchor="middle"
      dominant-baseline="central"
      pointer-events="none"
      xml:space="preserve"
    >{{ t }}</text>
  </g>
</template>
