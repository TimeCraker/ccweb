import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconSparkle } from './Icon'

interface Props {
  /** 提交:allow=true + updatedInput.answers;跳过:allow=false */
  onResolve: (requestId: string, allow: boolean, updatedInput?: Record<string, unknown>) => void
}

/**
 * 问题接管(AskUserQuestion 类):渲染在审批卡同位置。
 * 每题可单选或多选,也支持填写其他答案;提交时组装 answers。
 */
export default function QuestionCard({ onResolve }: Props) {
  const question = useStore((s) => s.question)
  useLocale()
  const [sel, setSel] = useState<Record<number, string[]>>({})
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({})
  const [otherText, setOtherText] = useState<Record<number, string>>({})

  useEffect(() => {
    setSel({})
    setOtherOpen({})
    setOtherText({})
  }, [question?.requestId])

  if (!question) return null

  const answered = (index: number) => (sel[index]?.length ?? 0) > 0 || (otherText[index] ?? '').trim() !== ''
  const allAnswered = question.questions.every((_, index) => answered(index))

  const submit = () => {
    const answers = Object.fromEntries(
      question.questions.map((item, index) => {
        const other = (otherText[index] ?? '').trim()
        return [item.question, other !== '' ? other : (sel[index] ?? []).join(', ')]
      }),
    )
    onResolve(question.requestId, true, { answers })
  }

  const toggle = (index: number, label: string, multi: boolean) => {
    setSel((state) => {
      const current = state[index] ?? []
      if (!multi) return { ...state, [index]: [label] }
      return {
        ...state,
        [index]: current.includes(label) ? current.filter((value) => value !== label) : [...current, label],
      }
    })
    setOtherText((state) => ({ ...state, [index]: '' }))
  }

  return (
    <div className="question-card" role="group" aria-label={t('q.title')}>
      <div className="question-head">
        <span
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 22,
            height: 22,
            borderRadius: 6,
            background: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          <IconSparkle width={13} height={13} />
        </span>
        {t('q.title')}
        <span className="badge" style={{ marginLeft: 'auto' }}>
          {question.questions.length} 个问题
        </span>
      </div>

      {question.questions.map((item, index) => (
        <div className="question-item" key={index}>
          <strong>
            {item.header && <span style={{ color: 'var(--color-text-faint)', fontWeight: 400 }}>{item.header} · </span>}
            {item.question}
          </strong>
          {item.multiSelect && <p>可选择多个</p>}
          <div className="option-list">
            {item.options.map((option) => {
              const selected = sel[index]?.includes(option.label) ?? false
              return (
                <button
                  key={option.label}
                  className="option"
                  aria-pressed={selected}
                  title={option.description}
                  onClick={() => toggle(index, option.label, Boolean(item.multiSelect))}
                >
                  <span className="tick" aria-hidden="true">
                    ✓
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block' }}>{option.label}</span>
                    {option.description && (
                      <span style={{ display: 'block', marginTop: 1, fontSize: 11.5, color: 'var(--color-text-faint)' }}>
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
            <button
              className="option"
              aria-pressed={Boolean(otherOpen[index])}
              onClick={() => setOtherOpen((state) => ({ ...state, [index]: !state[index] }))}
            >
              <span className="tick" aria-hidden="true">
                ✓
              </span>
              {t('q.other')}
            </button>
            {otherOpen[index] && (
              <input
                className="input"
                value={otherText[index] ?? ''}
                onChange={(e) => {
                  setOtherText((state) => ({ ...state, [index]: e.target.value }))
                  setSel((state) => ({ ...state, [index]: [] }))
                }}
                placeholder="输入你的答案"
                aria-label={t('q.other')}
                autoFocus
              />
            )}
          </div>
        </div>
      ))}

      <div className="question-actions">
        <span className="hint" style={{ flex: 1, fontSize: 11.5, color: 'var(--color-text-faint)' }}>
          回答会作为本轮输入提交，不会被当作新的任务。
        </span>
        <button className="btn btn-sm" onClick={() => onResolve(question.requestId, false)}>
          {t('q.skip')}
        </button>
        <button className="btn btn-sm btn-primary" onClick={submit} disabled={!allAnswered}>
          {t('q.submit')}
        </button>
      </div>
    </div>
  )
}
