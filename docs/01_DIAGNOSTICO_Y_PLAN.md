# Diagnóstico y plan previo — 6 noviembre 2026

## Alcance autorizado
Inspección y rediseño visual del portal existente en rama de desarrollo. No publicar en main ni integrar SQLite hasta revisión y aprobación del usuario, según el apartado 13 del texto adjunto. La tarea anterior de infraestructura VPS queda fuera de esta fase; sólo se creó una copia de trabajo, sin cambiar backend ni producción.

## Hallazgos comprobados
La versión pública main (39b549a) conserva 139 funciones JavaScript y la API canónica corregida. La copia local de OpenCode reemplazó app.js por 8 funciones, quedó con un error SyntaxError en la línea 207 y contiene bytes no válidos en UTF-8. Su nuevo HTML no carga el motor original; utiliza valores de ejemplo y un temporizador que simula Conectado. La navegación usa claves de índices de array en lugar de las claves de módulos. Estos problemas impiden certificar la conservación de funciones.
La rama remota visual-redesign tiene un historial independiente, sin ancestro común con main. No se mezclará a ciegas ni se sobrescribirá. Se conserva su trabajo y el respaldo ZIP de la carpeta local.

## Inventario funcional
Conservados en main: resumen KPI y sus gráficas de tendencia, familia, comparación, confiabilidad, paros, horas MP/MC y actividad por turno; bitácora y filtros; supervisión por día/equipo y videos; preventivos vehiculares con almanaque/Gantt/lista; calendario mensual/semanal/diario; catálogo con ficha por equipo; diésel, importación de libro y agrupaciones; PDF mediante impresión, CSV, XLSX con gráficas y PowerPoint.
Existen funciones de órdenes/evidencias, pero el normalizador público vacía work_orders expresamente y no hay una vista de órdenes habilitada. No se eliminarán ni se fingirá que ya funcionan; su habilitación requiere revisar privacidad y la fase operativa. La API puede publicar secciones opcionales que el exportador no entregue aún. Backlog, compras, almacén y captura operativa no están publicados: no se inventarán datos ni pantallas de operación.

## Mapa de conexión
SQLite del escritorio v1.10.3 -> exportador de paquete depurado sierra-madre-consultas/v1 -> API de publicación -> portal HTML/CSS/JS en GitHub Pages. API vigente: https://sierra-madre-consulta-api.vicozero559.chatgpt.site/api/portal. La dirección feywren128 es una redirección antigua. Ninguna clave de publicación se envía al navegador. La sincronización PC1-PC2 es otro servicio y no se modifica aquí.
El paquete requiere meta (updatedAt, periodStart, periodEnd), equipment, kpi, bitacora y calendar. diesel, supervision y light_vehicles son opcionales. No se carga la base SQLite en el portal. El Service Worker/cola operativa y API central VPS son fases futuras, no parte del rediseño.

## Estructura propuesta
Se conservan index.html, styles.css, app.js y las bibliotecas de exportación existentes. Se agregan assets/enterprise.css para el diseño, assets/enterprise.js para la navegación/centro de control y assets/vendor/ para Inter, Lucide y ECharts locales con sus licencias. El motor original conserva nombres, contratos de filtros, cálculos y funciones. docs/ y pruebas/ guardan auditoría y evidencias; no se incluyen paquetes reales de datos en commits.

## Plan
1. Conservar el motor original y respaldar OpenCode.
2. Crear la nueva envoltura visual, menú plegable y cabecera fija, manteniendo todos los identificadores que utiliza el motor.
3. Añadir Centro de control con datos realmente publicados. Las métricas ausentes se identifican como no publicadas, no como cero. Las tendencias usan cortes existentes; no se interpolan datos diarios.
4. Mapear módulos disponibles a sus vistas existentes y marcar los módulos futuros sin habilitar acciones de escritura.
5. Comprobar conexión real, filtros, calendarios, navegación, CSV/XLSX/PPTX/PDF y diseño de escritorio/móvil. Mantener main y la página pública sin cambios.

La imagen es referencia de composición y colores; sus cifras, avisos y estados no son datos del sistema. Se empleará la marca existente, sin inventar usuarios administradores ni una sincronización operativa terminada.

## Hallazgo adicional del historial
El commit b55c6cf retiró mechanics.js y su vista al añadir vehículos ligeros. El texto del usuario exige conservar ambos. Se recuperó la consulta histórica de mecánicos a partir de su versión previa, manteniendo vehículos ligeros. El módulo utiliza ahora el paquete ya recibido y el evento de render del portal, sin una segunda conexión. No se recuperó ni habilitó su antigua aplicación de captura: eso introduciría escrituras fuera de la primera fase.
Los reportes pueden incluir nombres y firmas ya transportados por el paquete. Su eventual publicación debe revisarse con autenticación y permisos antes de producción; la rama visual no se despliega automáticamente.
