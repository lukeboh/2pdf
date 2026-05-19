# Regras de edição de arquivos

## Regra 1 — Nunca use apply_diff com placeholders
Nunca use apply_diff se o search content contiver asteriscos (***),
reticências (...) ou qualquer placeholder representando conteúdo
omitido. Isso causa falha de match garantida.

## Regra 2 — Falhou uma vez? Use write_file
Se apply_diff falhar mesmo uma única vez em um arquivo, abandone
apply_diff para aquele arquivo e use write_file para reescrever
o conteúdo completo. Nunca tente apply_diff mais de uma vez no
mesmo trecho.

## Regra 3 — Sempre leia antes de editar
Antes de qualquer edição, use read_file para obter o conteúdo
atual do arquivo. Nunca assuma que o conteúdo em memória está
atualizado — outro apply_diff anterior pode ter alterado o arquivo.

## Regra 4 — Nunca entre em loop
Se uma operação falhar 2 vezes seguidas no mesmo arquivo, pare,
leia o arquivo com read_file, avalie o conteúdo real e escolha
uma estratégia diferente. Nunca repita a mesma operação com os
mesmos parâmetros esperando resultado diferente.

## Regra 5 — write_file é sempre seguro
Para arquivos pequenos (menos de 200 linhas), prefira write_file
ao invés de apply_diff por padrão. apply_diff só tem vantagem real
em arquivos grandes onde reescrever tudo seria custoso.

## Regra 6 — Erros de edição não são erros de lógica
Um erro "No sufficiently similar match found" significa apenas que
o conteúdo do arquivo mudou desde a última leitura. Não significa
que a lógica está errada. Leia o arquivo novamente e adapte.
