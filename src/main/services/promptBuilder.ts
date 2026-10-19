import type {
  AppState,
  CreateTaskInput,
  ExecutorRunRecord,
  ExpandPromptInput,
  ProjectRecord,
  TaskRecord
} from '../../shared/types.js';
import {
  DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET,
  DEFAULT_EXECUTOR_CONTINUE_RULES,
  DEFAULT_EXECUTOR_RUN_CORE_PRESET,
  DEFAULT_EXECUTOR_RUN_RULES,
  DEFAULT_PROMPT_CORE_PRESET,
  DEFAULT_PROMPT_RULES
} from '../../shared/promptPresets.js';

const RECENT_PROMPT_HISTORY_MESSAGES = 6;
const MAX_PROMPT_HISTORY_MESSAGE_CHARS = 3500;
const MAX_OLDER_HISTORY_ITEM_CHARS = 600;
const MAX_OLDER_HISTORY_SUMMARY_CHARS = 5000;
const MAX_REQUIREMENT_CHARS = 12000;
const MAX_EXECUTION_ISSUE_CHARS = 14000;
const MAX_CONTINUE_FEEDBACK_CHARS = 10000;
const RECENT_CONTINUE_RUNS = 3;

function projectBlock(project: ProjectRecord) {
  const summary = project.summary;
  if (!summary) {
    return `Project: ${project.name}\nPath: ${project.path}\nNo project summary is available yet.`;
  }

  return [
    `Project: ${project.name}`,
    `Path: ${project.path}`,
    `Stack: ${summary.detectedStack.join(', ') || 'unknown'}`,
    `Package manager: ${summary.packageManager || 'unknown'}`,
    `Important directories: ${summary.importantDirectories.join(', ') || 'none detected'}`,
    `Scripts:\n${Object.entries(summary.scripts)
      .slice(0, 16)
      .map(([name, script]) => `- ${name}: ${script}`)
      .join('\n')}`,
    `Docs:\n${summary.documentFiles.map((doc) => `- ${doc}`).join('\n') || '- none detected'}`,
    `Notes:\n${summary.notes.map((note) => `- ${note}`).join('\n')}`
  ].join('\n\n');
}

function conversationHistoryBlock(conversation: AppState['conversations'][number] | undefined) {
  const messages = conversation?.promptMessages || [];
  if (messages.length === 0) {
    return conversation?.expandedPrompt ? `assistant: ${clipBlock(conversation.expandedPrompt, MAX_EXECUTION_ISSUE_CHARS)}` : '无';
  }
  const olderMessages = messages.slice(0, -RECENT_PROMPT_HISTORY_MESSAGES);
  const recentMessages = messages.slice(-RECENT_PROMPT_HISTORY_MESSAGES);
  const olderSummary = olderMessages.length > 0
    ? [
        `以下是较早对话的压缩摘要，共 ${olderMessages.length} 条。它们只作为背景，最近对话优先：`,
        clipBlock(
          olderMessages
            .map((message, index) => {
              const role = message.role === 'user' ? '用户' : '助手';
              const content = clipBlock(message.content, MAX_OLDER_HISTORY_ITEM_CHARS).replace(/\n{3,}/g, '\n\n');
              return `${index + 1}. ${role}：${content}`;
            })
            .join('\n\n'),
          MAX_OLDER_HISTORY_SUMMARY_CHARS
        )
      ].join('\n')
    : '';
  const recentBlock = recentMessages
    .map((message) => `${message.role === 'user' ? '用户' : '助手'}：\n${message.content}`)
    .map((block) => clipBlock(block, MAX_PROMPT_HISTORY_MESSAGE_CHARS))
    .join('\n\n---\n\n');
  return [olderSummary, recentBlock].filter(Boolean).join('\n\n--- 最近对话原文 ---\n\n');
}

function promptCorePresetBlock(state: AppState) {
  const preset = state.settings?.promptCorePreset?.trim();
  return preset || DEFAULT_PROMPT_CORE_PRESET;
}

function settingsPromptRulesBlock(state: AppState) {
  const rules = state.settings?.promptRules?.trim();
  return rules || DEFAULT_PROMPT_RULES;
}

function promptQuestionLimit(state: AppState) {
  const rules = settingsPromptRulesBlock(state);
  const match = rules.match(/最多\s*(?:问|提出|输出)?\s*([0-9一二三四五六七八九十]+)\s*个/);
  if (!match) return 3;
  const parsed = parseQuestionLimit(match[1]);
  return parsed && parsed > 0 ? Math.min(parsed, 10) : 3;
}

function parseQuestionLimit(value: string) {
  const numberValue = Number(value);
  if (Number.isFinite(numberValue)) return numberValue;
  const chineseNumberMap: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (chineseNumberMap[value.slice(1)] || 0);
  if (value.endsWith('十')) return (chineseNumberMap[value.slice(0, 1)] || 0) * 10;
  if (value.includes('十')) {
    const [tens, ones] = value.split('十');
    return (chineseNumberMap[tens] || 1) * 10 + (chineseNumberMap[ones] || 0);
  }
  return chineseNumberMap[value];
}

function executorRunCorePresetBlock(state: AppState) {
  const preset = state.settings?.executorRunCorePreset?.trim();
  return preset || DEFAULT_EXECUTOR_RUN_CORE_PRESET;
}

function executorRunRulesBlock(state: AppState) {
  const rules = state.settings?.executorRunRules?.trim();
  return rules || DEFAULT_EXECUTOR_RUN_RULES;
}

function executorContinueCorePresetBlock(state: AppState) {
  const preset = state.settings?.executorContinueCorePreset?.trim();
  return preset || DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET;
}

function executorContinueRulesBlock(state: AppState) {
  const rules = state.settings?.executorContinueRules?.trim();
  return rules || DEFAULT_EXECUTOR_CONTINUE_RULES;
}

export function buildTaskExecutionPrompt(input: CreateTaskInput, state: AppState) {
  const project = state.projects.find((item) => item.id === input.projectId);
  const conversation = input.conversationId
    ? state.conversations.find((item) => item.id === input.conversationId)
    : undefined;

  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  const sourcePrompt = clipBlock(input.executionPrompt || conversation?.expandedPrompt || input.description, MAX_EXECUTION_ISSUE_CHARS);
  const sourcePromptTitle = input.workflowMode === 'quick-change' ? '快速修改执行说明' : 'Prompt 模块扩写结果';

  return `${executorRunCorePresetBlock(state)}

## 工作方式
${executorRunRulesBlock(state)}

## 项目上下文
${projectBlock(project)}

## Memory 策略
本次执行未自动附加 Memory。只根据当前 issue、项目上下文、附件和用户反馈工作。

## 任务标题
${input.title}

## 原始需求
${clipBlock(input.description, MAX_REQUIREMENT_CHARS)}

## ${sourcePromptTitle}
${sourcePrompt}

## 附件处理要求
- 如果上面的 issue 包含附件引用，优先使用 issue 中的绝对路径读取附件。
- 如果附件内容已经内嵌在 issue 中，也要把它作为需求依据。
- 不要因为聊天界面只显示文件名就忽略附件；执行时以 issue 中的“附件参考”或“相关附件”字段为准。

## 执行步骤建议
1. 快速识别相关页面、组件、hooks、接口、配置或附件路径。
2. 说明你计划修改的文件和原因。
3. 执行最小必要修改。
4. 做可行的验证。
5. 输出最终报告。

## 最终报告格式
请使用以下结构：

### 修改摘要
- ...

### 涉及文件
- ...

### 验证结果
- ...

### 风险与后续
- ...
`;
}

function clipBlock(value: string | undefined, limit = 12000) {
  const text = value?.trim();
  if (!text) return '无';
  return text.length > limit ? `${text.slice(0, limit)}\n\n...内容过长，已截断。` : text;
}

function isExplicitNewRequirement(feedback: string) {
  const normalized = feedback.replace(/\s+/g, '');
  return [
    '这是新需求',
    '这是一个新需求',
    '新的需求',
    '新需求',
    '新功能',
    '另一个需求',
    '另外一个需求',
    '和上一个无关',
    '和原需求无关',
    '不基于之前',
    '抛弃之前'
  ].some((signal) => normalized.includes(signal));
}

function runBrief(run: ExecutorRunRecord, index: number) {
  const lines = [
    `${index + 1}. ${run.status}${run.error ? `，错误：${run.error}` : ''}`,
    run.feedback?.trim() ? `用户输入：${clipBlock(run.feedback, 1200)}` : '',
    `执行结论：${clipBlock(run.summary || run.output, 1800)}`
  ].filter(Boolean);
  return lines.join('\n');
}

function continueDialogueContext(runs: ExecutorRunRecord[] | undefined) {
  const history = (runs || []).filter((run) => run.feedback?.trim() || run.summary?.trim() || run.output.trim());
  if (history.length === 0) return '无';
  const recentRuns = history.slice(0, RECENT_CONTINUE_RUNS);
  const olderRuns = history.slice(RECENT_CONTINUE_RUNS, 10);
  const olderSummary = olderRuns.length > 0
    ? [
        `较早执行记录压缩摘要，共 ${olderRuns.length} 条，只作为背景：`,
        olderRuns
          .map((run, index) => {
            const userInput = run.feedback?.trim() ? `；用户输入：${clipBlock(run.feedback, 240).replace(/\n/g, ' ')}` : '';
            const result = clipBlock(run.summary || run.output, 320).replace(/\n/g, ' ');
            return `${index + 1}. ${run.status}${userInput}；结论：${result}`;
          })
          .join('\n')
      ].join('\n')
    : '';
  const recentBlock = [
    `最近 ${recentRuns.length} 轮保留原文，越靠前越新：`,
    recentRuns.map(runBrief).join('\n\n---\n\n')
  ].join('\n');
  return [olderSummary, recentBlock].filter(Boolean).join('\n\n--- 最近执行原文 ---\n\n');
}

export function buildTaskContinuationPrompt(input: {
  task: TaskRecord;
  state: AppState;
  latestRun?: ExecutorRunRecord;
  taskRuns?: ExecutorRunRecord[];
  feedback: string;
  gitStatus: string;
  gitDiff: string;
}) {
  const project = input.state.projects.find((item) => item.id === input.task.projectId);
  if (!project) {
    throw new Error(`Project not found: ${input.task.projectId}`);
  }
  const explicitNewRequirement = isExplicitNewRequirement(input.feedback);
  const quickChangeBoundary = input.task.workflowMode === 'quick-change'
    ? [
        '## 快速修改边界',
        '- 本轮反馈默认视为同一个小改动的继续调整，保持最小修改范围。',
        '- 如果反馈已经变成新功能，或涉及跨项目、架构重构、数据迁移、安全策略、破坏性 API 变更，不要继续修改文件。',
        '- 需要升级时，在回复第一行输出“[建议转为标准任务]”，并列出需要补充的背景、范围和验收标准。'
      ].join('\n')
    : '';
  const historyBlock = explicitNewRequirement
    ? [
        '## 历史上下文处理',
        '用户本轮输入明确声明这是新需求。原始 issue、旧 Continue 历史、上一次执行目标和上一次执行结果已从本次 prompt 中移除；不要尝试回忆或延续旧目标。'
      ].join('\n')
    : [
        '## 当前 issue 摘要',
        `标题：${input.task.title}`,
        '',
        '描述：',
        clipBlock(input.task.description, 5000),
        '',
        '执行 issue：',
        clipBlock(input.task.executionPrompt, 7000),
        '',
        '## Continue 对话历史',
        continueDialogueContext(input.taskRuns)
      ].join('\n');

  return `${executorContinueCorePresetBlock(input.state)}

## 工作方式
${executorContinueRulesBlock(input.state)}

## 上下文优先级
1. 本轮 Continue 输入最高优先级。
2. 当前项目代码和当前 git diff 第二优先级。
3. 最近 Continue 对话原文第三优先级。
4. 当前 issue 摘要第四优先级。
5. 较早执行记录摘要只作为背景。

## Continue 处理原则
- 如果本轮输入明确声明是新需求：完全抛弃原始 issue 和上一次执行结果，不受旧目标约束；只基于当前项目代码、当前工作区状态和本轮输入处理。
- 如果本轮输入没有明确声明新需求：像 Codex 同一对话一样处理，优先理解最新输入，再结合最近几轮 Continue 原文和当前 issue 摘要继续推进。
- 当前 git diff 只能说明工作区现状；在新需求场景下，它不是需求约束，不要为了保留旧改动而牺牲新需求目标。
- 修正/补完场景下，已经被用户明确验证通过的改动不要动；用户反馈指出有问题的已有实现可以直接修改、替换或删除。
- 如果只是提问或分析，先回答问题；除非用户明确要求修改代码，否则不要主动改代码。
- 不要为了保留错误实现而继续往上叠逻辑；优先把当前已有实现改正确。
- 本轮修改或回答必须围绕用户输入收敛，不要扩展无关范围。

${quickChangeBoundary}

## 项目上下文
${projectBlock(project)}

## Memory 策略
本次 Continue 未自动附加 Memory。根据本轮输入类型决定是否使用历史上下文：明确新需求时不使用历史 issue 和历史运行结果；普通修正/补完时使用“最近原文 + 较早摘要”的对话式上下文。

${historyBlock}

## 当前已有改动
Git status:
${clipBlock(input.gitStatus, 4000)}

Git diff:
${clipBlock(input.gitDiff, 18000)}

## 本轮 Continue 输入
${clipBlock(input.feedback, MAX_CONTINUE_FEEDBACK_CHARS)}

## 本轮目标
先判断本轮输入是提问分析、当前 issue 的修正/补完，还是用户明确声明的新需求；然后按上面的上下文优先级处理。完成后输出：

### 修改摘要
- ...

### 涉及文件
- ...

### 验证结果
- ...

### 风险与后续
- ...
`;
}

export function buildExecutorResultSummaryPrompt(input: {
  task: TaskRecord;
  state: AppState;
  run: ExecutorRunRecord;
  baselineGitStatus: string;
  baselineGitDiff: string;
  gitStatus: string;
  gitDiff: string;
}) {
  return `你是一个执行结果总结助手。请基于用户的原始任务/本轮反馈、本地项目执行记录、执行前后 git diff 对比，生成一份给用户看的中文回复。

## 总结规则
- 只做总结，不要修改任何文件。
- 第一优先级是回应用户真正想知道或想完成的事：如果原始任务或本轮反馈是提问、排查、方案确认、原因分析，就要直接回答问题，而不是只总结代码改动。
- 如果本次 Executor 有新增或改变代码，再补充说明本次改了什么；执行前已经存在的 git diff / 未提交改动不要当成本次改动总结。
- 如果本轮主要是阅读、分析、回答问题，没有看到本次新增的明确代码改动，可以直接给出分析结论，不要硬凑“改了哪些地方”。
- 如果执行前和执行后的 diff 很接近，请结合 Codex 原始输出判断本次实际做了什么；无法确认时重点复述可确认的回答或分析结论。
- 不要输出原始日志、代码片段、diff、文件全文或终端噪声。
- 不要编造未发生的改动或结论。
- 输出要简洁、可读，方便用户理解答案或继续验证页面表现。
- 不要输出“风险”“后续风险”“未完成风险”等章节。

## 输出方式
- 用自然语言回答，不要使用固定的三段式标题。
- 可以写成 1 到 3 个短段落，必要时用少量项目符号，但不要像周报或模板报告。
- 根据用户任务类型自然组织内容：提问型任务先给答案；改代码型任务说明本次处理和验证方式；两者都有时先回答问题再说明改动。
- 开头直接说结果，不要写“结果总结”“本次处理了什么”这类标题。

## 任务标题
${input.task.title}

## 任务描述
${clipBlock(input.task.description, MAX_REQUIREMENT_CHARS)}

## 执行 Issue
${clipBlock(input.task.executionPrompt, MAX_EXECUTION_ISSUE_CHARS)}

## 执行状态
状态：${input.run.status}
错误：${input.run.error || '无'}

## 用户本轮 Continue 反馈
${clipBlock(input.run.feedback, MAX_CONTINUE_FEEDBACK_CHARS)}

## Codex 原始输出
${clipBlock(input.run.output, 12000)}

## 执行前 Git 状态
${clipBlock(input.baselineGitStatus, 4000)}

## 执行前 Git Diff
${clipBlock(input.baselineGitDiff, 12000)}

## 执行后 Git 状态
${clipBlock(input.gitStatus, 4000)}

## 执行后 Git Diff
${clipBlock(input.gitDiff, 18000)}
`;
}

export function buildStaticPrompt(input: ExpandPromptInput, state: AppState) {
  const project = state.projects.find((item) => item.id === input.projectId);
  const conversation = input.conversationId
    ? state.conversations.find((item) => item.id === input.conversationId)
    : undefined;

  if (!project) {
    throw new Error(`Project not found: ${input.projectId}`);
  }

  return `${promptCorePresetBlock(state)}

## 规则
${settingsPromptRulesBlock(state)}

## 项目上下文
${projectBlock(project)}

## Memory 策略
本次需求澄清未自动附加 Memory。只根据项目上下文、对话历史、本轮输入和附件判断需求是否清楚。

## 当前需求标题
${conversation?.title || '未命名需求'}

## 对话历史
${conversationHistoryBlock(conversation)}

## 本轮用户输入
${clipBlock(input.requirement, MAX_REQUIREMENT_CHARS)}

## 请输出
如果信息不足，请只输出关键问题，问题数量必须遵循上方“规则”中的限制。

如果信息足够，请输出以下格式：

## Issue

### 目标
- ...

### 范围
- ...

### 不做什么
- ...

### 约束
- ...

### 附件参考
- 文件名：
- 绝对路径：
- 用途摘要：
- 关键片段或结构说明：

### 验收标准
- ...
`;
}

export function buildPromptFallback(input: ExpandPromptInput, state: AppState, error?: string) {
  const project = state.projects.find((item) => item.id === input.projectId);
  const conversation = input.conversationId
    ? state.conversations.find((item) => item.id === input.conversationId)
    : undefined;
  const projectName = project?.name || '当前项目';
  const requirement = input.requirement.trim() || conversation?.requirement || '当前需求';
  const hasHistory = Boolean(conversation?.promptMessages?.some((message) => message.role === 'assistant'));
  const questionLimit = promptQuestionLimit(state);
  const fallbackQuestions = [
    '这次需求最终希望用户看到或感受到的结果是什么？',
    '这次修改明确包含哪些页面、模块、数据或交互范围？哪些内容不应该改？',
    '你希望用什么现象作为验收标准，来判断这个需求已经完成？',
    '是否有必须遵守的业务规则、权限边界、兼容范围或设计稿要求？',
    '是否有相关接口、数据来源、缓存策略或历史问题需要一起参考？',
    '是否有明确不允许改动的文件、模块、流程或交互？',
    '这次改动是否需要覆盖 PC/H5/多端、多项目或多角色场景？',
    '是否有附件、PRD、TAPD 缺陷链接或截图需要作为需求依据？',
    '完成后是否需要运行特定验证命令，或只由你通过页面表现验收？',
    '如果存在旧数据或兼容历史记录，期望如何迁移、清理或保留？'
  ].slice(0, questionLimit);

  return [
    `我现在还不能稳定调用 Codex CLI 来完成深度理解${error ? `（${error}）` : ''}，先按本地规则给出需要确认的关键问题：`,
    '',
    `当前项目：${projectName}`,
    `当前输入：${requirement}`,
    '',
    ...fallbackQuestions.map((question, index) => `${index + 1}. ${question}`),
    '',
    hasHistory
      ? `你可以直接回答这 ${fallbackQuestions.length} 点，我会继续整理成给 Codex 执行看的 issue。`
      : '回答后我会继续整理成给 Codex 执行看的 issue。'
  ].join('\n');
}
