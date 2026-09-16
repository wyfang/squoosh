# Squoosh

基于 GoogleChromeLabs Squoosh 的个人修改版，在浏览器中批量压缩、转换和比较图片，使用 React 19、HeroUI 3、Tailwind CSS 4 与 Vite 7 构建交互工作台。

[在线使用](https://play.wangyifang.com/squoosh/) · [上游项目](https://github.com/GoogleChromeLabs/squoosh) · [English](./README.en.md)

## 功能

- 拖入、粘贴或选择多张图片，添加后自动切换到新图片；支持将当前设置应用到整个队列。
- 输出 WebP、JPEG（MozJPEG）、AVIF 或 PNG（OxiPNG）。压缩期间仍可调整质量等设置，并以最新设置重新生成结果。
- 使用 HeroUI 滑杆或百分比输入框调整输出尺寸，范围为 `1%–100%`，步进为 `1%`；提供 `25%`、`50%`、`75%`、`100%` 快捷比例，宽高保持同比例缩放。
- 切换原图、对比和结果视图，拖动分界线检查差异；支持鼠标缩放、框选放大和平移。
- 显示单张与队列的转换前后体积、体积占比及增减；单张下载或将已完成结果批量导出 ZIP。
- 蓝色强调色搭配深色、浅色主题，记住主题选择；界面使用 HeroUI React 组件，图片解码和编码在浏览器工作线程中完成。

## 使用

需要 Node.js 22.12.0 或更高版本，以及支持 WebAssembly、Web Worker 和 OffscreenCanvas 的现代浏览器。建议使用当前版本的 Chrome、Edge、Firefox 或 Safari，并以实际浏览器解码能力为准。

```bash
npm ci
npm run dev -- --port 5178 --strictPort
```

打开 `http://127.0.0.1:5178/squoosh/`。若端口已被占用，修改 `--port` 后重试。

```bash
npm run typecheck
npm run build
npm run preview -- --port 4178 --strictPort
```

构建预览地址为 `http://127.0.0.1:4178/squoosh/`。产物位于 `dist/`，资源基础路径固定为 `/squoosh/`。构建复用仓库保留的 Squoosh WASM 编码器，不需要在本机重新编译各编解码器。

画布快捷操作如下。按键操作在输入框聚焦时不会接管输入；`1`、`2`、`3` 仅在单独按下时切换视图，搭配 `Shift`、`Ctrl`、`Alt` 或 `Command` 时不切换视图。画布缩放只改变预览，导出像素尺寸由右侧「调整尺寸」控制。

| 操作 | 效果 |
| --- | --- |
| 鼠标滚轮 | 以指针位置为中心缩放 |
| 按住 `Z` 单击 | 放大 |
| 按住 `Z` + `Alt` 单击 | 缩小 |
| 按住 `Z` 拖动 | 框选区域并放大 |
| 按住空格拖动，或使用鼠标中键、右键拖动 | 平移图片 |
| `1` | 原图视图 |
| `2` | 对比视图 |
| `3` | 结果视图 |
| `Shift` + `1` | 适应画布 |
| `Shift` + `0` | 原始像素 `1:1` 显示 |
| `Esc` | 取消当前框选 |

切换图片时沿用当前缩放模式，并将新图片居中：适应画布模式按新图重新计算倍率，原始像素模式保持 `1:1`，自定义缩放保持当前倍率。同一张图片切换视图或重新编码时，保留缩放和平移位置。

## 说明

当前支持静态 PNG、JPEG、WebP、AVIF、BMP 输入，不支持动画。一次最多加入 30 张图片，输入总量不超过 100 MB；单张不超过 40 MB、2500 万像素，任一边不超过 16383 像素。浏览器或设备的可用内存仍可能限制处理能力，AVIF 编码通常耗时更长。

图片仅在当前浏览器中处理，本工作台不上传原图或转换结果。主题偏好保存在浏览器本地；刷新或关闭页面会清空图片队列，应先下载需要保留的结果。线上宿主站点另行加载访问统计和 Cloudflare 安全脚本，不能将整站视为离线页面。

修改基于上游提交 `e8d35e0fb66eb16eff6fe8fc773eabcbb7128de3`。原应用源码及编解码器保留在 `src/`、`codecs/` 等原目录，原说明和依赖配置保留为 [README.upstream.md](./README.upstream.md)、[package.upstream.json](./package.upstream.json) 与 [package-lock.upstream.json](./package-lock.upstream.json)。当前入口在 `workbench/`，`npm run build` 构建的是新的工作台。

此源码仓库的 CI 在 Linux 和 Windows 上安装依赖并验证构建，不执行部署。生产发布由独立站点仓库 `play.wangyifang.com` 负责：其 `sync:squoosh` 脚本将本仓库的 `dist/` 同步到站点的 `squoosh/` 目录，随后将站点改动提交并推送到 `main`，触发 Cloudflare Workers Builds 自动部署。

## 版权说明

上游 Squoosh 由 GoogleChromeLabs 和贡献者维护，按 [Apache License 2.0](./LICENSE) 发布。本仓库保留上游许可证和源文件归属，并注明工作台修改关系。编码器、React、HeroUI 及其他第三方依赖各自遵循其许可证，完整归属文本随产物提供于 [THIRD_PARTY_NOTICES.txt](./public/THIRD_PARTY_NOTICES.txt)。

This software is based in part on the work of the Independent JPEG Group.

项目名称、商标和用户图片不因代码许可证获得额外授权。
