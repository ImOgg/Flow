# Design

## Context

全新專案，目錄中除 OpenSpec 設定外沒有任何程式碼。使用者熟悉 Web（Vue）開發、沒有桌面應用經驗，工具僅供個人使用，資料存本機檔案、無後端。動機見 proposal.md。

## Goals / Non-Goals

**Goals:**
- 模型是唯一真實資料來源，圖只是模型的呈現與排版資訊
- 最複雜的邏輯（操作、解析、循序圖排版）為不依賴 Vue 的純函式，可單元測試
- 之後能以 Tauri 包成桌面應用而不需重寫

**Non-Goals:**
- 連線自動避開障礙物、自動排版類別圖
- 多人協作、雲端同步
- UI 的自動化 / E2E 測試

## Decisions

### D1. 技術棧：Vue 3 + TypeScript + Vite + Pinia，不使用 UI 元件庫與圖形引擎
畫布完全以 SVG 由 Vue 元件渲染。
- 替代方案：AntV X6 / maxGraph。引擎持有自己的圖形狀態，需與模型雙向同步，是最容易出錯之處；且循序圖本質是「由順序算版面」，塞入通用圖形引擎反而不自然。
- 替代方案：WPF / Avalonia。需學習 XAML 與 MVVM，且畫布互動幾乎要全部自刻，對沒有桌面經驗的使用者成本最高。
- 代價：拖拉、框選、縮放平移、直角連線需自行實作（預估數百行）。

### D2. 專案檔結構：模型與圖分離
```ts
type Id = string // crypto.randomUUID()

interface Project {
  version: 1
  model: {
    elements: Record<Id, Classifier>
    relations: Record<Id, Relation>
  }
  diagrams: Diagram[]
}

interface Classifier {
  id: Id
  kind: 'class' | 'interface' | 'enum'
  name: string
  attributes: Attribute[]      // enum 時用作列舉值（只用 name）
  operations: Operation[]
}
interface Attribute { visibility: Visibility; name: string; type: string }
interface Operation { visibility: Visibility; name: string; params: string; returnType: string }
type Visibility = '+' | '-' | '#' | '~'

interface Relation {
  id: Id
  kind: 'association' | 'generalization' | 'realization' | 'dependency' | 'aggregation' | 'composition'
  sourceId: Id   // 繼承/實作：子；聚合/組合：整體
  targetId: Id
}

type Diagram = ClassDiagram | SequenceDiagram

interface ClassDiagram {
  id: Id; type: 'class'; name: string
  nodes: { elementId: Id; x: number; y: number }[]
  edges: { relationId: Id }[]
}

interface SequenceDiagram {
  id: Id; type: 'sequence'; name: string
  lifelines: { id: Id; name: string; elementId?: Id }[]  // 陣列順序 = 左到右
  items: SeqItem[]                                        // 陣列順序 = 上到下
}
type SeqItem =
  | { kind: 'message'; id: Id; from: Id; to: Id; text: string; type: 'sync' | 'return' }
  | { kind: 'fragment'; id: Id; type: 'alt' | 'loop' | 'opt'; operands: { guard: string; items: SeqItem[] }[] }
```
- 循序圖不存任何座標，巢狀 `items` 直接表達片段範圍，插入 / 刪除不需維護座標。
- 類別圖節點不存寬高，由內容計算。
- 循序圖的訊息不屬於共用模型（Astah 也將訊息視為該互動自身的內容），只有生命線可綁定模型元素。

### D3. 模組切分
```
src/
  model/            純 TS，不 import vue
    types.ts
    ops.ts          所有修改操作：(draft, args) => 結果，就地修改傳入的草稿
    quickInput.ts   parseAttribute / parseOperation / parseMessage
    sequenceLayout.ts  SequenceDiagram -> 各圖形座標
    classLayout.ts  文字量測後的框尺寸、直角連線路徑
    serialize.ts    驗證 + 載入（含略過無效參照）
  store/project.ts  Pinia：project、undo/redo 堆疊、dirty、fileHandle
  store/editor.ts   Pinia：選取、目前工具、行內編輯狀態（不進復原紀錄）
  io/file.ts        File System Access API + 退回方案
  io/export.ts      SVG / PNG 匯出
  canvas/           Canvas.vue（縮放平移框選）、class/*、sequence/*
  ui/               ModelTree、DiagramTabs、Toolbar（成員與名稱皆在畫布上行內編輯，不另設屬性面板）
```

### D4. 單向資料流與快照式復原
所有變更經由 `store.apply(fn)`：以 `structuredClone` 複製目前 `project` 為草稿，交給 `ops.ts` 就地修改，再把舊狀態推入 undo 堆疊、以草稿取代目前狀態並標記 dirty。舊狀態從未被修改，因此本身就是快照；ops 不需自行處理不可變性。復原 / 重做僅交換快照。
- 替代方案：Command pattern（每個操作寫 do/undo）。需為每個操作寫反向邏輯，跨圖連鎖刪除尤其容易漏。個人專案資料量小（KB 等級），快照成本可忽略。
- undo 堆疊上限 100 筆。
- 拖曳中的暫時位移保存在元件區域狀態，`pointerup` 時才呼叫 `apply`，確保一次拖曳一筆紀錄。

### D5. 連鎖刪除集中在 ops
`deleteElement` 在一個純函式內同時移除：元素、相連關係、所有類別圖的節點與邊、循序圖生命線的 `elementId`（解除綁定而非刪除生命線）。從圖移除（`removeFromDiagram`）只動該圖的 nodes / edges。

### D6. 類別圖連線路徑
依兩框中心的相對位置選擇出入邊（水平距離較大則左右、否則上下），產生最多兩個轉折的直角折線；不避開障礙物、使用者不可手動調整轉折點（MVP）。端點符號以 SVG `<marker>` 定義六種關係樣式。

### D7. 文字寬度量測
框寬度依最長一行文字決定，使用一個離屏 `<canvas>` 的 `measureText`，字型與 SVG 使用的字型一致；結果依字串快取。

### D8. 循序圖排版規則
- 生命線 x = 左邊距 + index × 欄寬（欄寬取 max(固定最小寬, 最長標題寬 + padding)）。
- 依序走訪 `items`，每則訊息佔一列；片段開頭佔一列（標籤 + 守衛）、每個 operand 分隔佔一列、片段結尾留下邊距。
- 片段水平範圍 = 其內所有訊息涉及的生命線最左到最右，巢狀層級每深一層左右各內縮固定距離；空片段則涵蓋全部生命線。
- 生命線虛線長度延伸到最後一列下方。

### D9. 快速輸入語法（正規表示式解析）
以下 `N` 代表名稱字元 `[\p{L}\p{N}_]+`（`u` 旗標，允許中文）：
- 屬性：`^([+\-#~])?\s*(N)\s*(?::\s*(.+))?$`
- 操作：`^([+\-#~])?\s*(N)\s*\(([^)]*)\)\s*(?::\s*(.+))?$`
- 訊息：`^(R)\s*(-->|->)\s*(R)\s*:\s*(.*)$`，其中生命線 `R` 可為 `N`、`N: N` 或 `:N`（與畫面標題相同寫法）
解析失敗回傳 `null`，由 UI 標紅保留原文。

### D10. 檔案讀寫
- 優先 `showOpenFilePicker` / `showSaveFilePicker`，保存 `FileSystemFileHandle` 以便直接覆寫。
- 不支援時：開啟用 `<input type="file">`，儲存用 Blob 下載（每次都下載新檔）。
- 載入時檢查 `version === 1` 與基本結構；不合格則拒絕並保留目前專案。
- 副檔名 `.uml.json`。

### D11. 匯出
複製目前圖的 SVG 節點，移除縮放平移 transform，以內容 bounding box 加邊距設定 viewBox，內嵌所需樣式後序列化為 SVG；PNG 以該 SVG 畫到 2 倍尺寸的 canvas（白底）後 `toBlob`。

### D12. 測試
Vitest 只測 `model/` 與 `serialize`；畫布與 UI 以手動驗證。

## Risks / Trade-offs

- [File System Access API 只有 Chromium 系完整支援] → 退回下載 / 選檔；之後包 Tauri 時改用 Tauri 檔案 API，只需替換 `io/file.ts`。
- [快照式復原在大型專案耗記憶體] → 上限 100 筆；個人專案預期遠小於此限制會造成問題的規模。
- [直角連線不避障礙，複雜圖可能穿過其他框] → MVP 接受，之後可加可拖曳轉折點。
- [measureText 與實際 SVG 渲染寬度有微小差異] → 加固定 padding 吸收誤差。
- [快速輸入語法較寬鬆，無法表達泛型如 `List<User>` 以外的複雜型別細節] → 型別部分以「冒號後整段字串」保存，不做型別語意解析。

## Migration Plan

全新專案，無既有資料。檔案格式帶 `version`，未來格式變更時在 `serialize.ts` 加入逐版遷移。
