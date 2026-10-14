# Portal de consulta de mantenimiento Sierra Madre

Sitio estático, adaptable a móvil, para consultar indicadores del programa de mantenimiento. Funciona en GitHub Pages y no necesita servidor propio ni dependencias de compilación.

## Seguridad y alcance

- El sitio está diseñado para ser público. Incluye exclusivamente filas ficticias `DEMO-*`.
- No subas aquí `mantenimiento.db`, respaldos, capturas reales, nombres de empleados, órdenes con observaciones ni otros datos internos.
- Al cargar un JSON, el navegador lo procesa localmente y solo lo mantiene en memoria durante la sesión. No se carga al repositorio ni a un servicio remoto.
- Para una consulta en vivo de información real se necesita una API autenticada y autorización por usuario; una página pública de GitHub Pages no puede custodiar secretos ni acceder directamente al archivo SQLite de una PC.

## Publicar con GitHub Pages

1. Crea un repositorio separado para el portal. Si el sitio solo muestra la demostración, el repositorio puede ser público.
2. Copia el contenido de esta carpeta en la raíz del repositorio.
3. Copia `.github/workflows/pages.yml` junto con los archivos en la raíz del repositorio.
4. En GitHub, abre **Settings → Pages** y selecciona **GitHub Actions** como fuente de publicación.
5. La dirección se verá como `https://USUARIO.github.io/REPOSITORIO/` cuando el workflow termine.

## Cargar datos de consulta

Usa **Cargar archivo JSON** para abrir un archivo local. No se guarda en GitHub. Las secciones disponibles son `equipment`, `availability`, `preventive`, `diesel` y `parts`. El ejemplo completo está en `data/demo.json` y cada propiedad es opcional.

Ejemplo mínimo:

```json
{
  "meta": {"updatedAt": "2026-10-14", "demo": false},
  "equipment": [
    {"code":"DEMO-01","description":"Equipo de ejemplo","family":"Cargadores","status":"Disponible","last_meter":1200,"meter_unit":"h","hp":215,"kw":160}
  ],
  "availability": [
    {"date":"2026-10-14","equipment":"DEMO-01","family":"Cargadores","availability":96.2,"utilization":78.4,"last_hf":1200}
  ]
}
```

El archivo se valida al cargarlo. Si falta una sección, se muestra vacía; los datos faltantes se muestran como `—`, nunca como cero.
