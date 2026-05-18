# md-dir-to-pdf

CLI em Node/TypeScript para gerar um PDF único a partir de todos os arquivos Markdown em um diretório.

## Procedimento obrigatório antes de entregar para teste

1. Executar `npm install`.
2. Executar `npm run build` e garantir build sem erros.
3. Executar o CLI com um diretório real contendo `.md`.
4. Verificar o PDF gerado no diretório de execução.
5. Somente após esses testes, entregar para validação do usuário.

## Instalação

```bash
npm install
```

## Uso

```bash
npm run build
node dist/index.js --in ../documentacao-sistema
```

Para definir o arquivo de saída:

```bash
node dist/index.js --in ../documentacao-sistema --out ./documentacao-sistema.pdf
```

Para habilitar logs em nível DEBUG:

```bash
node dist/index.js --in ../documentacao-sistema --verbose
```

## Logs

- INFO: início do processo com a pasta de entrada.
- INFO: total de arquivos encontrados.
- DEBUG: cada arquivo lido.
- INFO: fim do processo com o caminho do PDF gerado.
- INFO: tempo total de execução.

## Comportamento

- Varre o diretório de forma recursiva.
- Mantém ordem por árvore (pastas/arquivos), ordenada alfabeticamente em cada nível.
- Gera capa com o nome do diretório.
- Gera sumário com a hierarquia de pastas/arquivos.
