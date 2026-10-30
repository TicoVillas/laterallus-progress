import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer, ToolCallInput } from 'claude-code'

import type { Activity, AgentBar, CodexJob, Step, StepStatus } from '../types'

// Claude dark mode; o gradiente vai de um tom pastel até o tom forte da cor
const ORANGE_LIGHT = '#F2C4A6'
const ORANGE = '#D77757'
const TRACK = '#3D3D3A'
const MUTED = '#9C9A92'
// O nome muda de cor na borda do preenchimento: escuro sobre a cor, claro sobre o trilho.
const ON_FILL = '#262624'
const ON_TRACK = '#FAF9F5'

// Cores das barras dos subagentes, no mesmo esquema pastel → forte da barra principal.
const AGENT_COLORS: ReadonlyArray<readonly [string, string]> = [
  ['#CDBBF7', '#8B6FE0'], // roxo
  ['#B9E4C3', '#4F9E68'], // verde
  ['#F5B5B0', '#D2544E'], // vermelho
  ['#B5D3F5', '#4A86CF'], // azul
  ['#F2DDA0', '#C3952B'], // dourado
  ['#A8E0DA', '#2F9C92'], // turquesa
]

// Nomes dos subagentes: figuras conhecidas da filosofia, história, literatura, ciência e
// tecnologia. Os longos usam a forma curta para caber na coluna.
const NAMES = [
  'Sócrates', 'Platão', 'Aristóteles', 'Confúcio', 'Sun Tzu', 'Hipátia', 'Arquimedes', 'Euclides',
  'Pitágoras', 'Homero', 'Cleópatra', 'Júlio César', 'Marco Aurélio', 'Sêneca', 'Da Vinci', 'Galileu',
  'Copérnico', 'Gutenberg', 'Dante', 'Shakespeare', 'Cervantes', 'Camões', 'Descartes', 'Newton',
  'Voltaire', 'Kant', 'Darwin', 'Nietzsche', 'Tolstói', 'Dostoiévski', 'Machado', 'Fernando Pessoa',
  'Kafka', 'Tesla', 'Einstein', 'Marie Curie', 'Ada Lovelace', 'Alan Turing', 'Grace Hopper',
  'Von Neumann', 'Santos Dumont', 'Beauvoir', 'Hannah Arendt', 'Lispector', 'Frida Kahlo', 'Mandela',
]

// Larguras das colunas do nome e do tempo (células), para as barras ficarem alinhadas.
const LEFT_CELLS = 17
const RIGHT_CELLS = 13

// Ícones em pixel art, cada um com um notebook: L notebook, S tela.
// O crab do Claude Code: C corpo, E olhos.
const CRAB_PIXELS = [
  '......CCCCCCCC..',
  '......CECCCCEC..',
  '.....CCCCCCCCCCC',
  '......CCCCCCCC..',
  '.LLL..CCCCCCCC..',
  '.LSL..C.C..C.C..',
  '.LLL............',
  'LLLLL...........',
]

// O pet do Codex: B corpo de nuvem, V viseira, c olhos, P o ">_" no peito.
const CODEX_PIXELS = [
  '.......BB.BB....',
  '......BBBBBBB...',
  '.....BVVVVVVVB..',
  '.....BVcVVVcVB..',
  '......BBBBBBB...',
  '.LLL...BPPBB....',
  '.LSL...BBBBB....',
  'LLLLL...B.B.....',
]
const ICON_PX = 2
const CODEX_BODY = '#5B7CFA'
// A barra do Codex fica sempre no azul-índigo do pet.
const CODEX_COLORS = ['#C3CCFB', '#5468E8'] as const

type Icon = { kind: 'crab' | 'codex'; color: string }

function iconSvg(icon: Icon): string {
  const grid = icon.kind === 'crab' ? CRAB_PIXELS : CODEX_PIXELS
  const fills: Record<string, string> = {
    C: icon.color,
    E: '#262624',
    B: icon.color,
    V: '#1E2340',
    c: '#7FE3F0',
    P: '#D8E0FF',
    L: '#B8B6AE',
    S: '#5A5955',
  }
  const rects = grid
    .flatMap((row, y) =>
      [...row].flatMap((ch, x) => (fills[ch] ? [`<rect x="${x}" y="${y}" width="1" height="1" fill="${fills[ch]}"/>`] : [])),
    )
    .join('')
  const w = grid[0]!.length
  const h = grid.length
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * ICON_PX}" height="${h * ICON_PX}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`
}

// Altura e raio dos cantos da barra no desktop (px), próximos ao formato da band.
const BAR_PX = 22
const BAR_RADIUS = 6

function mix(a: string, b: string, k: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const c = [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// Trilho arredondado com o preenchimento em gradiente. O SVG estica na horizontal;
// o viewBox fica perto da largura real para os cantos não deformarem.
function barSvg(ratio: number, light: string, strong: string): string {
  const w = 700
  const h = BAR_PX
  const r = BAR_RADIUS
  const fill = Math.max(0, Math.min(1, ratio)) * w
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
    `<defs>` +
    `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="0">` +
    `<stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${strong}"/>` +
    `</linearGradient>` +
    `<clipPath id="c"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></clipPath>` +
    `</defs>` +
    `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${TRACK}"/>` +
    `<rect width="${fill}" height="${h}" fill="url(#g)" clip-path="url(#c)"/>` +
    `</svg>`
  )
}

const activity = atom({ plugin: 'laterallus-progress', key: 'activity' } as const, null)
const now = atom({ plugin: 'laterallus-progress', key: 'now' } as const, 0)
// Entre o envio de um prompt e o primeiro plano, a atividade anterior (cheia) não aparece.
const waiting = atom({ plugin: 'laterallus-progress', key: 'waiting' } as const, false)
const agents = atom({ plugin: 'laterallus-progress', key: 'agents' } as const, [])
const agentsStepKey = atom({ plugin: 'laterallus-progress', key: 'agentsStepKey' } as const, null)

type PlanItem = { content: string; status: StepStatus }

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function setStatus(step: Step, status: StepStatus, t: number): Step {
  if (step.status === status) return step
  return {
    ...step,
    status,
    startedAt: status === 'pending' ? null : (step.startedAt ?? t),
    endedAt: status === 'completed' ? t : null,
  }
}

function finish(a: Activity, t: number): Activity {
  const done = a.steps.length > 0 && a.steps.every(s => s.status === 'completed')
  return { ...a, endedAt: done ? (a.endedAt ?? t) : null }
}

// Substitui a lista inteira, preservando os tempos das etapas que já existiam (por nome).
function replaceSteps(prev: Activity | null, items: PlanItem[], t: number, isNew: boolean): Activity {
  const base: Activity = prev && !isNew && prev.endedAt === null ? prev : { steps: [], startedAt: t, endedAt: null }
  const steps = items.map((item, i) => {
    const old = base.steps.find(s => s.name === item.content)
    const step: Step = old ?? { id: `s${i}`, name: item.content, status: 'pending', startedAt: null, endedAt: null }
    return setStatus({ ...step, id: old?.id ?? `s${i}` }, item.status, t)
  })
  return finish({ ...base, steps }, t)
}

// Aplica uma ferramenta de plano a uma atividade. `undefined`: não é ferramenta de plano.
function applyPlanTool(prev: Activity | null, e: ToolCallInput, result: unknown, t: number): Activity | null | undefined {
  const args = e as unknown as Record<string, unknown>

  if (e.tool === 'TodoWrite') {
    const todos = args.todos as { content: string; activeForm?: string; status: StepStatus }[]
    return replaceSteps(prev, todos.map(td => ({ content: td.activeForm || td.content, status: td.status })), t, false)
  }

  if (e.tool === 'TaskCreate') {
    const id = (result as { task: { id: string } }).task.id
    const base = prev && prev.endedAt === null ? prev : { steps: [], startedAt: t, endedAt: null }
    const name = (args.activeForm as string | undefined) || (args.subject as string)
    return { ...base, steps: [...base.steps, { id, name, status: 'pending', startedAt: null, endedAt: null }], endedAt: null }
  }

  if (e.tool === 'TaskUpdate') {
    if (!prev) return prev
    const status = args.status as StepStatus | 'deleted' | undefined
    const steps =
      status === 'deleted'
        ? prev.steps.filter(s => s.id !== args.taskId)
        : prev.steps.map(s => {
            if (s.id !== args.taskId) return s
            const renamed = { ...s, name: (args.activeForm as string) || (args.subject as string) || s.name }
            return status ? setStatus(renamed, status, t) : renamed
          })
    return finish({ ...prev, steps }, t)
  }

  // Lista de tarefas do app desktop (Code tab).
  if (e.tool === 'mcp__ccd_turn__update_plan') {
    const plan = args as { items?: PlanItem[]; scope?: string; advance?: boolean; done?: number[]; start?: number }
    if (plan.items) {
      const isNew =
        (plan.scope === 'new_task' || plan.scope === 'first_task') &&
        (prev === null || prev.endedAt !== null || plan.items.every(i => i.status !== 'completed'))
      return replaceSteps(prev, plan.items, t, isNew)
    }
    if (!prev) return prev
    let steps = prev.steps
    if (plan.advance) {
      const cur = steps.findIndex(s => s.status === 'in_progress')
      const nxt = steps.findIndex((s, i) => i > cur && s.status === 'pending')
      steps = steps.map((s, i) => (i === cur ? setStatus(s, 'completed', t) : i === nxt ? setStatus(s, 'in_progress', t) : s))
    }
    const done = plan.done ?? []
    steps = steps.map((s, i) => (done.includes(i + 1) ? setStatus(s, 'completed', t) : s))
    if (plan.start) {
      steps = steps.map((s, i) => (i + 1 === plan.start ? setStatus(s, 'in_progress', t) : s))
    }
    return finish({ ...prev, steps }, t)
  }

  // O wrap_up do desktop fecha a lista de tarefas.
  if (e.tool === 'mcp__ccd_turn__wrap_up') {
    return prev ? finish({ ...prev, steps: prev.steps.map(s => setStatus(s, 'completed', t)) }, t) : prev
  }

  return undefined
}

// Identifica a atividade principal; quando começa uma nova, as barras de subagentes já
// encerrados saem. Dentro da mesma atividade elas ficam, terminadas ou não.
function stepKey(a: Activity | null): string | null {
  return a ? String(a.startedAt) : null
}

type Row = {
  key: string
  left: string
  icon: Icon | null
  ratio: number
  label: string
  right: string
  light: string
  strong: string
}

function mainRow(a: Activity, t0: number): Row {
  const t = a.endedAt ?? Math.max(t0, a.startedAt)
  const total = a.steps.length
  const completed = a.steps.filter(s => s.status === 'completed').length
  const curIdx = a.steps.findIndex(s => s.status === 'in_progress')
  const current: Step | undefined =
    curIdx >= 0 ? a.steps[curIdx] : a.endedAt !== null ? a.steps[total - 1] : a.steps.find(s => s.status === 'pending')
  const position = curIdx >= 0 ? curIdx + 1 : completed

  const stepMs = current?.startedAt != null ? (current.endedAt ?? t) - current.startedAt : 0
  const totalMs = t - a.startedAt

  // Tempo estimado: média das etapas já concluídas × o que falta. Só aparece
  // depois da primeira etapa concluída, quando há base para calcular.
  const timed = a.steps.filter(s => s.status === 'completed' && s.startedAt !== null && s.endedAt !== null)
  let eta = ''
  if (a.endedAt === null && timed.length > 0) {
    const avg = timed.reduce((sum, s) => sum + (s.endedAt! - s.startedAt!), 0) / timed.length
    const pending = a.steps.filter(s => s.status === 'pending').length
    const currentLeft = curIdx >= 0 ? Math.max(0, avg - stepMs) : 0
    eta = ` ~${clock(currentLeft + pending * avg)} restantes`
  }

  return {
    key: 'main',
    left: 'Task Progress',
    icon: null,
    ratio: completed / total,
    label: `${a.endedAt !== null ? '✓ ' : ''}${current?.name ?? ''} (${position}/${total}${eta})`,
    right: `${clock(stepMs)} / ${clock(totalMs)}`,
    light: ORANGE_LIGHT,
    strong: ORANGE,
  }
}

const CODEX_PHASES: Record<string, string> = {
  queued: 'na fila',
  starting: 'iniciando',
  reviewing: 'revisando',
  investigating: 'investigando',
  editing: 'editando',
  finalizing: 'finalizando',
}

// O progresso vem da fase que o plugin do Codex registra; dentro da investigação ele
// avança com as ações do Codex, sem passar de 85%, e só enche quando o job termina.
function codexRow(g: AgentBar, job: CodexJob, t0: number): Row {
  const [light, strong] = CODEX_COLORS
  const t = g.endedAt ?? Math.max(t0, g.startedAt)
  const working = 0.2 + 0.65 * (1 - 1 / (1 + job.actions / 15))
  const byPhase: Record<string, number> = { queued: 0.03, starting: 0.08, reviewing: 0.2, finalizing: 0.92 }
  const ratio = g.endedAt !== null ? (g.failed ? working : 1) : (byPhase[job.phase] ?? working)
  const what = `Codex ${job.kindLabel}`
  let detail: string
  if (g.endedAt !== null) {
    detail = g.failed ? 'interrompida' : job.findings === null ? 'concluída' : findingsText(job.findings)
  } else {
    const phase = CODEX_PHASES[job.phase] ?? job.phase
    detail = job.actions > 0 ? `${phase} · ${job.actions} ${job.actions === 1 ? 'ação' : 'ações'}` : phase
  }
  return {
    key: g.id,
    left: g.philosopher,
    icon: { kind: 'codex', color: CODEX_BODY },
    ratio,
    label: `${g.endedAt === null ? '' : g.failed ? '✗ ' : '✓ '}${what} (${detail})`,
    right: clock(t - g.startedAt),
    light,
    strong,
  }
}

function findingsText(findings: string[]): string {
  if (findings.length === 0) return 'sem achados'
  return `${findings.length} ${findings.length === 1 ? 'achado' : 'achados'}: ${findings.join(', ')}`
}

function agentRow(g: AgentBar, t0: number): Row {
  if (g.codex) return codexRow(g, g.codex, t0)
  const [light, strong] = AGENT_COLORS[g.color % AGENT_COLORS.length]!
  const t = g.endedAt ?? Math.max(t0, g.startedAt)
  const totalMs = t - g.startedAt
  const mark = g.endedAt === null ? '' : g.failed ? '✗ ' : '✓ '
  const plan = g.plan && g.plan.steps.length > 0 ? g.plan : null

  if (plan) {
    const total = plan.steps.length
    const completed = plan.steps.filter(s => s.status === 'completed').length
    const curIdx = plan.steps.findIndex(s => s.status === 'in_progress')
    const cur = curIdx >= 0 ? plan.steps[curIdx] : undefined
    const stepMs = cur?.startedAt != null ? t - cur.startedAt : 0
    return {
      key: g.id,
      left: g.philosopher,
      icon: { kind: 'crab', color: strong },
      ratio: g.endedAt !== null && !g.failed ? 1 : completed / total,
      label: `${mark}${g.description} (${curIdx >= 0 ? curIdx + 1 : completed}/${total})`,
      right: `${clock(stepMs)} / ${clock(totalMs)}`,
      light,
      strong,
    }
  }

  // Sem plano próprio não há total de etapas: a barra avança devagar com as ferramentas
  // usadas, sem passar de 90%, e só enche quando o subagente termina.
  const busy = Math.min(0.9, 1 - 1 / (1 + g.tools / 12))
  return {
    key: g.id,
    left: g.philosopher,
    icon: { kind: 'crab', color: strong },
    ratio: g.endedAt !== null && !g.failed ? 1 : busy,
    label: `${mark}${g.description} (${g.tools} ${g.tools === 1 ? 'ferramenta' : 'ferramentas'})`,
    right: clock(totalMs),
    light,
    strong,
  }
}

// O plugin do Codex roda as reviews por `node .../codex-companion.mjs review` (ou
// adversarial-review, ou task para um rescue).
const CODEX_JOB = /codex-companion\.mjs["']?\s+(adversarial-review|review|task)(?=\s|"|'|$)/

function codexKindLabel(command: string): string | null {
  const kind = CODEX_JOB.exec(command)?.[1]
  return kind === undefined ? null : kind === 'task' ? 'rescue' : kind
}

// Onde o plugin do Codex guarda os jobs: <dados do plugin>/state/<workspace>-<hash>/jobs.
const CODEX_JOBS_GLOB = '"$HOME"/.claude/plugins/data/codex-openai-codex/state/*/jobs/*.json'

type CodexRecord = {
  id: string
  kindLabel?: string
  status?: string
  phase?: string
  createdAt?: string
  completedAt?: string
  logFile?: string | null
  rendered?: string
}

// Lê os jobs mais recentes do plugin do Codex; [] em qualquer erro.
async function codexRecords($: EngineInterface): Promise<CodexRecord[]> {
  const ls = await $.process
    .run(['sh', '-c', `ls -t ${CODEX_JOBS_GLOB} 2>/dev/null | head -n 8`], { timeoutMs: 5_000 })
    .catch(() => null)
  if (!ls || ls.exitCode !== 0) return []
  const out: CodexRecord[] = []
  for (const file of ls.stdout.split('\n').filter(Boolean)) {
    try {
      out.push(JSON.parse(await $.fs.read(file)) as CodexRecord)
    } catch {
      // um job sendo reescrito agora: fica para a próxima leitura
    }
  }
  return out
}

// Quantas ações o Codex já fez: os comandos e ferramentas que o log registra.
async function codexActions($: EngineInterface, logFile: string | null | undefined): Promise<number> {
  if (!logFile) return 0
  const r = await $.process
    .run(['grep', '-c', '-E', '\\] (Running command|Running tool|Calling |Searching:|Applying )', '--', logFile], { timeoutMs: 5_000 })
    .catch(() => null)
  return r ? Number.parseInt(r.stdout.trim(), 10) || 0 : 0
}

// Os achados de uma review terminada: os [P1], [P2]... do resultado.
function codexFindings(rendered: string | undefined): string[] | null {
  if (!rendered) return null
  const found = [...rendered.matchAll(/\[(P\d)\]/g)].map(m => m[1]!)
  if (found.length > 0) return found
  return /no (?:issues|findings)|did not (?:find|identify)|looks good|nenhum/i.test(rendered) ? [] : null
}

let codexPoller: Timer | null = null
let isCodexPolling = false

function startCodexPoller($: EngineInterface): void {
  if (codexPoller) return
  codexPoller = $.clock.every(2_000, () => void pollCodex($).catch(() => {}))
}

// Liga cada barra do Codex ao job dela e atualiza fase, ações e achados.
async function pollCodex($: EngineInterface): Promise<void> {
  if (isCodexPolling) return
  isCodexPolling = true
  try {
    const running = (await read($, agents)).filter(g => g.codex && g.endedAt === null)
    if (running.length === 0) {
      codexPoller?.cancel()
      codexPoller = null
      return
    }
    const records = await codexRecords($)
    const claimed = new Set((await read($, agents)).map(g => g.codex?.jobId).filter(Boolean))
    for (const g of running) {
      const job = g.codex!
      let rec = job.jobId ? records.find(r => r.id === job.jobId) : undefined
      if (!rec && !job.jobId) {
        // O job mais recente criado depois que a barra abriu, do mesmo tipo, ainda sem dono.
        rec = records.find(
          r =>
            !claimed.has(r.id) &&
            (r.kindLabel ?? '') === job.kindLabel &&
            Date.parse(r.createdAt ?? '') >= g.startedAt - 5_000,
        )
        if (rec) claimed.add(rec.id)
      }
      if (!rec) continue
      const actions = await codexActions($, rec.logFile)
      const isOver = rec.status === 'completed' || rec.status === 'failed' || rec.status === 'cancelled'
      const t = await $.clock.now()
      const endedAt = isOver ? Date.parse(rec.completedAt ?? '') || t : null
      const recId = rec.id
      const phase = rec.phase ?? job.phase
      const findings = isOver ? codexFindings(rec.rendered) : null
      await update($, agents, list =>
        list.map(x =>
          x.id === g.id
            ? {
                ...x,
                endedAt: x.endedAt ?? endedAt,
                failed: isOver && rec!.status !== 'completed',
                codex: { ...job, jobId: recId, phase, actions, findings },
              }
            : x,
        ),
      )
    }
  } finally {
    isCodexPolling = false
  }
}

// Relógio que redesenha os tempos a cada segundo enquanto há alguém trabalhando.
let tick: Timer | null = null

function startTick($: EngineInterface): void {
  if (tick) return
  tick = $.clock.every(1000, () => {
    void $.clock.now().then(t => update($, now, () => t)).catch(() => {})
  })
}

function stopTick(): void {
  tick?.cancel()
  tick = null
}

export const register: Register = on => {
  let mainWorking = false

  on('prompt.submit', async ($, e, next) => {
    try {
      mainWorking = true
      const t = await $.clock.now()
      await update($, now, () => t)
      const a = await read($, activity)
      if (a && a.endedAt !== null) await update($, waiting, () => true)
      startTick($)
    } catch {
      // ignora: o progresso é só visual
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const res = await next(e)
    if (res.deny !== undefined || !res.agentId) return res
    try {
      const t = await $.clock.now()
      const id = res.agentId
      await update($, agents, prev => {
        const usedNames = new Set(prev.map(g => g.philosopher))
        const free = NAMES.filter(p => !usedNames.has(p))
        const pool = free.length > 0 ? free : NAMES
        const philosopher = pool[Math.floor(Math.random() * pool.length)]!
        const usedColors = new Set(prev.filter(g => !g.codex).map(g => g.color % AGENT_COLORS.length))
        const color = AGENT_COLORS.findIndex((_, i) => !usedColors.has(i))
        const bar: AgentBar = {
          id,
          philosopher,
          color: color >= 0 ? color : prev.length,
          description: e.description || e.subagentType,
          startedAt: t,
          endedAt: null,
          failed: false,
          tools: 0,
          plan: null,
        }
        return [...prev.filter(g => g.id !== id), bar]
      })
      await update($, now, () => t)
      startTick($)
    } catch {
      // ignora: o progresso é só visual
    }
    return res
  })

  on('turn.complete', async ($, e, next) => {
    try {
      const t = await $.clock.now()
      await update($, now, () => t)
      if (e.agentId) {
        const failed = e.reason === 'error' || e.reason === 'refusal' || e.isAborted
        await update($, agents, prev =>
          prev.map(g => (g.id === e.agentId && g.endedAt === null ? { ...g, endedAt: t, failed } : g)),
        )
      } else {
        mainWorking = false
        await update($, waiting, () => false)
      }
      const list = await read($, agents)
      if (!mainWorking && list.every(g => g.endedAt !== null)) stopTick()
    } catch {
      // ignora: o progresso é só visual
    }
    return next(e)
  })

  // A ferramenta roda primeiro; a contabilidade nunca bloqueia nem quebra a chamada.
  on('tool.call', async ($, e, next) => {
    // Uma review do Codex ganha a barra antes de rodar: em primeiro plano o Bash só
    // volta quando ela termina.
    let codexBarId: string | null = null
    if (e.tool === 'Bash') {
      try {
        const kindLabel = codexKindLabel(e.command)
        if (kindLabel) {
          const t = await $.clock.now()
          const id = `codex-${e.tool_use_id}`
          codexBarId = id
          await update($, agents, prev => {
            const usedNames = new Set(prev.map(g => g.philosopher))
            const free = NAMES.filter(p => !usedNames.has(p))
            const pool = free.length > 0 ? free : NAMES
            const bar: AgentBar = {
              id,
              philosopher: pool[Math.floor(Math.random() * pool.length)]!,
              color: 0,
              description: `Codex ${kindLabel}`,
              startedAt: t,
              endedAt: null,
              failed: false,
              tools: 0,
              plan: null,
              codex: { jobId: null, kindLabel, phase: 'queued', actions: 0, findings: null },
            }
            return [...prev.filter(g => g.id !== id), bar]
          })
          await update($, now, () => t)
          startTick($)
          startCodexPoller($)
        }
      } catch {
        // ignora: o progresso é só visual
      }
    }

    const res = await next(e)

    if (codexBarId) {
      try {
        // Em primeiro plano a review já terminou: uma última leitura fecha a barra.
        await pollCodex($)
        if (res.deny !== undefined || res.isError) {
          const t = await $.clock.now()
          const id = codexBarId
          await update($, agents, list => list.map(g => (g.id === id && g.endedAt === null ? { ...g, endedAt: t, failed: true } : g)))
        }
      } catch {
        // ignora: o progresso é só visual
      }
    }

    try {
      const t = await $.clock.now()
      const ok = res.deny === undefined && !res.isError

      if (e.agentId) {
        const agentId = e.agentId
        await update($, agents, prev =>
          prev.map(g => {
            if (g.id !== agentId) return g
            const plan = ok ? applyPlanTool(g.plan, e, res.result, t) : undefined
            return { ...g, tools: g.tools + 1, plan: plan === undefined ? g.plan : plan }
          }),
        )
        return res
      }

      if (!ok) return res
      const prev = await read($, activity)
      const nextActivity = applyPlanTool(prev, e, res.result, t)
      if (nextActivity === undefined) return res
      await update($, activity, () => nextActivity)
      await update($, waiting, () => false)

      const key = stepKey(nextActivity)
      if (key !== (await read($, agentsStepKey))) {
        await update($, agentsStepKey, () => key)
        await update($, agents, list => list.filter(g => g.endedAt === null))
      }
    } catch {
      // ignora: o progresso é só visual
    }
    return res
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const a = await read($, activity)
    const list = await read($, agents)
    if ((!a || a.steps.length === 0) && list.length === 0) {
      return next(e)
    }

    const t = await read($, now)
    const rows: Row[] = []
    if (a && a.steps.length > 0) {
      rows.push(
        (await read($, waiting))
          ? {
              key: 'main',
              left: 'Task Progress',
              icon: null,
              ratio: 0,
              label: 'Aguardando o próximo plano…',
              right: `${clock(0)} / ${clock(0)}`,
              light: ORANGE_LIGHT,
              strong: ORANGE,
            }
          : mainRow(a, t),
      )
    }
    for (const g of list) rows.push(agentRow(g, t))

    // Com uma pergunta na band, o engine aceita só um tree sem larguras, alturas ou posições,
    // com a pergunta dele embaixo: as barras viram uma linha de texto cada, sem sumir.
    if (e.props.hasSurvey) {
      const { Box, Text } = $.ui.resolve(e)
      const below = await next(e)
      const cells = 24
      const line = (r: Row) => {
        const filled = Math.round(r.ratio * cells)
        return (
          <Box key={r.key} flexDirection="row" gap={1}>
            <Text color={MUTED} bold>{r.icon ? `${r.icon.kind === 'crab' ? '🦀' : '🤖'} ${r.left}` : r.left}</Text>
            <Text>
              {Array.from({ length: cells }, (_, i) => (
                <Text key={`c${i}`} color={i < filled ? mix(r.light, r.strong, i / (cells - 1)) : TRACK}>━</Text>
              ))}
            </Text>
            <Text color={ON_TRACK} bold>{r.label}</Text>
            <Text color={MUTED}>{r.right}</Text>
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          {rows.map(line)}
          {below}
        </Box>
      )
    }

    if (e.surface === 'desktop') {
      const { Box, Text, Svg } = $.ui.resolve(e)
      const bar = (r: Row) => {
        // Porcentagem inteira (o desktop recusa decimais), usada na barra e no corte do nome.
        const pct = Math.round(r.ratio * 100)
        // A camada escura é cortada na largura do preenchimento; por dentro ela volta à
        // largura da barra inteira (100/pct) para o nome ficar no mesmo lugar da camada clara.
        // O desktop aceita no máximo 3 dígitos de porcentagem: abaixo de 11% a camada escura
        // pediria mais de 999% e fica de fora (o nome centralizado não chega tão à esquerda).
        const inner = pct > 0 ? Math.round(10000 / pct) : 100
        const hasDarkLayer = pct > 0 && inner <= 999
        return (
          <Box key={r.key} flexDirection="row" alignItems="center" gap={2}>
            <Box flexShrink={0} width={LEFT_CELLS} flexDirection="row" alignItems="center" gap={1}>
              {r.icon ? (
                <Svg
                  source={iconSvg(r.icon)}
                  alt={r.icon.kind === 'crab' ? 'crab' : 'Codex'}
                  width={CRAB_PIXELS[0]!.length * ICON_PX}
                  height={CRAB_PIXELS.length * ICON_PX}
                />
              ) : null}
              <Text color={MUTED} bold wrap="truncate">{r.left}</Text>
            </Box>
            <Box position="relative" flexGrow={1} flexShrink={1} minWidth={0} marginX={1} justifyContent="center">
              <Svg source={barSvg(pct / 100, r.light, r.strong)} alt={`${r.left}: ${r.label}, ${pct}%`} height={BAR_PX} />
              <Box position="absolute" top={0} left={0} right={0} bottom={0} justifyContent="center" alignItems="center">
                <Text color={ON_TRACK} bold wrap="truncate">{r.label}</Text>
              </Box>
              {hasDarkLayer ? (
                <Box position="absolute" top={0} left={0} bottom={0} width={`${pct}%`} overflow="hidden">
                  <Box position="absolute" top={0} left={0} bottom={0} width={`${inner}%`} justifyContent="center" alignItems="center">
                    <Text color={ON_FILL} bold wrap="truncate">{r.label}</Text>
                  </Box>
                </Box>
              ) : null}
            </Box>
            <Box flexShrink={0} width={RIGHT_CELLS} justifyContent="flex-end">
              <Text color={MUTED} wrap="truncate">{r.right}</Text>
            </Box>
          </Box>
        )
      }
      return (
        <Box flexDirection="column" gap="sm" paddingX={1} paddingY="sm">
          {rows.map(bar)}
        </Box>
      )
    }

    // Terminal: cada barra é montada célula a célula, com o gradiente cor a cor no trecho preenchido.
    const { Box, Text } = $.ui.resolve(e)
    const rightCells = Math.max(RIGHT_CELLS, ...rows.map(r => r.right.length + 2))
    const width = Math.max(10, e.props.bodyColumns - (LEFT_CELLS + 2) - rightCells)
    const bar = (r: Row) => {
      const shown = r.label.length > width - 2 ? `${r.label.slice(0, width - 3)}…` : r.label
      const padL = Math.floor((width - shown.length) / 2)
      const cells = (' '.repeat(padL) + shown).padEnd(width, ' ')
      const filled = Math.round(r.ratio * width)
      return (
        <Box key={r.key} flexDirection="row">
          <Text color={MUTED} bold>{` ${(r.icon ? `${r.icon.kind === 'crab' ? '🦀' : '🤖'} ${r.left}` : r.left).slice(0, LEFT_CELLS).padEnd(LEFT_CELLS)} `}</Text>
          {[...cells.slice(0, filled)].map((ch, i) => (
            <Text key={`f${i}`} color={ON_FILL} backgroundColor={mix(r.light, r.strong, width > 1 ? i / (width - 1) : 1)} bold>
              {ch}
            </Text>
          ))}
          <Text color={ON_TRACK} backgroundColor={TRACK} bold>{cells.slice(filled)}</Text>
          <Text color={MUTED}>{`${r.right} `.padStart(rightCells)}</Text>
        </Box>
      )
    }
    return <Box flexDirection="column">{rows.map(bar)}</Box>
  })
}
