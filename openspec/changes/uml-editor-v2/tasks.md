# Tasks

## 1. 資料模型與版本遷移

- [x] 1.1 依 design D1 修改 `model/types.ts`（`version: 2`、`ClassNote`、`Package`、edge `bends`、`SeqNote`），並讓 `emptyProject` / `addDiagram` 產生的類別圖帶空的 `notes` / `packages`；驗證 `npx vue-tsc --noEmit` 通過、既有測試全數通過
- [x] 1.2 依 D7 修改 `serialize.ts`：接受版本 1 並遷移、檢查新陣列欄位、清理 Note `links` / Package `elementIds` / `SeqNote.over` 的懸空參照；驗證測試涵蓋「版本 1 檔案載入後為版本 2 且有空陣列」「懸空成員被略過並產生 warning」「over 全部懸空的 Note 被略過」「含 Note、Package、bends 的專案往返一致」

## 2. Activation bar

- [x] 2.1 依 D2 在 `sequenceLayout.ts` 計算 `activations` 並修正訊息端點 x；驗證測試涵蓋一來一回、巢狀呼叫、自呼叫錯開一層、沒有回傳延伸到最後相關訊息、不成對的回傳被忽略、跨 loop 片段的配對
- [ ] 2.2 在 `SequenceDiagramView.vue` 繪製執行區段（白底細長矩形、`pointer-events="none"`）；手動驗證 spec「一來一回」「巢狀呼叫」「自呼叫的巢狀區段」情境，從生命線拖拉建立訊息仍可用，匯出 SVG 含執行區段

## 3. 連線轉折點

- [x] 3.1 依 D3 在 `classLayout.ts` 實作 `routeWith(a, b, bends)` 與折線正規化 `simplify`（合併重複點與共線點），並在 `ops.ts` 新增 `setEdgeBends` / `resetEdgeBends`；驗證測試涵蓋：轉折點在框的水平 / 垂直 / 斜角方向時端點都在邊框上且每段皆水平或垂直、元素移動後轉折點不變、共線點被合併
- [x] 3.2 在 `RelationEdge.vue` / `ClassDiagramView.vue` 實作選取連線時的線段控制點、拖曳平移（首末段自動插入轉折點）、雙擊重設；手動驗證 spec「拖曳線段繞開其他框」「調整後移動元素」「重設路徑」情境，且一次拖曳只產生一筆復原紀錄

## 4. Note

- [ ] 4.1 在 `classLayout.ts` 實作共用的 `noteBox(text, measure)`；在 `quickInput.ts` 實作 `parseNote`（D5 的冒號判斷規則）；驗證測試涵蓋多行尺寸、空白最小尺寸、單一 / 多條生命線、`A: Class` 寫法、文字含冒號、不分大小寫、失敗輸入回傳 null
- [x] 4.2 在 `ops.ts` 新增類別圖 Note 操作（新增、改文字、連結 / 取消連結元素、刪除），將 `moveNodes` 擴充為 `moveItems`，並依 D6 讓 `removeFromDiagram` 與 `deleteElement` 清除 Note 連結；驗證測試涵蓋「連結的元素從圖移除後連結消失、Note 保留」「從模型刪除元素後所有圖的連結消失」「Class 與 Note 一起移動」
- [x] 4.3 在 `ops.ts` 新增循序圖 Note 插入與改文字，並讓 `deleteLifeline` 清理 `over`；在 `sequenceLayout.ts` 排版 Note 列（列高隨行數、水平範圍、參與片段範圍）；驗證測試涵蓋「三行 Note 撐開列高、下方訊息下移」「刪除覆蓋的其中一條生命線」「覆蓋的生命線全刪則 Note 刪除」「Note 在片段內時片段寬度涵蓋它」
- [x] 4.4 `InlineInput.vue` 新增 `multiline` 模式（textarea、Shift+Enter 換行、Enter 送出、Esc 取消）；手動驗證 spec「多行輸入」「取消編輯」情境，且既有單行輸入行為不變
- [x] 4.5 類別圖畫面：新增 Note 與註解連結工具、Note 元件（折角框、雙擊編輯）、虛線連結的繪製與選取刪除、Note 參與框選與拖曳；手動驗證 diagram-notes spec 中類別圖的所有情境，匯出 PNG 含 Note 與連結
- [x] 4.6 循序圖畫面：繪製 Note 列、雙擊編輯、垂直拖曳重排、Delete 刪除，快速輸入框先試 `parseNote` 再試 `parseMessage`；手動驗證 diagram-notes spec 中循序圖的所有情境

## 5. Package

- [x] 5.1 依 D4 在 `classLayout.ts` 實作套件框計算與「點落在哪個套件」查詢；在 `ops.ts` 新增套件新增 / 改名 / 刪除 / `setPackageMembership`，讓 `moveItems` 移動套件時連同成員只移動一次，並讓 `removeFromDiagram` 清除套件成員；驗證測試涵蓋：空套件最小尺寸、成員撐大框、成員撐開範圍內的判斷、重疊取最上層、一個元素只屬一個套件、移動套件且成員同時被選取時不重複位移、成員從圖移除、刪除套件保留成員
- [x] 5.2 類別圖畫面：新增 Package 工具、套件框繪製（最底層、左上標籤）、雙擊標籤改名、拖曳標籤整組移動、節點放開時加入 / 離開套件、Delete 刪除套件；手動驗證 class-diagram spec 中所有 Package 情境，且整組移動只產生一筆復原紀錄

## 6. 整合驗證

- [x] 6.1 開啟一份第一期儲存的 `.uml.json`，加入 Note、Package、轉折點後儲存再重新開啟；驗證內容與儲存前相同、檔案 `version` 為 2，並執行 `npm run test` 與 `npx vue-tsc --noEmit` 全數通過
