# Support tickets — frontend

React + TypeScript + Vite web UI for the support tickets API ("Switchboard" design).

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to the backend on :3000
npm run build      # type-check and build to dist/
npm run typecheck
npm run lint
```

The backend must be running (`npm run dev` in `../backend`). Set `API_TARGET` to proxy to another address.
