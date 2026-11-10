# Little Fun Sync API

Spring Boot 同步服务，默认端口 **8081**（避开本机已有 8080 服务）。

## 接口

- `GET /api/v1/health`
- `POST /api/v1/auth/register` `{ "email", "password" }`
- `POST /api/v1/auth/login` `{ "email", "password" }`
- `POST /api/v1/sync/push` Bearer JWT，body: `{ "changes": [...] }`
- `GET /api/v1/sync/changes?since=2024-01-01T00:00:00Z` Bearer JWT

管理后台页面：`/admin`。默认管理员由 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 在首次启动时创建（默认 `admin@focusdesk.local` / `FocusAdmin123`）。已存在的账号不会被改密码，只会补上管理员角色。

管理接口（需管理员 JWT）：

- `POST /api/v1/admin/login`
- `GET /api/v1/admin/overview`
- `GET /api/v1/admin/users?q=`
- `DELETE /api/v1/admin/users/{id}`
- `POST /api/v1/admin/users/{id}/password` `{ "password" }`
- `GET /api/v1/admin/records?userId=&collection=&q=&page=&size=`
- `DELETE /api/v1/admin/records/{id}`

`collection` 支持：`projects` `subprojects` `items` `today_slots` `today_completions` `daily_marks` `work_logs` `idea_tags`

每条变更用客户端 `clientId`（建议 UUID）标识；冲突策略为后写覆盖（LWW），更旧的 push 会返回 `rejected_stale`。

## 本地运行

```bash
export DB_URL='jdbc:mysql://127.0.0.1:3306/focus_desk?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai'
export DB_USER=focus_desk
export DB_PASSWORD='...'
export JWT_SECRET='至少32字节的随机串'
mvn spring-boot:run
```

## 生产

用 systemd 环境变量注入 `DB_*` / `JWT_SECRET`，监听 `8081`。
