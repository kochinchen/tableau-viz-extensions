# Tableau Viz Extensions

Tableau viz extensions by Bill Chen。每個子資料夾是一個 extension，透過 GitHub Pages 以 https 提供，`.trex` 的 `source-location` 指向該網址。

## Trellis Chart

把一個度量依維度成員拆成多張小圖（small multiples）。

- 程式：[`trellis-chart/`](trellis-chart/)
- 版本紀錄：[`trellis-chart/version.md`](trellis-chart/version.md)
- 使用說明（英文，含截圖）：[`trellis-chart/docs/user-guide.html`](trellis-chart/docs/user-guide.html)，線上閱讀：<https://kochinchen.github.io/tableau-viz-extensions/trellis-chart/docs/user-guide.html>
- 線上網址：<https://kochinchen.github.io/tableau-viz-extensions/trellis-chart/index.html>
- 安裝：下載最新的 `.trex`（v00.08 以後），在 Tableau 工作表的「標記」卡片選「新增擴充功能」→ 從檔案加入。只要這一個檔案，不必整個資料夾。
- 本機開發：用 `python3 -m http.server 8765` 在 `trellis-chart/` 起服務，改用 v00.07 的 `.trex`（指向 localhost）。

## 發行流程

1. 改 `index.html` / `extension.js` / `style.css` / `config.html`。
2. 另存一份新版序的 `.trex`（舊檔保留），更新 `extension-version`。
3. 在 `version.md` 新增一節。
4. commit + push；GitHub Pages 幾十秒後生效。

只改 HTML / JS / CSS 時，已安裝舊 `.trex` 的人重新載入即可拿到新程式；manifest 有變更才需要重新加入 `.trex`。
