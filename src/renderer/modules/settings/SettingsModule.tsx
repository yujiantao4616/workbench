import { useEffect, useRef, useState } from 'react';
import {
  Bot,
  CalendarDays,
  Check,
  ChevronLeft,
  type LucideIcon,
  Monitor,
  Moon,
  Palette,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
  Sun
} from 'lucide-react';
import clsx from 'clsx';
import { Button, IconButton, SectionTitle } from '../../components/ui';
import { applyThemeColor } from '../../lib/workflow';
import type { AnalyticsEventRecord, AppSettings, CodexReasoningEffort, ThemeMode } from '../../../shared/types';
import {
  DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET,
  DEFAULT_EXECUTOR_CONTINUE_RULES,
  DEFAULT_EXECUTOR_RUN_CORE_PRESET,
  DEFAULT_EXECUTOR_RUN_RULES,
  DEFAULT_PROMPT_CORE_PRESET,
  DEFAULT_PROMPT_RULES,
  DEFAULT_WEEKLY_REPORT_CORE_PRESET,
  DEFAULT_WEEKLY_REPORT_RULES
} from '../../../shared/promptPresets';

const DEFAULT_CODEX_MODEL = 'gpt-5.5';
const CODEX_MODEL_OPTIONS = [
  { value: 'gpt-5.5', label: 'GPT-5.5' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' }
];
const CODEX_REASONING_OPTIONS: Array<{ value: CodexReasoningEffort; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
];


export function SettingsModule({
  settings,
  analyticsEvents,
  onUpdateSettings,
  onBack,
  isBusy
}: {
  settings: AppSettings;
  analyticsEvents: AnalyticsEventRecord[];
  onUpdateSettings: (settings: Partial<AppSettings>, options?: { silent?: boolean }) => void | Promise<void>;
  onBack: () => void;
  isBusy: boolean;
}) {
  const savedTimerRef = useRef<number | undefined>(undefined);
  const appearanceTimerRef = useRef<number | undefined>(undefined);
  const [savedSection, setSavedSection] = useState<string>();
  const [codexModel, setCodexModel] = useState(settings.codexModel || DEFAULT_CODEX_MODEL);
  const [codexReasoningEffort, setCodexReasoningEffort] = useState<CodexReasoningEffort>(settings.codexReasoningEffort || 'medium');
  const [promptCorePreset, setPromptCorePreset] = useState(settings.promptCorePreset || DEFAULT_PROMPT_CORE_PRESET);
  const [promptRules, setPromptRules] = useState(settings.promptRules || DEFAULT_PROMPT_RULES);
  const [weeklyReportCorePreset, setWeeklyReportCorePreset] = useState(settings.weeklyReportCorePreset || DEFAULT_WEEKLY_REPORT_CORE_PRESET);
  const [weeklyReportRules, setWeeklyReportRules] = useState(settings.weeklyReportRules || DEFAULT_WEEKLY_REPORT_RULES);
  const [executorRunCorePreset, setExecutorRunCorePreset] = useState(settings.executorRunCorePreset || DEFAULT_EXECUTOR_RUN_CORE_PRESET);
  const [executorRunRules, setExecutorRunRules] = useState(settings.executorRunRules || DEFAULT_EXECUTOR_RUN_RULES);
  const [executorContinueCorePreset, setExecutorContinueCorePreset] = useState(
    settings.executorContinueCorePreset || DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET
  );
  const [executorContinueRules, setExecutorContinueRules] = useState(settings.executorContinueRules || DEFAULT_EXECUTOR_CONTINUE_RULES);
  const [themeColor, setThemeColor] = useState(settings.themeColor || '#2a50a2');
  const [themeMode, setThemeMode] = useState<ThemeMode>(settings.themeMode || 'light');
  const [showTodayOnStartup, setShowTodayOnStartup] = useState(settings.showTodayOnStartup ?? true);
  const [dailyUnfinishedReminderEnabled, setDailyUnfinishedReminderEnabled] = useState(settings.dailyUnfinishedReminderEnabled ?? true);
  const [systemNotificationEnabled, setSystemNotificationEnabled] = useState(settings.systemNotificationEnabled ?? true);
  const [tapdApiBaseUrl, setTapdApiBaseUrl] = useState(settings.tapdApiBaseUrl || 'https://api.tapd.cn');
  const [tapdAuthName, setTapdAuthName] = useState(settings.tapdAuthName || '');
  const [tapdAuthToken, setTapdAuthToken] = useState(settings.tapdAuthToken || '');
  const codexModelOptions = CODEX_MODEL_OPTIONS.some((item) => item.value === codexModel)
    ? CODEX_MODEL_OPTIONS
    : [{ value: codexModel, label: codexModel }, ...CODEX_MODEL_OPTIONS];
  const sections = [
    { id: 'appearance', label: '外观主题', helper: '颜色与界面' },
    { id: 'codex', label: 'Codex CLI', helper: '模型选择' },
    { id: 'analytics', label: '使用频率', helper: '本地事件' },
    { id: 'today', label: 'Today 工作台', helper: '每日启动' },
    { id: 'tapd', label: 'TAPD My Work', helper: '连接配置' },
    { id: 'prompt', label: 'Prompt 扩写', helper: '需求澄清' },
    { id: 'weekly', label: '周报生成', helper: '工作总结' },
    { id: 'executor', label: 'Executor 执行', helper: '首次执行' },
    { id: 'continue', label: 'Executor Continue', helper: '修正 / 新需求' }
  ];

  useEffect(() => {
    setPromptCorePreset(settings.promptCorePreset || DEFAULT_PROMPT_CORE_PRESET);
    setPromptRules(settings.promptRules || DEFAULT_PROMPT_RULES);
  }, [settings.promptCorePreset, settings.promptRules]);

  useEffect(() => {
    setWeeklyReportCorePreset(settings.weeklyReportCorePreset || DEFAULT_WEEKLY_REPORT_CORE_PRESET);
    setWeeklyReportRules(settings.weeklyReportRules || DEFAULT_WEEKLY_REPORT_RULES);
  }, [settings.weeklyReportCorePreset, settings.weeklyReportRules]);

  useEffect(() => {
    setExecutorRunCorePreset(settings.executorRunCorePreset || DEFAULT_EXECUTOR_RUN_CORE_PRESET);
    setExecutorRunRules(settings.executorRunRules || DEFAULT_EXECUTOR_RUN_RULES);
  }, [settings.executorRunCorePreset, settings.executorRunRules]);

  useEffect(() => {
    setExecutorContinueCorePreset(settings.executorContinueCorePreset || DEFAULT_EXECUTOR_CONTINUE_CORE_PRESET);
    setExecutorContinueRules(settings.executorContinueRules || DEFAULT_EXECUTOR_CONTINUE_RULES);
  }, [settings.executorContinueCorePreset, settings.executorContinueRules]);

  useEffect(() => {
    const nextColor = normalizeThemeHex(settings.themeColor);
    const nextMode = settings.themeMode || 'light';
    setCodexModel(settings.codexModel || DEFAULT_CODEX_MODEL);
    setCodexReasoningEffort(settings.codexReasoningEffort || 'medium');
    setThemeColor(nextColor);
    setThemeMode(nextMode);
    setShowTodayOnStartup(settings.showTodayOnStartup ?? true);
    setDailyUnfinishedReminderEnabled(settings.dailyUnfinishedReminderEnabled ?? true);
    setSystemNotificationEnabled(settings.systemNotificationEnabled ?? true);
    setTapdApiBaseUrl(settings.tapdApiBaseUrl || 'https://api.tapd.cn');
    setTapdAuthName(settings.tapdAuthName || '');
    setTapdAuthToken(settings.tapdAuthToken || '');
    applyThemeColor(nextColor, nextMode);
  }, [
    settings.themeColor,
    settings.codexModel,
    settings.codexReasoningEffort,
    settings.themeMode,
    settings.showTodayOnStartup,
    settings.dailyUnfinishedReminderEnabled,
    settings.systemNotificationEnabled,
    settings.tapdApiBaseUrl,
    settings.tapdAuthName,
    settings.tapdAuthToken
  ]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      if (appearanceTimerRef.current) window.clearTimeout(appearanceTimerRef.current);
    };
  }, []);

  async function saveSection(section: string, payload: Partial<AppSettings>) {
    await onUpdateSettings(payload);
    setSavedSection(section);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setSavedSection(undefined), 1800);
  }

  async function updateAppearance(payload: Partial<Pick<AppSettings, 'themeColor' | 'themeMode'>>) {
    await onUpdateSettings(payload, { silent: true });
  }

  async function updateCodexRuntime(payload: Partial<Pick<AppSettings, 'codexModel' | 'codexReasoningEffort'>>) {
    await onUpdateSettings(payload, { silent: true });
  }

  function scheduleThemeColorSave(nextColor: string) {
    if (appearanceTimerRef.current) window.clearTimeout(appearanceTimerRef.current);
    appearanceTimerRef.current = window.setTimeout(() => {
      void updateAppearance({ themeColor: nextColor });
    }, 350);
  }

  async function selectThemeMode(nextMode: ThemeMode) {
    if (appearanceTimerRef.current) {
      window.clearTimeout(appearanceTimerRef.current);
      appearanceTimerRef.current = undefined;
    }
    setThemeMode(nextMode);
    applyThemeColor(normalizeThemeHex(themeColor), nextMode);
    await updateAppearance({ themeMode: nextMode, themeColor: normalizeThemeHex(themeColor) });
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-md-outline/20 bg-md-surface">
      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-r border-md-outline/15 bg-md-surfaceContainer/65 p-4">
          <div className="sticky top-4">
            <div className="mb-3 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-md-muted">Outline</div>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                className="group mb-1 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition hover:bg-md-surface"
                onClick={() => document.getElementById(`settings-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                <span className="h-2 w-2 rounded-full bg-md-outline/35 transition group-hover:bg-md-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-md-text">{section.label}</span>
                  <span className="block text-xs text-md-muted">{section.helper}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="min-h-0 overflow-y-auto bg-md-surfaceContainer/35 p-6">
          <div className="mx-auto max-w-6xl space-y-5">
            <section
              id="settings-appearance"
              className="scroll-mt-4 overflow-hidden rounded-md border border-md-outline/15 bg-md-surface shadow-sm"
            >
              <div className="h-1 bg-md-primary" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionTitle icon={Palette} title="Appearance" />
                    <h3 className="text-base font-semibold text-md-text">Material 主题色</h3>
                    <p className="mt-1 text-sm text-md-muted">选择一个主题色，应用会计算主要 Material 色阶。</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex rounded-full bg-md-surfaceContainer p-1">
                      {[
                        { id: 'light', label: 'Light', icon: Sun },
                        { id: 'dark', label: 'Dark', icon: Moon },
                        { id: 'system', label: 'System', icon: Monitor }
                      ].map((item) => {
                        const Icon = item.icon;
                        const active = themeMode === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            className={clsx(
                              'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition',
                              active ? 'bg-md-primary text-md-onPrimary shadow-sm' : 'text-md-muted hover:bg-md-surface hover:text-md-text'
                            )}
                            onClick={() => void selectThemeMode(item.id as ThemeMode)}
                          >
                            <Icon size={14} />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-md-outline/10 pt-5">
                  <input
                    type="color"
                    className="h-12 w-16 rounded-md border border-md-outline/30 bg-md-surface p-1"
                    value={normalizeThemeHex(themeColor)}
                    onChange={(event) => {
                      const nextColor = normalizeThemeHex(event.target.value);
                      setThemeColor(nextColor);
                      applyThemeColor(nextColor, themeMode);
                      scheduleThemeColorSave(nextColor);
                    }}
                  />
                  <input
                    className="field-input h-12 max-w-xs"
                    value={themeColor}
                    onChange={(event) => {
                      const value = event.target.value;
                      setThemeColor(value);
                      if (isValidThemeHex(value)) {
                        const nextColor = normalizeThemeHex(value);
                        applyThemeColor(nextColor, themeMode);
                        scheduleThemeColorSave(nextColor);
                      }
                    }}
                  />
                  <div className="rounded-md bg-md-primary px-4 py-3 text-sm font-semibold text-md-onPrimary">
                    Theme preview
                  </div>
                </div>
              </div>
            </section>

            <section
              id="settings-codex"
              className="scroll-mt-4 overflow-hidden rounded-md border border-md-outline/15 bg-md-surface shadow-sm"
            >
              <div className="h-1 bg-md-primary" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionTitle icon={Bot} title="Codex CLI" />
                    <h3 className="text-base font-semibold text-md-text">模型选择</h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-md-muted">
                      Prompt 扩写、Executor 执行和周报生成都会使用这里选择的模型和推理强度。
                    </p>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 border-t border-md-outline/10 pt-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px]">
                  <label className="block max-w-xl">
                    <span className="field-label">Model</span>
                    <select
                      className="field-input h-11"
                      value={codexModel}
                      disabled={isBusy}
                      onChange={(event) => {
                        const nextModel = event.target.value || DEFAULT_CODEX_MODEL;
                        setCodexModel(nextModel);
                        void updateCodexRuntime({ codexModel: nextModel });
                      }}
                    >
                      {codexModelOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <span className="field-label">Reasoning</span>
                    <div className="flex rounded-full bg-md-surfaceContainer p-1">
                      {CODEX_REASONING_OPTIONS.map((item) => {
                        const active = codexReasoningEffort === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            className={clsx(
                              'inline-flex h-9 flex-1 items-center justify-center rounded-full px-3 text-xs font-semibold transition',
                              active ? 'bg-md-primary text-md-onPrimary shadow-sm' : 'text-md-muted hover:bg-md-surface hover:text-md-text'
                            )}
                            disabled={isBusy}
                            onClick={() => {
                              setCodexReasoningEffort(item.value);
                              void updateCodexRuntime({ codexReasoningEffort: item.value });
                            }}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="rounded-md bg-md-surfaceContainer px-4 py-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-md-muted">剩余量</div>
                    <div className="mt-1 text-sm font-semibold text-md-text">CLI 暂未提供</div>
                    <p className="mt-1 text-xs leading-5 text-md-muted">后续如果 Codex 暴露额度接口，这里再接入自动展示。</p>
                  </div>
                </div>
              </div>
            </section>

            <section
              id="settings-analytics"
              className="scroll-mt-4 overflow-hidden rounded-md border border-md-outline/15 bg-md-surface shadow-sm"
            >
              <div className="h-1 bg-md-primary" />
              <div className="p-5">
                <SectionTitle icon={CalendarDays} title="Usage Analytics" />
                <h3 className="text-base font-semibold text-md-text">功能使用频率</h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-md-muted">
                  只记录本地功能事件，不上传。用于判断哪些模块和动作最常用，后续方便调整产品动线。
                </p>
                <UsageAnalytics events={analyticsEvents} />
              </div>
            </section>

            <section
              id="settings-today"
              className="scroll-mt-4 overflow-hidden rounded-md border border-md-outline/15 bg-md-surface shadow-sm"
            >
              <div className="h-1 bg-md-primary" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionTitle icon={CalendarDays} title="Today" />
                    <h3 className="text-base font-semibold text-md-text">每日工作台</h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-md-muted">
                      控制应用每天第一次打开时是否自动弹出 Today 面板。Calendar 里的 Today 按钮始终可以手动打开。
                    </p>
                  </div>
                  <Button
                    disabled={isBusy}
                    onClick={() => void saveSection('today', {
                      showTodayOnStartup,
                      dailyUnfinishedReminderEnabled,
                      systemNotificationEnabled
                    })}
                  >
                    <Check size={16} />
                    {savedSection === 'today' ? 'Saved' : 'Save'}
                  </Button>
                </div>
                <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-md bg-md-surfaceContainer px-4 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-md-text">启动时显示 Today</span>
                    <span className="mt-1 block text-xs text-md-muted">每天只自动弹出一次，可以随时关闭。</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[rgb(var(--md-primary))]"
                    checked={showTodayOnStartup}
                    onChange={(event) => setShowTodayOnStartup(event.target.checked)}
                  />
                </label>
                <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 rounded-md bg-md-surfaceContainer px-4 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-md-text">每天 17:00 提醒未完成任务</span>
                    <span className="mt-1 block text-xs text-md-muted">应用打开时会弹出 Today 面板，提醒未 Done 的任务。</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[rgb(var(--md-primary))]"
                    checked={dailyUnfinishedReminderEnabled}
                    onChange={(event) => setDailyUnfinishedReminderEnabled(event.target.checked)}
                  />
                </label>
                <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 rounded-md bg-md-surfaceContainer px-4 py-3">
                  <span>
                    <span className="block text-sm font-semibold text-md-text">系统通知提醒</span>
                    <span className="mt-1 block text-xs text-md-muted">开启后，17:00 提醒会同时发送 macOS 通知。</span>
                  </span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-[rgb(var(--md-primary))]"
                    checked={systemNotificationEnabled}
                    onChange={(event) => setSystemNotificationEnabled(event.target.checked)}
                    disabled={!dailyUnfinishedReminderEnabled}
                  />
                </label>
              </div>
            </section>

            <section
              id="settings-tapd"
              className="scroll-mt-4 overflow-hidden rounded-md border border-md-outline/15 bg-md-surface shadow-sm"
            >
              <div className="h-1 bg-md-primary" />
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <SectionTitle icon={Settings} title="TAPD" />
                    <h3 className="text-base font-semibold text-md-text">TAPD My Work 配置</h3>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-md-muted">
                      这里只配置 TAPD 连接信息。我的工作页面会按当前用户聚合跨项目未完成需求、任务和缺陷。
                    </p>
                  </div>
                  <Button
                    disabled={isBusy}
                    onClick={() => void saveSection('tapd', {
                      tapdApiBaseUrl: tapdApiBaseUrl.trim() || 'https://api.tapd.cn',
                      tapdAuthName: tapdAuthName.trim(),
                      tapdAuthToken: tapdAuthToken.trim()
                    })}
                  >
                    <Check size={16} />
                    {savedSection === 'tapd' ? 'Saved' : 'Save'}
                  </Button>
                </div>
                <div className="mt-5 grid gap-3 border-t border-md-outline/10 pt-5 md:grid-cols-2">
                  <label className="block">
                    <span className="field-label">API Base URL</span>
                    <input className="field-input h-11" value={tapdApiBaseUrl} onChange={(event) => setTapdApiBaseUrl(event.target.value)} />
                  </label>
                  <label className="block">
                    <span className="field-label">Auth Name</span>
                    <input
                      className="field-input h-11"
                      value={tapdAuthName}
                      onChange={(event) => setTapdAuthName(event.target.value)}
                      placeholder="Basic Auth 时填写，Bearer Token 可留空"
                    />
                  </label>
                  <label className="block">
                    <span className="field-label">Auth Token / Bearer Token</span>
                    <input
                      className="field-input h-11"
                      type="text"
                      value={tapdAuthToken}
                      onChange={(event) => setTapdAuthToken(event.target.value)}
                      placeholder="可直接填个人访问令牌"
                    />
                  </label>
                </div>
              </div>
            </section>

            <PromptSettingCard
              id="settings-prompt"
              icon={Sparkles}
              title="Prompt Expansion"
              heading="Prompt 扩写"
              description="控制需求澄清、追问和 issue 输出。保存后，Prompt 模块下一次 Expand 会使用这里的内容。"
              corePreset={promptCorePreset}
              rules={promptRules}
              onCorePresetChange={setPromptCorePreset}
              onRulesChange={setPromptRules}
              isBusy={isBusy}
              saved={savedSection === 'prompt'}
              onSave={() => void saveSection('prompt', { promptCorePreset, promptRules })}
            />

            <PromptSettingCard
              id="settings-weekly"
              icon={CalendarDays}
              title="Weekly Report"
              heading="周报生成"
              description="控制看板周报的归纳方式、长度和输出结构。"
              corePreset={weeklyReportCorePreset}
              rules={weeklyReportRules}
              onCorePresetChange={setWeeklyReportCorePreset}
              onRulesChange={setWeeklyReportRules}
              isBusy={isBusy}
              saved={savedSection === 'weekly'}
              onSave={() => void saveSection('weekly', { weeklyReportCorePreset, weeklyReportRules })}
            />

            <PromptSettingCard
              id="settings-executor"
              icon={Play}
              title="Executor Run"
              heading="Executor 首次执行"
              description="控制 Codex 执行 issue 时的身份、修改边界、验证方式和报告格式。"
              corePreset={executorRunCorePreset}
              rules={executorRunRules}
              onCorePresetChange={setExecutorRunCorePreset}
              onRulesChange={setExecutorRunRules}
              isBusy={isBusy}
              saved={savedSection === 'executor'}
              onSave={() => void saveSection('executor', { executorRunCorePreset, executorRunRules })}
            />

            <PromptSettingCard
              id="settings-continue"
              icon={RefreshCw}
              title="Executor Continue"
              heading="Continue 处理规则"
              description="控制 Executor Continue 如何区分当前 issue 的修正/补完，以及你明确声明的新需求。"
              corePreset={executorContinueCorePreset}
              rules={executorContinueRules}
              onCorePresetChange={setExecutorContinueCorePreset}
              onRulesChange={setExecutorContinueRules}
              isBusy={isBusy}
              saved={savedSection === 'continue'}
              onSave={() => void saveSection('continue', { executorContinueCorePreset, executorContinueRules })}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PromptSettingCard({
  id,
  icon,
  title,
  heading,
  description,
  corePreset,
  rules,
  onCorePresetChange,
  onRulesChange,
  isBusy,
  saved,
  onSave
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  heading: string;
  description: string;
  corePreset: string;
  rules: string;
  onCorePresetChange: (value: string) => void;
  onRulesChange: (value: string) => void;
  isBusy: boolean;
  saved: boolean;
  onSave: () => void;
}) {
  const Icon = icon;

  return (
    <section id={id} className="scroll-mt-4 overflow-hidden rounded-md border border-md-outline/15 bg-md-surface shadow-sm">
      <div className="h-1 bg-md-primary" />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <SectionTitle icon={Icon} title={title} />
            <h3 className="text-base font-semibold text-md-text">{heading}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-md-muted">{description}</p>
          </div>
          <Button disabled={isBusy} onClick={onSave}>
            <Check size={16} />
            {saved ? 'Saved' : 'Save'}
          </Button>
        </div>

        <div className="mt-5 grid gap-4 border-t border-md-outline/10 pt-5 lg:grid-cols-[minmax(280px,0.85fr)_minmax(360px,1.15fr)]">
          <label className="block min-w-0">
            <span className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-md-muted">核心预设</span>
              <span className="text-xs text-md-muted">{corePreset.length} chars</span>
            </span>
            <textarea
              className="field-textarea mt-2 min-h-[210px] bg-md-surfaceContainer/45"
              value={corePreset}
              onChange={(event) => onCorePresetChange(event.target.value)}
            />
            <span className="mt-2 block text-xs leading-5 text-md-muted">定义 Codex 在这个功能里的身份和主要职责。</span>
          </label>
          <label className="block min-w-0">
            <span className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-md-muted">规则</span>
              <span className="text-xs text-md-muted">{rules.split('\n').filter(Boolean).length} lines</span>
            </span>
            <textarea
              className="field-textarea mt-2 min-h-[300px] bg-md-surfaceContainer/45"
              value={rules}
              onChange={(event) => onRulesChange(event.target.value)}
            />
            <span className="mt-2 block text-xs leading-5 text-md-muted">定义边界、输出格式、追问方式和验收要求。</span>
          </label>
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-md bg-md-surfaceContainer px-3 py-2 text-xs text-md-muted">
          <span className="h-2 w-2 rounded-full bg-md-primary" />
          <span>发送顺序：核心预设 → 规则 → 当前功能上下文数据。</span>
        </div>
      </div>
    </section>
  );
}

function UsageAnalytics({ events }: { events: AnalyticsEventRecord[] }) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const todayKey = new Date().toDateString();
  const todayEvents = events.filter((event) => new Date(event.createdAt).toDateString() === todayKey);
  const weekEvents = events.filter((event) => Date.parse(event.createdAt) >= now - 7 * dayMs);
  const actionCounts = topCounts(events.map((event) => event.name), 8);
  const moduleCounts = topCounts(
    events
      .filter((event) => event.name === 'module.open')
      .map((event) => String(event.metadata?.module || 'unknown')),
    8
  );
  const categoryCounts = topCounts(events.map((event) => event.category), 8);
  const topAction = actionCounts[0];

  return (
    <div className="mt-5 space-y-4 border-t border-md-outline/10 pt-5">
      <div className="grid gap-3 md:grid-cols-4">
        <AnalyticsStat label="Total events" value={events.length} helper="最多保留最近 2000 条" />
        <AnalyticsStat label="Today" value={todayEvents.length} helper="今天的功能触发次数" />
        <AnalyticsStat label="Last 7 days" value={weekEvents.length} helper="近 7 天活跃度" />
        <AnalyticsStat label="Top action" value={topAction?.count || 0} helper={topAction?.label || '暂无事件'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <AnalyticsCountPanel title="Top Actions" items={actionCounts} empty="还没有动作事件。" />
        <AnalyticsCountPanel title="Top Modules" items={moduleCounts} empty="还没有模块访问事件。" />
        <AnalyticsCountPanel title="Categories" items={categoryCounts} empty="还没有分类事件。" />
      </div>

      <div className="rounded-md bg-md-surfaceContainer p-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-md-text">Recent events</h4>
          <span className="text-xs text-md-muted">{Math.min(events.length, 12)} shown</span>
        </div>
        <div className="mt-3 space-y-2">
          {events.slice(0, 12).map((event) => (
            <div
              key={event.id}
              className="grid gap-2 rounded-md bg-md-surface px-3 py-2 text-sm md:grid-cols-[160px_minmax(0,1fr)_120px]"
            >
              <span className="font-semibold text-md-text">{event.name}</span>
              <span className="min-w-0 truncate text-md-muted">
                {event.category}
                {event.metadata ? ` · ${formatMetadata(event.metadata)}` : ''}
              </span>
              <span className="text-right text-xs text-md-muted">{formatEventTime(event.createdAt)}</span>
            </div>
          ))}
          {events.length === 0 ? (
            <div className="rounded-md bg-md-surface px-3 py-4 text-sm text-md-muted">
              暂无事件。打开模块、扩写需求、执行任务后这里会自动出现统计。
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AnalyticsStat({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-md bg-md-surfaceContainer p-4">
      <div className="text-2xl font-semibold text-md-text">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-md-muted">{label}</div>
      <div className="mt-2 text-xs text-md-muted">{helper}</div>
    </div>
  );
}

function AnalyticsCountPanel({ title, items, empty }: { title: string; items: CountItem[]; empty: string }) {
  return (
    <div className="rounded-md bg-md-surfaceContainer p-4">
      <h4 className="text-sm font-semibold text-md-text">{title}</h4>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-md bg-md-surface px-3 py-2">
            <span className="min-w-0 truncate text-sm text-md-text">{item.label}</span>
            <span className="rounded-full bg-md-primary/10 px-2 py-1 text-xs font-semibold text-md-primary">{item.count}</span>
          </div>
        ))}
        {items.length === 0 ? <div className="rounded-md bg-md-surface px-3 py-4 text-sm text-md-muted">{empty}</div> : null}
      </div>
    </div>
  );
}

type CountItem = {
  label: string;
  count: number;
};

function topCounts(values: string[], limit: number): CountItem[] {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const key = value.trim() || 'unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function formatMetadata(metadata: NonNullable<AnalyticsEventRecord['metadata']>) {
  return Object.entries(metadata)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(', ');
}

function formatEventTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isValidThemeHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function normalizeThemeHex(value: string | undefined) {
  const fallback = '#2a50a2';
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed.toLowerCase()}`;
  return fallback;
}
