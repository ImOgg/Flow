# Design

## Context

- `store.project` 是 `shallowRef`，每次變更（`apply`、`undo`、`redo`、`load`）都整份換新，所以監看它的參照就能接到所有變更。
- `serialize` / `parseProject`（`src/model/serialize.ts`）已經處理好序列化、版本轉換與格式驗證。
- `useWorkspace()` 會被 `App.vue` 和 `Toolbar.vue` 各呼叫一次，不適合放只能執行一次的邏輯。
- `App.vue` 的 `active` computed 找不到目前的圖時，會自動退回第一張，所以還原後不用另外設定 `activeDiagramId`。

## Goals / Non-Goals

**Goals:** 改動集中在一處，沿用既有的序列化，失敗時完全不影響編輯。

**Non-Goals:** 跨分頁同步。開兩個分頁時，以最後寫入的為準。

## Decisions

### D1：放在 `App.vue` 的 setup，不另開模組或 composable
`App.vue` 只會建立一次，而且已經持有 `store`。整段邏輯不到 20 行，抽成 `useAutosave()` 也只有一個呼叫端。替代方案：放在 `useWorkspace()`，但它會被呼叫兩次，會註冊兩個 watcher；寫成 pinia plugin 則太重。

### D2：用 localStorage，key 為 `flow:autosave`，值是 `serialize(project)` 的字串
內容和存檔格式相同，還原時直接交給 `parseProject`，舊版格式轉換也一併沿用。localStorage 約有 5MB，足夠存放專案的 JSON。替代方案：IndexedDB 是非同步 API，容量也比較大，但目前用不到；cookie 只有約 4KB，而且每次 request 都會帶出去。

### D3：用 `watch(() => store.project)` 搭配 1 秒 debounce
debounce 用 `setTimeout` 搭配 watch 的 `onCleanup` 取消上一次，不引入 lodash 或 VueUse。不需要 `deep`，理由見 Context。啟動時的 `emptyProject()` 不會觸發 watch，所以不會用空白內容蓋掉暫存。

### D4：還原時呼叫 `store.load(project)` 之後設 `store.dirty = true`
`load` 會清空復原紀錄並清掉檔名與 handle，正好符合「不關聯任何檔案」的需求。設成 dirty 是為了讓 `confirmDiscard` 生效，避免使用者按「新專案」時沒有確認就蓋掉唯一一份內容。

### D5：讀寫都用 try/catch 包住，失敗時不做任何事
`parseProject` 失敗時，`r.ok === false`，所以不還原。讀取 `localStorage` 本身可能丟錯（瀏覽器封鎖儲存），寫入可能丟 `QuotaExceededError`，兩者都直接吞掉。

## Risks / Trade-offs

- [關閉分頁前最後約 1 秒的修改沒有暫存] → 可以接受。暫存只是保險，之後需要時再加 `pagehide` 事件立即寫入。
- [每次變更都序列化整份專案] → 有 1 秒 debounce，連續拖曳只會在停下來後寫一次；以目前的專案大小，成本可以忽略。
- [還原後第一次存檔會要求選位置] → 這是刻意的範圍取捨，記住檔案 handle 要用 IndexedDB，已列為不在本期範圍。
- [兩個分頁互相覆蓋暫存] → 以最後寫入的為準，不處理。
