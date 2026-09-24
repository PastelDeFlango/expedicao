# Expedição Control — Servidor

Controle de expedição multiusuário com banco central, login por turno, supervisão e backup automático.

```bash
npm install
cp .env.example .env
npm start
```

Windows: `copy .env.example .env`. Acesse http://localhost:3000.

## Fluxo

1. Início da montagem de carga
2. Fim da montagem de carga
3. Chegada na portaria
4. Veículo docado
5. Início do carregamento
6. Fim do carregamento
7. Saída da doca
8. Liberação do veículo
