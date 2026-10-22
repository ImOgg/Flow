# class-diagram Specification

## Purpose

讓使用者以拖拉加文字快速輸入的方式建立與維護 UML 類別圖，元素與關係存於共用模型，可在多張圖重複出現並同步更新。

## Requirements

### Requirement: 建立分類元素
系統 SHALL 允許在類別圖上建立 Class、Interface、Enum，新元素同時加入模型並顯示於點擊位置。

#### Scenario: 建立 Class
- **WHEN** 使用者選擇 Class 工具並點擊畫布
- **THEN** 模型新增一個預設名稱的 Class，並顯示在點擊位置且進入名稱編輯

#### Scenario: Interface 與 Enum 的標示
- **WHEN** 畫布顯示 Interface 或 Enum
- **THEN** 名稱上方分別顯示 «interface» 或 «enumeration» 標記

### Requirement: 元素外觀分區
Class 與 Interface SHALL 顯示名稱、屬性、操作三個區塊；Enum SHALL 顯示名稱與列舉值區塊。框的高度 SHALL 依內容自動調整。

#### Scenario: 新增屬性後框變高
- **WHEN** 使用者為 Class 新增一個屬性
- **THEN** 屬性區塊多一行，框高度隨之增加

### Requirement: 文字快速輸入成員
系統 SHALL 在元素的屬性 / 操作區塊接受 UML 文字語法，解析為結構化成員：屬性 `<可見性> 名稱: 型別`，操作 `<可見性> 名稱(參數): 回傳型別`；可見性為 `+ - # ~`，省略時視為 `+`。

#### Scenario: 輸入屬性
- **WHEN** 使用者在屬性區塊輸入 `- name: string` 並確認
- **THEN** 新增一個 private、名稱 name、型別 string 的屬性

#### Scenario: 輸入操作
- **WHEN** 使用者在操作區塊輸入 `+ login(id: string, pwd: string): bool`
- **THEN** 新增一個 public 操作 login，參數為 `id: string, pwd: string`，回傳型別為 bool

#### Scenario: 解析失敗
- **WHEN** 使用者輸入無法解析的文字（例如 `+ (: x`）
- **THEN** 輸入框標示錯誤、保留原文，且不新增成員

#### Scenario: 編輯既有成員
- **WHEN** 使用者雙擊既有成員並修改文字後確認
- **THEN** 該成員依新文字更新

### Requirement: 建立關係
系統 SHALL 允許在兩個元素間建立以下關係，並以 UML 標準符號繪製：關聯（實線）、繼承（實線 + 空心三角）、實作（虛線 + 空心三角）、相依（虛線 + 開放箭頭）、聚合（實線 + 空心菱形於整體端）、組合（實線 + 實心菱形於整體端）。

#### Scenario: 建立繼承
- **WHEN** 使用者選擇繼承工具，從子類別拖曳到父類別
- **THEN** 模型新增一筆繼承關係，圖上顯示指向父類別的空心三角箭頭

#### Scenario: 建立組合
- **WHEN** 使用者選擇組合工具，從整體拖曳到部分
- **THEN** 圖上在整體端顯示實心菱形

### Requirement: 關係連線路徑
關係連線 SHALL 以直角折線繪製並連到兩元素的邊框，元素移動時連線 SHALL 跟著更新。使用者 SHALL 可在選取連線後拖曳其中段落平移（水平段上下移、垂直段左右移）以調整轉折點；調整過的連線在元素移動時 SHALL 保留轉折點，只更新連到邊框的兩端。使用者 SHALL 可將連線重設回自動路徑。

#### Scenario: 移動元素
- **WHEN** 使用者拖動一個有連線的元素
- **THEN** 相連的所有關係線即時重新繞線並保持連在邊框上

#### Scenario: 拖曳線段繞開其他框
- **WHEN** 使用者選取一條穿過其他 Class 的連線，將其垂直段往右拖到該 Class 外側
- **THEN** 連線改走新位置且仍為直角折線，產生一筆復原紀錄

#### Scenario: 調整後移動元素
- **WHEN** 連線已手動調整過轉折點，使用者移動其中一端的元素
- **THEN** 中間的轉折點維持原位，兩端仍連在各自元素的邊框上

#### Scenario: 重設路徑
- **WHEN** 使用者雙擊一條手動調整過的連線
- **THEN** 連線恢復為自動計算的路徑

### Requirement: 同一元素多圖同步
同一模型元素出現在多張類別圖時，對其名稱或成員的修改 SHALL 反映在所有圖上。

#### Scenario: 改名同步
- **WHEN** 使用者在圖 A 將 Class `User` 改名為 `Member`
- **THEN** 圖 B 與模型樹中該元素也顯示 `Member`

### Requirement: 從圖移除與從模型刪除
在類別圖刪除元素 SHALL 只移除該圖上的圖形，模型元素保留；只有從模型樹刪除才移除模型元素。

#### Scenario: 從圖移除
- **WHEN** 使用者在類別圖選取 Class 並按 Delete
- **THEN** 該圖不再顯示它，但模型樹與其他圖中仍存在

### Requirement: 自動顯示既有關係
當一個元素被放到類別圖上，若它與圖上已有元素之間在模型中存在關係，系統 SHALL 自動顯示這些關係。

#### Scenario: 放入已有關聯的元素
- **WHEN** 模型中 `Order` 與 `User` 有關聯，圖上已有 `User`，使用者從模型樹拖入 `Order`
- **THEN** 圖上自動出現兩者間的關聯線

### Requirement: 建立套件框
系統 SHALL 允許在類別圖以 Package 工具點擊畫布建立套件框；套件框左上角有顯示名稱的標籤，名稱可雙擊編輯；套件只屬於該圖，不進入共用模型。

#### Scenario: 建立 Package
- **WHEN** 使用者選擇 Package 工具並點擊畫布
- **THEN** 點擊位置出現一個預設名稱的空套件框，並進入名稱編輯

#### Scenario: 改名
- **WHEN** 使用者雙擊套件標籤並輸入 `auth`
- **THEN** 套件標籤顯示 `auth`

### Requirement: 類別加入與離開套件
元素被拖曳放開時，若其中心點落在某個套件框內，SHALL 成為該套件的成員；中心點不在任何套件框內則 SHALL 離開原套件。一個元素在同一張圖上最多屬於一個套件；套件不可巢狀。

#### Scenario: 拖進套件
- **WHEN** 使用者把 Class `User` 拖到套件 `auth` 框內放開
- **THEN** `User` 成為 `auth` 的成員

#### Scenario: 拖出套件
- **WHEN** 使用者把 `auth` 內的 `User` 拖到框外空白處放開
- **THEN** `User` 不再屬於任何套件

### Requirement: 套件框自動撐大
套件框的範圍 SHALL 至少涵蓋所有成員元素加上固定邊距；成員移動或變大時框 SHALL 跟著撐大；空套件維持最小尺寸。

#### Scenario: 成員變大
- **WHEN** 套件內的 Class 新增多個屬性而變高
- **THEN** 套件框高度隨之增加，仍完整包住該 Class

### Requirement: 移動與刪除套件
拖曳套件框時，其所有成員元素 SHALL 一起移動。刪除套件 SHALL 只移除套件框，成員元素保留在圖上原位。

#### Scenario: 整組移動
- **WHEN** 使用者拖曳套件 `auth` 的標籤往右 100
- **THEN** 套件框與其中所有 Class 都往右移 100，且只產生一筆復原紀錄

#### Scenario: 刪除套件
- **WHEN** 使用者選取套件 `auth` 並按 Delete
- **THEN** 套件框消失，原本的成員 Class 仍留在原位

#### Scenario: 成員從圖移除
- **WHEN** 使用者把套件內的 `User` 從圖上移除
- **THEN** `User` 同時從套件成員中移除，套件框依剩餘成員重新計算大小

### Requirement: 調整套件框大小
只選取一個套件框時，系統 SHALL 在框的右下角提供調整大小的把手；拖曳把手 SHALL 即時改變框的大小，放開後成為一筆可復原的變更。手動指定的大小只作為最小尺寸，框的範圍仍 SHALL 至少涵蓋所有成員加上邊距，且不小於空套件的預設最小尺寸。調整大小 SHALL 不改變套件的成員。移動套件時手動大小 SHALL 保留。

#### Scenario: 放大空套件
- **WHEN** 使用者選取空套件 `auth`，把右下角把手往右下拖 200 後放開
- **THEN** 套件框變寬變高，之後把 Class 拖進框內新放大的區域放開，該 Class 成為 `auth` 的成員

#### Scenario: 縮小不會小於成員
- **WHEN** 套件 `auth` 內有 Class `User`，使用者把把手往左上拖到 `User` 內部後放開
- **THEN** 套件框仍完整包住 `User`，`User` 仍是 `auth` 的成員

#### Scenario: 放大不會自動收納
- **WHEN** 圖上有不屬於任何套件的 Class `Order`，使用者把套件 `auth` 放大到覆蓋 `Order`
- **THEN** `Order` 仍不屬於任何套件

#### Scenario: 一次復原
- **WHEN** 使用者拖曳把手調整大小後放開，再執行復原
- **THEN** 套件框回到調整前的大小（一次復原即回到原狀）

#### Scenario: 移動保留大小
- **WHEN** 使用者放大套件 `auth` 後拖曳其標籤往右 100
- **THEN** 套件框以相同大小往右移 100

### Requirement: 恢復套件框自動大小
使用者 SHALL 可雙擊套件框的調整大小把手，取消手動大小，讓框回到依成員與預設最小尺寸計算的大小。

#### Scenario: 雙擊把手重設
- **WHEN** 使用者放大過套件 `auth`，之後選取它並雙擊右下角把手
- **THEN** 套件框回到只依成員範圍與預設最小尺寸計算的大小
