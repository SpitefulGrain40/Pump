Build Pump and start the preview server with the CLI proxy for token-free testing.

```bash
cd /c/Users/I578036/Documents/Pump && npm run build && cp dist/index.src.html dist/index.html && node scripts/pump-cli-proxy.cjs &
sleep 1 && npm run preview -- --port 4173
```
