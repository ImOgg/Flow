<script setup lang="ts">
import { nextTick, ref } from 'vue'
import * as ops from '../model/ops'
import type { Diagram, Id } from '../model/types'
import { useEditorStore } from '../store/editor'
import { useProjectStore } from '../store/project'

const store = useProjectStore()
const ed = useEditorStore()
const renaming = ref<Id | null>(null)
const renameText = ref('')
const input = ref<HTMLInputElement[]>()

function activate(id: Id) {
  if (ed.activeDiagramId === id) return
  ed.clear()
  ed.activeDiagramId = id
}

function add(type: Diagram['type']) {
  const n = store.project.diagrams.filter((d) => d.type === type).length + 1
  const id = store.apply((p) => ops.addDiagram(p, type, `${type === 'class' ? '類別圖' : '循序圖'} ${n}`))
  activate(id)
}

async function startRename(d: Diagram) {
  renaming.value = d.id
  renameText.value = d.name
  await nextTick()
  input.value?.[0]?.select()
}

function commitRename() {
  const id = renaming.value
  const name = renameText.value.trim()
  renaming.value = null
  if (id && name && name !== store.project.diagrams.find((d) => d.id === id)?.name) {
    store.apply((p) => ops.renameDiagram(p, id, name))
  }
}

/** 刪除圖不影響模型（可復原） */
function remove(d: Diagram) {
  store.apply((p) => ops.deleteDiagram(p, d.id))
  if (ed.activeDiagramId === d.id) ed.activeDiagramId = store.project.diagrams[0]?.id ?? null
}
</script>

<template>
  <div class="tabs">
    <div
      v-for="d in store.project.diagrams"
      :key="d.id"
      class="tab"
      :class="{ on: d.id === ed.activeDiagramId }"
      @click="activate(d.id)"
      @dblclick="startRename(d)"
    >
      <span class="type">{{ d.type === 'class' ? '類' : '序' }}</span>
      <input
        v-if="renaming === d.id"
        ref="input"
        v-model="renameText"
        @keydown.enter="commitRename"
        @keydown.esc="renaming = null"
        @blur="commitRename"
      />
      <span v-else>{{ d.name }}</span>
      <button class="del" title="刪除這張圖" @click.stop="remove(d)">×</button>
    </div>
    <button class="add" @click="add('class')">＋類別圖</button>
    <button class="add" @click="add('sequence')">＋循序圖</button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  border-bottom: 1px solid #ddd;
  background: #f3f3f3;
  font-size: 13px;
  overflow-x: auto;
}
.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 10px;
  cursor: pointer;
  white-space: nowrap;
}
.tab.on {
  background: #fff;
  border-bottom: 2px solid #1a73e8;
}
.type {
  font-size: 11px;
  color: #888;
}
.tab input {
  width: 100px;
  font: inherit;
}
.del {
  border: none;
  background: none;
  cursor: pointer;
  color: #999;
}
.add {
  border: none;
  background: none;
  cursor: pointer;
  color: #1a73e8;
  padding: 0 8px;
}
</style>
