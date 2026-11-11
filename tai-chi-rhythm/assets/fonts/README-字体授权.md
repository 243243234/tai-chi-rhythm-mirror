# 字体授权说明（assets/fonts/）

本目录下所有 `.woff2` 都是 **Google Fonts 子集化产物**，字形与授权来自下列三款开源字体，
全部为 **SIL Open Font License 1.1**（可商用、可再分发、可子集化），许可证全文见同目录 `OFL.txt`。

| 文件前缀 | 字体 | 版权方 | 用途 |
| --- | --- | --- | --- |
| `mashanzheng-*` | [Ma Shan Zheng 马善政毛笔楷书](https://fonts.google.com/specimen/Ma+Shan+Zheng) | Copyright 2015 The Ma Shan Zheng Project Authors | 书法题字（仅大字号） |
| `notoserifsc-*` | [Noto Serif SC 思源宋体](https://fonts.google.com/noto/specimen/Noto+Serif+SC) | Copyright 2012-2020 Adobe / Google | 正文与 UI |
| `cinzel-*` | [Cinzel](https://fonts.google.com/specimen/Cinzel) | Copyright 2012 The Cinzel Project Authors | 数字与拉丁 |

## 为什么要子集化

三款字体的完整字库合计约 40MB，而游戏实际只用到 829 个字符。子集化后总共 615KB，
**随站自托管、不走 CDN**，离线也能用，且各端渲染一致。

## 文案改动后如何重新生成（三步）

```bash
node tools/collect-chars.mjs .     # 1. 从 index.html 文本节点 + src/*.js 字符串字面量重收字集
node tools/fetch-fonts.mjs         # 2. 走 Google Fonts text= 服务端子集化，重写 src/fonts.css
node tools/check-fonts.mjs         # 3. 校验：输出 missing 0 才算没字落到系统回退字体
```

`src/fonts.css` 是自动生成的，不要手改——它由第 2 步整份重写。
