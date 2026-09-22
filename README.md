# FBOтик Front

React/Vite-интерфейс для подготовки отгрузок и работы с заявками OZON.

## Локальный запуск

Сначала запустите `fbotik-back` на `http://127.0.0.1:8787`, затем:

```bash
npm install
npm run dev
```

Интерфейс откроется на `http://127.0.0.1:5173`. Vite проксирует запросы
`/local-api` на локальный backend. Для production эти маршруты также должны
проксироваться на `fbotik-back` через reverse proxy.

## Проверка

```bash
npm run typecheck
npm run build
```
