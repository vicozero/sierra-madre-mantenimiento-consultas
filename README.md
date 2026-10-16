# Consulta de mantenimiento Sierra Madre

Portal público de solo lectura para consultar KPI, bitácora, calendario preventivo y equipos desde Mantenimiento.

## Actualización automática

1. Instala la versión de Mantenimiento que incluye «URL del portal informativo» y «Clave de publicación del portal» en la PC que contiene la base de datos.
2. En Herramientas → Configuración de red y actualizaciones, deja la URL del portal informativo y captura la clave privada de publicación entregada al administrador. Pulsa Probar y luego Guardar.
3. El programa publica un paquete depurado al iniciar y después de cambios registrados, cuando hay internet. La página consulta el último paquete automáticamente.
4. El paquete incluye datos mensuales KPI y capturas históricas de bitácora, más calendario preventivo. Filtra por fechas y familias, y usa PDF o CSV compatible con Excel para reportar.

La API conserva una copia vigente y archivos diarios de respaldo en almacenamiento persistente. La clave solo autoriza publicar; las consultas son públicas, como este sitio. El servidor aplica una lista blanca de campos y omite credenciales, rutas locales, responsables, costos, órdenes y evidencias. Las órdenes, fotografías y PDF permanecen en el expediente interno hasta contar con un portal privado y usuarios autorizados. No cargues ni publiques la base SQLite completa.

## Consulta de Diesel

La pantalla Diesel puede leer un libro `.xlsx` directamente en el navegador y generar consultas por turno, día, semana o mes, además de PDF y CSV. El lector usa una hoja a la vez para evitar sumar copias históricas del mismo libro y excluye las columnas de operador y despachador. El archivo se procesa localmente y no se envía a GitHub.

La API de publicación actual aún no incluye el arreglo `diesel`; por eso la visualización automática de registros Diesel del programa todavía no está disponible. La página aceptará esa sección cuando el exportador y el servidor la publiquen con campos depurados. No publiques el libro completo ni datos de operadores.

## Desarrollo

El sitio es estático y se publica mediante GitHub Pages. Los datos se consultan desde la API pública de consulta; los navegadores reciben el paquete depurado `sierra-madre-consultas/v1` con arreglos `equipment`, `kpi`, `bitacora` y `calendar`; `diesel` es opcional y aún no lo entrega el servidor actual.

## Órdenes y evidencias
El programa guarda los adjuntos junto a SQLite en evidencias_ot/<id_orden>. La consulta se realiza desde Órdenes de trabajo e Historial del equipo dentro de Mantenimiento. El portal público no recibe ni muestra estos documentos.
