
# Block and vote authorship collector

Small CLI app that collects block and vote authors (and reward addresses) for Subspace Network blocks.

Usage example:
```bash
npm ci
WS_URL=ws://127.0.0.1:9944 OUTPUT=gemini-3h/snapshot-2024-sep-18.csv STOP_AT_BLOCK=0 START_AT_BLOCK=3338258 npm start
```
