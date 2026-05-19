# Bugs conhecidos

## 1. Links internos no PDF não são montados corretamente

**Descrição**
- Os links internos entre documentos e âncoras dentro do próprio documento não ficam clicáveis no PDF gerado.

**Comportamento esperado**
- Todos os links internos devem ser gerados com âncoras válidas e funcionar no PDF final.

**Comportamento atual**
- No GitLab (visualização dos `.md`), os links funcionam.
- No PDF gerado, os links internos aparecem como texto/azul, mas não são clicáveis.

**Impacto**
- Navegação no PDF fica comprometida.

**Status**
- Aberto
