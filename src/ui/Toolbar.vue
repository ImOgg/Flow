<script setup lang="ts">
import { useProjectStore } from '../store/project'
import { useWorkspace } from './workspace'

const store = useProjectStore()
const ws = useWorkspace()
</script>

<template>
  <header class="toolbar">
    <button @click="ws.newProject">新專案</button>
    <button @click="ws.open">開啟</button>
    <button title="Ctrl+S" @click="ws.save">儲存</button>
    <span class="sep" />
    <button :disabled="!store.canUndo" title="Ctrl+Z" @click="store.undo">復原</button>
    <button :disabled="!store.canRedo" title="Ctrl+Y / Ctrl+Shift+Z" @click="store.redo">重做</button>
    <span class="file">{{ store.fileName ?? '未命名' }}{{ store.dirty ? ' ●' : '' }}</span>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid #ddd;
  background: #fff;
}
.file {
  margin-left: auto;
  color: #666;
  font-size: 13px;
}
</style>
