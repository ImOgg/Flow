# Design

## Context

架構沿用前兩期（見 archive/2026-10-08-uml-editor-mvp/design.md、archive/2026-10-12-uml-editor-v2/design.md）：所有修改經 `store.apply(fn)` 交給 `model/ops.ts` 就地修改草稿、整份快照式復原、排版與路徑是 `model/` 下不依賴 Vue 的純函式、畫布以 Vue 元件直接畫 SVG、文字量測以參數注入。

可直接重用的第二期成果：`routeWith` / `simplify` / `moveSegment`（直角折線與轉折點拖曳）、`packageBox` / `packageAt`（框聯集與命中）、`InlineInput` 的 `multiline` 模式、`pointer.ts`、`measure.ts`、`Markers.vue`。

現有程式有三處以「不是類別圖就是循序圖」的二分寫法判斷圖種：`ops.deleteElement`（`else` 分支直接存取 `d.lifelines`）、`ops.addDiagram`、`DiagramTabs.vue` 的名稱與圖示。加入第三種圖後這些都必須改成明確判斷。

## Goals / Non-Goals

**Goals:**
- 流程圖資料全部掛在圖上，與 `model.elements` / `model.relations` 無關
- 形狀尺寸、端點貼合、標籤位置、下一步位置都是純函式並有單元測試
- 類別圖既有行為不變；`packageBox` 改簽章後原測試全數通過
- 版本 1、2 檔案無損開啟

**Non-Goals:**
- 把類別圖與流程圖的畫布互動抽成共用元件（見 D2）
- 箭頭自動避開障礙物、自動排版
- 箭頭標籤可拖曳、多條平行箭頭自動錯開

## Decisions

### D1. 資料模型（版本 3）
```ts
type FlowShape = 'process' | 'decision' | 'terminal' | 'io' | 'database'
interface FlowNode { id: Id; shape: FlowShape; text: string; x: number; y: number }
interface FlowEdge { id: Id; from: Id; to: Id; label: string; bends?: Point[] }
interface Subgraph { id: Id; title: string; x: number; y: number; nodeIds: Id[] }
interface FlowchartDiagram {
  id: Id; type: 'flowchart'; name: string
  nodes: FlowNode[]; edges: FlowEdge[]; subgraphs: Subgraph[]
}
type Diagram = ClassDiagram | SequenceDiagram | FlowchartDiagram
interface Project { version: 3; /* 其餘不變 */ }
```
- 節點、箭頭、子圖各有自己的 `id`，選取集合直接放這些 id，不需要類別圖那種組合 id。
- 節點尺寸不存，依文字與形狀即時計算（同類別框）。
- 允許自我迴圈箭頭（`from === to`），沿用 `route` 的自我迴圈路徑；Mermaid 也允許。
- 替代方案「流程圖節點進入 `model.elements`」：會讓模型樹混入流程步驟，且步驟不會跨圖共用，否決。

### D2. 獨立的 `FlowchartView`，共用純函式而非畫布元件
新增 `canvas/flowchart/FlowchartView.vue`（互動）、`FlowNode.vue`（形狀與文字）、`FlowEdge.vue`（折線、箭頭、標籤），`App.vue` 依 `type === 'flowchart'` 切換。拖曳、框選、選取連線的互動邏輯會與 `ClassDiagramView.vue` 有部分重複。

替代方案「把 `ClassDiagramView` 抽成通用畫布」：該元件 574 行且與 Classifier / Relation 緊密耦合，抽象化等於重構前兩期成果，類別圖回歸風險高。等第四種自由擺放的圖出現、重複模式明確後再抽。

### D3. 形狀尺寸（`model/flowLayout.ts` 的 `flowNodeBox`）
文字依換行拆行，文字框 `w = max(最長行 + 2·PAD_X, 100)`、`h = max(行數·LINE_H + 2·PAD_Y, 40)`（沿用 `classLayout` 的 `LINE_H` / `PAD_X` / `PAD_Y`）。外框：

| shape | 外框 W × H |
|---|---|
| process | `w × h` |
| terminal | `(w + h) × h`，兩端半圓半徑 `h/2` |
| io | `(w + 2·SLANT) × h`，`SLANT = 15` |
| database | `w × (h + 2·CAP)`，`CAP = 8`（橢圓蓋半高） |
| decision | `2w × 2h`，文字框恰好內接菱形 |

回傳 `{ w, h, lines }`，畫布元件依 `shape` 畫對應的 SVG path。

### D4. 端點貼合形狀（`clipToShape`）
`routeWith(外框A, 外框B, bends)` 產生端點在外框上的直角折線；之後對首、末端點各呼叫 `clipToShape(端點, 相鄰點, shape, 外框)`：沿「相鄰點 → 端點」方向（必為水平或垂直）把端點往內推，直到落在實際形狀邊上，因此線段仍維持水平 / 垂直。
- process：不動
- decision：解 `|dx|/(W/2) + |dy|/(H/2) = 1`
- io：左右邊為斜線，水平進入時解斜線方程式；上下邊不動
- database：上下邊為橢圓弧，垂直進入時解橢圓方程式；左右邊不動
- terminal：左右兩端為半圓，水平進入時解圓方程式；上下邊不動

自動路徑從外框邊中點出發，對菱形恰為頂點。轉折點拖曳仍用 `moveSegment`，存的是中間轉折點，邊上端點每次重算，故貼合不影響存檔資料。

### D5. 標籤位置
`labelPos(points)`：沿折線累加長度，取總長一半處的點。畫布在該點畫標籤文字並墊一個白底矩形（尺寸以 `measure` 計算）。

### D6. 子圖框共用 `packageBox` / `packageAt`
將兩者參數從 `Package` 放寬為 `{ id: Id; x: number; y: number; ids: Id[] }` 形狀的結構（類別圖呼叫端傳 `{ id: k.id, x: k.x, y: k.y, ids: k.elementIds }`），流程圖傳 `{ id, x, y, ids: nodeIds }`。視覺（最底層、左上標題）比照 Package。成員判定、重疊取最上層、一個節點只屬一個子圖，邏輯與 `setPackageMembership` 相同，流程圖版本為 `setSubgraphMembership`。

### D7. ops（`model/ops.ts`）
- `addDiagram` 改以 `switch (type)` 產生三種空圖；新增 `getFlowchart(p, id)`。
- `deleteElement` 改為 `if class … else if sequence …`，流程圖不處理。
- 新增：`addFlowNode`、`setFlowNodeText`、`setFlowNodeShape`、`addFlowEdge`、`setFlowEdgeLabel`、`setFlowEdgeBends` / `resetFlowEdgeBends`、`addSubgraph`、`renameSubgraph`、`setSubgraphMembership`、`moveFlowItems`（子圖連同成員、成員同時被選取時只移一次）、`removeFlowItems`（節點連帶刪除相連箭頭並從子圖成員移除；刪子圖保留成員）、`addNextNode(p, diagramId, fromId, measure)`（建立節點與箭頭並回傳新節點 id，位置由 D8 決定，整個在一次 `apply` 內 = 一筆復原紀錄）。

### D8. 下一步節點位置（`nextNodePos`）
`nextNodePos(來源框, 新框尺寸, 其他框[])`：候選位置 x 以來源中心對齊、y = 來源底 + 50；與任一其他框（含 10px 間距）相交就把 x 右移「新框寬 + 40」再試，最多嘗試 20 次後直接採用最後位置。新節點固定為 `process`、空文字，尺寸由 `flowNodeBox` 算出。

### D9. 編輯器狀態與鍵盤
- `editor.ts`：`tool` 型別擴充為 `ClassTool | FlowShape | 'edge' | 'subgraph'`（`select` 共用）；`Editing` 新增 `{ kind: 'flowNode' | 'edgeLabel' | 'subgraph'; id }`。
- Tab：`FlowchartView` 的 keydown 只在「選取恰為一個節點且 `editing` 為 null」時 `preventDefault` 並呼叫 `addNextNode`，接著設定選取與 `editing = flowNode`。
- 雙擊箭頭 = 編輯標籤（與類別圖的雙擊重設不同）；重設路徑改為選取有 `bends` 的箭頭時提示列出現「重設路徑」按鈕。
- 選取恰為一個節點時，提示列顯示五個形狀按鈕呼叫 `setFlowNodeShape`。

### D10. 序列化（`serialize.ts`）
- 接受 `version` 1、2、3；1 → 2 沿用既有遷移，2 → 3 只把 `version` 設為 3（舊檔不含流程圖）。
- 結構檢查：`type === 'flowchart'` 時 `nodes` / `edges` / `subgraphs` 必須為陣列，且每個節點的 `shape` 必須是五種之一，否則拒絕整份檔案。
- 懸空清理：`from` / `to` 不在節點集合的箭頭略過；子圖 `nodeIds` 只保留存在的節點；每項記 warning。
- 遍歷各圖的 `if class … else …` 改成三種明確分支。

### D11. 測試
只測 `model/`，比照前兩期：`flowNodeBox` 五種形狀與多行 / 空白；`clipToShape` 每種形狀上下左右四向進入時端點在形狀邊上（誤差 < 0.5）且首末段維持水平 / 垂直；`labelPos` 直線、L 形、Z 形；`nextNodePos` 正下方空、被佔、連續被佔；ops 的連鎖刪除、子圖成員、整組移動不重複位移、`addNextNode`；序列化版本 2 → 3、懸空清理、未知 `shape` 拒絕、含流程圖的往返；`deleteElement` 在含流程圖的專案上不出錯。畫布互動手動驗證。

## Risks / Trade-offs

- [菱形採 `2w × 2h`，長文字時菱形很寬] → 與 Mermaid 行為一致，先接受；使用者可用換行控制寬度。
- [`FlowchartView` 與 `ClassDiagramView` 互動邏輯重複] → 已在 D2 說明；重複部分集中在拖曳與框選，有第三個使用者時再抽。
- [Tab 被攔截影響鍵盤導覽] → 只在選取單一節點且未編輯時攔截，其餘情況保持瀏覽器預設。
- [`packageBox` 改簽章影響類別圖] → 有既有單元測試保護，任務中要求原測試全數通過。
- [版本 3 檔案無法以第二期程式開啟] → 與第二期升版相同處理，已在 proposal 標示 BREAKING。

## Migration Plan

開啟時自動遷移（D10），無需使用者操作；儲存即寫成版本 3。無伺服器端或資料庫，回復方式為使用前一版程式開啟升版前的檔案備份。
