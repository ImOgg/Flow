# Proposal

## Why

目前只能畫類別圖與循序圖，描述「業務流程、判斷分支、處理步驟」時沒有合適的圖種，只能另開其他工具。一般流程圖（Mermaid `flowchart` 風格）是最常被要求的第三種圖，且能直接重用第二期完成的連線轉折點與套件框邏輯，也為之後的 Mermaid 匯出 / 匯入鋪路，適合作為第三期。

## What Changes

- 新增 **流程圖** 圖種：可從圖分頁新增，與類別圖、循序圖並列。
- 五種 **節點形狀**：處理（矩形）、判斷（菱形）、開始 / 結束（膠囊形）、輸入 / 輸出（平行四邊形）、資料庫（圓柱）；節點文字可多行，尺寸依文字自動計算；選取單一節點時可直接切換形狀。
- **箭頭**：從來源節點拖曳到目標節點建立；可加文字標籤（例如判斷分支的「是 / 否」）；沿用類別圖的直角折線與可拖曳轉折點，端點貼合各形狀的實際外框。
- **快速建立下一步**：選取一個節點按 Tab，在下方建立新的處理節點並自動連線，可連續輸入整條流程。
- **子圖框（subgraph）**：以標題框住一組節點；拖進框內加入、拖出離開；拖曳標題整組移動；框大小自動撐大。
- 節點、箭頭、子圖框都只屬於該張流程圖，不進入共用模型、不顯示在模型樹。
- 流程圖沿用既有的選取、框選、移動、刪除、復原重做、縮放平移與匯出 SVG / PNG。
- **BREAKING（檔案格式）**：專案檔版本由 2 升為 3。版本 1、2 的檔案開啟時自動轉換；儲存一律寫成版本 3，第二期的程式無法開啟。

不在本期範圍：Mermaid 匯出 / 貼上匯入、流程圖上的 Note、自動排版、UML 活動圖專屬元素（泳道、Fork / Join）、巢狀子圖、箭頭標籤單獨拖曳、依來源形狀自動推測下一步形狀。

## Capabilities

### New Capabilities
- `flowchart`: 流程圖的節點、箭頭與標籤、子圖框的建立、編輯、排版與快速建立下一步

### Modified Capabilities
- `project-workspace`: 圖分頁可新增流程圖；開啟專案檔支援版本 1、2 自動轉換為版本 3；往返一致涵蓋流程圖內容
- `diagram-editing`: 移動與刪除的適用範圍擴及流程圖（刪除節點連帶刪除相連箭頭、刪除子圖框保留成員）

## Impact

- `src/model/types.ts`：新增 `FlowShape`、`FlowNode`、`FlowEdge`、`Subgraph`、`FlowchartDiagram`；`Diagram` 聯集加入流程圖；`Project.version` 改為 3
- `src/model/flowLayout.ts`（新）：節點尺寸、端點貼合形狀外框、標籤位置、下一步節點位置
- `src/model/classLayout.ts`：`packageBox` / `packageAt` 參數放寬，供子圖框共用
- `src/model/ops.ts`：流程圖節點、箭頭、子圖框的操作；`addDiagram` 支援流程圖
- `src/model/serialize.ts`：版本 1、2 → 3 遷移；流程圖結構檢查與懸空參照清理
- `src/canvas/flowchart/*`（新）、`src/canvas/Canvas.vue`、`src/ui/DiagramTabs.vue`、`src/store/editor.ts`：流程圖畫面、工具與分頁
- 不新增任何相依套件
