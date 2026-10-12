# Proposal

## Why

個人需要畫 UML 類別圖與循序圖並長期維護，但 draw.io / Figma 畫 UML 太手工（屬性方法要自己排、循序圖要手動對齊、同一 Class 在不同圖要各改一次），Mermaid 雖然打字快卻無法拖拉調整版面。需要一個 Astah 風格、模型驅動、可拖拉又可打字加速的本機 UML 編輯器。

## What Changes

- 新增一個從零開始的 Web 應用（瀏覽器執行，Chrome / Edge 為主），無後端、無資料庫
- 專案檔模式：一個本機 JSON 檔包含一份共用模型與多張圖，左側模型樹可瀏覽、拖到圖上
- 類別圖：Class / Interface / Enum；關聯、繼承、實作、相依、聚合、組合；框內以文字快速輸入屬性與操作
- 循序圖：生命線（可綁定模型 Class）、同步訊息與回傳訊息、alt / loop / opt 組合片段；版面由順序自動計算；以 `A -> B: msg()` 快速新增訊息
- 通用編輯：選取、拖拉、刪除、復原 / 重做、縮放平移、匯出 PNG / SVG
- 明確不做（後續期別）：流程圖 / 架構圖、activation bar、Package、Note、桌面包裝（Tauri）、程式碼反向工程

## Capabilities

### New Capabilities
- `project-workspace`: 專案檔的建立、開啟、儲存、格式版本，以及模型樹、圖分頁、未儲存提醒
- `class-diagram`: 類別圖元素與關係的建立、編輯、顯示，以及模型與圖的分離（從圖移除 vs 從模型刪除）
- `sequence-diagram`: 生命線、訊息、組合片段的建立與編輯，以及由順序自動排版
- `diagram-editing`: 兩種圖共用的編輯操作：選取、拖拉、刪除、復原 / 重做、縮放平移、匯出

### Modified Capabilities
（無，全新專案）

## Impact

- 新專案：Vue 3 + TypeScript + Vite + Pinia，測試用 Vitest
- 依賴瀏覽器 File System Access API；不支援的瀏覽器退回下載 / 檔案選擇器
- 不影響任何既有系統
