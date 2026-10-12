<script setup lang="ts">
// 畫布上的行內輸入框（foreignObject，跟著縮放平移）。匯出時會被移除
import { computed, nextTick, onMounted, ref } from 'vue'

const props = defineProps<{
  x: number
  y: number
  w: number
  initial?: string
  placeholder?: string
  /** 回傳 false 表示解析失敗：標紅並保留原文 */
  submit: (text: string) => boolean
  /** 成功後清空並保持開啟，用於連續輸入 */
  keepOpen?: boolean
  /** 多行：Shift+Enter 換行、Enter 送出 */
  multiline?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const text = ref(props.initial ?? '')
const error = ref(false)
const input = ref<HTMLInputElement | HTMLTextAreaElement>()
const height = computed(() => (props.multiline ? text.value.split('\n').length * 18 + 8 : 24))
let done = false

onMounted(async () => {
  await nextTick()
  input.value?.focus()
  input.value?.select()
})

function commit() {
  if (!props.submit(text.value)) {
    error.value = true
    return
  }
  error.value = false
  if (props.keepOpen) text.value = ''
  else close()
}

function close() {
  if (done) return
  done = true
  emit('close')
}

/** 失焦時：沒改就關閉；有改就嘗試送出，失敗則放棄 */
function onBlur() {
  if (done) return
  if (text.value !== (props.initial ?? '') && text.value !== '') props.submit(text.value)
  close()
}

function onKey(e: KeyboardEvent) {
  e.stopPropagation()
  if (e.key === 'Enter' && !(props.multiline && e.shiftKey)) {
    e.preventDefault()
    commit()
  }
  else if (e.key === 'Escape') close()
}
</script>

<template>
  <foreignObject :x="x" :y="y" :width="w" :height="height" data-export="false">
    <textarea
      v-if="multiline"
      ref="input"
      v-model="text"
      :class="{ error }"
      :placeholder="placeholder"
      :style="{ height: `${height - 2}px` }"
      @keydown="onKey"
      @blur="onBlur"
      @pointerdown.stop
      @input="error = false"
    />
    <input
      v-else
      ref="input"
      v-model="text"
      :class="{ error }"
      :placeholder="placeholder"
      @keydown="onKey"
      @blur="onBlur"
      @pointerdown.stop
      @input="error = false"
    />
  </foreignObject>
</template>

<style scoped>
input,
textarea {
  box-sizing: border-box;
  width: 100%;
  height: 22px;
  font: inherit;
  font-size: 13px;
  padding: 0 4px;
  border: 1px solid #1a73e8;
  outline: none;
}
textarea {
  display: block;
  padding: 3px 4px;
  line-height: 18px;
  resize: none;
}
input::placeholder,
textarea::placeholder {
  color: #aaa;
  font-style: italic;
}
input.error,
textarea.error {
  border-color: #d93025;
  background: #fce8e6;
}
</style>
