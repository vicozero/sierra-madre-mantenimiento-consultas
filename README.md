# Consulta de mantenimiento Sierra Madre

Portal público de solo lectura para consultar KPI, bitácora, calendario preventivo y equipos desde Mantenimiento.

## Actualización automática

1. Instala la versión de Mantenimiento que incluye «URL del portal informativo» y «Clave de publicación del portal» en la PC que contiene la base de datos.
2. En Herramientas → Configuración de red y actualizaciones, deja la URL del portal informativo y captura la clave privada de publicación entregada al administrador. Pulsa Probar y luego Guardar.
3. El programa publica un paquete depurado al iniciar y después de cambios registrados, cuando hay internet. La página consulta el último paquete automáticamente.
4. El paquete incluye datos mensuales KPI y capturas históricas de bitácora, más calendario preventivo. Filtra por fechas y familias, y usa PDF o CSV compatible con Excel para reportar.

La API conserva una copia vigente y archivos diarios de respaldo en almacenamiento persistente. La clave solo autoriza publicar; las consultas son públicas, como este sitio. El servidor aplica una lista blanca de campos y omite observaciones, responsables, evidencias, costos y credenciales. No cargues ni publiques la base SQLite completa.

## Desarrollo

El sitio es estático y se publica mediante GitHub Pages. Los datos se consultan desde la API pública de consulta; los navegadores solo reciben el paquete depurado `sierra-madre-consultas/v1` con arreglos `equipment`, `kpi`, `bitacora` y `calendar`.
