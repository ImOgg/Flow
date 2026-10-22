# Tasks

## 1. 解析（`src/io/mermaid.ts`）

- [ ] 1.1 依 design D1、D2 實作 `parseMermaidFlowchart`：完成前處理（圍欄、frontmatter title、`%%`、結尾 `;`）、標頭與方向判斷（TB 正規化成 TD），以及錯誤回傳（非流程圖、沒有節點）。驗證：`src/io/mermaid.test.ts` 涵蓋 spec 的「含圍欄與標題」「沒有標題」「貼了類別圖」「沒有節點」
- [ ] 1.2 實作陳述行掃描，包含節點形狀對照、引號與 `<br>`、`:::` 去除、只有 id 的節點、重複參照時取第一次帶括號的寫法、各種連線與兩種標籤寫法、串接、`&`、略過樣式行。驗證：測試涵蓋 spec 的「五種形狀」「不支援的形狀」「重複參照」「標籤」「串接與多節點」「AI 產生的樣式」，以及「引號內含括號」「無法解析的行只中止該行」
- [ ] 1.3 實作 `subgraph` / `end` 的堆疊、標題取法、巢狀攤平，以及略過連到子圖 id 的箭頭。驗證：測試涵蓋 spec 的「一般子圖」「巢狀子圖」與「子圖 id 被當成箭頭端點」

## 2. 排版（`src/model/flowLayout.ts`）

- [ ] 2.1 依 design D3 實作 `layerLayout`，包含回邊偵測、最長路徑分層、四種方向的座標與平移到 `ORIGIN`，並以 `ponytail:` 註解標明層內排序的上限。驗證：`flowLayout.test.ts` 涵蓋 spec 的「由上而下」「由左而右」「有迴圈」，另外再測 BT、RL 方向反轉、不同大小的節點互不重疊、自我迴圈不影響分層

## 3. 建立圖（`src/model/ops.ts`）

- [ ] 3.1 依 design D4 實作 `importFlowchart`，包含建立新圖、id 對照、略過找不到端點的箭頭、子圖的成員轉換與左上角計算、沒有成員的子圖不建立。驗證：`ops.test.ts` 涵蓋「節點、箭頭、子圖數量與內容正確」「圖名用 title，沒有 title 時用預設名稱」「子圖框（`packageBox`）完整包住所有成員」，並確認在單一 `store.apply` 中執行時，一次復原就讓整張圖消失

## 4. 畫面

- [ ] 4.1 依 design D5 新增 `src/ui/MermaidImportDialog.vue`，並在 `Toolbar.vue` 加上「匯入 Mermaid」按鈕。驗證：手動跑過 spec 的「匯入成功」「一次復原」「取消」「貼了類別圖」「沒有節點」情境，確認失敗時對話框保持開啟、文字保留，Esc 可以關閉。新增的樣式要先給使用者確認

## 5. 整合驗證

- [ ] 5.1 用一份 AI 產生、包含五種形狀、帶標籤的判斷分支、巢狀子圖、`classDef` / `style`、包在 Markdown 圍欄中的 `flowchart LR` 匯入，確認內容完整、方向正確、可以拖曳編輯，儲存後重新開啟內容相同。執行 `npm run test` 與 `npx vue-tsc --noEmit`，全部通過（依專案規則由使用者執行）
- [ ] 5.2 更新 `docs/backlog.md`：把「貼上 Mermaid 匯入」標成流程圖已完成，並移除已經做完的「Package 可調整大小」與第一期延後清單中的「流程圖」「Package」。驗證：檔案內容與實際進度一致

## Workflow follow-up

- 使用者確認後歸檔 change（`/opsx:archive`），並同步主規格 `openspec/specs/mermaid-import/spec.md`
