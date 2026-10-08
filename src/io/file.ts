// 本機檔案讀寫：優先使用 File System Access API（Chrome / Edge），不支援時退回下載與 <input type="file">

// File System Access API 尚未進入 TS 內建 lib，只宣告用到的部分
interface FsHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>
}
interface FsWindow {
  showOpenFilePicker(o: object): Promise<FsHandle[]>
  showSaveFilePicker(o: object): Promise<FsHandle>
}
export type FileHandle = FsHandle

const fsWindow = window as unknown as Partial<FsWindow>
export const supportsFileSystem = typeof fsWindow.showOpenFilePicker === 'function'

const PICKER_TYPES = [{ description: 'UML 專案', accept: { 'application/json': ['.json'] } }]
export const DEFAULT_FILE_NAME = 'untitled.uml.json'

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'

/** 使用者取消時回傳 null */
export async function openFile(): Promise<{ text: string; name: string; handle?: FileHandle } | null> {
  if (supportsFileSystem) {
    try {
      const [handle] = await fsWindow.showOpenFilePicker!({ types: PICKER_TYPES })
      const file = await handle.getFile()
      return { text: await file.text(), name: handle.name, handle }
    } catch (e) {
      if (isAbort(e)) return null
      throw e
    }
  }
  const file = await pickWithInput()
  return file && { text: await file.text(), name: file.name }
}

/** 有 handle 就直接覆寫；否則詢問位置（或退回下載）。使用者取消時回傳 null */
export async function saveFile(
  text: string,
  handle: FileHandle | undefined,
  suggestedName = DEFAULT_FILE_NAME,
): Promise<{ name: string; handle?: FileHandle } | null> {
  if (!supportsFileSystem) {
    download(new Blob([text], { type: 'application/json' }), suggestedName)
    return { name: suggestedName }
  }
  try {
    const target = handle ?? (await fsWindow.showSaveFilePicker!({ suggestedName, types: PICKER_TYPES }))
    // 由「開啟」取得的 handle 預設唯讀，寫入前需取得寫入權限
    if (target.queryPermission && (await target.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      if ((await target.requestPermission!({ mode: 'readwrite' })) !== 'granted') throw new Error('沒有寫入權限')
    }
    const w = await target.createWritable()
    await w.write(text)
    await w.close()
    return { name: target.name, handle: target }
  } catch (e) {
    if (isAbort(e)) return null
    throw e
  }
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function pickWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
