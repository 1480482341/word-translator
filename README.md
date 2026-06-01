# 🔤 Word Translator — 英文选词翻译助手

> 在任意网页上选中英文单词，**自动弹出中文翻译**，并记录到数据库，方便复习记忆。

![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-blue)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![MySQL](https://img.shields.io/badge/MySQL-8.0%2B-orange)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 📖 这是什么？

这是一款**浏览器翻译插件**，配合后端服务使用：

- ✅ 在任意网页上**选中英文单词或短语**，自动弹出翻译面板
- ✅ 翻译结果**自动保存到数据库**，记录查询次数
- ✅ 提供**管理后台页面**，可以搜索、排序、删除、导出翻译记录
- ✅ 完全免费，无需注册任何账号

**效果预览：**

```
在网页上选中 "Hello"  →  弹出浮动面板：
┌─────────────────────────┐
│ 🔤 Word Translator    ✕ │
├─────────────────────────┤
│ 原文: Hello              │
│ 翻译: 你好               │
├─────────────────────────┤
│ 已查询 1 次          ✓  │
└─────────────────────────┘
```

---

## 🛠️ 完整安装教程（从零开始）

> ⚠️ 本教程假设你使用 **Windows 10/11** 系统。如果你是 Mac/Linux 用户，步骤类似但命令不同。

### 第一步：安装 Node.js

Node.js 是运行后端服务的程序。

1. 打开浏览器，访问 https://nodejs.org/zh-cn
2. 点击 **LTS（长期支持版）** 下载按钮（会下载一个 `.msi` 文件）
3. 双击下载的文件，一路点 **Next** → **Install** → **Finish**
4. 验证安装：按 `Win + R`，输入 `cmd`，回车，在黑窗口中输入：
   ```
   node --version
   ```
   如果显示类似 `v22.x.x` 的版本号，说明安装成功 ✅

---

### 第二步：安装 MySQL 数据库

MySQL 用来存储翻译过的单词和翻译结果。

#### 方法 A：使用 ZIP 免安装版（推荐，简单快速）

1. 打开浏览器，访问 https://dev.mysql.com/downloads/mysql/
2. 在页面中找到 **Windows** 平台，选择 **ZIP Archive** 版本下载
   - 如果页面显示的是 MySQL 9.x，点击上方的 **Archives** 链接可以找到 8.x 版本
3. 下载完成后，解压到你想安装的位置，例如 `E:\App_install\mysql-8.4.0-winx64`

4. **创建配置文件**：在解压后的文件夹中，新建一个文本文件，命名为 `my.ini`，用记事本打开，粘贴以下内容：

   ```ini
   [mysqld]
   basedir=E:/App_install/mysql-8.4.0-winx64
   datadir=E:/App_install/mysql-8.4.0-winx64/data
   port=3306
   character-set-server=utf8mb4
   collation-server=utf8mb4_unicode_ci

   [client]
   default-character-set=utf8mb4
   ```

   > ⚠️ **注意**：`basedir` 和 `datadir` 的路径要改成你实际解压的位置！用正斜杠 `/` 而不是反斜杠 `\`。

5. **初始化数据库**：以管理员身份打开 CMD（在 Windows 搜索栏输入 `cmd`，右键选择"以管理员身份运行"），依次执行：

   ```cmd
   cd /d E:\App_install\mysql-8.4.0-winx64\bin
   mysqld.exe --initialize-insecure --console
   ```

   看到 `MySQL Server Initialization - end.` 表示成功。此时 `data` 文件夹已创建。

6. **安装为 Windows 服务**（这样开机自动启动）：

   ```cmd
   mysqld.exe --install MySQL84 --defaults-file=E:\App_install\mysql-8.4.0-winx64\my.ini
   net start MySQL84
   ```

   看到 `MySQL84 服务已经启动成功` 表示 OK ✅

7. **创建数据库**：

   ```cmd
   mysql.exe -u root -e "CREATE DATABASE IF NOT EXISTS word_translator CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```

   没有报错就是成功了 ✅

8. **允许远程连接**（WSL 等场景需要）：

   ```cmd
   mysql.exe -u root -e "CREATE USER IF NOT EXISTS 'root'@'%%' IDENTIFIED BY ''; GRANT ALL PRIVILEGES ON *.* TO 'root'@'%%' WITH GRANT OPTION; FLUSH PRIVILEGES;"
   ```

#### 方法 B：使用安装向导（图形界面）

1. 访问 https://dev.mysql.com/downloads/installer/
2. 下载 MySQL Installer（较大的那个文件，约 300MB）
3. 运行安装程序，选择 **Custom** 安装
4. 选择 MySQL Server 8.x，安装到 `E:\App_install\MySQL\`
5. 设置 root 密码时可以留空（开发环境）
6. 确保勾选 **Configure MySQL Server as a Windows Service**

---

### 第三步：下载本项目

#### 方法 A：使用 Git（推荐）

1. 先安装 Git：访问 https://git-scm.com/downloads ，下载安装
2. 打开 CMD，执行：

   ```cmd
   cd /d E:\
   mkdir Projects
   cd Projects
   git clone https://github.com/1480482341/word-translator.git
   ```

#### 方法 B：直接下载 ZIP

1. 打开本项目的 GitHub 页面
2. 点击绿色的 **Code** 按钮 → **Download ZIP**
3. 解压到 `E:\Projects\word-translator\`

---

### 第四步：配置后端

1. 打开 CMD，进入项目的 `server` 目录：

   ```cmd
   cd /d E:\Projects\word-translator\server
   ```

2. 安装依赖（第一次需要，以后不需要）：

   ```cmd
   npm install
   ```

   等待安装完成，看到类似 `added xx packages` 就成功了 ✅

3. 配置数据库连接：在 `server` 目录下找到 `.env.example` 文件，复制一份并重命名为 `.env`，用记事本打开，修改为：

   ```env
   # MySQL 数据库配置
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASS=
   DB_NAME=word_translator

   # 服务器端口
   PORT=3000
   ```

   > 如果你安装 MySQL 时设置了密码，把 `DB_PASS=` 后面填上你的密码，例如 `DB_PASS=123456`

---

### 第五步：启动后端服务

每次使用前需要启动后端（如果设置了开机自启则不需要）：

```cmd
cd /d E:\Projects\word-translator\server
node index.js
```

看到以下界面说明启动成功：

```
╔══════════════════════════════════════════════╗
║        🔤  Word Translator Server          ║
║        监听端口: http://localhost:3000      ║
║        管理后台: http://localhost:3000/admin ║
╚══════════════════════════════════════════════╝
```

> ⚠️ **不要关闭这个窗口！** 关闭后翻译功能就失效了。

---

### 第六步：安装浏览器扩展

1. 打开 Edge 浏览器，在地址栏输入 `edge://extensions/` 并回车
   - 如果用 Chrome，输入 `chrome://extensions/`
2. 打开左下角的 **开发人员模式** 开关
3. 点击 **加载已解压的扩展** 按钮
4. 选择项目中的 `extension` 文件夹（路径类似 `E:\Projects\word-translator\extension`）
5. 扩展安装成功后，可以在工具栏看到拼图图标 🧩

---

### 第七步：开始使用！

1. 打开任意网页（例如百度、知乎、GitHub 等）
2. 用鼠标**选中一个英文单词或短语**（最多 5 个单词）
3. 翻译面板自动弹出，显示原文和中文翻译 🎉
4. 按 **ESC** 或点击页面空白处关闭面板

---

## 📋 管理后台

访问 http://localhost:3000/admin 可以：

- 📊 查看所有翻译过的单词，按查询频率排序
- 🔍 搜索单词或翻译
- 🗑️ 删除不需要的记录
- 📥 导出为 CSV 文件（可以用 Excel 打开）

---

## ⚙️ 设置开机自动启动后端

每次手动启动后端太麻烦？设置自动启动：

1. 新建一个文本文件，粘贴以下内容：

   ```bat
   @echo off
   cd /d E:\Projects\word-translator\server
   start /b node index.js
   ```

2. 保存为 `start_translator.bat`（注意后缀是 `.bat` 不是 `.txt`）
   - 如果看不到 `.txt` 后缀：打开文件资源管理器 → 查看 → 显示 → 勾选"文件扩展名"

3. 以管理员身份打开 CMD，执行：

   ```cmd
   schtasks /create /tn "WordTranslatorBackend" /tr "E:\Projects\word-translator\start_translator.bat" /sc ONLOGON /f
   ```

4. 以后每次开机登录后，后端会自动启动 ✅

---

## 🏗️ 项目结构

```
word-translator/
├── extension/                  # 浏览器扩展（前端）
│   ├── manifest.json           # 扩展配置文件
│   ├── content.js              # 核心逻辑：监听选中事件 + 翻译面板
│   ├── background.js           # 后台服务：扩展生命周期管理
│   ├── popup.html              # 点击扩展图标弹出的小窗口
│   ├── popup.js                # 小窗口的逻辑
│   └── styles.css              # 翻译面板的样式
├── server/                     # 后端服务
│   ├── index.js                # 服务器入口：API 路由 + 管理页面
│   ├── admin.html              # 管理后台页面
│   ├── db/
│   │   ├── index.js            # 数据库操作：增删改查
│   │   └── init.sql            # 数据库建表脚本
│   ├── package.json            # 依赖配置
│   ├── package-lock.json       # 依赖版本锁定
│   └── .env.example            # 环境变量模板
├── .gitignore                  # Git 忽略规则
├── CLAUDE.md                   # 项目说明（AI 辅助开发用）
└── README.md                   # 你在看的这个文件
```

---

## 🔌 API 接口文档

| 方法 | 路径 | 说明 | 参数 |
|------|------|------|------|
| `POST` | `/api/translate` | 翻译英文 → 中文 | Body: `{"text": "hello"}` |
| `GET` | `/api/words` | 查询翻译记录 | Query: `?page=1&limit=20&search=关键词` |
| `DELETE` | `/api/words/:id` | 删除指定记录 | Path: `/api/words/1` |
| `GET` | `/api/export` | 导出 CSV 文件 | 无 |
| `GET` | `/api/stats` | 获取统计信息 | 无 |
| `GET` | `/admin` | 管理后台页面 | 无 |

### 示例

```bash
# 翻译单词
curl -X POST http://localhost:3000/api/translate -H "Content-Type: application/json" -d '{"text":"hello"}'

# 返回：
# {"original":"hello","translation":"你好","word":"hello","id":1,"frequency":1}
```

---

## ❓ 常见问题

### Q: 选中单词后没有弹出翻译？
**A:** 检查以下几点：
1. 后端服务是否启动了？（CMD 窗口是否还开着）
2. 浏览器扩展是否已启用？（在扩展管理页面查看）
3. 是否选中了英文？（纯中文或数字不会触发翻译）

### Q: 翻译失败，请检查后端服务是否启动？
**A:** 后端没有运行。打开 CMD 执行：
```cmd
cd /d E:\Projects\word-translator\server
node index.js
```

### Q: 翻译出来的结果不对？
**A:** 使用的是免费的 MyMemory 翻译 API，翻译质量不如 Google/百度翻译。部分单词可能翻译不准确，但大多数常用词是没问题的。

### Q: 每天能翻译多少个词？
**A:** MyMemory API 每天约 5000 字符的免费额度，日常使用完全够用。如果某天突然翻译失败，可能是额度用完了，第二天自动恢复。

### Q: MySQL 忘记密码了怎么办？
**A:** 如果是按本教程安装的（空密码），直接连接即可。如果设置了密码又忘了：
1. 停止 MySQL 服务：`net stop MySQL84`
2. 跳过权限启动：`mysqld.exe --skip-grant-tables`
3. 另开一个 CMD：`mysql.exe -u root`
4. 修改密码：`ALTER USER 'root'@'localhost' IDENTIFIED BY '';`
5. 重启 MySQL 服务

### Q: 端口 3000 被占用了怎么办？
**A:** 修改 `server/.env` 文件中的 `PORT=3000` 改成其他端口（如 `3001`），同时修改 `extension/content.js` 中的 `const API_BASE = 'http://localhost:3000'` 改成对应端口。

### Q: 可以翻译句子吗？
**A:** 可以！选中最多 5 个单词的英文短语即可翻译。超过 5 个单词不会触发翻译。

---

## 📄 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端 | Chrome Extension (Manifest V3) | 浏览器扩展，监听选中事件 |
| 后端 | Node.js + Express | RESTful API 服务 |
| 数据库 | MySQL 8.x | 存储翻译记录 |
| 翻译 API | MyMemory | 免费翻译服务，国内可访问 |

---

## 📜 开源协议

本项目基于 [MIT 协议](LICENSE) 开源。

---

## 🙏 致谢

- [MyMemory](https://mymemory.translated.net/) — 免费翻译 API
- [Express](https://expressjs.com/) — Node.js Web 框架
- [mysql2](https://github.com/sidorares/node-mysql2) — MySQL 驱动
