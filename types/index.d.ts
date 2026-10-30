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
  tools: number
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

declare module 'claude-code' {
  interface PluginState {
    'laterallus-progress': {
      activity: Activity | null
      now: number
      waiting: boolean
      agents: AgentBar[]
      agentsStepKey: string | null
    }
  }
}
