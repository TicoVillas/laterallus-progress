# laterallus-progress

Um mod para o Claude Code que mostra, logo acima da caixa de chat, barras de progresso para tudo o que está em andamento:

- **Plano do Claude**: `Task Progress`, com a barra em gradiente laranja, o nome da etapa atual, `(x/y - tempo ETA)` e o tempo da etapa / tempo total da atividade.
- **Subagentes nativos**: uma barra por subagente, com um crab segurando um notebook, um nome de uma figura histórica e uma cor própria. Mostra a tarefa do subagente e o andamento dele.
- **Reviews do Codex**: uma barra azul com o pet do Codex para cada `/codex:review`, `/codex:adversarial-review` ou rescue do plugin do Codex, com a fase, as ações do Codex e, no fim, os achados.

As barras começam vazias, não somem ao terminar e ficam até começar uma nova atividade. Enquanto há uma pergunta aberta acima do prompt, a band vira uma versão compacta em texto.

Funciona no app desktop (aba Code) e no terminal.

## Instalação

No prompt de uma sessão do Claude Code:

```
/plugin install laterallus-progress --marketplace TicoVillas/laterallus-progress
```

Confirme com `y` para adicionar o marketplace e escolha o escopo.

Pelo shell:

```bash
claude plugin install laterallus-progress --marketplace TicoVillas/laterallus-progress
```

## De onde vêm as informações

- **Plano**: as ferramentas de lista de tarefas do Claude (`TodoWrite`, `TaskCreate`/`TaskUpdate` e a lista de tarefas do app desktop).
- **Subagentes**: o início de cada subagente, as ferramentas que ele usa e o fim dele. Sem um plano próprio do subagente, a barra avança com as ferramentas usadas, sem passar de 90%, e só enche quando ele termina.
- **Codex**: os registros que o plugin do Codex grava para cada job (fase, log de ações e resultado), lidos a cada 2 segundos.
