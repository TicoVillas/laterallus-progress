export type StepStatus = 'pending' | 'in_progress' | 'completed'

export type Step = {
  id: string
  name: string
  status: StepStatus
  startedAt: number | null
  endedAt: number | null
}

export type Activity = {
  steps: Step[]
  startedAt: number
  endedAt: number | null
  // Tokens (entrada + escrita em cache + saída) gastos enquanto o plano rodava, e o modelo.
  tokens?: number
  model?: string | null
}

// Um subagente nativo: o nome de filósofo e a cor ficam com ele até a barra sair.
export type AgentBar = {
  id: string
  philosopher: string
  color: number
  description: string
  startedAt: number
  endedAt: number | null
  failed: boolean
  // Com failed: foi interrompido ou cancelado, não um erro.
  canceled?: boolean
  tools: number
  // Tokens (entrada + escrita em cache + saída) do agente e o modelo que ele usou.
  tokens?: number
  model?: string | null
  plan: Activity | null
  // Só numa barra do Codex: o job que o plugin do Codex registrou para a review.
  codex?: CodexJob
}

export type CodexJob = {
  jobId: string | null
  kindLabel: string
  phase: string
  actions: number
  findings: string[] | null
}

// Uma linha da linha do tempo do painel: um plano do Claude, um subagente nativo ou um
// agente externo (o Codex). Fica para sempre na sessão, na ordem em que começou.
export type TimelineEntry = {
  key: string
  kind: 'task' | 'agent' | 'external'
  startedAt: number
  activity: Activity | null
  agent: AgentBar | null
  // Um plano que ficou sem terminar quando outro começou: cancelado nesse instante.
  cancelledAt?: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'laterallus-progress': {
      activity: Activity | null
      now: number
      waiting: boolean
      agents: AgentBar[]
      agentsStepKey: string | null
      timeline: TimelineEntry[]
      // Tokens da sessão (entrada + escrita em cache + saída): do Claude no loop principal e
      // dos subagentes nativos, separados.
      tokenTotals: { main: number; agents: number }
    }
  }
}
