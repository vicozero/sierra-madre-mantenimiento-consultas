# Inventario funcional y compatibilidad

| Función | Implementación conservada | Verificación de esta fase |
|---|---|---|
| Conexión del escritorio | API canónica + sierra-madre-consultas/v1 | Consulta real: 124 equipos, 138 cortes KPI, 2.894 filas de bitácora y 149 servicios en el paquete observado |
| Resumen KPI | Vista inicio y 139 funciones del motor | Se conservan funciones y 12 contratos por huella; navegación y filtros probados |
| Disponibilidad/familias/comparativos | renderTrend, renderFamilyPanel, renderComparison | Código original conservado; nuevo centro usa sus datos y criterios |
| TMEF/TMPR, paros, MP/MC/utilización | Cálculos y tablas originales | Contratos y generación de reportes verificados |
| Turnos y KPI por equipo | Bitácora y agregación original | Filtros/navegación/CSV |
| Supervisión y videos | Vista y módulo publicado | Navegación y metadatos disponibles; no se certifica reproducción si no hay videos publicados |
| Mecánicos | Consulta recuperada del historial anterior a b55c6cf | Decodificación simple/fragmentada, filtros y rechazo de registro nulo; fixtures de prueba identificados |
| Calendario | Mes, semana, día y lista originales | Cambio de vistas probado |
| Preventivos vehiculares | Almanaque, Gantt y lista originales | Cambio de vistas probado |
| Catálogo/ficha por equipo | Tabla y modal originales | Apertura/cierre en navegador |
| Diésel | Consulta/importador y agrupaciones originales | Agrupaciones y PDF; importación de libro real no repetida en esta fase |
| CSV | Exportación original | Archivo descargado, 2.894 filas y sin transportes MECANICO |
| Excel | report-workbook.js original | Archivo descargado y abierto: cuatro hojas, dos gráficas, filtro Cargadores |
| PowerPoint | Plantilla/generador originales | Archivo descargado y abierto: 19 diapositivas, familia presente, sin marcadores pendientes |
| PDF | Impresión y generador Diésel originales | Dos PDF generados y abiertos, texto y páginas válidos |
| OT y evidencias | Funciones conservadas; normalizador público continúa vaciando work_orders | No se habilitó un acceso nuevo ni se inventan métricas de OT |
| Backlog/materiales/compras/operación | No forman parte del paquete habilitado | Menú preparado y deshabilitado; valores ausentes identificados |
| Offline operativo | No está implementado en el portal público | Se probó pérdida/recuperación de internet conservando el corte en memoria; no se anuncia PWA operativa |

## Límites de la prueba
El fixture de mecánicos sólo se inyectó en memoria del navegador para probar el decodificador. No se publicó ni se guardó en producción. Los archivos exportados se mantienen en salidas_PRIVADO y están excluidos de Git.
La prueba responsive usa Edge con distintos tamaños de pantalla. No equivale a una prueba física en Android/iPhone ni a validar Safari/WebKit. No se certifican funciones por el mero hecho de tener un botón.
Los 12 contratos originales y todos sus IDs se guardan en contratos_originales.json. Se preservó la API y no se cambió ningún identificador de datos.
