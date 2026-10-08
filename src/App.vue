<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watchEffect } from 'vue'
import ClassDiagramView from './canvas/class/ClassDiagramView.vue'
import SequenceDiagramView from './canvas/sequence/SequenceDiagramView.vue'
import { isTyping } from './canvas/pointer'
import { useEditorStore } from './store/editor'
import { useProjectStore } from './store/project'
import DiagramTabs from './ui/DiagramTabs.vue'
import ModelTree from './ui/ModelTree.vue'
import Toolbar from './ui/Toolbar.vue'
import { useWorkspace } from './ui/workspace'

const store = useProjectStore()
const ed = useEditorStore()
const ws = useWorkspace()

// 復原可能讓目前的圖消失，此時退回第一張
const active = computed(
  () => store.project.diagrams.find((d) => d.id === ed.activeDiagramId) ?? store.project.diagrams[0] ?? null,
)

watchEffect(() => {
  if (active.value && ed.activeDiagramId !== active.value.id) ed.activeDiagramId = active.value.id
})

watchEffect(() => {
  document.title = `${store.fileName ?? '未命名'}${store.dirty ? ' *' : ''} - Flow`
})

function onKeyDown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  const key = e.key.toLowerCase()
  if (key === 's') {
    e.preventDefault()
    ws.save()
    return
  }
  // 輸入框裡交給瀏覽器原生的文字復原
  if (isTyping()) return
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault()
    store.undo()
  } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
    e.preventDefault()
    store.redo()
  }
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (!store.dirty) return
  e.preventDefault()
  e.returnValue = ''
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="app">
    <Toolbar />
    <div class="body">
      <ModelTree />
      <main class="main">
        <DiagramTabs />
        <ClassDiagramView v-if="active?.type === 'class'" :key="active.id" :diagram="active" />
        <SequenceDiagramView v-else-if="active?.type === 'sequence'" :key="active.id" :diagram="active" />
        <div v-else class="empty">用上方「＋類別圖」或「＋循序圖」開始</div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.empty {
  margin: auto;
  color: #888;
}
</style>
