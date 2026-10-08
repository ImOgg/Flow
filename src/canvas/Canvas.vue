<script setup lang="ts">
// 共用畫布：縮放、平移、框選。內容以 slot 傳入，使用世界座標
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Point, Rect } from '../model/classLayout'
import { FONT_FAMILY, FONT_SIZE } from './measure'
import { isTyping, trackPointer as track } from './pointer'

const emit = defineEmits<{
  marquee: [rect: Rect, additive: boolean]
  backgroundClick: [p: Point, e: PointerEvent]
}>()

const MIN_SCALE = 0.25
const MAX_SCALE = 4

const svg = ref<SVGSVGElement>()
const content = ref<SVGGElement>()
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const marquee = ref<Rect | null>(null) // 螢幕座標（相對 svg）
let spaceDown = false

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function toWorld(clientX: number, clientY: number): Point {
  const r = svg.value!.getBoundingClientRect()
  return { x: (clientX - r.left - tx.value) / scale.value, y: (clientY - r.top - ty.value) / scale.value }
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    // 以游標為中心縮放：縮放前後游標下的世界座標不變
    const r = svg.value!.getBoundingClientRect()
    const sx = e.clientX - r.left
    const sy = e.clientY - r.top
    const next = clamp(scale.value * Math.exp(-e.deltaY * 0.0015), MIN_SCALE, MAX_SCALE)
    tx.value = sx - ((sx - tx.value) / scale.value) * next
    ty.value = sy - ((sy - ty.value) / scale.value) * next
    scale.value = next
  } else {
    const horizontal = e.shiftKey && !e.deltaX
    tx.value -= horizontal ? e.deltaY : e.deltaX
    ty.value -= horizontal ? 0 : e.deltaY
  }
}

/** 空白鍵或中鍵：不論點在哪裡都進入平移（capture 階段攔截，避免觸發元素拖曳） */
function onPointerDownCapture(e: PointerEvent) {
  if (e.button !== 1 && !(spaceDown && e.button === 0)) return
  e.preventDefault()
  e.stopPropagation()
  const start = { x: e.clientX, y: e.clientY, tx: tx.value, ty: ty.value }
  track(e, (m) => {
    tx.value = start.tx + m.clientX - start.x
    ty.value = start.ty + m.clientY - start.y
  })
}

/** 只有點在空白處（目標就是 svg 本身）才會到這裡 */
function onBackgroundDown(e: PointerEvent) {
  if (e.target !== svg.value || e.button !== 0) return
  const r = svg.value.getBoundingClientRect()
  const sx = e.clientX - r.left
  const sy = e.clientY - r.top
  let moved = false
  track(
    e,
    (m) => {
      const cx = m.clientX - r.left
      const cy = m.clientY - r.top
      moved ||= Math.abs(cx - sx) + Math.abs(cy - sy) > 3
      marquee.value = { x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) }
    },
    () => {
      const m = marquee.value
      marquee.value = null
      if (!moved || !m) return emit('backgroundClick', toWorld(e.clientX, e.clientY), e)
      const s = scale.value
      emit('marquee', { x: (m.x - tx.value) / s, y: (m.y - ty.value) / s, w: m.w / s, h: m.h / s }, e.shiftKey || e.ctrlKey)
    },
  )
}

const onKeyDown = (e: KeyboardEvent) => {
  if (e.code === 'Space' && !isTyping()) {
    spaceDown = true
    e.preventDefault()
  }
}
const onKeyUp = (e: KeyboardEvent) => {
  if (e.code === 'Space') spaceDown = false
}
onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})

function zoomReset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

/** 把內容邊界置中並縮放到畫面內（最大 100%） */
function zoomFit(b: Rect) {
  const r = svg.value!.getBoundingClientRect()
  if (!b.w || !b.h) return zoomReset()
  const s = clamp(Math.min(r.width / (b.w + 80), r.height / (b.h + 80)), MIN_SCALE, 1)
  scale.value = s
  tx.value = (r.width - b.w * s) / 2 - b.x * s
  ty.value = (r.height - b.h * s) / 2 - b.y * s
}

defineExpose({ toWorld, zoomReset, zoomFit, content, scale })
</script>

<template>
  <div class="canvas">
    <svg
      ref="svg"
      width="100%"
      height="100%"
      @wheel="onWheel"
      @pointerdown.capture="onPointerDownCapture"
      @pointerdown="onBackgroundDown"
    >
      <g
        ref="content"
        :transform="`translate(${tx} ${ty}) scale(${scale})`"
        :font-family="FONT_FAMILY"
        :font-size="FONT_SIZE"
      >
        <slot />
      </g>
      <rect
        v-if="marquee"
        :x="marquee.x"
        :y="marquee.y"
        :width="marquee.w"
        :height="marquee.h"
        fill="rgba(26,115,232,0.08)"
        stroke="#1a73e8"
        stroke-dasharray="4 2"
        pointer-events="none"
      />
    </svg>
    <div class="zoom">{{ Math.round(scale * 100) }}%</div>
  </div>
</template>

<style scoped>
.canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #fafafa;
}
svg {
  display: block;
  touch-action: none;
  user-select: none;
}
.zoom {
  position: absolute;
  right: 8px;
  bottom: 6px;
  font-size: 12px;
  color: #888;
  pointer-events: none;
}
</style>
