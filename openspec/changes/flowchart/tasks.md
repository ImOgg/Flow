# Tasks

## 1. 資料模型與版本遷移

- [x] 1.1 依 design D1 修改 `model/types.ts`（`FlowShape`、`FlowNode`、`FlowEdge`、`Subgraph`、`FlowchartDiagram`、`Diagram` 聯集、`version: 3`）；依 D7 將 `addDiagram` 改為 `switch` 支援流程圖、新增 `getFlowchart`、`deleteElement` 改為明確的 class / sequence 分支；驗證 `npx vue-tsc --noEmit` 通過、既有測試全數通過，並新增測試「含流程圖的專案執行 `deleteElement` 不出錯」
- [x] 1.2 依 D10 修改 `serialize.ts`：接受版本 1、2、3 並遷移到 3、流程圖結構檢查（含 `shape` 合法值）、箭頭端點與子圖成員的懸空清理；驗證測試涵蓋「版本 2 檔案載入後為版本 3」「版本 1 檔案載入後為版本 3 且類別圖有空陣列」「未知 shape 整份拒絕」「懸空箭頭與子圖成員被略過並產生 warning」「含流程圖的專案往返一致」

## 2. 版面與路徑（`model/flowLayout.ts`）

- [x] 2.1 依 D3 實作 `flowNodeBox(node, measure)`；驗證測試涵蓋五種形狀的外框尺寸關係、多行文字撐高、空白文字維持最小尺寸
- [x] 2.2 依 D4 實作 `clipToShape`，並提供組合函式產生流程圖箭頭的完整折線（`routeWith` + 首末端貼合）；驗證測試涵蓋每種形狀從上下左右四向進入時端點落在形狀邊上（誤差 < 0.5）、首末段仍為水平或垂直、自動路徑連到菱形時端點為頂點
- [x] 2.3 依 D5 實作 `labelPos(points)`、依 D8 實作 `nextNodePos`；驗證測試涵蓋直線 / L 形 / Z 形折線的中點，以及下一步位置在「正下方空」「正下方被佔」「連續三格被佔」時的結果
- [x] 2.4 依 D6 將 `classLayout.ts` 的 `packageBox` / `packageAt` 參數放寬為 `{ id, x, y, ids }`，更新類別圖呼叫端；驗證 `classLayout.test.ts` 原有套件測試全數通過，並新增以子圖資料呼叫的測試

## 3. 流程圖操作（`model/ops.ts`）

- [x] 3.1 依 D7 新增節點、箭頭、標籤、轉折點、形狀切換操作與 `removeFlowItems`；驗證測試涵蓋「刪除節點連帶刪除所有相連箭頭（含自我迴圈）」「刪除節點後從子圖成員移除」「切換形狀保留文字與箭頭」「重設轉折點後 `bends` 消失」
- [x] 3.2 新增子圖操作（新增、改名、`setSubgraphMembership`、刪除保留成員）與 `moveFlowItems`；驗證測試涵蓋「一個節點只屬一個子圖」「移動子圖且成員同時被選取時不重複位移」「刪除子圖保留成員位置」
- [x] 3.3 依 D7、D8 新增 `addNextNode`；驗證測試涵蓋新節點為空文字的 process、箭頭從來源指向新節點、位置符合 `nextNodePos`、在單一 `store.apply` 內完成（一次 undo 同時移除節點與箭頭）

## 4. 畫面

- [ ] 4.1 `App.vue` 依 `type === 'flowchart'` 顯示 `FlowchartView`；`DiagramTabs.vue` 新增「＋流程圖」按鈕、預設名稱「流程圖 N」與分頁圖示；`editor.ts` 依 D9 擴充 `tool` 與 `Editing`；手動驗證 project-workspace spec「新增流程圖」情境，且類別圖、循序圖分頁行為不變
- [ ] 4.2 `FlowNode.vue` 依 `shape` 繪製五種形狀與多行文字；`FlowchartView` 的節點工具點擊放置後進入多行編輯、雙擊編輯文字；手動驗證 flowchart spec「放置判斷節點」「取消編輯」「多行文字撐大節點」「菱形容納文字」情境
- [ ] 4.3 `FlowEdge.vue` 繪製折線、實心箭頭與白底標籤；箭頭工具從節點拖到節點建立後進入標籤編輯、雙擊箭頭改標籤；選取箭頭時的線段拖曳與提示列「重設路徑」按鈕；手動驗證「建立有標籤的箭頭」「拖到空白處」「修改標籤」「端點貼合菱形」「調整後重設」情境，且一次線段拖曳只產生一筆復原紀錄
- [ ] 4.4 選取、Shift 加選、框選、拖曳移動、Delete 刪除；選取單一節點時提示列顯示形狀按鈕；手動驗證 diagram-editing spec「流程圖多選移動」「刪除流程圖節點」與 flowchart spec「切換形狀」情境
- [ ] 4.5 依 D9 實作 Tab 快速建立下一步；手動驗證「連續輸入流程」「下方已有節點」「一次復原」情境，並確認未選取節點或編輯中時 Tab 維持預設行為
- [ ] 4.6 子圖工具與子圖框繪製（最底層、左上標題）、雙擊標題改名、拖曳標題整組移動、節點放開時加入 / 離開子圖、Delete 刪除子圖；手動驗證 flowchart spec 所有子圖情境，且整組移動只產生一筆復原紀錄

## 5. 整合驗證

- [ ] 5.1 開啟一份第二期儲存的 `.uml.json`，新增流程圖並畫出含五種形狀、有標籤的判斷分支、子圖與調整過轉折點的箭頭，匯出 SVG 與 PNG 確認內容完整，儲存後重新開啟確認內容相同、檔案 `version` 為 3；執行 `npm run test` 與 `npx vue-tsc --noEmit` 全數通過
