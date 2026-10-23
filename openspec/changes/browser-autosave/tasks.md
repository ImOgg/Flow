# Tasks

## 1. 自動暫存（`src/App.vue`）

- [ ] 1.1 依 design D1–D5，在 `App.vue` 的 setup 加入啟動時還原（`parseProject` 成功才 `store.load` 並設 `dirty = true`），以及 `watch(() => store.project)` 搭配 1 秒 debounce 寫入 `flow:autosave`，讀寫都用 try/catch 包住。驗證：執行 `npx vue-tsc --noEmit` 通過（依專案規則由使用者執行）

## 2. 整合驗證

- [ ] 2.1 手動逐一跑過 spec 的情境：「重新整理後還原」「開檔後暫存跟著換」「還原的內容放棄前要確認」「還原後存檔」「沒有暫存」（清空 localStorage 後重新整理）、「暫存內容損毀」（在 DevTools 把 `flow:autosave` 改成 `{oops`）、「無法寫入暫存」（無痕視窗）。驗證：每個情境的結果都和 spec 一致，Console 沒有未處理的錯誤
- [ ] 2.2 執行 `npm run test`，確認既有測試全部通過（依專案規則由使用者執行）
- [ ] 2.3 更新 `docs/backlog.md`：移除「瀏覽器自動暫存」段落，只保留「記住上次開的檔案（IndexedDB）」這個延後項目。驗證：檔案內容與實際進度一致

## Workflow follow-up

- 使用者確認後歸檔 change（`/opsx:archive`），並同步主規格 `openspec/specs/project-workspace/spec.md`
