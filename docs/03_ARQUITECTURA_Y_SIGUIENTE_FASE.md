# Arquitectura y fases posteriores

## Decisiones definitivas
HTML/CSS/JavaScript modular; FastAPI; SQLite como único motor relacional, en disco persistente de un VPS; SQLAlchemy/Alembic para la fase de dominio/migraciones; JWT, roles y auditoría; PWA/IndexedDB/REST; ECharts. No PostgreSQL, Redis, MongoDB ni una segunda base operativa para duplicar el sistema.

## Puerta de revisión
El usuario indicó: «No avanzar a la integración de SQLite hasta que el nuevo portal visual haya sido revisado y aprobado». En esta rama sólo se ejecutaron tareas de lectura y presentación. No se modificaron base, ejecutables, autenticación, servidor de publicación ni sincronización PC1/PC2. La copia Sierra_Madre_Cloud_20261106 se había preparado antes de recibir ese alcance; quedó como copia sin integración nueva.

## Hallazgos de infraestructura que deben retomarse
El fastapi_skeleton de OpenCode coincide por hashes con la instantánea ya auditada: no se detectaron cambios adicionales en sus archivos comparados. Persisten en esa copia original la conexión SQLite compartida entre tareas y commits dentro de execute, que invalidan la atomicidad de operaciones agrupadas. La continuación corregida ya separa operaciones, pero no tiene aún una cola central y bloqueo de segunda instancia adecuados para el VPS. No debe exponerse como una plataforma completa para 10–20 usuarios sin esas pruebas.
El SQLite del Python disponible informó versión 3.50.4. La documentación oficial describe una corrección de concurrencia WAL en 3.51.3 y backports 3.50.7/3.44.6. No se cambió la biblioteca global ni se habilitó WAL en producción durante esta fase. La preparación del VPS debe verificar una versión corregida antes de certificar escrituras concurrentes.
Referencias: https://sqlite.org/wal.html y https://www.sqlite.org/lang_transaction.html.
Se observó además un inspect.py de diagnóstico inválido en la raíz de trabajo, que sombrea el módulo estándar de Python al ejecutar desde esa carpeta. La verificación de exportaciones se ejecutó desde la rama para evitar esa colisión. No se modificó ese archivo de OpenCode durante la fase visual.

## Próxima fase tras aprobación
1. Consolidar el dominio existente y sus relaciones, sin reconstruir el esquema ni reasignar IDs.
2. Una instancia escritora FastAPI y una cola de escritura serial; conexiones lectoras independientes, WAL, foreign_keys, busy_timeout, transacciones breves, backpressure y exclusión de segunda instancia. El archivo SQLite sólo en disco local persistente del VPS, sin SMB/NFS/iCloud ni exposición a las PC.
3. Respaldos mediante API de SQLite, manifiesto/hash, integrity_check, foreign_key_check y prueba de restauración a un destino nuevo; no aceptar una simple copia del .db mientras existe WAL sin consolidar. Referencia: https://sqlite.org/backup.html.
4. Autenticación/roles por módulo y revisión de datos públicos, en especial reportes de mecánicos y firmas, antes de habilitar operaciones o nuevos campos en producción.
5. UUID/usuario/dispositivo/fecha/versión por operación; idempotencia, auditoría y respuesta de conflicto sin sobreescritura silenciosa.
6. PWA offline incremental: IndexedDB, cola persistente, evidencias y reintentos, caducidad de sesión y recuperación de internet. Los pendientes no se eliminan por cerrar sesión ni por reiniciar el navegador.
7. Adaptador del escritorio y prueba real PC1-PC2-VPS; no certificarla con una simulación.

No se ejecutaron pruebas nuevas de concurrencia, recuperación de base, VPS, ORM ni migraciones en esta fase: están pendientes de la aprobación de la interfaz.
