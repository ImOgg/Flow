<script setup lang="ts">
import { computed } from 'vue'
import { pathOf, type Point } from '../../model/classLayout'
import type { RelationKind } from '../../model/types'

const props = defineProps<{ kind: RelationKind; points: Point[]; selected: boolean }>()
const emit = defineEmits<{ down: [e: PointerEvent]; reset: [] }>()

// UML 符號：聚合 / 組合的菱形在整體端（起點），三角與箭頭在目標端（終點）
const STYLE: Record<RelationKind, { dashed?: boolean; start?: string; end?: string }> = {
  association: {},
  generalization: { end: 'm-tri' },
  realization: { dashed: true, end: 'm-tri' },
  dependency: { dashed: true, end: 'm-open' },
  aggregation: { start: 'm-diamond' },
  composition: { start: 'm-diamond-filled' },
}

const d = computed(() => pathOf(props.points))
const style = computed(() => STYLE[props.kind])
</script>

<template>
  <g @pointerdown="emit('down', $event)" @dblclick.stop="emit('reset')">
    <path :d="d" fill="none" stroke="transparent" stroke-width="10" data-export="false" />
    <path
      :d="d"
      fill="none"
      :stroke="selected ? '#1a73e8' : '#333'"
      :stroke-width="selected ? 2 : 1"
      :stroke-dasharray="style.dashed ? '6 4' : undefined"
      :marker-start="style.start && `url(#${style.start})`"
      :marker-end="style.end && `url(#${style.end})`"
    />
  </g>
</template>
