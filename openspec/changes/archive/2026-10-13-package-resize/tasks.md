# Tasks

前置：`flowchart` 變更已實作完成並歸檔（`openspec/specs/flowchart/spec.md` 存在）。

## 1. 資料模型與尺寸計算

- [x] 1.1 依 design D1 在 `types.ts` 的 `Package`、`Subgraph` 與 `classLayout.ts` 的 `Frame` 加入選填 `w` / `h`，兩個 view 的 `frame()` 一併帶入；`packageBox` 以 `max(預設, w ?? 預設)` 作為最小尺寸；驗證 `classLayout.test.ts` 原有套件測試全數通過，並新增測試涵蓋「`w / h` 大於預設時框放大」「小於預設時維持預設」「小於成員範圍時框仍包住成員」「子圖資料同樣適用」
- [x] 1.2 依 D3 新增 `setPackageSize` / `resetPackageSize` / `setSubgraphSize` / `resetSubgraphSize`；驗證測試涵蓋設定後欄位存在、重設後 `w` / `h` 消失、`moveItems` / `moveFlowItems` 移動後 `w` / `h` 不變、調整大小不改變成員
- [x] 1.3 依 D5 在 `serialize.ts` 略過非有限正數的 `w` / `h` 並產生 warning；驗證測試涵蓋「含 `w / h` 的類別圖與流程圖往返一致」「`w: -1`、`h: "abc"` 被刪除且 warning 數正確、其餘內容照常載入」「缺少 `w / h` 的檔案照常載入」

## 2. 畫布互動

- [x] 2.1 `ClassDiagramView.vue` 依 D4 實作套件把手：只選取一個套件時顯示、拖曳預覽、放開寫入、雙擊重設；手動驗證 class-diagram spec「放大空套件」「縮小不會小於成員」「放大不會自動收納」「一次復原」「移動保留大小」「雙擊把手重設」情境，並確認匯出的 SVG 不含把手
- [x] 2.2 `FlowchartView.vue` 依 D4 實作子圖把手（同 2.1）；手動驗證 flowchart spec「放大後放入節點」「縮小不會小於成員」「一次復原」「雙擊把手重設」情境

## 3. 整合驗證

- [x] 3.1 放大一個套件與一個子圖後儲存、重新開啟，確認大小相同；執行 `npm run test` 與 `npx vue-tsc --noEmit` 全數通過

## Workflow follow-up

- 歸檔前確認 `flowchart` 已歸檔，否則 `flowchart` capability 的 delta 無處合併
