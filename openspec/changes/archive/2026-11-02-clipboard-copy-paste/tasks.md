# Tasks

## 1. 剪貼簿型別與狀態

- [x] 1.1 依 design D1，在 `src/model/types.ts` 新增 `Clip` 型別（flowchart／class／sequence 三種），並在 `src/store/editor.ts` 新增 `clipboard`（`shallowRef<Clip | null>`）與 `pasteCount`（D3）。驗證：`npm run typecheck` 通過（依專案規則由使用者執行）

## 2. 流程圖（`src/model/ops.ts`）

- [x] 2.1 依 design D2、D4 實作 `copyFlowItems` 與 `pasteFlowItems`，並在 `ops.test.ts` 補上測試：只複製兩端都在範圍內的箭頭、子圖框連同成員一起複製、貼上產生新 id 並偏移座標與 `bends`、回傳新 id、沒有可複製內容時回傳 `null`。驗證：`npm run test` 通過
- [x] 2.2 新增 `src/canvas/clipboard.ts` 的 `handleClipboardKey`（D7），並在 `FlowchartView.vue` 的 `onKeyDown` 呼叫它處理 Ctrl/Cmd + C/X/V：剪下在一次 `apply` 裡呼叫 `removeFlowItems`，貼上後選取回傳的 id。驗證：手動跑過 spec 的「流程圖複製貼上」「只複製兩端都在範圍內的箭頭」「流程圖子圖框連同成員複製」「剪下一次復原」「剪下後貼上」「貼到同類型的其他圖」「編輯文字時不攔截」

## 3. 類別圖（`src/model/ops.ts`）

- [x] 3.1 依 design D2、D5 實作 `copyClassItems` 與 `pasteClassItems`，並在 `ops.test.ts` 補上測試：目標圖沒有該元素時放原元素、已在圖上時建立 `_copy` 副本（含成員）、元素已從模型刪除時從快照建立、兩端都是原元素時沿用原關係並套用 `bends`、其他情況建立新關係、套件與註解連結改用對應後的 id。驗證：`npm run test` 通過
- [x] 3.2 在 `ClassDiagramView.vue` 的 `onKeyDown` 呼叫 `handleClipboardKey` 處理 Ctrl/Cmd + C/X/V：剪下在一次 `apply` 裡呼叫 `removeFromDiagram`。驗證：手動跑過 spec 的「類別圖剪下貼上等於搬移」「同一張類別圖複製貼上建立副本」「類別圖套件連同成員複製」「不同類型的圖不能貼」

## 4. 循序圖（`src/model/ops.ts`）

- [x] 4.1 依 design D6 實作 `copySeqItems`、`pasteSeqItems` 與 `removeSeqItems`，並在 `ops.test.ts` 補上測試：依文件順序複製、已選取片段的子項目不重複複製、只選生命線時回傳 `null`、同圖依 id 對應生命線、跨圖依名稱對應並新增缺少的生命線、插在最後一個選取項目之後（含片段內）、沒有選取時加在最後、片段的子項目也產生新 id、`removeSeqItems` 連同內容移除片段。驗證：`npm run test` 通過
- [x] 4.2 在 `SequenceDiagramView.vue` 的 `onKeyDown` 呼叫 `handleClipboardKey` 處理 Ctrl/Cmd + C/X/V：剪下在一次 `apply` 裡呼叫 `removeSeqItems`，貼上的插入位置依目前選取決定。驗證：手動跑過 spec 的「循序圖貼在選取之後」「跨循序圖依名稱對應生命線」「循序圖剪下片段」

## 5. 整合驗證

- [x] 5.1 執行 `npm run typecheck` 與 `npm run test`，確認全部通過（依專案規則由使用者執行）
- [x] 5.2 更新 `docs/backlog.md`：移除「複製／剪下／貼上」段落。驗證：檔案內容與實際進度一致

## Workflow follow-up

- 使用者確認後歸檔 change（`/opsx:archive`），並同步主規格 `openspec/specs/diagram-editing/spec.md`
