# Design

## Context

第一期的架構沿用不變（見 archive/2026-10-08-uml-editor-mvp/design.md）：模型是唯一資料來源、所有修改經 `store.apply(fn)` 交給 `model/ops.ts` 就地修改草稿、快照式復原、排版與路徑是 `model/` 下不依賴 Vue 的純函式、畫布以 Vue 元件直接畫 SVG。

本期四項功能都只動「圖」這一層：Note、Package、轉折點都是圖的呈現資訊，不進入共用模型（`model.elements` / `model.relations`）；Activation bar 完全由現有訊息推算，不存任何資料。

## Goals / Non-Goals

**Goals:**
- 新資料都掛在圖上，`deleteElement` / `removeFromDiagram` / `deleteLifeline` 三個既有的連鎖刪除點負責清乾淨
- Activation 計算、轉折點路徑、套件框尺寸都是純函式並有單元測試
- 版本 1 檔案無損開啟

**Non-Goals:**
- 套件進入模型（模型樹不顯示套件、不同圖的同名套件互不相關）
- 巢狀套件、套件之間的關係（import / merge）
- Activation 手動覆寫（強制開始 / 結束某段）
- 連線自動避開障礙物（仍由使用者手動拖）

## Decisions

### D1. 資料模型（版本 2）
```ts
interface Project { version: 2; /* 其餘不變 */ }

interface ClassDiagram {
  id: Id; type: 'class'; name: string
  nodes: ClassNode[]
  edges: { relationId: Id; bends?: Point[] }[]   // 無 bends = 自動路徑
  notes: ClassNote[]
  packages: Package[]
}
interface ClassNote { id: Id; text: string; x: number; y: number; links: Id[] }   // links = elementId
interface Package  { id: Id; name: string; x: number; y: number; elementIds: Id[] }

type SeqItem = Message | Fragment | SeqNote
interface SeqNote { kind: 'note'; id: Id; text: string; over: Id[] }              // over = lifelineId
```
- Note、Package 存在圖上而非模型：兩者都是排版用的說明 / 分區，與 Astah 中 Package 為模型元素不同。代價是同一個「auth 模組」在兩張圖要各畫一次。替代方案「Package 進模型、元素帶 `packageId`」會牽動模型樹、跨圖同步與刪除規則，留到真正需要命名空間語意時再做。
- 循序圖 Note 是 `SeqItem` 的一種，與訊息共用插入位置、拖曳重排、放進片段、`findItem` / `moveItem` / `deleteItem` 等既有機制，不需要座標。
- `bends` 設為可省略：第一期檔案與從未調整過的連線都不帶這個欄位。

### D2. Activation 計算（`sequenceLayout.ts`）
在現有 `walk` 依序產生訊息 y 座標後，再對扁平化的訊息清單做一次掃描：每條生命線維護一個堆疊。
- 同步訊息 `f → t`：若 `f` 堆疊為空，先在 `f` 推入一段（起點 = 該訊息 y）；再在 `t` 推入一段。自呼叫時 `t === f`，新的一段深度 +1。
- 回傳訊息 `f → t`：若 `f` 堆疊非空，彈出最上層並以該訊息 y 為終點；否則忽略。
- 掃描結束仍未關閉的段落：終點 = 該生命線最後一則相關訊息的 y + 固定下緣（自迴圈則加 `SELF_H`）。
- 輸出 `activations: { lifelineId, depth, y1, y2 }[]`；同時在掃描當下依兩端「當時」的最上層深度，修正 `MessageBox.x1 / x2` 為長條邊緣（往右的訊息用發送端右緣、接收端左緣，反之亦然）。

忽略片段邊界：alt 的兩個區段會被當成先後執行。這與「順序決定版面」的既有原則一致，且 alt 各區段通常各自成對回傳，結果仍正確。長條寬 10、每深一層往右錯開 5。長條設 `pointer-events="none"`，不擋住從生命線拖拉建立訊息。

### D3. 連線轉折點（`classLayout.ts`）
- `bends` 存「中間的轉折點」，兩端連到邊框的點每次重算：對來源框，若第一個轉折點的 y 在框的上下範圍內，從左 / 右邊框水平出發；若 x 在左右範圍內，從上 / 下邊框垂直出發；兩者都不是（落在框的斜角方向）則從最近的側邊出發並自動補一個轉折。目標端同理。如此元素移動後仍保持直角。
- 新增 `routeWith(a, b, bends)`；`bends` 為空時沿用原本的 `route`。
- 拖曳：選取連線時，每段中點顯示一個控制點。拖曳某段時，該段的兩個端點沿垂直方向平移；若拖的是連到邊框的第一段或最後一段，先在端點處插入一個轉折點，讓邊框上的端點不動。放開時把目前折線的中間點（去掉頭尾、合併共線點）寫入 `bends`，一次拖曳一筆 `apply`。
- 重設：雙擊連線清除 `bends`。

### D4. 套件框（`classLayout.ts` + ops）
- 顯示的框 = `{x, y, 最小寬高}` 與「所有成員框外擴固定邊距、上方再留標籤高度」的聯集。有成員時框由成員撐開，`x / y` 主要對空套件有意義。
- 移動套件：`x / y` 與所有成員節點一起位移。第一期的 `moveNodes` 擴充為 `moveItems(diagramId, ids, dx, dy)`，`ids` 可混合 elementId、noteId、packageId；套件的成員若同時被選取，只移動一次。
- 加入 / 離開：節點拖曳放開時，在同一個 `apply` 內先 `moveItems` 再 `setPackageMembership`。判斷「中心點在哪個套件框內」時，套件框必須以「排除正被拖曳的節點」重新計算，否則成員拖出時框會跟著撐大而永遠在框內。多個套件重疊時取最上層（陣列後者）。
- 繪製順序：套件 → 關係線 → 註解連結 → 類別 → Note。套件在最底層，點擊框內空白處仍會選到套件；只有標籤可拖曳整組，避免使用者想框選套件內元素時誤拖套件。

### D5. Note
- 尺寸：依 `\n` 拆行後以既有的 `measureText` 量最寬一行，高度 = 行數 × `LINE_H` + 上下邊距，右上角折角 10。類別圖與循序圖共用同一個 `noteBox(text, measure)`。
- 類別圖：新增 `note` 與 `noteLink` 兩個工具。註解連結的選取 id 用 `` `${noteId}>${elementId}` `` 組合，Delete 時拆解。
- 循序圖：列高 = `max(ROW, noteBox 高 + 上下邊距)`；水平範圍為覆蓋的生命線最左到最右欄，僅一條時為該欄寬度內置中。Note 參與片段水平範圍的計算，與訊息相同。
- 快速輸入：`quickInput.ts` 新增 `parseNote`，語法 `note over R[, R...]: 文字`（不分大小寫）；`R` 沿用訊息的生命線寫法。由於 `R` 本身可含冒號（`A: Class`），以「從左邊起第一個能讓所有 `R` 合法的冒號」作為文字分隔；快速輸入框先試 `parseNote` 再試 `parseMessage`。
- 多行輸入：`InlineInput.vue` 新增 `multiline` 屬性，改用 `<textarea>`；Shift+Enter 換行、Enter 送出。

### D6. 連鎖刪除
- `removeFromDiagram`：一併移除套件 `elementIds`、Note `links` 中被移除的元素；新增參數接受 noteId、packageId、註解連結 id。
- `deleteElement`：對每張類別圖改呼叫 `removeFromDiagram`，不再自行過濾 nodes，連鎖邏輯只留一份。
- `deleteLifeline`：一併從 `SeqNote.over` 移除該生命線，`over` 變空的 Note 刪除。

### D7. 版本遷移（`serialize.ts`）
- 接受 `version` 為 1 或 2；為 1 時對每張類別圖補 `notes: []`、`packages: []`，並把 `version` 改為 2。其餘欄位格式相同，不需轉換。
- 結構檢查加上類別圖 `notes`、`packages` 必須為陣列（遷移之後檢查）。
- 懸空參照比照既有作法：Note `links`、Package `elementIds` 只保留圖上存在的元素；`SeqNote.over` 只保留存在的生命線，空了就略過整個 Note；每項都記 warning。
- `emptyProject()` 與 `addDiagram` 產生的新類別圖帶空的 `notes` / `packages`。

### D8. 測試
比照第一期，只測 `model/`：activation 掃描（一來一回、巢狀、自呼叫、無回傳、不成對回傳、跨片段）、`routeWith` 端點重算、套件框聯集與「排除拖曳中節點」、`noteBox`、`parseNote`、連鎖刪除、版本 1 遷移與新欄位的懸空清理、往返。畫布互動手動驗證。

## Risks / Trade-offs

- [Activation 忽略片段邊界，alt 某區段沒有回傳時會延續到下一區段] → 接受；回傳成對的常見寫法結果正確。之後若需要可改為進入每個 operand 前複製堆疊。
- [轉折點固定不動，元素移到轉折點另一側時線會繞遠路] → 雙擊即可重設；本期不做自動修正。
- [套件不在模型中，跨圖不同步] → 已列為 Non-Goal；資料結構上 `elementIds` 可直接遷移成模型層的成員清單。
- [套件框可重疊，成員判斷取最上層] → 不阻止重疊，以簡單規則處理；使用者自行排開。
- [循序圖 Note 文字含冒號時可能與生命線寫法混淆] → 採 D5 的冒號判斷規則；不確定時使用者可先建好生命線，或建立後雙擊修改文字。

## Migration Plan

開啟版本 1 檔案時在記憶體中轉為版本 2，原檔不動，直到使用者儲存才覆寫為版本 2。第一期的程式無法開啟版本 2 檔案；本專案為個人使用，不提供降版。
