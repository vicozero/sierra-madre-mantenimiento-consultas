# Entrega de revisión visual — 6 noviembre 2026

## Resultado
Rediseño del mismo portal en la rama revision/portal-empresarial-20261106. Conserva la API de escritorio y las funciones de consulta. main y GitHub Pages no se modifican. La integración de SQLite/VPS queda pendiente de revisión y aprobación visual, según la instrucción del usuario.

## Hallazgos y correcciones
- Crítico: app.js local de OpenCode quedó truncado, con SyntaxError y ocho funciones frente a las 139 de main. Se conservó el respaldo y se reutilizó el motor funcional; no se reconstruyeron sus cálculos ni exportaciones.
- Alto: HTML local con indicadores de ejemplo y Conectado simulado. El nuevo diseño usa el paquete real y distingue conexión confirmada, paquete local y corte conservado.
- Alto: IDs y vistas retirados en el rediseño local habrían roto filtros/exportaciones. Se conservaron todos los IDs originales y los doce contratos de cálculo/exportación verificados por SHA-256.
- Alto: el historial había sustituido mecánicos por vehículos ligeros. Se recuperó la consulta histórica sin retirar vehículos ni habilitar captura; se validan objetos nulos y fechas antes de dibujar.
- Medio: navegación por índices incorrectos y codificación UTF-8 inválida en la copia local. La nueva navegación usa claves de vistas existentes y archivos UTF-8; los módulos futuros se identifican y deshabilitan.
- Medio: dependencias gráficas y fuentes dependientes de CDN. Inter, Lucide y ECharts se sirven localmente, con versión, licencia y huella.

Lo aprovechable de OpenCode era la dirección visual, la propuesta de categorías del menú y la elección de Inter/ECharts. Su validación por búsqueda de cadenas y conteo de llaves no demostraba funcionamiento. La rama visual-redesign tiene historial independiente y no se mezcló ni sobrescribió.

## Diseño implementado
Menú azul marino plegable por grupos, cabecera fija, búsqueda global, tarjetas blancas, azul institucional, Inter y Lucide, gráficas ECharts, servicios prioritarios, equipos críticos, próximos servicios y fecha del corte. Los datos no publicados —OT autorizadas, backlog y materiales— no se convierten en cifras inventadas. Las tendencias muestran cortes existentes, sin fabricar mediciones diarias. Se conserva el logo real del proyecto; la imagen adjunta se utilizó como referencia de composición.

## Archivos
Motor modificado de forma acotada: app.js (vista, eventos de presentación y estados), index.html (envoltura y secciones). Nuevos: assets/enterprise.css, assets/enterprise.js, assets/vendor/* y mechanics.js recuperado/adaptado. Las bibliotecas de exportación, plantilla PowerPoint y styles.css originales permanecen conservadas. docs/ incluye diagnóstico, inventario, mapa, contratos y riesgos; pruebas/ contiene validaciones reproducibles. El manifiesto final registra las huellas.

## Pruebas ejecutadas
- Cinco pruebas automáticas de integridad: funciones originales presentes, IDs conservados/únicos, doce contratos intactos, dependencias y sintaxis JavaScript.
- 14 comprobaciones en Edge, detalladas en pruebas/resultado_regresion.json: conexión real, métricas/filtros, 7/30/90 días, vistas, calendarios, ficha por equipo, mecánicos, importación local, exportaciones, desconexión/recuperación, menú y responsive. Sin errores ni advertencias JavaScript.
- Fixture de mecánicos identificado como prueba: transporte simple y fragmentado, filtro por ejecutor y rechazo de registro nulo. Se retiró antes de las capturas finales; no se escribió en el servicio.
- Archivos descargados y validados: CSV de bitácora; Excel con cuatro hojas y dos gráficas; PowerPoint con 19 diapositivas, familia Cargadores y cero marcadores pendientes; PDF de impresión (1 página) y Diésel (4 páginas), ambos con texto. Se abrieron con bibliotecas de formato; no se certifica visualización en Microsoft Office mediante estas pruebas.
- Anchos 1920/1440/768/390 sin desbordamiento horizontal del documento; tablas anchas usan desplazamiento interno. Menú móvil probado. No se ejecutaron pruebas físicas Android/iPhone ni Safari/WebKit.

## Límites y siguiente etapa
La web sigue siendo una consulta del corte publicado, no una sesión de administrador ni una cola operativa. No se cambió base, .exe ni sincronización PC1-PC2. Las escrituras, SQLite central, SQLAlchemy/Alembic, JWT/roles, PWA, IndexedDB operativo y pruebas VPS/concurrencia/restauración se retomarán sólo después de aprobar el diseño. El documento 03_ARQUITECTURA_Y_SIGUIENTE_FASE.md registra los riesgos ya detectados para esa fase, incluidos el runtime SQLite, las transacciones del skeleton y el conflicto con inspect.py de diagnóstico en la raíz.

Revisión: abra la vista local en http://127.0.0.1:15923/ o consulte vista-centro-control.png y vista-movil.png. El servidor es exclusivamente de desarrollo y sólo hace lecturas a destinos públicos fijos. No está preparado para exposición a internet.
