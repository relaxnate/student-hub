import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

// Per-widget error boundary. A single misbehaving widget must never take down
// the whole dashboard canvas — it renders a contained fallback instead.

interface Props { children: ReactNode; widgetName: string }
interface State { error: Error | null }

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Surface to the console for debugging; the boundary keeps the app alive.
    console.error(`[widget:${this.props.widgetName}] crashed:`, error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-4 text-center">
          <AlertTriangle size={18} className="text-amber-400" />
          <p className="t-caption text-zinc-400">This widget hit an error.</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="t-caption text-accent-400 hover:text-accent-300">
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
