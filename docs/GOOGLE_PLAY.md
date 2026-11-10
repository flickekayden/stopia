# Publicação na Google Play

1. Instale: `npm i -g @bubblewrap/cli` (requer Java 17 + Android SDK; `bubblewrap doctor`).
2. Em `android/`: `bubblewrap update` e `bubblewrap build`.
3. Envie `app-release-bundle.aab` ao Play Console. **Guarde `android.keystore` fora do repositório.**
4. Digital Asset Links: o SHA-256 da assinatura (Play Console → Integridade do app) deve estar no segredo `ANDROID_SHA256_FINGERPRINTS`; confira `https://stopia.lovable.app/.well-known/assetlinks.json`.
5. Faturamento: configure `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` para validar compras no servidor.
