# Cherry Apple 上新监视器（0 元 Bark 版）

自动每 5 分钟检查 Cherry Apple 店铺页面。**发现上新 / 新增款式 / 补货 / 页面公告变化时，立即推送 Bark 到你的 iPhone**。无需打开 App，无需手动登记，不需要 Apple 开发者账号。

## 一、准备（约 2 分钟，均免费）
1. iPhone 在 App Store 搜索安装 **Bark**。
2. 打开 Bark → 首页会显示你的**推送地址**，形如：
   `https://api.day.app/XXXXXXXX/`（这一串是你的专属钥匙，请保密）
3. 确认 iPhone“设置 → 通知 → Bark”已开启，并允许横幅/声音。

## 二、部署到 GitHub（约 5 分钟）
> 重要：请新建一个**公开的、独立的小仓库**，只放本监视器这 3 个文件。
> 不要把书架 App 源码、藏书数据或任何个人文件放进这个仓库（公开仓库任何人都能看）。

1. GitHub 网页 → New repository：
   - 仓库名随意，例如 `cherry-watcher`
   - 选 **Public**（公开仓库的定时任务才免费）
   - 不要勾选 Add a README（选空仓库即可）→ Create repository
2. 依次用 **Add file → Create new file** 创建 3 个文件（输入完整路径可自动建文件夹）：
   - `watch.js` ← 内容：见本目录 `watch.js`
   - `.github/workflows/watch-cherry.yml` ← 内容：见本目录 `.github/workflows/watch-cherry.yml`
   - `README.md` ← 本文件即可
   每建一个点一次 “Commit changes”。
3. 添加密钥：仓库页 → **Settings → Secrets and variables → Actions → New repository secret**
   - Name：`BARK_URL`
   - Secret：填你 Bark 的完整推送地址 `https://api.day.app/XXXXXXXX/`
4. 手动试跑一次：仓库页 → **Actions** → 左侧 “Watch Cherry Apple” → **Run workflow** → 等约 1 分钟。
   - 手机收到「✅ Cherry Apple 上新监视已启动」= 全线打通 ✅
5. 之后它会**每 5 分钟自动检查**，有变化就推送到 Bark，无需你做任何事。

## 三、会提醒什么
- 🆕 首页出现新商品 / 现有商品新增款式（含“万能拍、明信片”这类商品下新加的款式）
- 🔁 售罄款式重新有货（补货可拍）
- ✏️ 商品标题变化、🚫 商品下架
- 📣 页面出现新公告/预告文字（可能是在预告下次上新）
- 只在第一次启动时发一条确认消息；平时**没变化完全静默**。

## 四、已知边界（重要，请读一遍）
- GitHub 定时任务不是精密秒级调度，实际间隔约 5～10 分钟，且依赖 GitHub 服务正常。
- 本监视器读取的是店铺“首页展示数据”（公开接口）。如果店家上架新书**但完全不动首页**，可能检测不到——这是这家店接口限制，暂时无法绕过；若发现漏报，可再升级云端抓目录方案。
- 店铺时间随机且不提前公开，因此无法“提前一天预告”，只能做到“上新后几分钟内提醒”。
- 公开仓库若超过 60 天完全没有提交，GitHub 会自动暂停定时任务。本监视器每次检测到变化会提交一次快照，通常能避免；万一被暂停，去 Actions 页手动 Run workflow 即可恢复。

## 五、本地试跑（Windows PowerShell，可选）
```powershell
cd cherry-watcher
$env:BARK_URL = "https://api.day.app/XXXXXXXX/"
node watch.js
```
第一次运行会记录基准并推送启动消息；再运行一次应显示“无变化，保持静默”。