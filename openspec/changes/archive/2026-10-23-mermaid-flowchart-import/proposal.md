# Proposal

## Why

流程圖常常已經以 Mermaid 寫在 Markdown 文件裡，或是請 AI 產生的。但 Mermaid 自動排出來的版面不好看，也不能手動調整。現在要在這裡整理，只能照著文字一個一個重畫。流程圖已經上線，它的節點、箭頭、子圖幾乎和 Mermaid `flowchart` 一一對應，所以先做流程圖的匯入。

## What Changes

- 工具列新增 **「匯入 Mermaid」** 按鈕，開啟對話框，貼上 Mermaid 文字後按確定，建立一張新的流程圖並切換到它的分頁。
- 支援 `flowchart` / `graph`，以及 `TD`、`TB`、`LR`、`RL`、`BT` 五種方向。貼上時自動去掉 Markdown 的 ```` ```mermaid ```` 圍欄。有 frontmatter `title` 時用它當圖名，沒有則叫「匯入的流程圖」。
- **形狀對照**：`[ ]` 對到處理，`{ }` 對到判斷，`([ ])`、`(( ))` 對到開始／結束，`[/ /]`、`[\ \]` 對到輸入／輸出，`[( )]` 對到資料庫。其他形狀一律轉成處理。
- **箭頭**：各種線型（實線、虛線、粗線、無箭頭）都轉成一般箭頭，保留標籤。支援串接（`A --> B --> C`）與 `&` 多節點寫法。
- **子圖**：`subgraph` 轉成子圖框。巢狀子圖會被攤平，節點歸到最內層的子圖。
- **容錯**：認不得的行（`style`、`classDef`、`click`、`%%` 註解等）直接略過，不讓整份匯入失敗。
- **錯誤處理**：貼上的是其他圖種時，提示「目前只支援流程圖」；解析不出任何節點時，顯示錯誤訊息。兩種情況都不建立圖。
- **自動排版**：依方向分層排列，不重疊、看得出流向即可，之後由使用者手動整理。
- 整個匯入算一筆復原紀錄。

不在本期範圍：Mermaid 匯出、類別圖與循序圖的匯入、匯入到既有的圖、保留 Mermaid 的樣式（顏色、虛線、粗線）、巢狀子圖、新式 `A@{ shape: ... }` 語法、匯入時保留 Mermaid 原本的版面。

## Capabilities

### New Capabilities
- `mermaid-import`: 把貼上的 Mermaid 文字轉成可編輯的圖，本期只涵蓋流程圖。之後的類別圖、循序圖匯入也會放在這裡。

### Modified Capabilities
（無）

## Impact

- `src/io/mermaid.ts`（新增）：Mermaid flowchart 文字解析，是不依賴 Vue 的純函式，附單元測試。
- `src/model/flowLayout.ts`：新增分層自動排版函式，附單元測試。
- `src/model/ops.ts`：新增匯入操作，把解析結果與排版位置寫進新的流程圖。
- `src/ui/Toolbar.vue`：新增「匯入 Mermaid」按鈕。
- `src/ui/MermaidImportDialog.vue`（新增）：貼上文字用的對話框，以原生 `<dialog>` 實作。
- 不新增任何相依套件，專案檔格式不變。
