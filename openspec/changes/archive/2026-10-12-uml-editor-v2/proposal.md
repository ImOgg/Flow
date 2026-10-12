# Proposal

## Why

第一期完成了類別圖與循序圖的基本編輯，但實際畫圖時有四個缺口：無法在圖上寫補充說明、循序圖看不出呼叫的巢狀層級（誰在等誰）、類別一多時直角連線常穿過其他框、類別無法依模組分區。這四項都是在現有兩種圖上補足表達能力，不需要新的圖種，適合作為第二期。

## What Changes

- 新增 **Note 註解框**：類別圖與循序圖都可放置多行文字的註解；類別圖的 Note 可用虛線連到一或多個元素，循序圖的 Note 依順序佔一列，蓋在指定的生命線上方。
- 循序圖新增 **Activation bar**：由同步訊息與回傳訊息的配對自動計算各生命線的執行區段並繪製，使用者不需手動維護；訊息箭頭改連到執行區段的邊緣。
- 類別圖關係連線新增 **可拖曳轉折點**：選取連線後可拖曳線段平移，讓線繞開其他框；可一鍵重設回自動路徑。
- 類別圖新增 **Package 套件框**：可建立、命名、刪除套件；類別拖進框內即加入、拖出即離開；移動套件時內部類別一起移動；框大小自動撐大以容納所有成員。
- **BREAKING（檔案格式）**：專案檔版本由 1 升為 2。開啟版本 1 的檔案時自動轉換；儲存一律寫成版本 2，第一期的程式無法開啟。

不在本期範圍：流程圖 / 架構圖、Tauri 桌面版、程式碼反向工程、巢狀 Package、連線自動避開障礙物。

## Capabilities

### New Capabilities
- `diagram-notes`: 在類別圖與循序圖放置、編輯、連結與刪除註解框

### Modified Capabilities
- `class-diagram`: 關係連線路徑改為可手動調整轉折點；新增 Package 套件框
- `sequence-diagram`: 新增 Activation bar 自動計算與繪製
- `project-workspace`: 開啟專案檔支援版本 1 自動轉換為版本 2

## Impact

- `src/model/types.ts`：類別圖新增 `notes`、`packages`、連線 `bends`；循序圖 `SeqItem` 新增 `note`；`Project.version` 改為 2
- `src/model/ops.ts`：新增 Note、Package、轉折點相關操作；`deleteElement` / `removeFromDiagram` 連鎖清除套件成員與 Note 連結
- `src/model/classLayout.ts`：路徑計算支援轉折點；套件框尺寸計算；Note 尺寸計算
- `src/model/sequenceLayout.ts`：計算 activation 區段與 Note 列
- `src/model/serialize.ts`：版本 1 → 2 遷移與新欄位的懸空參照清理
- `src/canvas/class/*`、`src/canvas/sequence/SequenceDiagramView.vue`：新圖形與互動
- 不新增任何相依套件
