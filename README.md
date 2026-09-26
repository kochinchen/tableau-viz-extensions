# Tableau Viz Extensions

Tableau viz extensions by Bill Chen。每個子資料夾是一個 extension，透過 GitHub Pages 以 https 提供，`.trex` 的 `source-location` 指向該網址。

## Trellis Chart

把一個度量依維度成員拆成多張小圖（small multiples）。

### 什麼是 Trellis Chart

Trellis Chart（又稱 small multiples）把一張圖拆成一格一格的小圖，每個類別一格；所有小圖共用同樣的軸與刻度，所以讀者一眼就能跨很多個區段比較走勢、型態與離群值，比如各機型的每月燃油消耗，或各區域的銷售趨勢。

**在 Tableau 裡原生製作**：在 Tableau Desktop 做 trellis，光靠拖拉是不夠的。通常要寫計算欄位，用 `INDEX()`、`SIZE()` 這類表計算來配置列與欄的位置，例如 `INT((INDEX()-1)/n)` 與 `(INDEX()-1)%n`；接著還要把「計算依據」設對、處理排序，再逐一調整標題、標籤與間距。常見的痛點有三個：篩選條件一改，表計算就失效；格數是固定的，類別數量變了不會自動調整；新手的學習曲線很陡。

**用 Viz Extension 走捷徑**：Viz Extension 把上面這些步驟收成幾次點擊。把維度拖到「標記」卡片上，格子就自動排好，完全不需要計算欄位。最新版另外加了兩層互動：分格層級的互動，可以醒目提示或篩選整個區塊；標記層級的互動，可以選取分格內的單一資料點。有了這兩層，靜態的比較圖就變成可以動手探索的分析工具。

### What is a Trellis Chart?

A trellis chart, also called "small multiples," splits one view into a grid of mini charts, one panel per category. Every panel uses the same axes and scale, so readers can compare patterns, trends, and outliers across many segments at a glance, such as monthly fuel burn by aircraft type or sales trends by region.

**Building it natively in Tableau.** Creating a trellis in Tableau Desktop takes more than drag-and-drop. You typically need calculated fields using table calculations like `INDEX()` and `SIZE()` to assign row and column positions, for example `INT((INDEX()-1)/n)` and `(INDEX()-1)%n`. You then have to configure "Compute Using" correctly, handle sorting, and fine-tune headers, labels, and spacing. Common pain points include table calcs breaking when filters change, a fixed grid that doesn't adapt to the number of categories, and a steep learning curve for new users.

**The Viz Extension shortcut.** A Viz Extension turns all of this into a few clicks. Just drop your dimension onto the Marks card, and the grid is generated automatically with no calculated fields required. The latest version also adds two layers of interactivity. Panel-level interaction lets you highlight or filter an entire block. Mark-level interaction lets you select a single data point within a panel. Both turn a static comparison into a genuinely exploratory analysis experience.

### 檔案與連結

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
