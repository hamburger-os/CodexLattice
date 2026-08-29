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

> **v0.3.0：** adaptive 模式改为透明生效。安装后，Codex 的普通 root turn 会通过 `UserPromptSubmit` hook 自动进入路由。`codex-lattice run` 仍保留给 CI / 调试 / 显式执行，但不再是普通聊天入口。

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

从此直接输入普通任务：

```text
重构三个模块里的 authentication 逻辑
```

不再需要 `codex-lattice run`、slash command、手工选择模型，也不需要针对每个项目额外配置路由。首次执行用户级 Hook 时，Codex 可能要求做一次 **Hook review / trust**；CodexLattice 不会替用户绕过这一步。

## 透明编排架构

Adaptive 安装会在用户的 `CODEX_HOME` 下管理三类资产：

- 路线专用的 native agent role，例如 `lattice_execute_terra_medium`、`lattice_verify_sol_max`；
- `hooks.json` 中一个带唯一 marker 的 `UserPromptSubmit` handler，与用户已有 Hook 合并而不是覆盖；
- `CODEX_HOME/codex-lattice/runtime/<version>/` 下的版本化、自包含 Hook runtime。

```text
普通用户 Prompt
      │
      ▼
UserPromptSubmit Hook
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

Subagent 的 `UserPromptSubmit` turn 会被直接忽略，避免 Lattice 递归路由。Hook 自身发生异常时也采用 fail-open：普通 Codex 仍然可以继续工作。

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

如需 CI / 调试中的显式执行，兼容入口仍然存在：

```bash
codex-lattice run "refactor authentication across three modules"
```

该子进程会带上 bypass 标记，因此透明 Hook 不会把同一个任务再次路由。

## 事务化安装

`codex-lattice install` 会校验 Codex、保留无关的配置/role/Hook、安装路线角色与版本化 Hook runtime、合并 managed Hook、让 Codex 自己解析结果、检查 multi-agent / hooks / model catalog 信号，并把所有受管理资产的哈希写入 receipt。

如果验证失败，受管理修改会自动回滚。`doctor --strict` 会检查 managed config block、role hash、Hook handler、runtime hash、Codex 版本、multi-agent backend、hooks feature 与本地模型目录。

CodexLattice 不会替用户写入 Codex 的 Hook trust state。

## 模式切换与卸载

```bash
# 关闭透明路由，恢复用户原本的 Codex 行为
codex-lattice mode single

# 重新启用透明 adaptive 编排
codex-lattice mode adaptive

# 只删除 CodexLattice 拥有的配置、Hook、role、runtime 与 receipt
codex-lattice uninstall
```

用户自己的 `hooks.json` handler 会被保留。Runtime 文件只有在 receipt hash 仍能证明所有权时才会被删除；若文件被改过，会保留而不是猜测性删除。

## Codex App

v0.3 针对 Codex CLI 与 Codex App 共享的用户级 Hook / config 层设计，因此桌面端的目标体验同样是：**打开 App，正常聊天即可。**

当前上游边界会明确记录：

- 用户级 Hook 可能需要 Codex 的一次性 review；
- Desktop 可能产生内部 non-resumable turn，因此默认跳过 `transcript_path` 明确为 `null` 的 turn；设置 `CODEX_LATTICE_ROUTE_EPHEMERAL=1` 可主动纳入；
- 当前 `UserPromptSubmit` classifier payload 不包含图片附件内容，所以多模态任务只能根据文字部分进行路由；
- 自动化 CI 能验证真实 Codex CLI 与共享配置，但完整 Desktop UI 验收仍属于单独的兼容性检查。

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

CI 在 Linux、macOS、Windows 上执行单元与配置测试。真实 Codex smoke matrix 会安装 `@openai/codex@0.149.1`、全局安装 CodexLattice、验证临时 `CODEX_HOME`、确认 multi-agent 与 hooks backend 以及 GPT-5.6 route slug、执行 `adaptive → single → adaptive`，并确认卸载后恢复基线。

项目**不会声称** heuristic quality 已经校准为概率、多个廉价 agent 必然等价于一个强模型、固定百分比的成本/速度收益、model catalog 可见就等于账户 entitlement、CI 已执行付费模型调用，或 CLI smoke 等价于对所有 Codex App UI 版本的完整验证。

## 文档

- [安装说明](docs/installation.md)
- [架构](docs/architecture.md)
- [Codex 兼容性](docs/compatibility.md)
- [Codex App 兼容性](docs/codex-app.md)
- [评测与校准](docs/evaluation.md)
- [路线图](docs/roadmap.md)
- [变更日志](CHANGELOG.md)

## License

Apache-2.0，见 [`LICENSE`](LICENSE)。

---

CodexLattice 是独立开源项目，与 OpenAI 不存在从属、赞助或官方背书关系。
