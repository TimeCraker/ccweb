import { Component, type ReactNode } from 'react'
import { t } from './i18n'

interface State {
  error: Error | null
}

/** 顶层错误边界:崩溃时给出可读界面而非白屏(企业级兜底) */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  override componentDidCatch(error: Error): void {
    console.error('[ccweb] UI crashed:', error)
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-full place-items-center bg-bg p-8">
        <div className="max-w-md rounded-xl border border-danger/40 bg-panel p-6 text-center">
          <p className="text-sm font-medium text-danger">{t('err.crashTitle')}</p>
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg px-3 py-2 text-left font-mono text-[11px] text-text-dim">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => {
              this.setState({ error: null })
              location.reload()
            }}
            className="mt-4 rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            {t('err.reload')}
          </button>
        </div>
      </div>
    )
  }
}
