# Epoch Deliver CLI (交付版 CLI)

Epoch Deliver CLI 是一个专注于**端到端交付**的功能规格说明管理器。它强制执行结构化的工作流，将功能开发分为三个严格的阶段：**需求 (Requirements)**、**设计 (Design)** 和 **实现任务 (Implementation Tasks)**。

该工具旨在减少代理的上下文偏移，并确保在编写任何代码之前，技术设计和任务分解都经过了充分的验证。

## 核心工作流

1.  **Initialize (`sc_init`):** 在 `projects/active/` 目录下创建一个新的功能文件夹。
2.  **Draft:** AI 根据用户指令起草当前阶段的文档（需求、设计或任务）。
3.  **Approve (`sc_approve`):** 用户（或 AI 在 one-shot 模式下）审查并批准草案。
4.  **Plan (`sc_plan`):** 根据批准的文档自动脚手架（Scaffold）下一个阶段。
5.  **Implement (`sc_todo_*`):** 按照分解的任务进行逐一实现。

## 主要特性

*   **三个严格阶段：** 需求 -> 设计 -> 任务。在任务阶段之前，禁止编写任何业务逻辑代码。
*   **状态机驱动：** `spec sc_status` 工具提供实时的状态检查和清晰的“下一步”指令。
*   **GPS 导航系统：** 在每个工具调用结束时，`deliver-cli` 都会输出明确的“下一步”指令。例如，`sc_init` 会返回新创建的需求文件的绝对路径，并立即提示编写其内容。这使得工具像一个自动导航仪，极大减少了对冗长系统提示词的需求。
*   **Epoch 上下文管理：** 使用 `spec sc_epoch` 维护短期记忆（当前的重点、意图、假设和待答问题），确保 AI 在长时间任务中不迷失。
*   **One-Shot 与 Step-Through 模式：**
    *   **Step-Through (默认):** 在进入下一个阶段之前，必须经过显式的批准（Draft -> Approve -> Confirm）。
    *   **One-Shot:** AI 会自动在各个阶段之间切换，直到项目完成并归档。

## 快速参考 (工具列表)

| 工具名称 | 用途 | 参数示例 |
| :--- | :--- | :--- |
| `spec sc_init` | 在 `projects/active/` 中初始化新的功能规格说明。 | `{"name": "auth-system", "mode": "one-shot"}` |
| `spec sc_plan` | 推进工作流状态。完成后自动归档。 | `{"instruction": "Use PostgreSQL"}` |
| `spec sc_approve` | 在审查后显式批准当前起草的阶段。 | `{}` |
| `spec sc_feedback` | 提供用户反馈或回答问题。 | `{"feedback": "The logo should be blue"}` |
| `spec sc_status` | 获取活跃项目的健康检查和简洁的下一步指令。 | `{"feature": "auth-system"}` |
| `spec sc_todo_list` | 列出所有实现任务及其状态。 | `{}` |
| `spec sc_todo_start` | 将特定任务标记为正在进行中。 | `{"id": "1.1"}` |
| `spec sc_todo_complete` | 将特定任务标记为已完成。 | `{"id": "1.1"}` |
| `spec sc_epoch` | 更新任务的 Epoch 上下文。 | `{"focus": "Refactoring the auth layer"}` |
| `spec sc_mode` | 在 `one-shot` 和 `step-through` 之间切换项目模式。 | `{"mode": "one-shot"}` |

## 命令行参考

| 命令 | 描述 |
| :--- | :--- |
| `spec sc_init --name <name>` | 初始化新的功能规格说明。 |
| `spec sc_plan` | 推进工作流状态。 |
| `spec sc_approve` | 显式批准当前阶段。 |
| `spec sc_feedback --feedback <text>` | 提供用户反馈或答案。 |
| `spec sc_todo_list` | 列出实现任务。 |
| `spec sc_epoch --focus <text>` | 更新短期记忆上下文。 |
| `spec sc_mode <mode>` | 在 'one-shot' 和 'step-through' 之间切换。 |
| `spec sc_archive` | 手动归档项目。 |
| `spec sc_status` | 查看当前状态和下一步建议。 |

## 安装与设置

1.  克隆仓库。
2.  运行 `npm install`。
3.  使用 `npm link` 将 `spec` 命令链接到全局，或者直接使用 `node dist/cli.js`。

---
由 Epoch AI 团队荣誉出品。
