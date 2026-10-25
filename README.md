# 回译练习网站

一个打开即可使用的个人英语回译网站。材料内置在站点中；练习只保存当前一篇，可导出备份。AI 分析可选，使用 Firebase 云函数安全调用 DeepSeek。

## 本地查看

需要 Node.js 20 或更高版本。先同步材料：

```powershell
npm run sync-materials
npx serve dist
```

在浏览器打开命令输出的本地地址。基础练习、对照和备份不需要安装依赖或配置 AI。

材料唯一来源是根目录的 `materials.json`。修改该文件后运行 `npm run sync-materials`，它会生成前端使用的 `dist/materials.json` 和函数使用的 `functions/materials-manifest.json`。不要直接编辑这两个生成文件。

```powershell
npm run check
```

该命令检查 JavaScript 语法和材料字段。

## GitHub Pages 发布

1. 创建 GitHub 仓库，提交项目文件。
2. 在仓库的 Pages 设置中选择“从分支部署”。
3. 选择含有 `dist/` 内容的发布方式：可以将 `dist` 设为发布目录的构建产物，或用 GitHub Actions 将 `dist` 部署到 Pages。
4. 发布前运行 `npm run sync-materials`，确保 `dist/materials.json` 已更新。

这个项目使用相对路径，因此适合部署在 `https://用户名.github.io/仓库名/` 这样的项目子路径下。

`dist/config.js` 是公开配置文件，默认只有空的 `apiUrl`。不要在其中放口令或 DeepSeek 密钥。它被 `.gitignore` 忽略；首次配置时从 `dist/config.example.js` 复制生成。

## Firebase 与 DeepSeek AI 配置

AI 功能需要 Firebase Cloud Functions 和一个 DeepSeek API Key。云函数部署需要 Firebase Blaze 计费方案；请先在 Firebase / Google Cloud 中设置预算提醒和可用的服务费用上限。DeepSeek 的调用费用单独计算。

1. 安装 Firebase CLI，并登录你的 Firebase 账户。
2. 在 Firebase 项目中初始化 Functions 时选择现有的 `functions` 目录，并安装依赖：

```powershell
Set-Location functions
npm install
Set-Location ..
```

3. 设置一个 JSON Secret。`accessCode` 是仅你自己知道的高强度口令；浏览器每次使用 AI 时会要求输入它。不要把这两个值提交到仓库。

```powershell
firebase functions:secrets:set BACKTRANSLATION_CONFIG
```

在提示中输入以下 JSON，并替换真实内容：

```json
{
  "deepseekApiKey": "你的 DeepSeek API Key",
  "accessCode": "一段随机且足够长的个人访问口令",
  "model": "deepseek-chat",
  "maxOutputTokens": 1800
}
```

4. 设置 `ALLOWED_ORIGIN` 环境变量为你的 GitHub Pages 完整来源，例如 `https://your-name.github.io`。注意：这只能限制浏览器来源，不替代访问口令。可用 Firebase Functions 参数或 `.env` 配置此变量；部署前请按 Firebase 当前文档核对方式。
5. 发布函数：

```powershell
firebase deploy --only functions:analyze
```

6. 将返回的函数地址填入本地 `dist/config.js`：

```js
window.BACKTRANSLATION_CONFIG = {
  apiUrl: "https://asia-east1-你的项目.cloudfunctions.net/analyze"
};
```

7. 将 `config.js` 一并发布到 GitHub Pages，但不要提交密钥。它只包含函数地址，可以公开。

函数会在收到 AI 请求时验证访问口令、材料版本、文本大小与消息角色，再读取 Secret 调用 DeepSeek。它不使用云数据库保存练习或聊天记录。日志与外部服务仍可能有自身处理规则；不要在练习中填写敏感个人资料。

函数还包含每个运行实例每分钟 6 次的短时请求限制，用于避免误触或简单滥用。它不是跨实例的严格总配额；如果以后需要严格全局限制，应接入托管限流服务或仅保存少量技术计数，仍不必保存练习正文。

## 使用方式

1. 打开网站后直接阅读中文，右侧写英文。
2. 点击“完成并对照”查看自己的答案和参考英文。
3. 点击“AI 分析”，输入访问口令。首次分析和后续提问构成同一篇练习的单一会话。
4. 修改答案后，旧反馈会明确标记为基于旧版本；重新分析会在成功后替换当前会话。
5. 用“导出当前练习”保存备份。恢复备份只能恢复本站已内置且版本一致的文章。

网站只保存一份当前练习在浏览器本地。清除浏览器站点数据、换浏览器或换设备前请导出备份。

## 材料与版权

默认三篇材料为原创双语短文。`materials.json` 的结构包括 `id`、`version`、`title`、`source`、`chinese`、`english`。公开替换为教材文章前，请先取得相应的发布授权。

## 开发说明

- `dist/`：GitHub Pages 静态站点。
- `materials.json`：唯一材料源。
- `scripts/sync-materials.mjs`：从唯一材料源生成前端和后端副本。
- `functions/`：Firebase 后端。后端从生成的材料清单读取参考文本，不相信前端传来的原文。

如需改变文本限制、超时或模型，请在 `functions/index.js` 中集中调整；不能将模型地址、模型名、输出上限或系统提示词开放给浏览器传入。
