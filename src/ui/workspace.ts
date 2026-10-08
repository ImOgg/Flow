// 專案層級動作：新建、開啟、儲存（含未儲存確認與錯誤提示）
import { openFile, saveFile } from '../io/file'
import { emptyProject } from '../model/ops'
import { parseProject, serialize } from '../model/serialize'
import { useEditorStore } from '../store/editor'
import { useProjectStore } from '../store/project'

export function useWorkspace() {
  const store = useProjectStore()
  const ed = useEditorStore()

  const confirmDiscard = () => !store.dirty || confirm('有未儲存的變更，確定要放棄嗎？')

  function newProject() {
    if (!confirmDiscard()) return
    store.load(emptyProject())
    ed.clear()
    ed.activeDiagramId = null
  }

  async function open() {
    if (!confirmDiscard()) return
    try {
      const file = await openFile()
      if (!file) return
      const r = parseProject(file.text)
      if (!r.ok) return alert(`無法開啟：${r.error}`)
      if (r.warnings.length) console.warn('開啟時略過的項目：', r.warnings)
      store.load(r.project, file.name, file.handle)
      ed.clear()
      ed.activeDiagramId = r.project.diagrams[0]?.id ?? null
    } catch (e) {
      alert(`無法開啟：${(e as Error).message}`)
    }
  }

  async function save() {
    try {
      const r = await saveFile(serialize(store.project), store.fileHandle, store.fileName ?? undefined)
      if (r) store.markSaved(r.name, r.handle)
    } catch (e) {
      // 未儲存標記保持不變
      alert(`儲存失敗：${(e as Error).message}`)
    }
  }

  return { newProject, open, save }
}
