<script setup lang="ts">
import { ref } from 'vue'
import { measureText } from '../canvas/measure'
import { parseMermaidFlowchart } from '../io/mermaid'
import * as ops from '../model/ops'
import { useEditorStore } from '../store/editor'
import { useProjectStore } from '../store/project'

const store = useProjectStore()
const ed = useEditorStore()
const dlg = ref<HTMLDialogElement>()
const text = ref('')
const error = ref('')

function open() {
  error.value = ''
  dlg.value?.showModal()
}

/** 失敗時對話框保持開啟、文字保留；成功時整個匯入為一筆復原紀錄 */
function submit() {
  const r = parseMermaidFlowchart(text.value)
  if (!r.ok) {
    error.value = r.error
    return
  }
  const id = store.apply((p) => ops.importFlowchart(p, r.flow, measureText))
  ed.clear()
  ed.activeDiagramId = id
  text.value = ''
  dlg.value?.close()
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dlg">
    <p>貼上 Mermaid 流程圖（flowchart / graph）</p>
    <textarea v-model="text" rows="16" cols="60" spellcheck="false" autofocus />
    <p v-if="error" role="alert">{{ error }}</p>
    <p>
      <button @click="submit">確定</button>
      <button @click="dlg?.close()">取消</button>
    </p>
  </dialog>
</template>
