# Spec Delta

## MODIFIED Requirements

### Requirement: 開啟專案檔
系統 SHALL 從本機讀取專案 JSON 檔並載入為目前專案。版本 1 的專案檔 SHALL 自動轉換為目前版本後載入，之後儲存一律寫成目前版本。

#### Scenario: 成功開啟
- **WHEN** 使用者選擇一個有效的專案檔
- **THEN** 模型樹與圖分頁顯示該檔案內容

#### Scenario: 開啟第一期的檔案
- **WHEN** 使用者開啟版本 1 的專案檔
- **THEN** 檔案內容照常顯示，所有圖都沒有 Note 與 Package，連線使用自動路徑；儲存後檔案版本為 2

#### Scenario: 檔案格式錯誤
- **WHEN** 檔案不是有效 JSON，或格式版本不受支援
- **THEN** 系統顯示錯誤訊息，目前已開啟的專案保持不變

#### Scenario: 圖參照不存在的模型元素
- **WHEN** 檔案中某張圖引用了模型中不存在的元素或關係
- **THEN** 系統略過該圖形項目並照常開啟其餘內容

#### Scenario: Note 或 Package 參照不存在的項目
- **WHEN** 檔案中 Note 連結或 Package 成員指向圖上不存在的元素，或循序圖 Note 覆蓋不存在的生命線
- **THEN** 系統略過該連結、成員或生命線並照常開啟；覆蓋的生命線全部不存在的 Note 一併略過

### Requirement: 存檔往返一致
儲存後再開啟的專案 SHALL 與儲存前的模型與圖內容完全相同。

#### Scenario: 往返
- **WHEN** 使用者儲存專案後重新開啟該檔案
- **THEN** 所有元素、關係、圖、位置、訊息順序、Note、Package 成員與連線轉折點皆與儲存前相同
