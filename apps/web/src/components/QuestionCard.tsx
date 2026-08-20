import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { t, useLocale } from '../i18n'
import { IconSparkle } from './Icon'

interface Props {
  /** 提交:allow=true + updatedInput.answers;跳过:allow=false */
  onResolve: (requestId: string, allow: boolean, updatedInput?: Record<string, unknown>) => void
}

/**
 * 问题接管(AskUserQuestion 类):渲染在 PermissionCard 同位置。
 * 每题单选一个选项(或展开填写其他答案),提交组装 answers 数组。
 */
export default function QuestionCard({ onResolve }: Props) {
  const question = useStore((s) => s.question)
  useLocale()
  // 每题作答状态(选项 label / 其他答案开关 / 其他答案文本)
  const [sel, setSel] = useState<Record<number, string>>({})
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({})
  const [otherText, setOtherText] = useState<Record<number, string>>({})

  // 新问题到达时清空作答
  useEffect(() => {
    setSel({})
    setOtherOpen({})
    setOtherText({})
  }, [question?.requestId])

  if (!question) return null

  const answered = (i: number) =>
    sel[i] != null || (otherText[i] ?? '').trim() !== ''
  const allAnswered = question.questions.every((_, i) => answered(i))

  const submit = () => {
    const answers = question.questions.map((_, i) => {
      const other = (otherText[i] ?? '').trim()
      return other !== '' ? other : (sel[i] ?? '')
    })
    onResolve(question.requestId, true, { answers })
  }

  return (
    <div className="mx-auto mb-2 max-w-3xl px-6">
      <div className="animate-pop-in rounded-xl border border-accent/40 bg-panel-2/95 p-4 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-md bg-accent/15 text-accent">
            <IconSparkle width={14} height={14} />
          </span>
          <span className="text-sm font-medium">{t('q.title')}</span>
        </div>

        {question.questions.map((q, qi) => (
          <div key={qi} className="mt-3">
            <p className="text-xs font-medium text-text">
              {q.header && <span className="text-text-faint">{q.header}: </span>}
              {q.question}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {q.options.map((o) => (
                <button
                  key={o.label}
                  onClick={() => setSel((s) => ({ ...s, [qi]: o.label }))}
                  title={o.description}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    sel[qi] === o.label
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border-strong text-text-dim hover:border-accent/50 hover:text-text'
                  }`}
                >
                  {o.label}
                </button>
              ))}
              <button
                onClick={() => setOtherOpen((s) => ({ ...s, [qi]: !s[qi] }))}
                className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  otherOpen[qi]
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border-strong text-text-dim hover:border-accent/50 hover:text-text'
                }`}
              >
                {t('q.other')} {otherOpen[qi] ? '▴' : '▾'}
              </button>
            </div>
            {otherOpen[qi] && (
              <input
                value={otherText[qi] ?? ''}
                onChange={(e) => setOtherText((s) => ({ ...s, [qi]: e.target.value }))}
                placeholder={t('q.other')}
                className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-xs outline-none transition-colors focus:border-accent/60"
              />
            )}
          </div>
        ))}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => onResolve(question.requestId, false)}
            className="rounded-lg border border-border-strong px-3 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-danger hover:text-danger"
          >
            {t('q.skip')}
          </button>
          <button
            onClick={submit}
            disabled={!allAnswered}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-35"
          >
            {t('q.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
