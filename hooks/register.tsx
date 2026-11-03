import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, Timer, ToolCallInput } from 'claude-code'

import type { Activity, AgentBar, CodexJob, Step, StepStatus, TimelineEntry } from '../types'

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
// O crab das tasks: sempre laranja, com um bloco de notas no lugar do notebook.
// N folha, n linhas escritas, R espiral.
const TASK_PIXELS = [
  '......CCCCCCCC..',
  '......CECCCCEC..',
  '.....CCCCCCCCCCC',
  '.RRR..CCCCCCCC..',
  'NNNNN.CCCCCCCC..',
  'NnnnN.C.C..C.C..',
  'NNNNN...........',
  'NnnnN...........',
]
const ICON_PX = 2
const CODEX_BODY = '#5B7CFA'
// A barra do Codex fica sempre no azul-índigo do pet.
const CODEX_COLORS = ['#C3CCFB', '#5468E8'] as const

type Icon = { kind: 'crab' | 'codex' | 'task'; color: string }

const TASK_ICON: Icon = { kind: 'task', color: '#D77757' }
const CRAB_ICON: Icon = { kind: 'crab', color: '#8B6FE0' }

function iconSvg(icon: Icon): string {
  const grid = icon.kind === 'crab' ? CRAB_PIXELS : icon.kind === 'task' ? TASK_PIXELS : CODEX_PIXELS
  const fills: Record<string, string> = {
    C: icon.color,
    E: '#262624',
    B: icon.color,
    V: '#1E2340',
    c: '#7FE3F0',
    P: '#D8E0FF',
    L: '#B8B6AE',
    S: '#5A5955',
    N: '#F2EEE6',
    n: '#9C9A92',
    R: '#B8B6AE',
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

function iconAlt(icon: Icon): string {
  return icon.kind === 'crab' ? 'crab' : icon.kind === 'task' ? 'task' : 'Codex'
}

function iconEmoji(icon: Icon): string {
  return icon.kind === 'crab' ? '🦀' : icon.kind === 'task' ? '📝' : '🤖'
}

// Altura e raio dos cantos da barra no desktop (px), próximos ao formato da band.
const BAR_PX = 22
const BAR_RADIUS = 6
// A barra da Timeline: um terço da altura da barra da band.
const THIN_BAR_PX = 7
// O separador entre as entradas da Timeline: uma linha cinza leve, como a do rail.
const DIVIDER = '#3A3936'
const DIVIDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="1" viewBox="0 0 4000 1" preserveAspectRatio="none"><rect width="4000" height="1" fill="${DIVIDER}"/></svg>`

function mix(a: string, b: string, k: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const c = [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * k))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

// Trilho arredondado com o preenchimento em gradiente. O SVG estica na horizontal;
// o viewBox fica perto da largura real para os cantos não deformarem.
function barSvg(ratio: number, light: string, strong: string, h = BAR_PX, r = BAR_RADIUS): string {
  const w = 700
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
// A linha do tempo do painel: nada sai dela, ao contrário da band.
const timeline = atom({ plugin: 'laterallus-progress', key: 'timeline' } as const, [])

const PANE = 'laterallus-timeline'
const PANE_TITLE = 'Timeline'

// Copia o plano atual e cada barra de agente para a linha do tempo, uma linha por
// atividade (pelo início), sem nunca tirar uma que já esteja lá.
async function syncTimeline($: EngineInterface): Promise<void> {
  const a = await read($, activity)
  const list = await read($, agents)
  const fresh: TimelineEntry[] = []
  if (a && a.steps.length > 0) {
    fresh.push({ key: `task-${a.startedAt}`, kind: 'task', startedAt: a.startedAt, activity: a, agent: null })
  }
  for (const g of list) {
    fresh.push({ key: `agent-${g.id}`, kind: g.codex ? 'external' : 'agent', startedAt: g.startedAt, activity: null, agent: g })
  }
  if (fresh.length === 0) return
  let isNewEntry = false
  const t = await $.clock.now()
  await update($, timeline, prev => {
    const byKey = new Map(prev.map(x => [x.key, x] as const))
    for (const x of fresh) {
      if (!byKey.has(x.key)) {
        isNewEntry = true
        // Um plano novo encerra o anterior que ficou pela metade: ele vai para Canceled.
        if (x.kind === 'task') {
          for (const [key, old] of byKey) {
            if (old.kind === 'task' && old.activity && old.activity.endedAt === null && !old.cancelledAt) {
              byKey.set(key, { ...old, cancelledAt: t })
            }
          }
        }
      }
      byKey.set(x.key, { ...x, cancelledAt: byKey.get(x.key)?.cancelledAt ?? null })
    }
    return [...byKey.values()].sort((x, y) => x.startedAt - y.startedAt).slice(-300)
  })
  // Cada atividade nova abre a aba (ou só a mantém, se já estiver aberta).
  if (isNewEntry) await openTimeline($)
}

// Abre a aba da linha do tempo; se o app não a colocar na tela, avisa o motivo uma vez.
let lastOpenFailure: string | null = null

async function openTimeline($: EngineInterface): Promise<void> {
  const opened = await $.ui.open({ id: PANE, title: PANE_TITLE }).catch(() => null)
  if (opened && !opened.isPlaced && opened.reason !== lastOpenFailure) {
    lastOpenFailure = opened.reason
    void $.ui.toast(`Timeline não abriu: ${opened.reason}. Use /timeline.`)
  }
}

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
  // O nome da atividade, a marca de fim (✓/✗) e a contagem entre parênteses, separados
  // para a Timeline; o label junta tudo para a barra.
  name: string
  mark: Mark
  count: string
  right: string
  light: string
  strong: string
}

type Mark = 'ok' | 'fail' | 'cancel' | null

const MARK_TEXT = { ok: '✓', fail: '✗', cancel: '✗' } as const
const MARK_LABELS = { ok: 'Success', fail: 'Failed', cancel: 'Canceled' } as const
const MARK_COLORS = { ok: '#6CC070', fail: '#E5534B', cancel: '#E5534B' } as const

function agentMark(g: AgentBar): Mark {
  return g.endedAt === null ? null : !g.failed ? 'ok' : g.canceled ? 'cancel' : 'fail'
}

function markPrefix(m: Mark): string {
  return m ? `${MARK_TEXT[m]} ` : ''
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

  const name = current?.name ?? ''
  const mark: Mark = a.endedAt !== null ? 'ok' : null
  const count = `${position}/${total}${eta}`
  return {
    key: 'main',
    left: 'Task Progress',
    icon: null,
    ratio: completed / total,
    label: `${markPrefix(mark)}${name} (${count})`,
    name,
    mark,
    count,
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
  const mark = agentMark(g)
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
    label: `${markPrefix(mark)}${what} (${detail})`,
    name: what,
    mark,
    count: detail,
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
  const mark = agentMark(g)
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
      label: `${markPrefix(mark)}${g.description} (${curIdx >= 0 ? curIdx + 1 : completed}/${total})`,
      name: g.description,
      mark,
      count: `${curIdx >= 0 ? curIdx + 1 : completed}/${total}`,
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
    label: `${markPrefix(mark)}${g.description} (${g.tools} ${g.tools === 1 ? 'ferramenta' : 'ferramentas'})`,
    name: g.description,
    mark,
    count: `${g.tools} ${g.tools === 1 ? 'ferramenta' : 'ferramentas'}`,
    right: clock(totalMs),
    light,
    strong,
  }
}

// Uma barra no desktop: nome à esquerda, a barra com o nome da atividade no meio e o
// tempo à direita. Usada pela band e pelo painel da linha do tempo.
function desktopBar(ui: Elements['desktop'], r: Row, leftCells: number, rightCells: number) {
  const { Box, Text, Svg } = ui
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
      <Box flexShrink={0} width={leftCells} flexDirection="row" alignItems="center" gap={1}>
        {r.icon ? (
          <Svg
            source={iconSvg(r.icon)}
            alt={iconAlt(r.icon)}
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
      <Box flexShrink={0} width={rightCells} justifyContent="flex-end">
        <Text color={MUTED} wrap="truncate">{r.right}</Text>
      </Box>
    </Box>
  )
}

// Terminal: a barra é montada célula a célula, com o gradiente cor a cor no trecho preenchido.
function terminalBar(ui: Pick<Elements['terminal'], 'Box' | 'Text'>, r: Row, width: number, leftCells: number, rightCells: number) {
  const { Box, Text } = ui
  const shown = r.label.length > width - 2 ? `${r.label.slice(0, width - 3)}…` : r.label
  const padL = Math.floor((width - shown.length) / 2)
  const cells = (' '.repeat(padL) + shown).padEnd(width, ' ')
  const filled = Math.round(r.ratio * width)
  return (
    <Box key={r.key} flexDirection="row">
      <Text color={MUTED} bold>{` ${(r.icon ? `${iconEmoji(r.icon)} ${r.left}` : r.left).slice(0, leftCells).padEnd(leftCells)} `}</Text>
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

// Hora do dia (HH:MM:SS) de um instante, no fuso da máquina.
function timeOfDay(t: number): string {
  const d = new Date(t)
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, '0')).join(':')
}

const KIND_LABELS: Record<TimelineEntry['kind'], string> = {
  task: 'Task',
  agent: 'Sub-Agent',
  external: 'External Agent',
}

// A barra de uma linha da linha do tempo, e quando ela começou e terminou.
function timelineRow(x: TimelineEntry, t: number): { row: Row; endedAt: number | null } | null {
  if (x.activity && x.cancelledAt) {
    // Os tempos param no cancelamento, e a marca é ✗.
    const row = mainRow(x.activity, x.cancelledAt)
    const label = `${markPrefix('cancel')}${row.name} (${row.count})`
    return { row: { ...row, key: x.key, left: 'Progress', icon: TASK_ICON, mark: 'cancel', label }, endedAt: x.cancelledAt }
  }
  if (x.activity) return { row: { ...mainRow(x.activity, t), key: x.key, left: 'Progress', icon: TASK_ICON }, endedAt: x.activity.endedAt }
  if (x.agent) return { row: { ...agentRow(x.agent, t), key: x.key }, endedAt: x.agent.endedAt }
  return null
}

type EntryStatus = 'running' | 'completed' | 'canceled'

function entryStatus(x: TimelineEntry): EntryStatus {
  if (x.activity) return x.cancelledAt ? 'canceled' : x.activity.endedAt !== null ? 'completed' : 'running'
  if (x.agent) return x.agent.endedAt === null ? 'running' : x.agent.failed ? 'canceled' : 'completed'
  return 'completed'
}

const STATUS_LABELS: Record<EntryStatus, string> = { running: 'Running', completed: 'Completed', canceled: 'Canceled' }

// Os totais da sessão por tipo: rodando / encerrados (concluídos ou cancelados) / total.
type Totals = { kind: TimelineEntry['kind']; icon: Icon; text: string }

function totalsOf(list: TimelineEntry[]): Totals[] {
  const kinds: [TimelineEntry['kind'], Icon][] = [
    ['task', TASK_ICON],
    ['agent', CRAB_ICON],
    ['external', { kind: 'codex', color: CODEX_BODY }],
  ]
  return kinds.map(([kind, icon]) => {
    const mine = list.filter(x => x.kind === kind)
    const running = mine.filter(x => entryStatus(x) === 'running').length
    return { kind, icon, text: `${running} / ${mine.length - running} / ${mine.length}` }
  })
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
                canceled: isOver && rec!.status === 'cancelled',
                codex: { ...job, jobId: recId, phase, actions, findings },
              }
            : x,
        ),
      )
    }
    await syncTimeline($)
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

  // O painel da linha do tempo abre sozinho como uma aba; /timeline reabre se for fechado.
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    try {
      await $.command.register({ name: 'timeline', description: 'Abre a linha do tempo das atividades do LaterallusCODE' })
      void openTimeline($)
    } catch {
      // ignora: o progresso é só visual
    }
    return started
  })

  on('command.run', { command: 'timeline' }, async $ => {
    await $.ui.open({ id: PANE, title: PANE_TITLE })
    return { text: 'Linha do tempo aberta.' }
  })

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
      await syncTimeline($)
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
        const canceled = e.isAborted
        await update($, agents, prev =>
          prev.map(g => (g.id === e.agentId && g.endedAt === null ? { ...g, endedAt: t, failed, canceled } : g)),
        )
      } else {
        mainWorking = false
        await update($, waiting, () => false)
      }
      await syncTimeline($)
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
          const canceled = res.deny !== undefined
          await update($, agents, list =>
            list.map(g => (g.id === id && g.endedAt === null ? { ...g, endedAt: t, failed: true, canceled } : g)),
          )
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
    } finally {
      await syncTimeline($).catch(() => {})
    }
    return res
  })

  // A band mostra tudo o que está rodando e, de cada tipo sem nada rodando, o último que
  // terminou ou foi cancelado; o resto vive na Timeline. Embaixo, os totais por tipo.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const a = await read($, activity)
    const list = await read($, agents)
    const history = await read($, timeline)
    const t = await read($, now)
    const running: Record<TimelineEntry['kind'], Row[]> = { task: [], agent: [], external: [] }
    if (a && a.steps.length > 0 && a.endedAt === null && !(await read($, waiting))) running.task.push(mainRow(a, t))
    for (const g of list) if (g.endedAt === null) running[g.codex ? 'external' : 'agent'].push(agentRow(g, t))
    const rows: Row[] = []
    for (const kind of ['task', 'agent', 'external'] as const) {
      if (running[kind].length > 0) {
        rows.push(...running[kind])
        continue
      }
      let last: { row: Row; endedAt: number } | null = null
      for (const x of history) {
        if (x.kind !== kind || entryStatus(x) === 'running') continue
        const shown = timelineRow(x, t)
        if (shown && shown.endedAt !== null && (!last || shown.endedAt >= last.endedAt)) last = { row: shown.row, endedAt: shown.endedAt }
      }
      if (last) rows.push(kind === 'task' ? { ...last.row, left: 'Task Progress', icon: null } : last.row)
    }
    if (rows.length === 0 && history.length === 0) {
      return next(e)
    }
    const totals = totalsOf(history)

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
            <Text color={MUTED} bold>{r.icon ? `${iconEmoji(r.icon)} ${r.left}` : r.left}</Text>
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
          <Box key="totals" flexDirection="row" gap={3}>
            {totals.map(x => (
              <Text key={x.kind} color={MUTED}>{`${iconEmoji(x.icon)} ${x.text}`}</Text>
            ))}
          </Box>
          {below}
        </Box>
      )
    }

    if (e.surface === 'desktop') {
      const ui = $.ui.resolve(e)
      const { Box, Text, Svg } = ui
      const align = ['flex-start', 'center', 'flex-end'] as const
      return (
        <Box flexDirection="column" gap="sm" paddingX={1} paddingY="sm">
          {rows.map(r => desktopBar(ui, r, LEFT_CELLS, RIGHT_CELLS))}
          <Box key="totals" flexDirection="row" alignItems="center">
            {totals.map((x, i) => (
              <Box key={x.kind} width="33%" flexDirection="row" alignItems="center" justifyContent={align[i]} gap={1}>
                <Svg
                  source={iconSvg(x.icon)}
                  alt={KIND_LABELS[x.kind]}
                  width={CRAB_PIXELS[0]!.length * ICON_PX}
                  height={CRAB_PIXELS.length * ICON_PX}
                />
                <Text color={MUTED} bold>{x.text}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    // Terminal: cada barra é montada célula a célula, com o gradiente cor a cor no trecho preenchido.
    const ui = $.ui.resolve(e)
    const rightCells = Math.max(RIGHT_CELLS, ...rows.map(r => r.right.length + 2))
    const width = Math.max(10, e.props.bodyColumns - (LEFT_CELLS + 2) - rightCells)
    return (
      <ui.Box flexDirection="column">
        {rows.map(r => terminalBar(ui, r, width, LEFT_CELLS, rightCells))}
        <ui.Box key="totals" flexDirection="row" justifyContent="space-between" paddingX={1}>
          {totals.map(x => (
            <ui.Text key={x.kind} color={MUTED} bold>{`${iconEmoji(x.icon)} ${x.text}`}</ui.Text>
          ))}
        </ui.Box>
      </ui.Box>
    )
  })
  // Linha do tempo, no estilo de um painel de agentes: cada plano, subagente e agente
  // externo numa entrada própria, agrupadas em Running, Completed e Canceled e, dentro de
  // cada grupo, na ordem em que começaram. Em cima o tipo e a contagem; no meio o que a
  // atividade faz, na cor do tipo; embaixo uma barra fina e o horário de início / fim.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, timeline)
    const t = await read($, now)
    const entries = list.flatMap(x => {
      const shown = timelineRow(x, t)
      if (!shown) return []
      const r = shown.row
      const kindColor = x.kind === 'task' ? ORANGE : r.strong
      const span = `${timeOfDay(x.startedAt)} / ${shown.endedAt !== null ? timeOfDay(shown.endedAt) : '--:--:--'}`
      const detail = [r.count, r.right].filter(Boolean).join(' · ')
      const isTask = x.kind === 'task'
      return [{ key: x.key, status: entryStatus(x), kind: KIND_LABELS[x.kind], kindColor, span, detail, isTask, row: r }]
    })
    type Entry = (typeof entries)[number]
    const groups = (['running', 'completed', 'canceled'] as const)
      .map(status => ({ status, items: entries.filter(x => x.status === status) }))
      .filter(g => g.items.length > 0)

    if (e.surface === 'desktop') {
      const { Box, Text, Svg } = $.ui.resolve(e)
      const entry = (x: Entry, i: number) => (
        <Box key={x.key} flexDirection="column" gap="xs">
          {i > 0 ? <Svg source={DIVIDER_SVG} alt="" height={1} /> : null}
          <Box flexDirection="row" justifyContent="space-between" gap={1}>
            <Text color={MUTED} bold>{x.kind}</Text>
            <Text color={MUTED} wrap="truncate">{x.detail}</Text>
          </Box>
          <Box flexDirection="row" alignItems="center" gap={1}>
            {x.row.icon ? (
              <Svg
                source={iconSvg(x.row.icon)}
                alt={iconAlt(x.row.icon)}
                width={CRAB_PIXELS[0]!.length * ICON_PX}
                height={CRAB_PIXELS.length * ICON_PX}
              />
            ) : null}
            {x.row.icon && !x.isTask ? <Text color={x.kindColor} bold>{x.row.left}</Text> : null}
            {x.row.icon && !x.isTask ? <Text color={MUTED}>-</Text> : null}
            <Box flexShrink={1} minWidth={0}>
              <Text color={MUTED} bold wrap="truncate">{x.row.name}</Text>
            </Box>
            {x.row.mark ? <Text color={MUTED}>-</Text> : null}
            {x.row.mark ? (
              <Text color={MARK_COLORS[x.row.mark]} bold>{`${MARK_TEXT[x.row.mark]} ${MARK_LABELS[x.row.mark]}`}</Text>
            ) : null}
          </Box>
          <Svg
            source={barSvg(x.row.ratio, x.row.light, x.row.strong, THIN_BAR_PX, THIN_BAR_PX / 2)}
            alt={`${x.row.name}: ${Math.round(x.row.ratio * 100)}%`}
            height={THIN_BAR_PX}
          />
          <Box flexDirection="row" justifyContent="flex-end">
            <Text color={MUTED}>{x.span}</Text>
          </Box>
        </Box>
      )
      return (
        <Box flexDirection="column" gap="lg" paddingX={1} paddingY="sm">
          {entries.length === 0 ? <Text color={MUTED}>Nenhuma atividade ainda.</Text> : null}
          {groups.map(g => (
            <Box key={g.status} flexDirection="column" gap="md">
              <Text color={ON_TRACK} bold>{`${STATUS_LABELS[g.status]} · ${g.items.length}`}</Text>
              {g.items.map(entry)}
            </Box>
          ))}
        </Box>
      )
    }

    // Terminal: as mesmas linhas em texto, a barra como uma fileira de ━.
    const { Box, Text } = $.ui.resolve(e)
    const cells = Math.max(10, e.props.bodyColumns - 2)
    const entry = (x: Entry, i: number) => {
      const filled = Math.round(x.row.ratio * cells)
      const icon = x.row.icon ? `${iconEmoji(x.row.icon)} ` : ''
      return (
        <Box key={x.key} flexDirection="column" marginBottom={1}>
          {i > 0 ? <Text color={DIVIDER}>{'─'.repeat(cells + 1)}</Text> : null}
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={MUTED} bold>{` ${x.kind}`}</Text>
            <Text color={MUTED} wrap="truncate-end">{`${x.detail} `}</Text>
          </Box>
          <Text wrap="truncate-end">
            {` ${icon}`}
            {x.isTask ? null : <Text color={x.kindColor} bold>{x.row.left}</Text>}
            {x.isTask ? null : <Text color={MUTED}>{' - '}</Text>}
            <Text color={MUTED} bold>{x.row.name}</Text>
            {x.row.mark ? <Text color={MUTED}>{' - '}</Text> : null}
            {x.row.mark ? (
              <Text color={MARK_COLORS[x.row.mark]} bold>{`${MARK_TEXT[x.row.mark]} ${MARK_LABELS[x.row.mark]}`}</Text>
            ) : null}
          </Text>
          <Text>
            {' '}
            {Array.from({ length: cells }, (_, c) => (
              <Text key={`c${c}`} color={c < filled ? mix(x.row.light, x.row.strong, c / (cells - 1)) : TRACK}>━</Text>
            ))}
          </Text>
          <Box flexDirection="row" justifyContent="flex-end">
            <Text color={MUTED}>{`${x.span} `}</Text>
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        {entries.length === 0 ? <Text color={MUTED}>Nenhuma atividade ainda.</Text> : null}
        {groups.map(g => (
          <Box key={g.status} flexDirection="column">
            <Text color={ON_TRACK} bold>{` ${STATUS_LABELS[g.status]} · ${g.items.length}`}</Text>
            {g.items.map(entry)}
          </Box>
        ))}
      </Box>
    )
  })
}
