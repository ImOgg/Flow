# Design

## Context

- 所有修改都經過 `store.apply(fn)`：先 clone 一份草稿，在草稿上修改，再整份換新，一次 `apply` 就是一筆復原紀錄。所以「剪下」和「貼上」只要各包在一次 `apply` 裡，就符合「一次復原」的規格。
- `ops.ts` 的函式直接修改傳入的草稿，不依賴 Vue，`ops.test.ts` 也都用這種方式測試。
- 三個 View 各自在 `window` 上掛 `onKeyDown`，開頭都先用 `isTyping()` 擋掉輸入框。Delete 的處理會先用一組「本圖已知 id」過濾 `ed.selection`。同一頁同時只會掛一個 View，所以快捷鍵不會重複觸發。
- `App.vue` 的 `onKeyDown` 只處理 Ctrl+S/Z/Y，不會和 C/X/V 衝突。
- 循序圖現有的 `deleteItem` 對片段是「解除框、保留內容」，剪下需要的是「連同內容移除」。
- `ensureLifeline(p, diagramId, ref)` 已經實作「依名稱（或綁定的類別名）找生命線，找不到就在最右側新增並嘗試綁定類別」。

## Goals / Non-Goals

**Goals:** 複製、貼上的資料轉換都寫成 `ops.ts` 的純函式並附測試；View 只負責把快捷鍵接到這些函式。

**Non-Goals:** 共用的快捷鍵分派層。三個 View 各加一段，和 Delete 的寫法一致。

## Decisions

### D1：剪貼簿內容是「自給自足的快照」，型別沿用各圖既有的結構
```ts
type Clip =
  | { type: 'flowchart' } & Pick<FlowchartDiagram, 'nodes' | 'edges' | 'subgraphs'>
  | { type: 'class'; elements: Classifier[]; relations: Relation[] } & Pick<ClassDiagram, 'nodes' | 'edges' | 'notes' | 'packages'>
  | { type: 'sequence'; items: SeqItem[]; lifelines: Lifeline[] }
```
複製時用 `structuredClone` 存下篩選後的資料，保留原本的 id，貼上時再重新對應。類別圖也存元素與關係的完整內容，所以原元素在模型被刪掉之後，仍然可以從快照建立副本。替代方案：只存 id，貼上時再回頭查專案。但剪下會把內容刪掉，跨圖也查不到，所以不採用。

### D2：每種圖各一組 `copyXxx(project, diagramId, ids) → Clip | null` 與 `pasteXxx(project, diagramId, clip, offset) → Id[]`
- `copy` 只讀不寫，沒有可複製的內容時回傳 `null`。這時 View 不清空剪貼簿，也不 `preventDefault`。
- `paste` 在 `apply` 裡執行，回傳新內容的 id，View 拿這些 id 設定選取。
- 剪下：先 `copy`，成功後在一次 `apply` 裡呼叫既有的刪除函式（`removeFlowItems`、`removeFromDiagram`），以及循序圖新增的 `removeSeqItems`。只刪除實際被複製的 id。
- 替代方案：一個泛用的 `copy(diagram)` 依 type 分派。但三種圖的規則幾乎沒有共用的部分，硬合在一起只會多一層 switch。

### D3：剪貼簿放在 `editor` store，偏移量用貼上次數計算
`editor.ts` 新增 `clipboard`（`shallowRef<Clip | null>`）與 `pasteCount`。複製或剪下時把 `pasteCount` 歸零，每次貼上先加一，偏移量為 `20 * pasteCount`（流程圖與類別圖使用，循序圖不用）。這樣連續貼上不會疊在同一個位置，剪下後的第一次貼上也會略為偏移。editor store 本來就是「不進復原紀錄、不存檔」的暫時狀態，符合需求。開啟其他專案時不清空剪貼簿，因為快照是自給自足的，貼到別的專案也不會壞。

### D4：流程圖
- 複製範圍：選取的節點，加上選取子圖框的成員。子圖框只保留在複製範圍內的成員。箭頭兩端都在範圍內才複製。
- 貼上：每個節點、箭頭、子圖框都產生新 id，用 `Map` 對應舊 id 到新 id。座標、子圖框的 `x/y`、箭頭的 `bends` 都加上偏移。

### D5：類別圖：原元素優先，必要時才建立副本
- 複製範圍：選取的 Class 節點，加上選取套件的成員、選取的註解與套件。關係（以及它在圖上的 `bends`）兩端都在範圍內才複製。
- 貼上每個 Class 時：
  - 元素還在模型裡，而且不在目標圖上 → 放原元素（對應到同一個 id）。
  - 元素已經在目標圖上，或已從模型刪除 → 從快照建立新元素，成員一起複製，名稱加上 `_copy` 後綴。
- 關係：兩端都對應到原元素，而且原關係還存在 → `addNode` 本來就會自動帶入，這裡只補上 `bends`。其他情況 → 以相同類型建立新關係，並顯示在目標圖上。
- 註解：產生新 id，`links` 只保留連到同批貼上 Class 的連結（換成對應後的 id）。套件：產生新 id，`elementIds` 換成對應後的 id。
- 回傳的 id 包含節點的 elementId、關係 id、註解 id、套件 id，和 Delete 能辨識的 id 一致。

### D6：循序圖：依文件順序複製，依名稱對應生命線
- 複製：遞迴走訪 `items`，依上下順序收集被選取的項目。已被選取片段包含的子項目跳過，避免重複。同時收集這些項目引用到的生命線快照（`id`、`name`、`elementId`）。只選了生命線時，回傳 `null`。
- 貼上時對應生命線：
  - 目標圖有同一個 id → 直接使用（同圖貼上，也能正確處理同名的生命線）。
  - 否則組成 ref 字串交給既有的 `ensureLifeline`：有綁定類別時用 `名稱: 類別名`，沒有綁定時只用名稱。
- 插入位置：目標圖目前選取的項目中，文件順序最後的那一個，用 `posAfter` 取得位置，依序插在它後面。沒有選取項目（或只選了生命線）時，加在最外層最後。
- 所有項目（含片段裡的子項目）遞迴產生新 id。
- 新增 `removeSeqItems(p, diagramId, ids)`：遞迴過濾，片段連同內容一起移除。不改動 `deleteItem`，Delete 鍵維持原本「解除框」的行為。

### D7：View 端的快捷鍵
剪貼簿、`pasteCount` 偏移與「一次 `apply`」的規則三種圖都一樣，所以集中在 `src/canvas/clipboard.ts` 的 `handleClipboardKey(e, type, { copy, remove, paste })`，裡面也檢查剪貼簿類型是否相符。各 View 只在 `onKeyDown` 的 `isTyping()` 之後呼叫一次，傳入自己的 ops 函式。`copyXxx` 本身會依本圖內容過濾 id，所以不需要另外抽「已知 id」集合。只有真的有動作時才 `preventDefault`。

## Risks / Trade-offs

- [類別圖副本名稱只加一次 `_copy`，重複貼上會出現多個 `User_copy`] → 模型允許同名元素，使用者可以自己改名；有需要再改成遞增編號。
- [貼上位置固定是原位置加偏移，不跟隨游標] → 已列為不在本期範圍；跨圖貼上時，原位置可能不在目前畫面內，使用者可以用「縮放至全圖」找到。
- [跨圖貼上循序圖時，同名生命線會被視為同一條] → 這正是規格要的對應方式；同一張圖裡有同名生命線時，會優先用 id 對應，不受影響。
- [剪貼簿留著舊專案的元素 id] → 貼上時一律先檢查模型是否有該元素，不存在就從快照建立，不會產生懸空的參照。
