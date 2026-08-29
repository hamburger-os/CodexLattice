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

CodexLattice 根据任务和生命周期阶段，在规划、探索、执行和验证之间选择原生 Codex agent role。它首先尽量留在“接近最优质量”的区域内，再在满足质量约束的候选路线中选择成本更低、延迟更小的路线。质量是约束，成本只是次级排序因素。

> **当前版本：v0.2.6。** 安装与运行采用 fail-closed 策略：CodexLattice 会校验真实 Codex CLI、安装按路线固定模型/推理强度的原生角色、记录配置哈希，并在验证状态发生漂移时拒绝运行。

## 快速开始

前置要求：**Node.js >= 20**、**Codex CLI >= 0.149.0**。CodexLattice v0.2.6 已针对 Codex 0.149.1 做跨平台集成验证。

```bash
npm install -g @openai/codex
npm install -g https://github.com/hamburger-os/CodexLattice.git

codex-lattice install adaptive
codex-lattice doctor --strict
codex-lattice run "refactor authentication across three modules"
```

CodexLattice 不会静默安装或替换 Codex，也不会修改 Codex 的 sandbox / approval 设置。

## 它实际改变了什么

CodexLattice 不依赖 prompt 在 `spawn_agent` 时临时覆盖 `model` / `reasoning_effort`，而是安装原生、路线专用的角色，例如：

```text
lattice_plan_sol_high
lattice_explore_luna_low
lattice_execute_terra_medium
lattice_verify_sol_max
```

每个角色在自己的 Codex 配置文件中固定模型和推理强度；运行时选择准确的 `agent_type`。

```text
                    USER TASK
                       │
                       ▼
                ┌─────────────┐
                │ Task signals │
                └──────┬──────┘
                       │
                       ▼
                ┌──────────────┐
                │ Route policy │
                └──────┬───────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
      Luna           Terra            Sol
      轻量             平衡             深度
        │              │              │
        └──────────────┼──────────────┘
                       ▼
        PLAN → EXPLORE → EXECUTE → VERIFY
                       │
                       ▼
              Native Codex agents
```

## 为什么需要它

固定配方，例如“Sol 规划、Terra 编码、Sol 审查”，可能在简单任务上浪费强模型调用，同时在真正高风险任务上仍然投入不足。CodexLattice 使用阶段感知策略：

- **Plan：** 普通任务优先 Terra；高歧义、架构变化或高风险时升级到 Sol。
- **Explore：** 默认 Luna；只对相互独立的仓库问题做有界并行探索。
- **Execute：** 当预测质量仍接近上限时使用 Luna/Terra；有证据再升级。
- **Verify：** 先运行确定性检查；高风险、分歧或验证不完整时使用更强审查路线。
- **Critical ceiling：** 最大推理强度只用于关键规划/验证路径。
- **Fallback：** `single` 模式只移除 CodexLattice 管理的编排配置，将控制权交还用户原本的 Codex 配置。

## 优化目标

对于候选路线 `r`：

1. 估计任务与阶段条件下的质量 `Q(r | task, stage)`；
2. 找到预测质量上限 `Q*`；
3. 保留 `Q(r) >= Q* - δ` 的路线；
4. 在这些路线中先最小化名义成本，再最小化延迟；
5. 高风险任务令 `δ = 0`。

这是词典序优化：不会通过一个“成本权重”主动交换掉质量。当前质量模型刻意保持简单、可检查；`cost` 是排序指数，**不是账单估算器**。

## 运行前先看路由

```bash
codex-lattice explain "refactor authentication across three modules"
codex-lattice explain --trace "refactor authentication across three modules"
codex-lattice shadow "refactor authentication across three modules"
```

`explain` 展示生命周期各阶段的选择；`--trace` 展示完整候选集和淘汰原因；`shadow` 给出相对于 Sol-medium 单 agent 参考路线的反事实视图，但不会伪装成已测量的节省结论。

## 安装完整性

`codex-lattice install adaptive` 是一个安装事务，而不是简单写几行 TOML。它会：

1. 校验受支持的 `codex` 可执行文件；
2. 校验运行所需的 model/config override surface；
3. 备份已有 Codex 配置；
4. 保留用户无关的自定义 agent role；
5. 写入路线专用 native role 文件；
6. 在清晰边界的 managed block 中注册这些角色；
7. 让已安装的 Codex CLI 自己解析当前 `CODEX_HOME`；
8. 确认至少一个有效 multi-agent backend 已启用；
9. 把配置和 role 哈希写入安装 receipt；
10. 原生验证失败时自动回滚。

随时检查：

```bash
codex-lattice doctor --strict
```

如果安装 receipt 缺失/过期、managed block 被改动、role 文件被修改，或 Codex CLI 版本与验证时不同，`run` 会拒绝继续。

## 模式切换与卸载

```bash
# 暂停 CodexLattice 编排，但保留用户原本配置
codex-lattice mode single

# 重新启用并重新验证
codex-lattice mode adaptive

# 只移除 CodexLattice 管理的配置、角色文件和 receipt
codex-lattice uninstall
```

## 本地遥测（默认关闭）

Telemetry 默认关闭并且仅保存在本地。CodexLattice telemetry 不会写入原始任务文本。

```bash
codex-lattice telemetry on
codex-lattice telemetry status
codex-lattice telemetry summarize

codex-lattice feedback <run-id> pass
codex-lattice feedback <run-id> mixed "tests pass but implementation is too invasive"
```

评测与校准方法见 [`docs/evaluation.md`](docs/evaluation.md)。

## 当前证据边界

当前仓库对“安装与配置确实生效”的证明强于“路由一定提升最终任务效果”的证明。

CI 在 Linux、macOS、Windows 上运行单元/配置测试；真实 Codex smoke matrix 会安装 `@openai/codex@0.149.1`、全局安装 CodexLattice、创建临时 `CODEX_HOME`、要求 `doctor --strict` 通过、验证有效 multi-agent backend 与 GPT-5.6 路线 slug，执行 `single → adaptive`，并证明卸载后基线配置被恢复。

目前**不会声称**：

- heuristic quality 是校准后的概率；
- 多个廉价 agent 必然等价于一个更强模型；
- 固定百分比的成本节省或速度提升；
- 本地 model catalog 可见就代表账户一定拥有模型权限；
- CI 已进行认证/付费模型调用。

下一项关键工程里程碑是可复现 paired evaluation 与 calibration。见 [`docs/roadmap.md`](docs/roadmap.md) 和 [Issue #1](https://github.com/hamburger-os/CodexLattice/issues/1)。

## 文档

- [安装说明](docs/installation.md)
- [架构](docs/architecture.md)
- [评测协议](docs/evaluation.md)
- [研究笔记](docs/research-notes.md)
- [路线图](docs/roadmap.md)
- [贡献指南](CONTRIBUTING.md)
- [安全策略](SECURITY.md)
- [变更日志](CHANGELOG.md)

## 参与贡献

欢迎提交 bug、Codex 兼容性报告、路由策略建议、benchmark task 和聚焦的 Pull Request。提交前请阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

兼容性问题请附上操作系统、Node 版本、Codex 版本、CodexLattice 版本以及经过脱敏的 `doctor --strict` 输出。请勿发布 token、凭据或私人任务内容。

## License

Apache-2.0，见 [`LICENSE`](LICENSE)。

---

CodexLattice 是独立开源项目，与 OpenAI 不存在从属、赞助或官方背书关系。
