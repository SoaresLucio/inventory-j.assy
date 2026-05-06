Vou corrigir o fluxo de coleta para que o item apareça imediatamente após clicar em “Salvar e enviar”, sem depender da fila offline para dar a sensação de salvamento.

Plano de implementação:

1. Tornar o salvamento “online-first” e mais seguro
- Hoje o item é sempre colocado na fila offline antes da tentativa de envio. Isso pode confundir o fluxo e manter o item como “aguardando sincronização” mesmo quando há internet.
- Vou ajustar para tentar salvar diretamente no banco quando houver conexão.
- Só vou usar a fila offline quando o app realmente estiver sem internet ou quando a tentativa online falhar por erro de rede/serviço.
- Após sucesso online, o item será confirmado imediatamente pelo `client_id`.

2. Atualizar a lista/cache instantaneamente após salvar
- Assim que o banco confirmar o item, vou inserir/atualizar o item recém-salvo no cache das consultas de inventário.
- Isso evita esperar apenas pelo `invalidateQueries`, que refaz a busca em segundo plano e pode parecer lento.
- A tela de Histórico e o Painel do Gestor passarão a refletir o item novo imediatamente quando a query correspondente estiver aberta.

3. Fortalecer a sincronização offline
- Manter a fila offline para situações reais sem conexão.
- Ao reconectar, a sincronização vai:
  - enviar os pendentes;
  - remover da fila os que forem aceitos ou já existirem por `client_id`;
  - confirmar visualmente o último item pendente salvo;
  - atualizar os caches do histórico/painel sem precisar recarregar a página.

4. Melhorar a validação pós-salvamento
- Manter o badge inline solicitado: `✓ Confirmado nº X`.
- Ajustar para ele só mostrar “aguardando sincronização” quando o item realmente estiver offline ou não confirmado após as tentativas.
- A confirmação vai buscar pelo `client_id` e, ao encontrar, aplicar o item confirmado no cache.

5. Adicionar atualização em tempo real nas telas de lista
- No Histórico e no Painel do Gestor, vou adicionar assinatura de novos registros de inventário.
- Quando um item novo chegar, a lista será atualizada automaticamente, sem depender do usuário sair/voltar da tela.

6. Pequena limpeza de robustez/performance
- Evitar chamadas duplicadas de sincronização logo após um salvamento online bem-sucedido.
- Evitar depender de `lastCount` antigo dentro do `trySync`.
- Centralizar a lógica de “item confirmado” para reduzir inconsistências entre salvar online e sincronizar offline.

Arquivos que pretendo alterar:
- `src/routes/coleta.tsx`
- `src/lib/offline-queue.ts` se necessário para retornar mais dados úteis da sincronização
- `src/routes/historico.tsx`
- `src/routes/gestor.tsx`

Resultado esperado:
- Ao salvar com internet: o item é salvo no banco e aparece/é confirmado instantaneamente.
- Ao salvar sem internet: o item fica claramente como pendente e sincroniza automaticamente ao reconectar.
- Ao concluir a sincronização: o badge muda para `✓ Confirmado nº X` e as listas atualizam sem recarregar.