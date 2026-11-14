# Control de diésel · Boba

Aplicación web para registrar el **cuenta-litros de la boba** (lectura inicial y final de cada
turno de 12 horas) y las **cargas de diésel por equipo**, comparar ambos números y generar el
concentrado en Excel. Está pensada para incrustarse en **Google Sites** y guardar la información
como archivos JSON en un repositorio de **GitHub**.

No requiere servidor propio, base de datos ni compilación: son archivos estáticos
(HTML + CSS + JavaScript) que se publican con GitHub Pages. El único proceso externo es
GitHub, que hace de base de datos y de historial de cambios.

---

## 1. Qué incluye

| Sección | Para qué sirve |
| --- | --- |
| **Día** | Captura la lectura inicial y final de la boba en los dos turnos, calcula los litros del turno y los compara contra las cargas del día. |
| **Boba** | Historial mensual de lecturas: inicial, final, litros, cargas y diferencia por turno. Detecta días con cargas pero sin lectura. |
| **Cargas** | Alta, edición, borrado y filtros del concentrado por equipo: categoría, horómetro, litros, departamento, operador, responsable, folio y ubicación. |
| **Reportes** | KPIs del periodo, gráfica de consumo diario, detalle por día, **importación del concentrado .xlsx**, exportación al mismo formato y CSV/PDF. |
| **Ajustes** | Empresa, catálogos, tope del contador, conexión con GitHub, datos de ejemplo y borrado local. |

### Lógica de la boba

- Cada día tiene **dos turnos de 12 horas** (`Turno 1` y `Turno 2`).
- La app guarda la **lectura inicial** y la **lectura final** de cada turno.
- Litros del turno = final − inicial.
- Si el contador vuelve a cero, se puede configurar el **tope del cuenta-litros**
  (`contadorMax`, por defecto 1,000,000). La vuelta solo se aplica cuando la lectura inicial
  está al 90 % o más del tope y la final al 10 % o menos; así se evita confundir un error de
  captura con una vuelta real.
- Al capturar el turno 2, la app sugiere automáticamente la lectura final del turno 1.
  También hay un botón para usar el último final conocido.
- La diferencia del día = litros de la boba − litros cargados a los equipos.

---

## 2. Cómo funciona

```
Navegador (app en GitHub Pages o incrustada en Google Sites)
        │  lee/escribe con tu token
        ▼
GitHub REST API  ──►  Repositorio
                       ├── config.json          (empresa, catálogos, tope del contador)
                       └── data/
                           ├── index.json       (lista de periodos disponibles)
                           ├── 2026-11.json     (cargas y bobas de noviembre 2026)
                           └── 2026-12.json     (cargas y bobas de diciembre 2026)
```

- Los datos se guardan **un archivo por mes** para que el repositorio crezca sin problemas.
- En el mismo archivo conviven dos tipos de registro:

  ```json
  { "tipo": "carga", "fecha": "2026-11-05", "turno": "1", "equipo": "ST-41", "litros": 120.5, ... }
  { "tipo": "boba",  "fecha": "2026-11-05", "turno": "1", "inicial": 125430, "final": 125550, "litros": 120 }
  ```

- La boba es **única por fecha + turno**. Si vuelves a guardar el mismo turno, se actualiza en
  lugar de duplicarse.
- La app mantiene una copia en `localStorage` y una **cola de cambios pendientes**. Si no hay
  internet o falla GitHub, los cambios quedan en cola y se reintentan al volver la conexión o al
  pulsar **Sincronizar**.
- Si dos personas editan a la vez, la app detecta el conflicto (SHA distinto), vuelve a leer el
  archivo, aplica su cambio sobre la versión más reciente y reintenta automáticamente.

---

## 3. Puesta en marcha (unos 10 minutos)

### 3.1 Crear el repositorio

1. En GitHub: **New repository** → nombre, por ejemplo `control-diesel`.
2. Sube **todo el contenido de esta carpeta** a la raíz del repositorio (no la carpeta, su contenido).

Con Git desde esta carpeta:

```bash
git init
git add .
git commit -m "Control de diésel"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/control-diesel.git
git push -u origin main
```

También puedes arrastrar los archivos desde la web de GitHub (**Add file → Upload files**).

> El archivo `.nojekyll` es necesario para que GitHub Pages no procese el sitio con Jekyll.

### 3.2 Publicar con GitHub Pages

1. Repositorio → **Settings → Pages**.
2. En *Build and deployment*: **Source: Deploy from a branch**.
3. **Branch: `main`** y carpeta **`/ (root)`** → **Save**.
4. En uno o dos minutos tendrás una URL como:
   `https://TU-USUARIO.github.io/control-diesel/`

> En cuentas gratuitas, GitHub Pages solo publica sitios de repositorios **públicos**.
> Si necesitas repositorio privado + Pages, hace falta un plan de pago (Pro/Team). Ver sección 9.

### 3.3 Crear el token de GitHub

El token permite que la página **guarde** cambios en el repositorio. Sin token, la app funciona
en modo local (solo en ese navegador).

1. GitHub → foto de perfil → **Settings**.
2. **Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
3. Configura:
   - **Token name:** `control-diesel-web`
   - **Expiration:** el periodo que prefieras (por ejemplo 1 año).
   - **Repository access:** *Only select repositories* → elige `control-diesel`.
   - **Permissions → Repository permissions → Contents:** `Read and write`.
     (Metadata queda en *Read-only* automáticamente.)
4. **Generate token** y copia el valor (`github_pat_...`). Solo se muestra una vez.

### 3.4 Conectar la app

1. Abre la URL de GitHub Pages.
2. Ve a **Ajustes → GitHub**.
3. Escribe usuario, repositorio, rama (`main`), carpeta (`data`) y pega el token.
4. Marca **Recordar el token en este equipo** si el equipo es de confianza.
5. Pulsa **Probar conexión** (debe decir que puede leer y escribir) y luego **Guardar conexión**.

Listo: el indicador superior pasará a **GitHub al día**.

### 3.5 Revisar la empresa y los catálogos

`config.json` ya viene precargado con los datos del concentrado real:

- Empresa y razón social.
- 10 categorías (`EDM`, `EDP`, `VLG`, `PRO`, `LAB`, `MTP`, `GEN`, `EXT`, `EPJ`, `PLA`).
- Equipos con su categoría y departamento.
- Departamentos, operadores, responsables y ubicaciones.
- Tope del cuenta-litros.

Puedes revisarlos en **Ajustes → Empresa**. Los catálogos se editan como texto, un renglón por
elemento:

```
# Categorías
EDM | Equipo diésel de mina
EDP | Equipo diésel planta de beneficio

# Equipos
ST-41 | EDM | Mina
CF-WA250-6 #1 | EDP | Planta Beneficio
```

La configuración se guarda en `config.json` del repositorio (o en el navegador si aún no hay
conexión).

---

## 4. Incrustar en Google Sites

1. Abre tu sitio en Google Sites.
2. **Insertar → Insertar → Código incrustado**.
3. Pega este HTML (cambia la URL por la tuya):

```html
<iframe
  src="https://TU-USUARIO.github.io/control-diesel/?embed=1"
  title="Control de diésel"
  style="width:100%;height:900px;border:0;border-radius:12px"
  loading="lazy"></iframe>
```

4. Ajusta el tamaño arrastrando el borde del bloque. El parámetro `?embed=1` activa el modo
   compacto (sin pie de página) para que se vea mejor dentro de Sites.
5. Publica el sitio.

Recomendaciones:

- Añade también un enlace o botón **«Abrir en pantalla completa»** que apunte a la URL de Pages
  (sin `?embed=1`). Dentro del iframe, Google Sites puede bloquear descargas de Excel/CSV o la
  impresión.
- En móvil, el iframe de Sites suele quedar estrecho; la app es responsive, pero el enlace a
  pantalla completa da mejor experiencia.

---

## 5. Uso diario

1. **Día**: elige la fecha (hoy por defecto).
2. **Turno 1**: escribe la lectura inicial y final; pulsa **Guardar turno**. Los litros se
   calculan al instante y se comparan con las cargas de ese turno.
3. **Turno 2**: la lectura inicial se sugiere sola con el final del turno 1.
4. **Registrar carga** (desde Día o Cargas) cada vez que se despache diésel a un equipo:
   fecha, turno, categoría, equipo, horómetro, litros, departamento, operador, responsable,
   folio y ubicación. Al escribir un equipo del catálogo se autocompletan categoría y
   departamento.
5. **Boba**: revisa el mes completo y detecta días con cargas sin lectura.
6. **Reportes**: elige el periodo, descarga el Excel o imprime. Todo cambio se envía a GitHub
   automáticamente (unos segundos después) y queda en cola si estás sin conexión.

### Formato de los registros

```json
{
  "id": "cabc123xyz",
  "tipo": "carga",
  "fecha": "2026-11-05",
  "turno": "1",
  "categoria": "EDM",
  "equipo": "ST-41",
  "horometro": 1234,
  "litros": 120.5,
  "departamento": "Mina",
  "operador": "JUAN MANUEL GONZALEZ",
  "responsable": "David cisneros",
  "folio": "9764",
  "ubicacion": "GUITARRA",
  "notas": "",
  "creado": "2026-11-05T14:02:11.000Z",
  "actualizado": "2026-11-05T14:02:11.000Z"
}
```

```json
{
  "id": "babc123xyz",
  "tipo": "boba",
  "fecha": "2026-11-05",
  "turno": "1",
  "inicial": 125430,
  "final": 125550,
  "litros": 120,
  "operador": "",
  "notas": "",
  "creado": "2026-11-05T14:02:11.000Z",
  "actualizado": "2026-11-05T14:02:11.000Z"
}
```

No hace falta editar estos archivos a mano: la app los mantiene. Si lo haces, conserva el formato.

---

## 6. Excel: importar y exportar

El formato es el mismo que ya usas: `REPORTE_DIESEL_2026-11-01_a_2026-11-12.xlsx`.

### Exportar

**Reportes → Descargar Excel (.xlsx)** genera un libro con tres hojas:

| Hoja | Contenido |
| --- | --- |
| **REPORTE DIESEL** | El concentrado con el mismo encabezado, columnas, fórmula `Total Turnos`, fila TOTAL, filtros y paneles congelados. |
| **CUENTA LITROS** | Fecha, turno, lectura inicial, lectura final, litros de la boba y notas. |
| **RESUMEN** | Totales por fecha y turno: cargas, boba y diferencia. |

Columnas del concentrado: `Categoria`, `Equipo`, `Horometro`, `Fecha`, `Turno 1`, `Turno 2`,
`Turno 3`, `Total Turnos`, `Departamento`, `Operador`, `Responsable`, `Folio`, `Ubicacion T.`

El nombre del archivo se arma con el periodo: `REPORTE_DIESEL_2026-11-01_a_2026-11-12.xlsx`.

### Importar

**Reportes → Importar concentrado** acepta el mismo `.xlsx`. También puedes arrastrarlo al
recuadro. Antes de importar muestra una vista previa con:

- Cargas y lecturas encontradas.
- Litros de cargas y de boba.
- Hojas leídas y avisos de lectura.

Después eliges el modo:

- **Combinar**: actualiza los renglones que coinciden (misma fecha, turno, equipo, categoría y
  folio) y agrega los nuevos. Las lecturas de boba se actualizan por fecha + turno.
- **Reemplazar periodos**: deja cada mes exactamente como el archivo, eliminando lo que no
  aparezca en él.

Notas de lectura:

- Se lee la hoja **REPORTE DIESEL** y, si existe, la hoja **CUENTA LITROS**.
- Cada renglón del concentrado trae un solo turno en la columna correspondiente
  (`Turno 1`, `Turno 2` o `Turno 3`); la app lo convierte a un registro de carga por turno.
- Las filas sin litros, sin equipo o sin fecha válida se omiten y se reportan como avisos.
- Los encabezados se buscan en las primeras filas, así que se toleran pequeñas diferencias de
  posición respecto al archivo original.

El lector/escritor de Excel es propio (`assets/xlsx.js`) y usa `fflate` para comprimir el ZIP;
no depende de CDN ni de librerías externas en tiempo de ejecución.

---

## 7. Reportes

- **KPIs:** litros de boba, litros cargados, diferencia y cobertura de días.
- **Gráfica:** barras de litros cargados por día y línea de litros de la boba.
- **Detalle por día:** boba, cargas, diferencia, número de cargas y estado
  (`Cuadra`, `Diferencia`, `Incompleto`, `Sin boba`, `Sin datos`).
- **Exportar CSV** de cargas (compatible con Excel en español: separador `;` y coma decimal).
- **Imprimir / PDF:** usa el diálogo del navegador; el encabezado incluye empresa, razón social,
  periodo y fecha de generación.

---

## 8. Estructura del proyecto

```
.
├── index.html              Interfaz (una sola página con pestañas)
├── assets/
│   ├── styles.css          Estilos (claro/oscuro, responsive, impresión)
│   ├── store.js            Datos: GitHub API, caché local, cola de pendientes
│   ├── xlsx.js             Lector/escritor de Excel (.xlsx) sin dependencias externas
│   ├── charts.js           Gráfica SVG sin dependencias
│   ├── app.js              Vistas, formularios, reportes e importación/exportación
│   └── vendor/
│       └── fflate.min.js   Compresión ZIP para los .xlsx
├── config.json             Empresa, catálogos, tope del cuenta-litros
├── data/                   (se crea solo al sincronizar)
│   ├── index.json          Periodos disponibles
│   └── 2026-11.json        Cargas y bobas del mes
├── robots.txt              Evita indexación del sitio en buscadores
└── .nojekyll               Desactiva Jekyll en GitHub Pages
```

---

## 9. Privacidad y seguridad

Es importante que lo tengas claro antes de usarlo con datos reales:

- **El token se guarda en el navegador**, no en el repositorio. Cualquiera que use ese navegador
  con la sesión abierta podría verlo; por eso conviene un equipo de confianza y, si es compartido,
  no marcar «recordar».
- **Un repositorio público hace públicos los datos.** Cualquiera con la URL del repositorio
  (o de los archivos `data/*.json`) puede leerlos, aunque no pueda escribir sin token.
  Los permisos de Google Sites **no** protegen los archivos: el iframe carga directamente GitHub Pages.
- **Token recomendado:** fine-grained, limitado a ese repositorio y solo con `Contents: Read and write`.
  Si se filtra, revócalo en GitHub y genera otro.
- **Repositorio privado:** GitHub Pages en repositorios privados requiere plan de pago, y aun así
  el sitio publicado suele ser público. Si los datos son sensibles, las opciones son:
  1. Usar la app solo en local (abrir `index.html` con un servidor local, sin publicar).
  2. Poner la app detrás de un proxy con autenticación (Cloudflare Access, Netlify con contraseña, etc.).
  3. Mover la escritura a un backend propio (Cloudflare Worker o Google Apps Script) para que el
     token no viva en el navegador. Es una mejora fácil de añadir sobre esta base.

---

## 10. Preguntas frecuentes

**No sincroniza y aparece «Error de sync».**
Revisa el mensaje en Ajustes. Causas típicas: token vencido, token sin permiso de escritura,
rama incorrecta o el repositorio no existe. Pulsa **Probar conexión**.

**«No se pudo leer data/... ¿El repositorio es público?»**
Sin token, la app solo puede leer repositorios públicos. Configura el token para repos privados.

**GitHub Pages da 404.**
Espera un par de minutos tras activar Pages y confirma que `index.html` está en la raíz de la rama publicada.

**Los cambios tardan en aparecer en GitHub.**
La app envía automáticamente ~1 segundo después de guardar. Si estás sin conexión, quedan como
«pendientes» y se reintentan al reconectar o al pulsar **Sincronizar**.

**La lectura final es menor que la inicial.**
Puede ser una vuelta del cuenta-litros. La app la aplica sola si el inicial está cerca del tope
configurado; si no, pide confirmación y guarda el valor negativo para que lo revises.

**¿Puedo capturar varias cargas del mismo día y equipo?**
Sí, en el mismo turno o en otro. Son renglones distintos del concentrado.

**¿Cómo respaldo la información?**
Descarga el Excel desde **Reportes** y/o conserva el repositorio: cada archivo mantiene su
historial de cambios en Git.

**¿Funciona sin internet?**
Sí, en modo local: los registros se guardan en el navegador y se envían cuando vuelve la conexión
(con token configurado).

---

## 11. Mejoras posibles

- Reporte por operador y por equipo.
- Carga de tickets/fotos (requiere almacenamiento aparte).
- Alertas por correo cuando la boba y las cargas no cuadran (GitHub Actions programado).
- Backend sin token en el navegador (Cloudflare Worker + GitHub API).
- Control de existencia en tanque propio (compras vs consumos).
