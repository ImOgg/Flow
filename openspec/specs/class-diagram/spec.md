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
關係連線 SHALL 以直角折線繪製並連到兩元素的邊框，元素移動時連線 SHALL 跟著更新。

#### Scenario: 移動元素
- **WHEN** 使用者拖動一個有連線的元素
- **THEN** 相連的所有關係線即時重新繞線並保持連在邊框上

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
