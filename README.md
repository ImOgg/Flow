# Flow

個人用的 Astah 風格 UML 編輯器：類別圖 + 循序圖，模型驅動、可拖拉也可打字快速輸入，專案存成本機 JSON 檔。

## 啟動

需要 Node.js 20.19 以上。建議使用 Chrome 或 Edge（可直接覆寫本機檔案；其他瀏覽器會改用下載 / 選檔）。

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # 單元測試（model/、store/）
npm run typecheck  # 型別檢查
```

## 概念

- **專案檔**（`*.uml.json`）＝ 一份共用模型 + 多張圖
- **模型**：Class / Interface / Enum 與它們之間的關係，左側模型樹列出所有元素
- **圖**：只記錄「哪些模型元素畫在哪裡」。同一個 Class 可以出現在多張圖，改一處、處處同步
- 在圖上按 Delete 只是**從這張圖移除**；在模型樹按 × 才是**從模型刪除**（所有圖一起移除）

## 操作速查

| 操作 | 方式 |
|---|---|
| 縮放 | Ctrl + 滾輪（以游標為中心） |
| 平移 | 滾輪 / Shift + 滾輪、按住空白鍵拖曳、滑鼠中鍵拖曳 |
| 框選 | 在空白處拖曳；Shift / Ctrl 點擊加選 |
| 復原 / 重做 | Ctrl+Z / Ctrl+Y（或 Ctrl+Shift+Z） |
| 儲存 | Ctrl+S |
| 加入既有元素 | 從模型樹拖到圖上 |

### 類別圖

- 工具列選 Class / Interface / Enum 後點擊畫布放置，立即輸入名稱
- 選關係工具後從來源拖到目標；聚合 / 組合從「整體」拖到「部分」，繼承 / 實作從「子」拖到「父」
- 雙擊名稱改名；雙擊屬性 / 操作區塊新增成員（Enter 後可繼續輸入下一個，Esc 結束）；雙擊既有成員修改，清空後 Enter 即刪除

### 循序圖

- 上方輸入框打訊息，Enter 新增；不存在的生命線會自動建立
- 新訊息插在選取的訊息之後；點一下片段的某個區段，則加到該區段末尾
- 選取連續的訊息後按「包成 alt / loop / opt」，接著輸入條件
- 拖曳訊息上下移動、拖曳生命線標題左右移動；雙擊可編輯文字 / 條件

## 快速輸入語法

| 位置 | 語法 | 例子 |
|---|---|---|
| 屬性 | `[可見性] 名稱[: 型別]` | `- name: string` |
| 操作 | `[可見性] 名稱(參數)[: 回傳型別]` | `+ login(id: string, pwd: string): bool` |
| Enum 值 | `名稱` | `ACTIVE` |
| 同步訊息 | `來源 -> 目標: 文字` | `Client -> AuthService: login(id)` |
| 回傳訊息 | `來源 --> 目標: 文字` | `AuthService --> Client: token` |

可見性：`+` public、`-` private、`#` protected、`~` package，省略為 `+`。名稱可用中文。解析失敗時輸入框會變紅並保留原文。

## 專案結構

```
src/
  model/    純 TypeScript：型別、所有修改操作、快速輸入解析、版面計算、存讀檔驗證（皆有單元測試）
  store/    Pinia：專案狀態與復原 / 重做（快照式）、編輯器暫時狀態
  io/       本機檔案讀寫、SVG / PNG 匯出
  canvas/   SVG 畫布、類別圖與循序圖畫面
  ui/       工具列、模型樹、圖分頁
```

設計與規格文件在 `openspec/changes/uml-editor-mvp/`。
