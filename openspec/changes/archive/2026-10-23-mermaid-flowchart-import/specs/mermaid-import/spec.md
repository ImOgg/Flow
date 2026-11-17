# Spec Delta

## Purpose

讓使用者把 Markdown 文件或 AI 產生的 Mermaid 文字貼進來，轉成可以手動編輯、重新排版的圖；本期只支援流程圖。

## ADDED Requirements

### Requirement: 匯入對話框
工具列 SHALL 提供「匯入 Mermaid」操作，開啟可貼上多行文字的對話框。按確定且匯入成功時，SHALL 建立一張新的流程圖、切換到它的分頁並關閉對話框；按取消 SHALL 不改變專案。整個匯入 SHALL 為一筆復原紀錄。

#### Scenario: 匯入成功
- **WHEN** 使用者在對話框貼上 `flowchart TD\n A[開始] --> B[結束]` 並按確定
- **THEN** 出現一張新的流程圖分頁且為目前分頁，圖上有「開始」「結束」兩個節點與一條箭頭

#### Scenario: 一次復原
- **WHEN** 使用者匯入成功後執行復原
- **THEN** 匯入產生的流程圖整張消失

#### Scenario: 取消
- **WHEN** 使用者在對話框貼上文字後按取消
- **THEN** 專案內容不變，也沒有新增復原紀錄

### Requirement: 接受的輸入格式
系統 SHALL 接受以 `flowchart` 或 `graph` 開頭、方向為 `TD`、`TB`、`LR`、`RL`、`BT` 或省略（視為 `TD`）的文字。貼上的文字被 Markdown 圍欄（```` ```mermaid ```` … ```` ``` ````）包住時 SHALL 先去除圍欄。開頭有 frontmatter 且含 `title` 時 SHALL 以其為圖名，否則圖名為「匯入的流程圖」。

#### Scenario: 含圍欄與標題
- **WHEN** 貼上的文字為 ```` ```mermaid ````、`---`、`title: 請假流程`、`---`、`flowchart LR`、`A --> B`、```` ``` ````
- **THEN** 匯入成功，新流程圖名稱為「請假流程」

#### Scenario: 沒有標題
- **WHEN** 貼上 `graph TD\n A --> B`
- **THEN** 新流程圖名稱為「匯入的流程圖」

### Requirement: 節點形狀對照
節點 SHALL 依括號轉成對應形狀：`[ ]` 為處理、`{ }` 為判斷、`([ ])` 與 `(( ))` 為開始 / 結束、`[/ /]` 與 `[\ \]` 為輸入 / 輸出、`[( )]` 為資料庫，其他形狀一律為處理。節點文字為括號內文字，去除外層引號，`<br>` 轉為換行；只寫 id 時以 id 為文字。同一個 id 多次出現時 SHALL 只建立一個節點，形狀與文字以第一次有括號的寫法為準。

#### Scenario: 五種形狀
- **WHEN** 貼上的流程圖含 `A([開始])`、`B[填表]`、`C{通過？}`、`D[/輸入資料/]`、`E[(資料庫)]`
- **THEN** 依序產生開始 / 結束、處理、判斷、輸入 / 輸出、資料庫五種節點，文字為括號內的文字

#### Scenario: 不支援的形狀
- **WHEN** 貼上的流程圖含 `F{{準備}}` 與 `G>旗標]`
- **THEN** 兩者都成為處理節點，文字分別為「準備」「旗標」

#### Scenario: 重複參照
- **WHEN** 貼上 `A[開始] --> B` 與 `A --> C`
- **THEN** 只有一個 A 節點，文字為「開始」，有兩條從它出發的箭頭

### Requirement: 箭頭對照
各種連線（實線、虛線、粗線、無箭頭、雙向、`o` / `x` 端點）SHALL 一律轉成從左側指向右側的一般箭頭，並保留 `-->|標籤|` 與 `-- 標籤 -->` 兩種寫法的標籤文字。一行中的串接（`A --> B --> C`）SHALL 產生每一段的箭頭；`A & B --> C` SHALL 對左右兩側的每一組節點各產生一條箭頭。

#### Scenario: 標籤
- **WHEN** 貼上 `C{通過？} -->|是| D` 與 `C -- 否 --> E`
- **THEN** 有兩條箭頭，標籤分別為「是」與「否」

#### Scenario: 串接與多節點
- **WHEN** 貼上 `A --> B -.-> C` 與 `X & Y ==> Z`
- **THEN** 產生 A→B、B→C、X→Z、Y→Z 四條一般箭頭

### Requirement: 子圖對照
`subgraph` … `end` SHALL 轉成子圖框，標題為 `subgraph` 後的標題文字（`id [標題]` 時取標題，否則取整段文字）。巢狀子圖 SHALL 攤平：每個子圖各自成為子圖框，節點只屬於最內層的子圖。沒有任何成員的子圖 SHALL 不建立。連到子圖 id 的箭頭 SHALL 略過。

#### Scenario: 一般子圖
- **WHEN** 貼上 `subgraph 後端` 內含 `V[驗證]` 與 `S[儲存]`，再以 `end` 結束
- **THEN** 出現標題「後端」的子圖框，「驗證」「儲存」為其成員

#### Scenario: 巢狀子圖
- **WHEN** 子圖「系統」內有子圖「資料層」，「資料層」內有節點「DB」
- **THEN** 「DB」只屬於「資料層」，兩個子圖框都不巢狀

### Requirement: 略過無法辨識的內容
樣式與互動相關的行（如 `style`、`classDef`、`class`、`linkStyle`、`click`、`direction`）、`%%` 註解、空行與無法解析的行 SHALL 略過，不影響其餘內容的匯入。節點後的 `:::類別名` SHALL 去除。

#### Scenario: AI 產生的樣式
- **WHEN** 貼上的流程圖除了節點與箭頭外，還含 `classDef ok fill:#9f9`、`A:::ok`、`style B fill:#f00` 與 `%% 註解`
- **THEN** 匯入成功，節點與箭頭照常建立，沒有因這些行產生多餘節點

### Requirement: 無法匯入時的提示
文字不是流程圖（例如以 `classDiagram`、`sequenceDiagram` 開頭）時 SHALL 提示「目前只支援流程圖」；是流程圖但解析不出任何節點時 SHALL 提示找不到節點。兩種情況都 SHALL 不建立圖，對話框保持開啟、保留已貼上的文字。

#### Scenario: 貼了類別圖
- **WHEN** 貼上以 `classDiagram` 開頭的文字並按確定
- **THEN** 對話框顯示「目前只支援流程圖」，專案內容不變

#### Scenario: 沒有節點
- **WHEN** 貼上只有 `flowchart TD` 一行的文字並按確定
- **THEN** 對話框顯示找不到節點的錯誤，專案內容不變

### Requirement: 自動排版
匯入的節點 SHALL 依方向分層排列：`TD` / `TB` 由上而下、`BT` 由下而上、`LR` 由左而右、`RL` 由右而左；每條非迴圈的箭頭，其目標節點所在的層 SHALL 比來源節點更後面。節點之間 SHALL 不重疊。子圖框 SHALL 涵蓋其所有成員。

#### Scenario: 由上而下
- **WHEN** 匯入 `flowchart TD\n A --> B --> C`
- **THEN** A、B、C 由上而下排列，三個節點不重疊

#### Scenario: 由左而右
- **WHEN** 匯入 `flowchart LR\n A --> B`
- **THEN** B 在 A 的右邊

#### Scenario: 有迴圈
- **WHEN** 匯入 `flowchart TD\n A --> B --> C --> A`
- **THEN** 匯入成功，A、B、C 由上而下排列，三條箭頭都建立
