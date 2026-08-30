<div align="center">
  <img src="assets/brand/banner.svg" alt="CodexLattice — 面向 Codex 的质量优先推理资源编排" width="100%" />
</div>

<div align="center">

[English](README.md) · [简体中文](README.zh-CN.md)

[![CI](https://github.com/hamburger-os/CodexLattice/actions/workflows/ci.yml/badge.svg)](https://github.com/hamburger-os/CodexLattice/actions/workflows/ci.yml)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)
![Codex](https://img.shields.io/badge/Codex-%3E%3D0.149.0-111827)

</div>

# CodexLattice

**面向 Codex 的质量优先推理资源编排器，使用 GPT-5.6 Sol、Terra 与 Luna。**

CodexLattice 为规划、探索、执行和验证选择原生 Codex agent role。它先保留预测质量接近最优的候选集合，再在其中优先选择成本更低、延迟更小的路线。质量是约束，成本是次级排序因素。

> **v0.3.1：** adaptive 仍然是透明模式：安装一次，之后正常使用 Codex 聊天。本补丁重点加强恢复能力与 Hook 信任边界：把 adaptive capability 与高级 `run` capability 分开、确保 adaptive 专用能力损坏时仍能切到 `single`，并让被 Codex review 的 Hook command 在加载任何路由代码前绑定并校验 runtime manifest 的 SHA-256。

## 快速开始

前置要求：**Node.js >= 20**、**Codex CLI >= 0.149.0**。发布矩阵针对 Codex 0.149.1 做真实安装验证。

```bash
npm install -g @openai/codex
npm install -g https://github.com/hamburger-os/CodexLattice.git

codex-lattice install
codex-lattice doctor --strict

# 之后正常使用 Codex 即可。
codex
```

### 不通过 npm 的本地维护入口（Windows）

如果你保留了本仓库检出，不需要把 CodexLattice 发布或安装为 npm 包。直接使用随仓库提供的启动器：

```powershell
cd <CodexLattice 仓库根目录>
.\bin\codex-lattice.cmd doctor --strict
.\bin\codex-lattice.cmd mode adaptive
.\bin\codex-lattice.cmd mode single
```

启动器会使用系统 Node.js，并自动发现版本化的 Codex Desktop 可执行文件；无需依赖 npm 的全局 `codex` 或 `codex-lattice` shim。

从此直接输入普通任务：

```text
重构三个模块里的 authentication 逻辑
```

不再需要 `codex-lattice run`、slash command、手工选择模型，也不需要针对每个项目额外配置路由。首次执行用户级 Hook 时，Codex 可能要求做一次 **Hook review / trust**；CodexLattice 不会替用户绕过这一步。

## 透明编排架构

Adaptive 安装会在用户的 `CODEX_HOME` 下管理三类资产：

- 路线专用的 native agent role，例如 `lattice_execute_terra_medium`、`lattice_verify_sol_max`；
- `hooks.json` 中一个带唯一 marker 的 `UserPromptSubmit` handler，与用户已有 Hook 合并而不是覆盖；
- `CODEX_HOME/codex-lattice/runtime/<version>/` 下的版本化、自包含 Hook runtime 与完整性 manifest。

```text
普通用户 Prompt
      │
      ▼
UserPromptSubmit Hook
      │
      ▼
可信 Bootstrap
校验 manifest + runtime hash
      │
      ▼
 buildPlan(task)
      │
      ▼
派生的路由元数据
      │
      ▼
 Root Coordinator
      │
      ├── PLAN
      ├── EXPLORE
      ├── EXECUTE
      └── VERIFY
           │
           ▼
    Native Codex Roles
    Luna / Terra / Sol
```

JavaScript policy 仍然是路由权威。Hook 注入 developer context 的只有**派生路由元数据与 coordinator 规则**，不会把原始用户 prompt 复制到 developer context。对于需要仓库、工具、代码修改或测试的任务，root 被要求协调精确选中的 route-specific agent，而不是自己重新猜模型。

Subagent 的 `UserPromptSubmit` turn 会被直接忽略，避免 Lattice 递归路由。Hook 自身发生异常时也采用 fail-open：普通 Codex 仍然可以继续工作。Codex 原生的 collaboration mode、sandbox 与 approval 约束始终拥有更高优先级；Hook 的 `permission_mode` 只作为审批元数据，不会被 CodexLattice 猜测为 Plan mode。

### Hook trust 与 runtime 绑定

Hook 的 review / trust 由 Codex 自己管理；CodexLattice 不会写 trusted-hook state。v0.3.1 加强的是“被 review 的命令究竟会执行什么”：Hook command 会固定安装时的 Node executable，并携带一个很小的内联校验 bootstrap、runtime manifest 路径以及该 manifest 的 SHA-256。

在 import 路由 runner 之前，bootstrap 会校验 manifest digest，再校验 manifest 中列出的每一个可执行 runtime 文件。如果任一校验失败，被改动的 runtime **不会被加载**，Hook 会 fail-open，让普通 Codex 会话继续可用；而 `codex-lattice doctor --strict` 会把这种状态判为不健康，并额外通过真实安装命令发送一次不调用模型的 synthetic `UserPromptSubmit`，只有实际返回路由 context 才认为透明路由健康。

## 路由目标

对每个阶段与候选路线 `r`：

1. 估计任务条件下的质量 `Q(r | task, stage)`；
2. 找到预测质量上限 `Q*`；
3. 保留 `Q(r) >= Q* - δ` 的路线；
4. 在集合内先最小化名义成本，再最小化延迟；
5. 高风险任务令 `δ = 0`。

当前 quality 值是透明的 seed heuristic，不是校准后的概率；`cost` 是排序指数，不是账单估算器。

典型策略：

- **Plan：** 普通任务优先 Terra；高歧义、架构变化或更高风险时使用 Sol。
- **Explore：** 默认 Luna；只对相互独立的问题做有界并行。
- **Execute：** 当预测质量仍接近上限时使用 Luna/Terra；有证据再升级。
- **Verify：** 确定性检查优先；高风险或验证不完整时使用更强的独立审查。

## 查看路由但不执行任务

```bash
codex-lattice explain "refactor authentication across three modules"
codex-lattice explain --trace "refactor authentication across three modules"
codex-lattice shadow "refactor authentication across three modules"
```

## 事务化安装

`codex-lattice install` 会校验基础 Codex、保留无关的配置/role/Hook、安装路线角色与版本化 Hook runtime、生成 runtime manifest、合并 managed Hook、让 Codex 自己解析结果、检查 adaptive 所需的 multi-agent / hooks / model catalog 信号，并通过真实 Hook command 做一次 synthetic 无模型执行检查，再把所有受管理资产的哈希写入 receipt。

如果验证失败，受管理修改会自动回滚。`doctor --strict` 会检查 managed config block、role hash、Hook handler、runtime hash、Codex 版本、adaptive backend，以及真实 Hook command 是否能够在完整性校验后返回路由 context。

Adaptive 重装会保留 `hooks.json` 在首次安装前是否已经存在的原始 ownership 状态，因此卸载仍然精确可逆。版本升级时，仍保持 receipt 哈希的旧 runtime 会被安全清理；如果旧 runtime 文件曾被外部修改，则会保留而不是猜测性删除。

CodexLattice 不会替用户写入 Codex 的 Hook trust state。

## Capability 分层、模式切换与恢复

v0.3.1 把不同用途需要的能力明确分开：

- **基础 Codex capability：** 安装和恢复所需；
- **透明 adaptive capability：** 额外要求 native multi-agent、hooks、路线 role 与可信 runtime 正常；
- **高级显式 `run` capability：** 单独要求 `codex exec --model` / config override，这些只服务于高级兼容入口。

因此，上游即使修改了高级 `run` 的 CLI flags，也不会拖死普通透明安装。更重要的是：即使 multi-agent、hooks、model catalog 或显式 `run` surface 出现故障，`mode single` 仍然可以作为恢复路径，不会因为“adaptive 已坏”而无法关闭 adaptive。

```bash
# 关闭透明路由，恢复用户原本的 Codex 行为
codex-lattice mode single

# 重新启用透明 adaptive 编排
codex-lattice mode adaptive

# 只删除 CodexLattice 拥有的配置、Hook、role、runtime 与 receipt
codex-lattice uninstall
```

用户自己的 `hooks.json` handler 会被保留。Runtime 文件只有在 receipt hash 仍能证明所有权时才会被删除；若文件被改过，会保留而不是猜测性删除。

## 高级显式执行

如需 CI / 调试中的显式执行，兼容入口仍然存在：

```bash
codex-lattice run "refactor authentication across three modules"
```

该路径会单独检查它自己依赖的 `codex exec` runtime override surface，并给子进程带上 bypass 标记，因此透明 Hook 不会把同一个任务再次路由。它不是普通聊天的前置要求。

## Codex App

v0.3 针对 Codex CLI 与 Codex App 共享的用户级 Hook / config 层设计，因此桌面端的目标体验同样是：**打开 App，正常聊天即可。**

当前上游边界会明确记录：

- 用户级 Hook 可能需要 Codex 的一次性 review；
- Desktop 可能产生内部 non-resumable turn，因此默认跳过 `transcript_path` 明确为 `null` 的 turn；设置 `CODEX_LATTICE_ROUTE_EPHEMERAL=1` 可主动纳入；
- 当前 `UserPromptSubmit` classifier payload 不包含图片附件内容，所以多模态任务只能根据文字部分进行路由；
- 自动化 CI 能验证真实 Codex CLI 与共享配置/Hook/runtime contract，但完整 Desktop UI 验收仍属于单独的兼容性检查。

详见 [`docs/codex-app.md`](docs/codex-app.md)。

## 本地遥测（默认关闭）

Telemetry 默认关闭，仅保存在本地，而且不会写入原始任务文本。

```bash
codex-lattice telemetry on
codex-lattice telemetry status
codex-lattice telemetry summarize
codex-lattice feedback <run-id> pass
```

评测与校准协议见 [`docs/evaluation.md`](docs/evaluation.md)。

## 证据边界

CI 在 Linux、macOS、Windows 上执行单元与配置测试。真实 Codex smoke matrix 会安装 `@openai/codex@0.149.1`、全局安装 CodexLattice、验证临时 `CODEX_HOME`、确认 adaptive 模式的 multi-agent 与 hooks backend 以及 GPT-5.6 route slug、执行 manifest-bound 可信 Hook command、覆盖包含空格的 `CODEX_HOME` 路径、执行 `adaptive → single → adaptive`，并确认卸载后恢复基线。

项目**不会声称** heuristic quality 已经校准为概率、多个廉价 agent 必然等价于一个强模型、固定百分比的成本/速度收益、model catalog 可见就等于账户 entitlement、CI 已执行付费模型调用，或 CLI smoke 等价于对所有 Codex App UI 版本的完整验证。

## 文档

- [安装说明](docs/installation.md)
- [架构](docs/architecture.md)
- [Codex 兼容性](docs/compatibility.md)
- [Codex App 兼容性](docs/codex-app.md)
- [评测与校准](docs/evaluation.md)
- [研究说明](docs/research-notes.md)
- [路线图](docs/roadmap.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [变更日志](CHANGELOG.md)

## License

Apache-2.0，见 [`LICENSE`](LICENSE)。

---

CodexLattice 是独立开源项目，与 OpenAI 不存在从属、赞助或官方背书关系。
