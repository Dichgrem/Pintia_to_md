# Pintia 题目导出工具

用于从 Pintia 平台导出题目集为 Markdown 文件。

## 功能特性

- 支持选择题、编程题、SQL编程题等多种题型
- 自动提取用户提交的答案
- 清理题目内容中的特殊标记
- 交互式选择要导出的题目集
- 简洁的 Markdown 格式输出

## 安装依赖

```bash
npm install
```

## 使用方法

### 1. 设置环境变量

```bash
export PINTIA_SESSION_ID="your_session_id"
```

**获取 Session ID：**
1. 登录 Pintia 网站
2. 打开浏览器开发者工具 (F12)
3. 切换到 Network 标签
4. 刷新页面
5. 找到任意请求，查看 Request Headers 中的 `Cookie: PTASession=xxx`
6. 复制 `PTASession` 后的值

### 2. 运行导出脚本

```bash
npm run export
```

或直接使用：

```bash
npx tsx export-selected.ts
```

### 3. 交互式选择

脚本会列出所有可用的题目集，你可以：
- 输入序号（如：`1,3,5`）选择特定的题目集
- 输入 `all` 导出所有题目集

示例输出：
```
找到 20 个题目集:

1. 题目集1 (ID: xxx)
2. 题目集2 (ID: xxx)
...

请选择要导出的题目集（输入序号，用逗号分隔，如: 1,3,5，或输入 'all' 导出全部）: 1,5,10
```

## 配置说明

### 环境变量

- `PINTIA_SESSION_ID`: Pintia 会话ID（必需）

### 命令行参数

暂不支持命令行参数，使用交互式选择。

## 文件结构

```
pintia-export/
├── export-selected.ts      # 主导出脚本
├── pintia-api.ts          # Pintia API 封装
├── types.ts               # 类型定义
├── package.json
├── tsconfig.json
└── README.md
```

## 输出格式

每个题目集导出为一个 Markdown 文件，格式如下：

```markdown
# 题目集名称

## 1. 题目标签 - 题目标题

### 题目

题目内容...

### 答案

```
答案内容
```

---
```

## 注意事项

- 请确保网络连接正常
- 某些题目可能没有用户答案（未提交）
- 题目内容会自动清理特殊标记和重复标题
- 导出过程中会有短暂延迟，避免请求过于频繁
- 导出的 `.md` 文件在 `.gitignore` 中被忽略，不会被提交

## 故障排除

### 提示"错误: 请设置环境变量 PINTIA_SESSION_ID"
确保已经设置了环境变量：
```bash
export PINTIA_SESSION_ID="your_session_id"
npm run export
```

### 提示"获取题目集失败"
- 检查 Session ID 是否正确
- 检查网络连接
- Session ID 可能已过期，需要重新获取

### 题目答案为空
- 该题目可能未提交
- 该题目类型不支持答案提取
