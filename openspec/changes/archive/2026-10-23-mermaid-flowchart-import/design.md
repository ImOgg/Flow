# Design

## Context

做法沿用既有架構：修改一律經過 `store.apply(fn)` 交給 `model/ops.ts`，排版是 `model/` 下不依賴 Vue 的純函式，文字量測以 `Measure` 參數注入（例如 `addNextNode(p, diagramId, fromId, measure)`）。流程圖資料的定義見 `types.ts` 的 `FlowchartDiagram`。節點尺寸由 `flowNodeBox` 即時計算。子圖框範圍由 `packageBox` 計算，是 `{x, y, 最小尺寸}` 與成員框的聯集。

分頁切換做法參考 `DiagramTabs.vue` 的 `add()`：先 `store.apply` 建立圖，再 `ed.clear()`，最後設定 `ed.activeDiagramId`。

動機與範圍見 proposal.md，行為見 specs/mermaid-import/spec.md。

## Goals / Non-Goals

**Goals:**
- 解析、排版、建立圖分成三層，各自能單獨測試：解析是純文字轉中介結構，排版是尺寸與邊轉成座標，建立圖是 ops。
- 遇到 AI 或文件中常見的雜訊不報錯，盡量把能認的部分都匯進來。

**Non-Goals:**
- 完整的 Mermaid 文法相容（不寫正式的文法或 tokenizer，也不引入 mermaid 套件）。
- 漂亮的排版：不做交叉最小化，也不讓子圖成員在排版時聚在一起（見 Risks）。
- 把解析結果拿來做匯出的反向轉換。

## Decisions

### D1. 三層結構

```
src/io/mermaid.ts        parseMermaidFlowchart(text) → ParseResult         （純文字，不知道座標）
src/model/flowLayout.ts  layerLayout(sizes, edges, dir) → Map<id, Point>   （純幾何）
src/model/ops.ts         importFlowchart(p, flow, measure) → diagramId     （建立圖、節點、箭頭、子圖）
```

```ts
type Direction = 'TD' | 'LR' | 'RL' | 'BT'          // TB 解析時正規化成 TD
interface MermaidFlow {
  title: string | null
  direction: Direction
  nodes: { id: string; shape: FlowShape; text: string }[]      // 依第一次出現的順序
  edges: { from: string; to: string; label: string }[]
  subgraphs: { title: string; nodeIds: string[] }[]
}
type ParseResult = { ok: true; flow: MermaidFlow } | { ok: false; error: string }
```

中介結構裡的 id 是 Mermaid 原本的 id。`importFlowchart` 建立節點時才換成 `newId()`，所以 Mermaid id 不會進到專案檔。

替代方案是解析時直接寫入 `Project`。但這樣解析測試就得帶著整個專案結構，排版也會被綁在 ops 裡，所以不採用。

### D2. 解析：逐行處理，每行由左往右掃描

1. **前處理**：去掉 ```` ``` ```` 開頭與結尾的圍欄行，讀取 `---` … `---` frontmatter 裡的 `title:`，去掉 `%%` 開頭的行。每行去掉頭尾空白與結尾的 `;`。
2. **找標頭**：第一個非空行必須符合 `^(flowchart|graph)(\s+(TD|TB|LR|RL|BT))?$`。不符合時，如果是已知的其他圖種關鍵字（`classDiagram`、`sequenceDiagram`、`stateDiagram`、`erDiagram`、`gantt`、`pie` 等），或任何其他內容，都回傳 `{ ok: false, error: '目前只支援流程圖' }`。
3. **略過的行**：以 `style`、`classDef`、`class`、`linkStyle`、`click`、`direction` 開頭的行直接略過。
4. **子圖**：`subgraph X` 把一個子圖推入堆疊，`end` 彈出。節點第一次出現時，記錄到堆疊頂端（最內層）的子圖，所以巢狀會自然攤平。標題的取法是：`id [標題]` 或 `id ["標題"]` 取括號內的文字，否則取整段文字。子圖 id 記在一個集合裡，連到這些 id 的箭頭在最後略過。
5. **陳述行**用一個游標由左往右掃描：
   - 讀一組節點：`節點 (& 節點)*`。
   - 讀一個節點：先讀 id（`/[\p{L}\p{N}_]+/u`），接著試形狀開頭。依長度由長到短比對 `([`、`((`、`[(`、`[/`、`[\`、`{{`、`[[`、`[`、`{`、`(`、`>`，再讀到對應的結尾。括號內以 `"` 開頭時，讀到下一個 `"` 為止，所以引號裡可以出現括號。之後去掉 `:::名稱`。
   - 讀連線：用一條正規式比對「左端記號 + 線本體 + 右端記號」，線本體包含 `--`、`==`、`-.-` 等不同長度。再加上兩種標籤寫法：`-->|標籤|`，以及 `-- 標籤 -->`、`== 標籤 ==>`、`-. 標籤 .->`。
   - 重複「連線、節點組」直到行尾。每一段都對左右兩組節點做笛卡兒積，產生箭頭。
   - 掃描途中如果碰到無法解析的地方，就停止這一行。已經讀到的節點與箭頭照樣保留。
6. **形狀對照**照 spec 的表。`[/ /]`、`[\ \]`、`[/ \]`、`[\ /]` 都轉成 io。`{{ }}`、`[[ ]]`、`( )`、`> ]` 轉成 process。文字的處理：去掉外層引號，`<br>`、`<br/>`、`<br />` 轉成 `\n`。
7. **同一個 id 第一次出現沒有括號、之後才帶括號時**，用之後的形狀與文字覆蓋。只寫 id 的節點，文字就是 id。
8. 解析完如果 `nodes` 是空的，回傳 `{ ok: false, error: '找不到任何節點' }`。

替代方案一是引入官方 `mermaid` 套件來解析。它的體積有數 MB，又依賴 DOM，而且只為了拿到 AST 不值得，所以不採用。

替代方案二是寫完整的 tokenizer 加文法。流程圖的實際用法很有限，逐行掃描的程式碼量小，搭配測試已經夠用，等遇到真的解析不了的情況再升級。

### D3. 分層排版（`layerLayout`）

輸入是 `nodes: { id, w, h }[]`（順序就是 Mermaid 中第一次出現的順序）、`edges: { from, to }[]` 與 `dir`，輸出每個節點的左上角座標。

1. **斷開迴圈**：依節點順序做 DFS，指向「目前還在遞迴堆疊中的節點」的邊視為回邊，排版時忽略。自我迴圈也忽略。
2. **分層**：在剩下的 DAG 上做最長路徑分層，`rank(v) = max(rank(u) + 1)`，沒有前驅的節點是第 0 層。這樣每條非回邊都滿足 `rank(to) > rank(from)`。
3. **層內順序**：照節點第一次出現的順序。
4. **座標**（以 TD 為準）：
   - 每一層是一列，列高取該層最高的節點高度，列與列之間隔 `GAP_RANK = 60`。
   - 同一列的節點由左往右排，間隔 `GAP_NODE = 40`，每個節點在列高內垂直置中。
   - 每一列以所有列中最寬的那一列為準，水平置中。
   - LR 是把「層」放在 x 軸，用層內節點的最大寬度當欄寬，節點在欄內水平置中。
   - BT 和 RL 是把層的順序反過來。
5. **平移**：最後整體平移，讓最小的 x 和 y 都等於 `ORIGIN = 40`。

替代方案是 Sugiyama 的完整流程（交叉最小化、座標指定）。實作量多好幾倍，但使用者反正會自己重排，所以不採用。這裡用 `ponytail:` 註解標明上限：層內只照出現順序排，箭頭交叉多時才需要加 barycenter 排序。

### D4. 建立圖（`importFlowchart`）

```ts
export function importFlowchart(p: Project, flow: MermaidFlow, measure: Measure): Id
```

1. 用 `addDiagram(p, 'flowchart', flow.title ?? '匯入的流程圖')` 建立新圖。
2. 用 `flowNodeBox` 算出每個節點的尺寸，交給 `layerLayout` 拿到座標，再以 `newId()` 建立節點，並記下「Mermaid id → 新 id」的對照。
3. 箭頭依對照轉換 `from` 和 `to` 後建立。找不到對照的箭頭（例如連到子圖 id）略過。
4. 子圖：先依對照把成員轉成新 id，沒有成員就不建立。子圖的 `x` 等於成員框的最小 x 減 `PKG_PAD`，`y` 等於成員框的最小 y 減 `PKG_PAD + PKG_TAB_H`。這樣 `packageBox` 算出的框會剛好從成員的左上角開始，不會被 `{x, y}` 往外撐大。
5. 一個節點只會出現在一個子圖裡，這點由解析器保證（節點只記在第一次出現時的最內層子圖）。

UI 端在單一次 `store.apply` 中呼叫這個函式，所以只產生一筆復原紀錄。

### D5. 對話框（`MermaidImportDialog.vue`）

- 用原生的 `<dialog>` 加 `showModal()`，Esc 關閉與背景遮罩都由瀏覽器提供，不需要新增套件或自己寫 overlay。
- 內容是一個 `<textarea>`、一行錯誤訊息，以及「確定」「取消」兩個按鈕。
- 按確定時先執行 `parseMermaidFlowchart`。失敗就顯示 `error`，對話框保持開啟，文字也保留。成功就執行 `store.apply((p) => ops.importFlowchart(p, r.flow, measureText))`，然後 `ed.clear()`、切換 `activeDiagramId`、關閉對話框，並清空 textarea。
- `Toolbar.vue` 在「儲存」後面加一個「匯入 Mermaid」按鈕，用來開啟對話框。
- 樣式只寫對話框可用所需的最少量：textarea 的寬高、等寬字型、錯誤文字顏色。按鈕沿用既有的全域樣式。依專案規則，任何樣式調整都要先給使用者確認。

## Risks / Trade-offs

- **子圖成員在排版時沒有聚在一起**：子圖框是成員範圍的聯集，如果成員被排到不相鄰的位置，框可能蓋住非成員的節點，之後拖動時也容易誤判成員。
  → 緩解：Mermaid 的寫法通常把子圖成員連續寫在一起，照出現順序排列時大多會相鄰。如果真的造成困擾，再在層內排序時以子圖分組（只需改層內排序的鍵值）。
- **逐行掃描無法涵蓋所有 Mermaid 語法**，例如 `A@{ shape: ... }`、跨行的節點文字、markdown 字串等。
  → 緩解：無法解析的部分只會中止該行，不影響其他行。測試用的範例以 AI 常產生的寫法為主。
- **多條平行箭頭或回邊的路徑可能重疊**：這是沿用既有自動路徑的限制。
  → 使用者可以拖動轉折點。

## Open Questions

（無）
