# Terminal Nerd Font

## Goal

所有 Terminal 與輸出預覽使用使用者指定的 Nerd Fonts v3.5.1 JetBrainsMono Nerd Font Mono，保留完整 glyph 與離線字型資源。

## Context

- Repository 沒有 `CONTRIBUTING.md`。
- 保留目前 Terminal 的 400／600 weight，提供 normal／italic WOFF2，不改其他 UI 字型。
- `src/components/InteractiveTerminal.tsx` 已超過 1,000 行；本次只替換字型設定，保留既有 lifecycle，避免將不相關的大型拆分納入字型變更。

## Plan

- [x] 確認指定 ZIP 含 Mono 變體與 OFL 授權；來源為 v3.5.1，JetBrains Mono 2.304。
- [x] 將 Regular、SemiBold、Italic、SemiBoldItalic 轉成完整 WOFF2，附來源與授權；FontTools 驗證每個檔案的 12,226 個 Unicode mappings 與來源相同，ASCII、Powerline、Terminal、Git 圖示皆為單格寬度。
- [x] 更新 CSS、xterm font readiness 與測試，移除舊字型依賴；搜尋確認 active code 無舊 font family，僅保留 browser test 的 negative assertions。
- [x] `npm run ci` 通過：238 tests、Biome、package check、TypeScript、build、font asset checks。四個 WOFF2 合計 4,344,732 bytes。四個相關 browser tests 通過，包含預覽字型、DPR 1／2 渲染及 fractional scale 最後一行；完整 `terminal-rendering.e2e.ts` 再次通過。

## Completion Checklist

- [x] 字型來源、授權與轉換方法可追溯，記錄於 `public/fonts/README.md`。
- [x] 所有 Terminal 字型設定與載入流程一致，browser tests 驗證四個 font faces 均 loaded。
- [x] 驗證通過且 diff 僅包含本次變更；`git diff --check` 通過。Build 仍有超過 500 kB 的 JavaScript chunk 提示，不影響成功建置。
