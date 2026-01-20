# Nano Banana 水印去除模块

基于 [gemini-watermark-remover](https://github.com/journey-ad/gemini-watermark-remover) 开源项目实现。

## 功能说明

自动去除 Gemini（Nano Banana）生成图片上的可见水印（Gemini Sparkle Logo）。

## 技术原理

使用 **反向 Alpha 混合（Reverse Alpha Blending）** 算法：

- Gemini 添加水印公式：`带水印图片 = α × 水印 + (1 - α) × 原图`
- 反向求解原图：`原图 = (带水印图片 - α × 水印) / (1 - α)`

通过预先捕获的水印参考图计算 Alpha 透明度，精确还原原始像素。

## 文件结构

```
watermark-remover/
├── index.js           # 主入口，监听页面图片并处理
├── watermark-engine.js # 水印引擎，协调检测和去除
├── blend-modes.js     # 核心算法：反向 Alpha 混合
├── alpha-map.js       # 从参考图计算 Alpha 透明度图
├── styles.css         # 样式文件
├── README.md          # 说明文档
└── assets/
    ├── bg_48.png      # 48x48 水印参考图（小图用）
    └── bg_96.png      # 96x96 水印参考图（大图用）
```

## 资源下载

如果 `assets` 目录下没有水印参考图片，请手动下载：

### 方法一：从 GitHub 下载

1. 访问 https://github.com/journey-ad/gemini-watermark-remover
2. 下载 `src/core/assets/bg_48.png` 和 `src/core/assets/bg_96.png`
3. 放到 `js/watermark-remover/assets/` 目录

### 方法二：使用命令行

```bash
cd js/watermark-remover/assets
curl -L -o bg_48.png "https://raw.githubusercontent.com/journey-ad/gemini-watermark-remover/main/src/core/assets/bg_48.png"
curl -L -o bg_96.png "https://raw.githubusercontent.com/journey-ad/gemini-watermark-remover/main/src/core/assets/bg_96.png"
```

> 注意：如果本地资源加载失败，代码会自动尝试从 CDN 加载。

## 水印规则

Gemini 根据图片尺寸使用不同大小的水印：

| 图片尺寸 | 水印大小 | 边距 |
|---------|---------|------|
| 宽高都 > 1024px | 96×96 | 64px |
| 其他 | 48×48 | 32px |

## 开源协议

本模块基于 MIT 协议开源，原作者：journey-ad (Jad)

- 原项目：https://github.com/journey-ad/gemini-watermark-remover
- C++ 版本：https://github.com/allenk/GeminiWatermarkTool
