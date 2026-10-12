# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
