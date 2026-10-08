# sequence-diagram Specification

## Purpose

讓使用者快速建立與維護 UML 循序圖：版面由訊息順序自動計算，支援組合片段，生命線可綁定共用模型中的 Class。

## Requirements

### Requirement: 生命線
系統 SHALL 允許新增、重新命名、刪除、左右調整順序生命線；生命線由頂部標題框與向下延伸的虛線組成，水平依序等距排列。

#### Scenario: 新增生命線
- **WHEN** 使用者在循序圖新增生命線
- **THEN** 新生命線出現在最右側，並進入名稱編輯

#### Scenario: 調整順序
- **WHEN** 使用者將生命線拖到另一條生命線左側
- **THEN** 生命線順序改變，所有訊息隨之重新排版

### Requirement: 生命線綁定模型元素
生命線 SHALL 可選擇綁定模型中的 Class / Interface；綁定時標題顯示 `名稱: 類別名`（名稱可空，顯示為 `:類別名`），類別名隨模型改名同步。

#### Scenario: 從模型樹拖入
- **WHEN** 使用者從模型樹拖曳 Class `AuthService` 到循序圖
- **THEN** 新增一條綁定該 Class 的生命線，標題顯示 `:AuthService`

#### Scenario: 綁定的類別被刪除
- **WHEN** 被綁定的 Class 從模型刪除
- **THEN** 生命線保留但解除綁定，標題改以生命線自身名稱顯示

### Requirement: 訊息
系統 SHALL 支援同步訊息（實線 + 實心箭頭）與回傳訊息（虛線 + 開放箭頭），以及對自己發送的訊息（自迴圈）。訊息依順序由上而下排列，垂直間距固定。

#### Scenario: 插入訊息後自動下推
- **WHEN** 使用者在第 2 與第 3 則訊息之間插入一則新訊息
- **THEN** 新訊息成為第 3 則，原本之後的訊息全部往下移一格

#### Scenario: 拖曳調整順序
- **WHEN** 使用者將某則訊息垂直拖到另一位置
- **THEN** 訊息順序改變，版面重新計算

#### Scenario: 自迴圈
- **WHEN** 訊息的發送者與接收者是同一條生命線
- **THEN** 訊息以從生命線出發再折回自身的箭頭繪製

### Requirement: 文字快速輸入訊息
系統 SHALL 接受 `來源 -> 目標: 文字`（同步）與 `來源 --> 目標: 文字`（回傳）語法，新增訊息到目前插入位置；名稱不存在的生命線 SHALL 自動建立。

#### Scenario: 輸入同步訊息
- **WHEN** 使用者輸入 `Client -> AuthService: login(id)`
- **THEN** 新增一則從 Client 到 AuthService、文字為 `login(id)` 的同步訊息

#### Scenario: 照畫面標題指定生命線
- **WHEN** 使用者輸入 `A: AuthService -> B: AuthService: login()`，且已有標題為 `A: AuthService` 與 `B: AuthService` 的生命線
- **THEN** 訊息建立在這兩條生命線之間，不另外新增生命線

#### Scenario: 自動建立生命線
- **WHEN** 輸入中的生命線名稱 `DB` 尚不存在
- **THEN** 系統先在最右側新增 `DB` 生命線再建立訊息

#### Scenario: 解析失敗
- **WHEN** 使用者輸入無法解析的文字（例如 `Client login`）
- **THEN** 輸入框標示錯誤、保留原文，且不新增訊息

### Requirement: 組合片段
系統 SHALL 支援 alt、loop、opt 組合片段：片段框住一段連續訊息，左上角標示類型，每個區段顯示守衛條件 `[條件]`；alt 可有多個區段並以虛線分隔；片段 SHALL 可巢狀。

#### Scenario: 以選取訊息建立 loop
- **WHEN** 使用者選取連續的兩則訊息並選擇「包成 loop」，輸入條件 `retry < 3`
- **THEN** 一個 loop 框包住這兩則訊息，左上標示 `loop`，並顯示 `[retry < 3]`

#### Scenario: alt 新增區段
- **WHEN** 使用者對 alt 片段新增一個 `[else]` 區段
- **THEN** 片段內出現虛線分隔，新區段可放入訊息

#### Scenario: 巢狀片段排版
- **WHEN** loop 內含一個 alt
- **THEN** alt 框完整位於 loop 框內，兩者寬度足以涵蓋其內訊息相關的生命線

#### Scenario: 解除片段
- **WHEN** 使用者刪除一個片段（非其內容）
- **THEN** 片段框移除，其內訊息保留並維持原本順序

### Requirement: 版面不需手動定位
循序圖中所有圖形的位置 SHALL 由生命線順序與訊息順序推算，使用者無法也不需要自由擺放個別訊息座標。

#### Scenario: 刪除訊息後自動收合
- **WHEN** 使用者刪除中間一則訊息
- **THEN** 下方訊息自動上移，不留空白

### Requirement: 拖拉建立訊息
系統 SHALL 允許從一條生命線拖曳到另一條生命線以建立訊息：放開位置的高度決定插入順序（含片段內的區段），放開後立即進入訊息文字編輯；起訖為同一條生命線時建立自迴圈；按住 Alt 放開時建立回傳訊息。拖曳期間 SHALL 顯示預覽箭頭與插入位置提示。

#### Scenario: 拖拉建立同步訊息
- **WHEN** 使用者從生命線 A 的虛線拖曳到生命線 B，在第 1 與第 2 則訊息之間放開
- **THEN** 新增一則 A 到 B 的同步訊息成為第 2 則，並出現文字輸入框

#### Scenario: 拖進片段區段
- **WHEN** 放開位置位於 loop 片段框內
- **THEN** 新訊息加入該 loop 的區段中

#### Scenario: Alt 建立回傳訊息
- **WHEN** 使用者按住 Alt 拖拉並放開
- **THEN** 新訊息為回傳訊息（虛線、開放箭頭）

#### Scenario: 切換訊息種類
- **WHEN** 使用者雙擊一則同步訊息並按下「改為回傳」
- **THEN** 該訊息改為回傳訊息
