import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import {
  IconCheck,
  IconCheckSquare,
  IconChevron,
  IconFolder,
  IconSparkle,
  IconX,
} from './Icon'
import DrawerResizer from './DrawerResizer'

interface PlanStep {
  id: string
  lineIndex: number
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
  style,
}: {
  onClose: () => void
  onSwitchToChanges?: () => void
  onSwitchToFiles?: () => void
  onSwitchToDetails?: () => void
  style?: React.CSSProperties
}) {
  useLocale()
  const workspace = useStore((s) => s.settings?.workspace)
  const [activePlanFile, setActivePlanFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
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

    lines.forEach((rawLine, idx) => {
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
            lineIndex: idx,
            text,
            done,
            stage: currentStage,
          })
          groups[currentStage] = list
        }
      }
    })

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

  // 双向持久化：勾选/取消勾选步骤并原子写回磁盘
  const handleToggleStep = async (step: PlanStep) => {
    if (!fileContent || !activePlanFile || syncing) return
    const rawLines = fileContent.split('\n')
    const targetLine = rawLines[step.lineIndex]
    if (!targetLine) return

    const nextDone = !step.done
    let updatedLine = targetLine
    if (nextDone) {
      updatedLine = targetLine.replace(/^(\s*[-*]\s+\[)\s*(\]\s+.*)$/, '$1x$2')
    } else {
      updatedLine = targetLine.replace(/^(\s*[-*]\s+\[)[xX](\]\s+.*)$/, '$1 $2')
    }

    if (updatedLine === targetLine) return

    rawLines[step.lineIndex] = updatedLine
    const newContent = rawLines.join('\n')

    // 乐观更新
    setFileContent(newContent)
    setSyncing(true)

    try {
      const res = await fetch('/api/workspaces/write-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: activePlanFile,
          content: newContent,
        }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (data.ok) {
        useStore.getState().setNotice(`已同步更新 ${activePlanFile} 进度`)
      } else {
        // 失败回滚
        setFileContent(fileContent)
        useStore.getState().setError(data.error || '同步保存计划失败')
      }
    } catch {
      setFileContent(fileContent)
      useStore.getState().setError('网络异常，无法保存计划文件')
    } finally {
      setSyncing(false)
    }
  }

  const handleContinueTask = (stepText: string) => {
    const prompt = `请继续推进任务：${stepText}`
    window.dispatchEvent(new CustomEvent('ccweb:insert-prompt', { detail: prompt }))
    useStore.getState().setNotice('已将任务指令填入输入框')
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
      const res = await fetch('/api/workspaces/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: activePlanFile }),
      })
      const data = (await res.json()) as { ok: boolean; error?: string }
      if (data.ok) {
        useStore.getState().setNotice(`已在资源管理器中定位计划文件: ${activePlanFile}`)
      } else {
        useStore.getState().setNotice(data.error || '无法打开资源管理器')
      }
    } catch {
      useStore.getState().setNotice('调用系统程序异常')
    }
  }

  const handleRefresh = async () => {
    setLoading(true)
    await loadPlanFile()
    useStore.getState().setNotice('已刷新实施计划进度')
  }

  return (
    <aside className="drawer plan-drawer" aria-label="实施计划伴侣" style={style}>
      <DrawerResizer />
      <header className="drawer-head">
        <div className="drawer-nav-tabs">
          {onSwitchToFiles && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToFiles}>
              {t('dw.tabFiles')}
            </button>
          )}
          {onSwitchToDetails && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToDetails}>
              {t('dw.tabTasks')}
            </button>
          )}
          {onSwitchToChanges && (
            <button type="button" className="drawer-nav-tab" onClick={onSwitchToChanges}>
              {t('dw.tabReview')}
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
                    onClick={handleRefresh}
                    title="重新加载实施计划文件"
                    aria-label="刷新计划"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={handleRevealFile}
                    title="在系统资源管理器中定位此计划文件"
                    aria-label="在系统资源管理器中定位"
                  >
                    <IconFolder width={13} height={13} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => {
                      const next = !viewRaw
                      setViewRaw(next)
                      useStore.getState().setNotice(next ? '已切换为 Markdown 源码' : '已切换为卡片实施大纲')
                    }}
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
                  <div className="plan-progress-track">
                    <div
                      className="plan-progress-fill"
                      style={{
                        width: `${progressPct}%`,
                        background: progressPct === 100 ? 'var(--color-ok)' : 'var(--color-accent)',
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 阶段大纲列表 */}
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
                          <button
                            type="button"
                            className={`plan-step-check ${step.done ? 'is-checked' : ''}`}
                            onClick={() => handleToggleStep(step)}
                            disabled={syncing}
                            title={step.done ? '标记为未完成（点击写回磁盘）' : '标记为已完成（点击写回磁盘）'}
                            aria-label={step.done ? '标记为未完成' : '标记为已完成'}
                          >
                            {step.done ? <IconCheck width={11} height={11} /> : null}
                          </button>
                          <span
                            className="plan-step-text"
                            title={step.text}
                            onClick={() => handleToggleStep(step)}
                            style={{ cursor: 'pointer' }}
                          >
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
