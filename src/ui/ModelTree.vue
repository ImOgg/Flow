<script setup lang="ts">
import { computed } from 'vue'
import * as ops from '../model/ops'
import type { Classifier, ClassifierKind } from '../model/types'
import { useEditorStore } from '../store/editor'
import { useProjectStore } from '../store/project'

const store = useProjectStore()
const ed = useEditorStore()

const GROUPS: [ClassifierKind, string][] = [
  ['class', 'Class'],
  ['interface', 'Interface'],
  ['enum', 'Enum'],
]

const groups = computed(() => {
  const all = Object.values(store.project.model.elements).sort((a, b) => a.name.localeCompare(b.name))
  return GROUPS.map(([kind, label]) => ({ kind, label, items: all.filter((e) => e.kind === kind) }))
})

function onDragStart(e: DragEvent, el: Classifier) {
  e.dataTransfer?.setData('text/x-uml-element', el.id)
}

/** 從模型刪除：所有圖都會移除它（可復原） */
function remove(el: Classifier) {
  store.apply((p) => ops.deleteElement(p, el.id))
  ed.clear()
}
</script>

<template>
  <aside class="tree">
    <div class="title">模型</div>
    <div v-for="g in groups" :key="g.kind" class="group">
      <div class="group-label">{{ g.label }}（{{ g.items.length }}）</div>
      <div
        v-for="el in g.items"
        :key="el.id"
        class="item"
        :class="{ on: ed.selection.includes(el.id) }"
        draggable="true"
        title="拖到圖上加入"
        @dragstart="onDragStart($event, el)"
      >
        <span class="name">{{ el.name }}</span>
        <button class="del" title="從模型刪除" @click="remove(el)">×</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.tree {
  width: 200px;
  border-right: 1px solid #ddd;
  overflow: auto;
  font-size: 13px;
  background: #fff;
}
.title {
  font-weight: bold;
  padding: 8px;
}
.group-label {
  padding: 4px 8px;
  color: #666;
}
.item {
  display: flex;
  align-items: center;
  padding: 2px 8px 2px 20px;
  cursor: grab;
}
.item:hover {
  background: #f0f4ff;
}
.item.on {
  background: #e3ecfd;
}
.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.del {
  visibility: hidden;
  border: none;
  background: none;
  cursor: pointer;
  color: #999;
}
.item:hover .del {
  visibility: visible;
}
</style>
