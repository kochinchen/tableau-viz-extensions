# Tableau Viz Extensions

Tableau viz extensions by Bill Chen。每個子資料夾是一個 extension，透過 GitHub Pages 以 https 提供，`.trex` 的 `source-location` 指向該網址。

## Trellis Chart

把一個度量依維度成員拆成多張小圖（small multiples）。

### 什麼是 Trellis Chart？

Trellis chart 又稱「small multiples（小倍數圖）」，是把一張圖拆成多格的小圖矩陣，每個類別各自占一格。所有小圖使用相同的座標軸與刻度，讓讀者一眼就能比較不同類別之間的模式、趨勢與異常值。常見的應用像是依機型比較每月油耗，或依區域比較銷售趨勢。

**在 Tableau 原生建立的做法**：在 Tableau Desktop 裡做 trellis，光靠拖拉是做不到的。通常要搭配 `INDEX()`、`SIZE()` 等表計算撰寫計算欄位來指定每格的列與欄位置，例如 `INT((INDEX()-1)/n)` 和 `(INDEX()-1)%n`。接著還要正確設定「Compute Using」、處理排序，再細調標題、標籤和間距。常見的卡關點包括：篩選條件一變，表計算就跑掉；格數固定，無法隨類別數量自動調整；新手的學習門檻也偏高。

**用 Tableau Extension 快速達成**：透過 Viz Extension，只要幾個點擊就能完成。把維度拖到 Marks 卡上，系統就會自動產生矩陣，完全不需要寫計算欄位。最新版本還加入兩層互動功能。第一層是區塊互動，可以針對整個區塊做 highlight 或篩選。第二層是單物件互動，可以點選某一格中的單一資料點。靜態的比較圖因此變成可以深入探索的分析體驗。

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
