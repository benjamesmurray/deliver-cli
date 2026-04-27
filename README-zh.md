# Epoch Deliver CLI (交付版 CLI)

Epoch Deliver CLI 是一个专注于**端到端交付**的功能规格说明管理器。它强制执行结构化的工作流，将功能开发分为三个严格的阶段：**需求 (Requirements)**、**设计 (Design)** 和 **实现任务 (Implementation Tasks)**。

**Epoch Deliver CLI** 是一个专注于**端到端交付**的功能规格说明管理工具，专为 AI Agent 设计。3.0 (Agent-Optimized) 版本针对高密度、低 Token 通信进行了重新设计。

## 为什么选择 Deliver CLI v3?

传统的 AI 编码方法往往会导致范围蔓延和遗漏需求。`deliver-cli` (v3) 为高级 AI Agent 进行了优化：

*   **TOON 状态输出 (上下文效率):** `sc_status` 现在返回紧凑的 YAML 格式，而不是冗长的 Markdown。这使每轮的 Token 使用量减少了约 70%，保持上下文窗口精简。
*   **状态机驱动：** 工具确切知道项目处于哪个阶段。AI 不必跟踪是在做“需求”还是“设计”——它只需调用 `mcpx spec sc_plan`，工具就会自动处理转换。
*   **零开销执行：** 消除了子进程；MCP 服务器直接调用 CLI 逻辑，以获得最快速度和可靠的错误处理。
*   **极简语法：** 功能名称和项目标识符现在是可选的。工具默认使用上次使用的项目，减少了每次后续工具调用的有效载荷大小。
*   **GPS 导航系统：** 在每个工具调用结束时，`deliver-cli` 都会输出明确的“下一步”指令。

## TOON 格式 (v3 新特性)

`mcpx spec sc_status` 返回一个紧凑的块，而不是冗长的 Markdown：

```yaml
spec_status:
  feature: code-analytics
  phase: requirements
  status: drafting
  next_step: write Requirements.md
  blockers: [template_tags_present]
  mode: one-shot
```

## 核心工作流

1.  **Initialize (`sc_init`):** 在 `projects/active/` 目录下创建一个新的功能文件夹。
2.  **Draft:** AI 根据用户指令起草当前阶段的文档（需求、设计或任务）。
3.  **Approve (`sc_approve`):** 用户（或 AI 在 one-shot 模式下）审查并批准草案。
4.  **Plan (`sc_plan`):** 根据批准的文档自动脚手架（Scaffold）下一个阶段。
5.  **Implement (`sc_todo_*`):** 按照分解的任务进行逐一实现。

## 主要特性

*   **三个严格阶段：** 需求 -> 设计 -> 任务。在任务阶段之前，禁止编写任何业务逻辑代码。
*   **状态机驱动：** `mcpx spec sc_status` 工具提供实时的状态检查和清晰的“下一步”指令。
*   **GPS 导航系统：** 在每个工具调用结束时，`deliver-cli` 都会输出明确的“下一步”指令。例如，`sc_init` 会返回新创建的需求文件的绝对路径，并立即提示编写其内容。这使得工具像一个自动导航仪，极大减少了对冗长系统提示词的需求。
*   **Epoch 上下文管理：** 使用 `mcpx spec sc_epoch` 维护短期记忆（当前的重点、意图、假设和待答问题），确保 AI 在长时间任务中不迷失。
*   **One-Shot 与 Step-Through 模式：**
    *   **Step-Through (默认):** 在进入下一个阶段之前，必须经过显式的批准（Draft -> Approve -> Confirm）。
    *   **One-Shot:** AI 会自动在各个阶段之间切换，直到项目完成并归档。

## 快速参考 (工具列表)

| 工具名称 | 用途 | 参数示例 |
| :--- | :--- | :--- |
| `mcpx spec sc_init` | 在 `projects/active/` 中初始化新的功能规格说明。 | `{"name": "auth-system", "mode": "one-shot"}` |
| `mcpx spec sc_plan` | 推进工作流状态。完成后自动归档。 | `{"instruction": "Use PostgreSQL"}` |
| `mcpx spec sc_approve` | 在审查后显式批准当前起草的阶段。 | `{}` |
| `mcpx spec sc_feedback` | 提供用户反馈或回答问题。 | `{"feedback": "The logo should be blue"}` |
| `mcpx spec sc_status` | 获取活跃项目的健康检查和简洁的下一步指令。 | `{"feature": "auth-system"}` |
| `mcpx spec sc_todo_list` | 列出所有实现任务及其状态。 | `{}` |
| `mcpx spec sc_todo_start` | 将特定任务标记为正在进行中。 | `{"id": "1.1"}` |
| `mcpx spec sc_todo_complete` | 将特定任务标记为已完成。 | `{"id": "1.1"}` |
| `mcpx spec sc_epoch` | 更新任务的 Epoch 上下文。 | `{"focus": "Refactoring the auth layer"}` |
| `mcpx spec sc_mode` | 在 `one-shot` 和 `step-through` 之间切换项目模式。 | `{"mode": "one-shot"}` |

## 命令行参考

| 命令 | 描述 |
| :--- | :--- |
| `mcpx spec sc_init --name <name>` | 初始化新的功能规格说明。 |
| `mcpx spec sc_plan` | 推进工作流状态。 |
| `mcpx spec sc_approve` | 显式批准当前阶段。 |
| `mcpx spec sc_feedback --feedback <text>` | 提供用户反馈或答案。 |
| `mcpx spec sc_todo_list` | 列出实现任务。 |
| `mcpx spec sc_epoch --focus <text>` | 更新短期记忆上下文。 |
| `mcpx spec sc_mode <mode>` | 在 'one-shot' 和 'step-through' 之间切换。 |
| `mcpx spec sc_archive` | 手动归档项目。 |
| `mcpx spec sc_status` | 查看当前状态和下一步建议。 |

## 安装与设置

1.  克隆仓库。
2.  运行 `npm install`。
3.  使用 `npm link` 将 `spec` 命令链接到全局，或者直接使用 `node dist/cli.js`。

---
由 Epoch AI 团队荣誉出品。
