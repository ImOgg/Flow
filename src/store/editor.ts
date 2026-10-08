// 編輯器的暫時狀態：選取、工具、行內編輯。不進復原紀錄、不存檔
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ClassifierKind, Id, RelationKind } from '../model/types'

export type ClassTool = 'select' | ClassifierKind | RelationKind | 'note' | 'noteLink' | 'package'

export type Editing =
  | { kind: 'name'; id: Id }
  | { kind: 'member'; id: Id; list: 'attributes' | 'operations'; index: number } // index = -1 表示新增
  | { kind: 'lifeline'; id: Id }
  | { kind: 'message'; id: Id }
  | { kind: 'guard'; id: Id; operand: number }
  | { kind: 'note'; id: Id } // 類別圖或循序圖的 Note
  | { kind: 'package'; id: Id }

export const useEditorStore = defineStore('editor', () => {
  const activeDiagramId = ref<Id | null>(null)
  const selection = ref<Id[]>([])
  /** 循序圖中被點選的片段區段，作為快速輸入的插入目標 */
  const operand = ref<{ fragmentId: Id; operand: number } | null>(null)
  const tool = ref<ClassTool>('select')
  const editing = ref<Editing | null>(null)

  function select(id: Id | null, additive = false) {
    operand.value = null
    if (!id) selection.value = []
    else if (!additive) selection.value = [id]
    else if (selection.value.includes(id)) selection.value = selection.value.filter((x) => x !== id)
    else selection.value = [...selection.value, id]
  }

  function clear() {
    selection.value = []
    operand.value = null
    editing.value = null
  }

  return { activeDiagramId, selection, operand, tool, editing, select, clear }
})
