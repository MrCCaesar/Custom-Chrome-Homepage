# Chrome 自定义新标签页扩展

一个功能丰富的 Chrome 浏览器新标签页扩展，替换默认新标签页。

## 功能

- 🔍 **可调节搜索栏** — 支持 Google / Bing / 百度 / DuckDuckGo / GitHub 搜索引擎，位置可上下滑动调节
- 🖼️ **自定义背景图片** — 上传任意图片作为主页背景
- 📑 **分组书签** — 网站链接按分组管理，分组可独立命名
- 🏷️ **自动获取图标** — 通过 Google Favicon 服务自动获取网站图标，支持自定义图标 URL
- 📐 **三阶图标尺寸** — 小 / 中 / 大三档调节

## 安装方法

1. 生成图标（需要 Python + Pillow）：
   ```bash
   pip install Pillow
   python generate_icons.py
   ```

   或手动将任意 16×16、48×48、128×128 的 PNG 图片放入 `icons/` 目录，命名为：
   - `icon16.png`
   - `icon48.png`
   - `icon128.png`

2. 打开 Chrome，地址栏输入 `chrome://extensions/`

3. 打开右上角「开发者模式」

4. 点击「加载已解压的扩展程序」

5. 选择 `chrome-homepage-extension` 文件夹

6. 打开新标签页即可看到效果

## 使用说明

| 操作 | 方式 |
|------|------|
| 打开设置 | 点击右下角 🖼️ 按钮 |
| 调节搜索栏位置 | 设置面板中拖动滑块 |
| 切换搜索引擎 | 设置面板下拉选择 |
| 上传背景图 | 设置面板点击「选择图片」 |
| 添加分组 | 页面底部「+ 添加分组」 |
| 重命名分组 | 点击分组标题 |
| 删除分组 | 点击分组右上角 ✕ |
| 添加链接 | 分组内「+ 添加链接」 |
| 删除链接 | 鼠标悬停链接卡片，点击右上角 ✕ |
| 调节图标大小 | 设置面板中选择 小/中/大 |

## 文件结构

```
chrome-homepage-extension/
├── manifest.json        # 扩展清单
├── newtab.html          # 主页面
├── newtab.css           # 样式
├── newtab.js            # 逻辑
├── generate_icons.py    # 图标生成脚本
├── icons/               # 扩展图标
└── README.md
```
