# Design

## Context

套件框與子圖框共用 `classLayout.ts` 的 `packageBox(frame, rects)`：框 = `{x, y, PKG_MIN_W × PKG_MIN_H}` 與所有成員框（外擴 `PKG_PAD`、上方留 `PKG_TAB_H`）的聯集。`Frame = { id, x, y, ids }` 由 `flowchart` 變更引入，類別圖與流程圖各有 `frame()` 轉換。框的 `x / y` 是錨點，移動框時 `moveItems` / `moveFlowItems` 只改錨點與成員座標。

本變更建立在 `flowchart` 變更之上（`Subgraph`、`Frame`、`FlowchartView`、檔案版本 3），須在其歸檔後實作。

## Goals / Non-Goals

**Goals:**
- 手動大小只改「最小尺寸」，`packageBox` 其餘行為與既有測試不變
- 類別圖與流程圖共用同一套尺寸計算與把手互動規則

**Non-Goals:**
- 把手互動抽成共用元件（兩個 view 目前各自實作拖曳，沿用 flowchart design D2 的取捨）
- 依框內元素自動調整成員

## Decisions

### D1. 資料：選填 `w` / `h`，相對錨點
`Package`、`Subgraph`、`Frame` 新增 `w?: number; h?: number`，表示從錨點 `(x, y)` 起算的最小寬高。`packageBox` 的初始右下角由 `x + PKG_MIN_W` 改為 `x + max(PKG_MIN_W, w ?? PKG_MIN_W)`（高度同理），之後仍與成員聯集。
- 相對錨點：移動框時 `x / y` 改變、`w / h` 不變，大小自然保留，`moveItems` / `moveFlowItems` 不需修改。
- 省略 = 自動大小，與第二期 `bends?` 省略 = 自動路徑的慣例一致；重設即 `delete`。
- 替代方案「存絕對的右下角座標」：移動時要一起改，且與錨點語意重複，否決。

### D2. 存的值不夾到成員範圍
拖曳時以游標世界座標計算 `w = round(游標.x − k.x)`、`h = round(游標.y − k.y)`，只夾到預設最小值，不夾到成員範圍；畫面上因為取聯集，框不會小於成員。
- 好處：計算是純函式、與成員位置無關；之後成員移走時，框會縮到使用者指定的大小，符合「我要這麼大」的意圖。
- 替代方案「放開時夾到成員範圍再存」：要在 view 內重算成員框，且成員移走後框維持偏大，否決。
- 錨點：成員往左 / 上超出時框的左上角會小於錨點，但 `w / h` 仍以錨點起算，把手位置 = 框的右下角，計算一致。

### D3. ops
新增 `setPackageSize(p, diagramId, id, w, h)`、`resetPackageSize`、`setSubgraphSize`、`resetSubgraphSize`。比照 `setEdgeBends` / `resetEdgeBends` 的命名與「找不到就不做事」寫法。成員判定 `setPackageMembership` / `setSubgraphMembership` 不受影響。

### D4. 把手互動
- 只在選取恰為一個框時，於框右下角畫 8×8 把手（樣式比照線段控制點：白底藍框，`data-export="false"`），游標 `nwse-resize`；畫在最上層，避免被元素蓋住。
- `pointerdown.stop`：不觸發框選或框的拖曳移動。拖曳期間以 `shallowRef<{ id, w, h }>` 預覽（同 `bendDrag`），框的 `box` 計算時以預覽值覆蓋；放開時若有改變，一次 `store.apply` 寫入 = 一筆復原紀錄。
- 雙擊把手：有手動大小時呼叫 reset，沒有則不做事（不產生空的復原紀錄）。
- 子圖框與套件框視覺相同，流程圖照抄同一段互動。

### D5. 序列化
版本維持 3：版本 3 隨流程圖推出且尚未發佈，選填欄位併入同一版即可。`parseProject` 對套件與子圖：`w` / `h` 存在但不是有限正數時刪除該欄位並記 warning（不拒絕整份檔案，比照懸空參照的處理）。

### D6. 測試
只測 `model/`：`packageBox` 在 `w / h` 大於預設、小於預設（夾到預設）、小於成員範圍（取成員）時的結果；ops 設定 / 重設；`moveItems` / `moveFlowItems` 後 `w / h` 不變；序列化往返含 `w / h`、非法值被略過並產生 warning。畫布互動手動驗證。

## Risks / Trade-offs

- [依賴 `flowchart` 變更] → proposal 與 tasks 標明須在其歸檔後實作；若 `flowchart` 先以版本 3 發佈，D5 的「不升版」要重新評估（舊版程式開啟時會忽略 `w / h`，只是失去大小，不會壞檔）。
- [存的值可能小於成員範圍，使用者看不出存了多少] → 雙擊把手可重設；這是 D2 的取捨。
- [兩個 view 重複把手邏輯] → 約 30 行，與既有重複一致；有第三種框時再抽。

## Migration Plan

缺少 `w / h` 的檔案即自動大小，無需轉換。回復方式：使用前一版程式開啟時 `w / h` 被忽略，框回到自動大小。
