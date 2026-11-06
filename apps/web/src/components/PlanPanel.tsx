import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import {
  IconCheck,
  IconCheckSquare,
  IconChevron,
  IconFolder,
  IconList,
  IconSparkle,
  IconX,
} from './Icon'
import DrawerResizer from './DrawerResizer'

interface PlanStep {
  id: string
  text: string
  done: boolean
  stage: string
}

interface StageGroup {
  stage: string
  steps: PlanStep[]
}

const CANDIDATE_FILES = [
  'implementation_plan.md',
  'SPEC.md',
  'task.md',
  'todo.md',
  'PLAN.md',
]

export default function PlanPanel({
  onClose,
  onSwitchToChanges,
  onSwitchToFiles,
  onSwitchToDetails,
}: {
  onClose: () => void
  onSwitchToChanges?: () => void
  onSwitchToFiles?: () => void
  onSwitchToDetails?: () => void
}) {
  useLocale()
  const workspace = useStore((s) => s.settings?.workspace)
  const [activePlanFile, setActivePlanFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [viewRaw, setViewRaw] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // 探测并加载工作区计划文件
  const loadPlanFile = useCallback(async () => {
    setLoading(true)
    for (const cand of CANDIDATE_FILES) {
      try {
        const res = await fetch('/api/workspaces/read-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: cand }),
        })
        const data = (await res.json()) as { ok: boolean; content?: string }
        if (data.ok && typeof data.content === 'string' && data.content.trim()) {
          setActivePlanFile(cand)
          setFileContent(data.content)
          setLoading(false)
          return
        }
      } catch {
        // 继续探测下一个候选
      }
    }
    setActivePlanFile(null)
    setFileContent(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadPlanFile()
  }, [loadPlanFile, workspace, refreshKey])

  // 解析 Markdown 阶段与待办事项
  const { title, stages, totalSteps, completedSteps, progressPct } = useMemo(() => {
    if (!fileContent) {
      return { title: '', stages: [], totalSteps: 0, completedSteps: 0, progressPct: 0 }
    }
    const lines = fileContent.split('\n')
    let mainTitle = '实施计划'
    let currentStage = '总览阶段'
    const groups: Record<string, PlanStep[]> = {}
    let idCounter = 0

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (line.startsWith('# ') && mainTitle === '实施计划') {
        mainTitle = line.replace(/^#\s+/, '').trim()
      } else if (line.startsWith('## ') || line.startsWith('### ')) {
        currentStage = line.replace(/^#+\s+/, '').trim()
      } else {
        const checkMatch = line.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/)
        if (checkMatch && checkMatch[1] && checkMatch[2]) {
          idCounter++
          const done = checkMatch[1].toLowerCase() === 'x'
          const text = checkMatch[2].trim()
          const list = groups[currentStage] ?? []
          list.push({
            id: `step-${idCounter}`,
            text,
            done,
            stage: currentStage,
          })
          groups[currentStage] = list
        }
      }
    }

    const stageList: StageGroup[] = Object.entries(groups).map(([stage, steps]) => ({
      stage,
      steps,
    }))

    const allSteps = stageList.flatMap((g) => g.steps)
    const total = allSteps.length
    const done = allSteps.filter((s) => s.done).length
    const pct = total > 0 ? Math.round((done / total) * 100) : 0

    return {
      title: mainTitle,
      stages: stageList,
      totalSteps: total,
      completedSteps: done,
      progressPct: pct,
    }
  }, [fileContent])

  const handleContinueTask = (stepText: string) => {
    const prompt = `请继续推进任务：${stepText}`
    window.dispatchEvent(new CustomEvent('ccweb:insert-prompt', { detail: prompt }))
  }

  const handleCreatePlan = () => {
    window.dispatchEvent(
      new CustomEvent('ccweb:insert-prompt', {
        detail: '/plan 分析当前项目需求并输出规范的实施计划',
      }),
    )
  }

  const handleRevealFile = async () => {
    if (!activePlanFile) return
    try {
      await fetch('/api/workspaces/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activePlanFile }),
      })
    } catch {
      // ignore
    }
  }

  return (
    <aside className="drawer plan-drawer" aria-label="实施计划伴侣">
      <DrawerResizer />
      <header className="drawer-head">
        <div className="drawer-nav-tabs">
          {onSwitchToChanges && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToChanges}>
              {t('dw.tabReview')}
            </button>
          )}
          {onSwitchToFiles && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToFiles}>
              {t('dw.tabFiles')}
            </button>
          )}
          <button type="button" className="drawer-nav-tab is-active">
            <IconCheckSquare width={12} height={12} style={{ color: 'var(--color-accent)' }} />
            <span>计划</span>
            {totalSteps > 0 && (
              <span className="tab-badge" style={{ background: progressPct === 100 ? 'var(--color-ok)' : undefined }}>
                {completedSteps}/{totalSteps}
              </span>
            )}
          </button>
          {onSwitchToDetails && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToDetails}>
              {t('dw.tabTasks')}
            </button>
          )}
        </div>
        <div className="header-actions">
          <button className="icon-btn" onClick={onClose} aria-label={t('dw.close')} title={`${t('dw.close')} (Esc)`}>
            <IconX width={16} height={16} />
          </button>
        </div>
      </header>

      <div className="drawer-body plan-drawer-body">
        {loading ? (
          <div className="menu-empty" style={{ padding: '40px 16px' }}>
            <span className="ws-spinner" style={{ marginRight: 8 }} />
            正在探测工作区计划文件…
          </div>
        ) : activePlanFile && fileContent ? (
          <div className="plan-container animate-fade-in">
            {/* 计划概览顶栏 */}
            <div className="plan-overview-card">
              <div className="plan-overview-head">
                <div className="plan-title-area">
                  <span className="plan-file-pill" title={`文件：${activePlanFile}`}>
                    {activePlanFile}
                  </span>
                  <h3 className="plan-doc-title" title={title}>
                    {title}
                  </h3>
                </div>
                <div className="plan-overview-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setRefreshKey((k) => k + 1)}
                    title="重新加载计划文件"
                  >
                    <IconList width={13} height={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={handleRevealFile}
                    title="在系统资源管理器中打开此文件"
                  >
                    <IconFolder width={13} height={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setViewRaw((v) => !v)}
                    title={viewRaw ? '切换为卡片进度视图' : '查看 Markdown 源码'}
                  >
                    {viewRaw ? '卡片视图' : '源码'}
                  </button>
                </div>
              </div>

              {totalSteps > 0 && (
                <div className="plan-progress-box">
                  <div className="plan-progress-label">
                    <span className="plan-progress-status">
                      <span
                        className="dot"
                        style={{
                          background: progressPct === 100 ? 'var(--color-ok)' : 'var(--color-accent)',
                          marginRight: 6,
                        }}
                      />
                      {progressPct === 100 ? '全部任务已达成' : '实施推进中'}
                    </span>
                    <span className="plan-progress-num">
                      <strong>{completedSteps}</strong> / {totalSteps} 步骤 ({progressPct}%)
                    </span>
                  </div>
                  <div className="plan-progress-bar-track">
                    <div
                      className="plan-progress-bar-fill"
                      style={{
                        width: `${progressPct}%`,
                        background: progressPct === 100 ? 'var(--color-ok)' : 'var(--color-accent)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 视图内容切换 */}
            {viewRaw ? (
              <div className="plan-raw-wrap">
                <pre className="plan-raw-code">
                  <code>{fileContent}</code>
                </pre>
              </div>
            ) : stages.length > 0 ? (
              <div className="plan-stages-list">
                {stages.map((st, sIdx) => (
                  <section key={sIdx} className="plan-stage-section">
                    <div className="plan-stage-head">
                      <IconChevron width={11} height={11} className="plan-stage-icon" />
                      <h4>{st.stage}</h4>
                      <span className="plan-stage-count">
                        {st.steps.filter((item) => item.done).length}/{st.steps.length}
                      </span>
                    </div>
                    <div className="plan-stage-items">
                      {st.steps.map((step) => (
                        <div
                          key={step.id}
                          className={`plan-step-card ${step.done ? 'is-done' : ''}`}
                        >
                          <span
                            className={`plan-step-check ${step.done ? 'is-checked' : ''}`}
                            aria-hidden="true"
                          >
                            {step.done ? <IconCheck width={11} height={11} /> : null}
                          </span>
                          <span className="plan-step-text" title={step.text}>
                            {step.text}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-ghost plan-step-action"
                            onClick={() => handleContinueTask(step.text)}
                            title="把此任务指令填入对话输入框"
                          >
                            执行 ↗
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="plan-raw-wrap">
                <p className="menu-empty" style={{ margin: '16px 0 8px' }}>
                  未检测到标准待办清单语法（- [ ]），已展示计划全文：
                </p>
                <pre className="plan-raw-code">
                  <code>{fileContent}</code>
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="plan-empty-card">
            <span className="plan-empty-icon">
              <IconCheckSquare width={28} height={28} />
            </span>
            <h3>暂未检测到当前项目实施计划</h3>
            <p>
              可在对话中运行 <code>/plan</code> 指令生成系统级技术方案，或在工作区根目录维护{' '}
              <code>implementation_plan.md</code>。
            </p>
            <div className="plan-empty-actions">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={handleCreatePlan}
              >
                <IconSparkle width={13} height={13} style={{ marginRight: 6 }} />
                在对话中生成计划 (/plan)
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => setRefreshKey((k) => k + 1)}
              >
                刷新重试
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
