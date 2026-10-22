# Proposal

## Why

套件框（類別圖 Package）與子圖框（流程圖 Subgraph）的大小目前只由「最小尺寸」與成員範圍決定，無法先拉出一個大框再把元素放進去，也無法在框內預留空白。使用者實際整理圖時會想先規劃區塊再擺元素，因此需要能手動調整框的大小。

## What Changes

- 選取單一套件框或子圖框時，框的右下角出現**調整大小把手**；拖曳把手可放大或縮小框，放開後成為一筆可復原的變更。
- 框的範圍仍 SHALL 至少涵蓋所有成員加上邊距：手動尺寸只是「最小尺寸」，縮小時不會小於成員範圍，因此不會把成員擠出框、也不會改變成員判定。
- 雙擊把手**恢復自動大小**（回到預設最小尺寸）。
- 調整大小不會自動把框內的元素加入成員；加入 / 離開仍只在拖曳元素放開時判定（與現行規則相同）。
- 移動框時手動尺寸跟著保留。
- 檔案格式：套件與子圖新增選填欄位 `w` / `h`。檔案版本維持 3（版本 3 隨流程圖一起推出、尚未發佈，不另外升版）；缺少欄位的檔案照常開啟。

不在本期範圍：從框的其他邊或角調整、調整大小時自動吸附 / 收納框內元素、Note 或節點的手動尺寸。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `class-diagram`: 新增「調整套件框大小」requirement
- `flowchart`: 新增「調整子圖框大小」requirement（此 capability 由 `flowchart` 變更建立，本變更須在 `flowchart` 歸檔後才能歸檔）

## Impact

- `src/model/types.ts`：`Package`、`Subgraph` 新增選填 `w?: number`、`h?: number`
- `src/model/classLayout.ts`：`Frame` 新增選填 `w` / `h`，`packageBox` 以其作為最小尺寸
- `src/model/ops.ts`：套件與子圖的設定 / 重設尺寸操作
- `src/model/serialize.ts`：`w` / `h` 不是正數時略過該欄位並產生 warning
- `src/canvas/class/ClassDiagramView.vue`、`src/canvas/flowchart/FlowchartView.vue`：右下角把手、拖曳預覽、雙擊重設
- 相依：須在 `flowchart` 變更實作完成並歸檔後進行
- 不新增任何相依套件
