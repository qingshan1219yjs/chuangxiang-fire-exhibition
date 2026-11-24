# 创想消防作品展

手机展厅展示 25 件消防主题作品，共 26 张展板。第 15、16 块合并为《滴滴护校记》。访客输入学号，每个学号只可提交一次，最多选三件作品，每件计一票。管理员登录并验证密码后可查看得票和选票明细、下载 CSV，也可以关闭或重新开放投票。

## 导入 GitHub

解压后，将压缩包内的文件和文件夹放到 GitHub 仓库根目录。保留 `.openai` 文件夹和 `.gitignore` 文件。

## 本机预览

需要 Node.js 24 或更高版本。解压后在此目录运行以下命令，然后打开 `http://127.0.0.1:4177`。

```text
node scripts/build.mjs
node scripts/preview.mjs
```

本机预览使用解压目录的 `.local/votes.sqlite`。点网页底部的「管理员入口」进行本机预览登录，并输入启动时终端显示的预览密码。

## 线上部署

线上投票需要运行 Worker 并绑定名为 `DB` 的 D1 数据库。部署时按顺序执行 `drizzle/` 里的 SQL 迁移。

如果部署到新的 Sites 项目，将该项目的标识填入 `.openai/hosting.json` 的 `project_id`，并在部署环境配置 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 和 `ADMIN_SESSION_KEY`。管理员先登录 ChatGPT，再输入管理员密码。管理员密码和会话签名密钥应保存在部署环境的机密变量中。

## 源码结构

- `public/` 包含页面、样式、脚本和经过压缩的展板图。
- `worker/index.js` 提供投票、权限验证、统计和 CSV 导出。
- `drizzle/` 包含投票数据库结构。
