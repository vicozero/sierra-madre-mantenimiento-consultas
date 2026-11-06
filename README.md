# SIERRA MADRE · Portal empresarial — revisión visual

Rama: revision/portal-empresarial-20261106. Base funcional: main, commit 39b549a. Esta rama no despliega GitHub Pages; la página publicada continúa sin cambios.

## Vista local

Desde esta carpeta:

```powershell
python pruebas/preview.py --port 15923
```

Abra http://127.0.0.1:15923/. El servidor de desarrollo obtiene únicamente el mismo paquete público, con destinos fijos. No usa credenciales ni SQLite y se enlaza sólo a localhost. Al servir app.js adapta la dirección de consulta en memoria para resolver CORS local; los archivos de producción conservan la API canónica.

## Auditoría y pruebas

- docs/01_DIAGNOSTICO_Y_PLAN.md: problemas de OpenCode, inventario inicial y plan.
- docs/02_MAPA_FUNCIONAL.md: funciones conservadas, resultados y límites.
- docs/03_ARQUITECTURA_Y_SIGUIENTE_FASE.md: decisiones y puerta de aprobación antes de SQLite.
- pruebas/test_integridad.py: funciones/IDs/contratos/dependencias y sintaxis.
- pruebas/regresion_navegador.cjs: navegación, consultas, filtros, calendarios, exportaciones, desconexión y responsive. Requiere npm ci y Edge en Windows, o npx playwright install chromium en otro entorno. Puede indicar BROWSER_EXECUTABLE para otro navegador Chromium.

Ejecute python pruebas/test_integridad.py desde esta carpeta. Los datos reales y exportaciones privadas no se incluyen en Git ni en el paquete de fuentes. Las bibliotecas gráficas/fuentes se sirven localmente con licencias, sin CDN obligatorio.

La vista operativa sigue siendo de consulta: no se inventa una sesión de administrador, ni cola offline, ni escrituras. Los módulos futuros permanecen identificados y deshabilitados. La API central y SQLite requieren revisión y aprobación posterior del diseño.
