# Spec Delta

## Purpose

讓使用者在類別圖與循序圖上加入多行文字的註解框（Note），補充圖形本身無法表達的說明；註解只屬於所在的圖，不進入共用模型。

## ADDED Requirements

### Requirement: 註解框外觀
Note SHALL 以右上角折角的矩形繪製，內含多行文字；框的寬高 SHALL 依文字內容自動調整，空白註解維持最小尺寸。

#### Scenario: 文字變多時框變大
- **WHEN** 使用者把 Note 的文字從一行改為三行
- **THEN** 框的高度增加為容得下三行，寬度容得下最長的一行

### Requirement: 編輯註解文字
系統 SHALL 允許雙擊 Note 進入文字編輯；編輯時 Shift+Enter 換行、Enter 確認、Esc 取消。

#### Scenario: 多行輸入
- **WHEN** 使用者雙擊 Note，輸入 `第一行`、按 Shift+Enter、輸入 `第二行` 後按 Enter
- **THEN** Note 顯示兩行文字 `第一行` 與 `第二行`

#### Scenario: 取消編輯
- **WHEN** 使用者編輯 Note 文字時按 Esc
- **THEN** Note 文字維持編輯前的內容

### Requirement: 類別圖放置註解
系統 SHALL 允許在類別圖以 Note 工具點擊畫布建立註解，並可像元素一樣選取、拖曳移動、框選與刪除；刪除 Note 只影響該圖。

#### Scenario: 建立 Note
- **WHEN** 使用者選擇 Note 工具並點擊類別圖畫布
- **THEN** 點擊位置出現一個空白 Note，並進入文字編輯

#### Scenario: 與元素一起框選移動
- **WHEN** 使用者框選一個 Class 與一個 Note 後拖曳
- **THEN** 兩者一起移動，且只產生一筆復原紀錄

#### Scenario: 刪除 Note
- **WHEN** 使用者選取 Note 並按 Delete
- **THEN** Note 從圖上移除

### Requirement: 類別圖註解連結元素
類別圖的 Note SHALL 可用虛線連結到一或多個元素；連結的元素從該圖移除或從模型刪除時，該連結 SHALL 一併移除，Note 本身保留。

#### Scenario: 建立連結
- **WHEN** 使用者選擇註解連結工具，從 Note 拖曳到 Class `User`
- **THEN** Note 與 `User` 之間出現一條虛線

#### Scenario: 刪除連結
- **WHEN** 使用者選取一條註解連結並按 Delete
- **THEN** 該虛線消失，Note 與元素都保留

#### Scenario: 連結的元素被移除
- **WHEN** Note 連結到 `User`，使用者將 `User` 從圖上移除
- **THEN** 連結消失，Note 保留在原位

### Requirement: 循序圖放置註解
循序圖的 Note SHALL 與訊息一樣依順序佔一列，水平覆蓋其指定的一或多條生命線；Note 的位置由順序推算，SHALL 可拖曳重排、可放進片段區段、可刪除。

#### Scenario: 快速輸入 Note
- **WHEN** 使用者在快速輸入框輸入 `note over Client, AuthService: 先驗證 token`
- **THEN** 目前插入位置新增一個 Note，水平範圍從 Client 到 AuthService，文字為 `先驗證 token`

#### Scenario: 指定的生命線不存在
- **WHEN** 輸入 `note over DB: 交易開始`，且 `DB` 生命線尚不存在
- **THEN** 系統先在最右側新增 `DB` 生命線再建立 Note

#### Scenario: Note 撐開列高
- **WHEN** 循序圖中的 Note 有三行文字
- **THEN** 該列高度容得下三行，下方訊息往下移

#### Scenario: 覆蓋的生命線被刪除
- **WHEN** Note 覆蓋 A、B 兩條生命線，使用者刪除生命線 B
- **THEN** Note 改為只覆蓋 A；若覆蓋的生命線全部被刪除，Note 一併刪除

### Requirement: 註解隨圖匯出
匯出 SVG 或 PNG 時 SHALL 包含圖上的 Note 與註解連結。

#### Scenario: 匯出含 Note 的圖
- **WHEN** 使用者匯出一張含 Note 的類別圖為 PNG
- **THEN** 圖片中可看到 Note 及其連結虛線
