import { Component, type ReactNode } from 'react'
import { t } from './i18n'

interface State {
  error: Error | null
}

/** 顶层错误边界:崩溃时给出可读界面而非白屏 */
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
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 32, background: 'var(--color-bg)' }}>
        <div className="note danger" style={{ maxWidth: 460, flexDirection: 'column', gap: 12 }}>
          <strong style={{ fontSize: 14 }}>{t('err.crashTitle')}</strong>
          <pre
            style={{
              margin: 0,
              maxHeight: 180,
              overflow: 'auto',
              padding: '8px 10px',
              borderRadius: 8,
              background: 'var(--color-panel)',
              border: '1px solid var(--color-border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ error: null })
              location.reload()
            }}
          >
            {t('err.reload')}
          </button>
        </div>
      </div>
    )
  }
}
