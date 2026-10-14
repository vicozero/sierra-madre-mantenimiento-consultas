# Consultas de mantenimiento Sierra Madre

Portal público de solo lectura para consultar datos exportados de los módulos KPI, bitácora y calendario de servicio. No contiene datos de ejemplo ni consulta directamente el sistema local.

## Uso

1. En el equipo que tiene Mantenimiento, genera el paquete de consulta: `Mantenimiento.exe --export-portal-json C:\Users\Public\Documents\consulta_mantenimiento.json`. El periodo exportado es el mes actual.
2. Abre el portal de GitHub Pages y pulsa **Abrir paquete del programa**. El JSON se procesa en el navegador y no se transmite a GitHub.
3. Filtra por fechas, familia y equipo. **Descargar Excel (CSV)** exporta la tabla del módulo abierto en un formato que Excel puede abrir; **Imprimir / Guardar PDF** abre la impresión del módulo actual.

El paquete contiene KPI por equipo, capturas resumidas de bitácora y servicios del calendario, así como un catálogo básico. Omite responsables, observaciones libres, evidencia y costos. Para publicar datos disponibles para cualquier visitante, se requeriría subir el JSON como archivo público; este portal no lo hace automáticamente.

## Desarrollo

El sitio es estático y se publica con GitHub Actions en GitHub Pages. No tiene escritura ni conexión al SQLite, no envía archivos y no almacena las cargas en el servidor. El contrato aceptado es `sierra-madre-consultas/v1` con arreglos `equipment`, `kpi`, `bitacora` y `calendar`.
