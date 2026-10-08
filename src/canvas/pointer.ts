/**
 * 拖曳期間追蹤指標，放開時結束。
 * 用 window 監聽而非 pointer capture：capture 會改變 click / dblclick 的目標，讓元素內的雙擊編輯失效
 */
export function trackPointer(_e: PointerEvent, move: (m: PointerEvent) => void, up?: (u: PointerEvent) => void) {
  const onUp = (u: PointerEvent) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', onUp)
    up?.(u)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', onUp)
}

export const isTyping = () => {
  const el = document.activeElement
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
}
