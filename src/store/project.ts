import { defineStore } from 'pinia'
import { computed, ref, shallowReactive, shallowRef } from 'vue'
import { emptyProject } from '../model/ops'
import type { Project } from '../model/types'
import type { FileHandle } from '../io/file'

export const UNDO_LIMIT = 100

export const useProjectStore = defineStore('project', () => {
  // 每次變更都整份換新（舊的就是復原快照），所以只需要 shallowRef
  const project = shallowRef<Project>(emptyProject())
  const undoStack = shallowReactive<Project[]>([])
  const redoStack = shallowReactive<Project[]>([])
  const dirty = ref(false)
  const fileName = ref<string | null>(null)
  const fileHandle = shallowRef<FileHandle | undefined>()

  const canUndo = computed(() => undoStack.length > 0)
  const canRedo = computed(() => redoStack.length > 0)

  /** 唯一的修改入口：在 project 的副本上執行 fn，成功後才取代目前狀態並記錄復原 */
  function apply<R>(fn: (draft: Project) => R): R {
    const draft = structuredClone(project.value)
    const result = fn(draft)
    undoStack.push(project.value)
    if (undoStack.length > UNDO_LIMIT) undoStack.shift()
    redoStack.length = 0
    project.value = draft
    dirty.value = true
    return result
  }

  function undo() {
    const prev = undoStack.pop()
    if (!prev) return
    redoStack.push(project.value)
    project.value = prev
    dirty.value = true
  }

  function redo() {
    const next = redoStack.pop()
    if (!next) return
    undoStack.push(project.value)
    project.value = next
    dirty.value = true
  }

  /** 換成另一份專案（新建或開檔），清空復原紀錄 */
  function load(p: Project, name: string | null = null, handle?: FileHandle) {
    project.value = p
    undoStack.length = 0
    redoStack.length = 0
    dirty.value = false
    fileName.value = name
    fileHandle.value = handle
  }

  function markSaved(name: string, handle?: FileHandle) {
    dirty.value = false
    fileName.value = name
    fileHandle.value = handle
  }

  return { project, dirty, fileName, fileHandle, canUndo, canRedo, apply, undo, redo, load, markSaved }
})
