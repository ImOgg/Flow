<script setup lang="ts">
// 註解框：右上角折角的矩形與多行文字，類別圖與循序圖共用
import { LINE_H, NOTE_FOLD, NOTE_PAD } from '../model/classLayout'

defineProps<{ x: number; y: number; w: number; h: number; lines: string[]; selected: boolean }>()
const emit = defineEmits<{ down: [e: PointerEvent]; edit: [] }>()
</script>

<template>
  <g :transform="`translate(${x} ${y})`" @pointerdown="emit('down', $event)" @dblclick.stop="emit('edit')">
    <path
      :d="`M0,0 H${w - NOTE_FOLD} L${w},${NOTE_FOLD} V${h} H0 Z M${w - NOTE_FOLD},0 V${NOTE_FOLD} H${w}`"
      fill="#fff"
      stroke="#333"
    />
    <text
      v-for="(t, i) in lines"
      :key="i"
      :x="NOTE_PAD"
      :y="NOTE_PAD + (i + 0.5) * LINE_H"
      dominant-baseline="central"
      pointer-events="none"
      xml:space="preserve"
    >{{ t }}</text>
    <rect
      v-if="selected"
      x="-3"
      y="-3"
      :width="w + 6"
      :height="h + 6"
      fill="none"
      stroke="#1a73e8"
      stroke-width="2"
      pointer-events="none"
      data-export="false"
    />
  </g>
</template>
