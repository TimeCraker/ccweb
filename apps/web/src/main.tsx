import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { useStore } from './store'

if (typeof window !== 'undefined') {
  ;(window as unknown as { __CCWEB_STORE__?: typeof useStore }).__CCWEB_STORE__ = useStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
