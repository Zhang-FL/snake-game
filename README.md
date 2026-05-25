# 贪吃蛇 Snake Game

一个使用 Node.js + Express 构建的经典贪吃蛇网页游戏，包含用户登录注册和排行榜功能。

## 快速开始

需要 Node.js 环境。

```bash
npm install
npm start
```

浏览器访问 `http://localhost:3000`。

## 项目结构

```
snake-game/
├── public/
│   ├── index.html        # 页面结构
│   ├── style.css         # 样式
│   └── game.js           # 游戏逻辑
├── data/
│   ├── snake.db          # SQLite 数据库（用户 + 排行榜）
│   └── sessions.db       # Session 存储
├── scripts/
│   └── migrate.js        # 历史数据迁移脚本
├── server.js             # Express 服务器
└── README.md
```

## 玩法

- **方向键** 或 **W/A/S/D** 控制蛇的移动方向
- **空格键** 暂停 / 继续游戏
- 吃到红色食物 +10 分，蛇身变长，速度逐渐加快
- 撞墙或撞到自己则游戏结束
- 登录后成绩自动保存到排行榜
- 未登录也可以玩游戏，但成绩不会保存

## 排行榜

- 登录用户游戏结束时成绩自动保存
- 排行榜保留前 15 名，按分数降序排列，同分按时间升序
- 数据存储在 SQLite 数据库中
- 排行榜前三名分别以金/银/铜色高亮

## API 接口

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/auth/register | 无 | 注册 |
| POST | /api/auth/login | 无 | 登录 |
| POST | /api/auth/logout | 需要 | 登出 |
| GET | /api/auth/me | 可选 | 当前用户状态 |
| GET | /api/leaderboard | 无 | 获取排行榜 |
| POST | /api/leaderboard | 需要 | 提交分数 |

## 技术实现

### 后端

- **Express**：Web 框架，处理路由和静态文件
- **better-sqlite3**：SQLite 数据库驱动，同步 API
- **express-session**：Session 管理
- **bcryptjs**：密码哈希

### 数据库

- 两张表：`users`（用户）和 `leaderboard`（排行榜）
- Session 持久化在 `sessions.db`，服务器重启不影响登录状态
- Cookie 有效期 7 天

### 游戏核心

- 基于 Canvas 2D 渲染，20×20 网格，每格 20px
- 使用 `setInterval` 驱动游戏循环，初始间隔 120ms
- 每吃一个食物速度提升 1ms，最快间隔不低于 50ms
- 食物随机生成在蛇身未占据的空闲格子上

### 数据迁移

如有旧的 `leaderboard.json` 数据，运行迁移脚本：

```bash
npm run migrate
```

迁移后原文件备份为 `leaderboard.json.bak`。

## 浏览器兼容

支持所有现代浏览器（Chrome、Firefox、Safari、Edge）。
