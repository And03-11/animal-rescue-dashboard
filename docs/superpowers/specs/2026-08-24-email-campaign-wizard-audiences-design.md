# Wizard de campañas y selección múltiple de audiencias

**Estado:** Diseño aprobado en conversación  
**Fecha:** 2026-08-24

## Contexto

El formulario actual de creación de campañas reúne fuente de contactos, filtros de Airtable, remitentes, detalles, programación, plantillas, editor y vista previa en un único modal largo. Esto obliga a desplazarse demasiado y dificulta entender qué falta antes de guardar o programar una campaña.

Las campañas de Airtable también admiten una sola combinación de región y estado de rebote. El usuario necesita seleccionar cualquier combinación de estas cuatro ramas:

- USA · Valid
- USA · Bounced
- EUR · Valid
- EUR · Bounced

`Donors` y `Not Donors` permanecen como segmentos mutuamente excluyentes y se aplican a todas las ramas seleccionadas.

## Objetivos

- Reemplazar el formulario largo por un wizard profesional de tres pasos.
- Permitir entre una y cuatro ramas de Airtable en una campaña.
- Admitir selecciones rápidas por región, estado o todas las ramas.
- Consultar Airtable mediante una condición combinada y contar destinatarios únicos.
- Volver a consultar Airtable al lanzar la campaña para usar datos recientes.
- Mantener la edición y ejecución de campañas antiguas.
- Conservar el flujo existente de CSV dentro de la nueva estructura.

## Fuera de alcance

- Cambiar las reglas actuales de exclusión de contactos en Airtable.
- Permitir mezclar Airtable y CSV en una misma campaña.
- Permitir seleccionar simultáneamente `Donors` y `Not Donors`.
- Implementar tracking de aperturas o clics.
- Crear audiencias guardadas o presets personalizados por el usuario.

## Decisión de modelado

La selección se almacenará como una lista explícita de ramas. Este modelo permite combinaciones no rectangulares, por ejemplo `USA Valid + EUR Bounced`, que no pueden representarse correctamente mediante listas independientes de regiones y estados.

```json
{
  "source_type": "airtable",
  "audiences": [
    { "region": "USA", "is_bounced": false },
    { "region": "EUR", "is_bounced": true }
  ],
  "segment": "standard"
}
```

Reglas:

- `region` solo admite `USA` o `EUR`.
- `is_bounced` es booleano.
- `segment` solo admite `standard` (`Not Donors`) o `dnr` (`Donors`).
- Una campaña de Airtable requiere entre una y cuatro ramas únicas.
- El orden de las ramas no cambia el significado de la selección.
- El backend normaliza y deduplica la lista antes de guardarla.

## Experiencia del wizard

El diálogo utilizará densidad balanceada, encabezado con progreso y footer fijo. El contenido central podrá desplazarse cuando sea necesario, pero la navegación siempre permanecerá visible.

### Paso 1: Audience

- Selector de fuente `Airtable Contacts / Upload CSV`.
- Para Airtable, matriz de cuatro checkboxes organizada por región y estado.
- Atajos: `Select all`, `USA`, `EUR`, `Valid`, `Bounced` y `Clear`.
- Control segmentado exclusivo `Not Donors / Donors`.
- Resumen de ramas seleccionadas y, después de validar, conteos por rama y total único.
- `Continue` permanece deshabilitado sin una rama válida.
- Para CSV, se conserva la carga, preview y mapeo existentes; la matriz de Airtable y el segmento se ocultan.

### Paso 2: Campaign setup

- Modo de remitentes: todos, grupo específico o selección manual.
- Nombre de campaña y asunto.
- Programación opcional.
- Los campos se agrupan con encabezados simples y espaciado; se eliminan divisores con chips y tarjetas decorativas innecesarias.

### Paso 3: Content & review

- Selector y guardado de plantilla.
- Editor HTML y toggle `Edit / Preview`.
- Resumen de audiencia, segmento, remitentes y programación.
- `Send test` permanece cerca del editor.
- Acción final contextual: `Save draft` o `Schedule campaign`.

### Navegación

- Encabezado: indicador `Audience → Setup → Content & review`.
- Footer fijo: `Cancel`, `Back` y `Continue`.
- En el último paso, `Continue` se reemplaza por la acción final.
- El estado ingresado se conserva al retroceder entre pasos.
- En móvil, el diálogo se transforma en una hoja de altura completa y los controles se apilan antes de reducir tipografía.

## Límites de componentes frontend

El formulario se separará del archivo de página para reducir su responsabilidad:

- `CampaignWizard`: estado compartido, navegación, carga inicial y envío final.
- `AudienceStep`: fuente, ramas, segmento, CSV y preview de destinatarios.
- `CampaignSetupStep`: remitentes, nombre, asunto y programación.
- `ContentReviewStep`: plantillas, editor, preview, prueba y resumen.
- `audienceSelection`: funciones puras para normalizar ramas y aplicar atajos.
- Tipos compartidos: `AirtableAudience`, `AudiencePreview` y el payload actualizado de campaña.

`EmailSenderPage` seguirá controlando la apertura del diálogo, el guardado y la actualización de la lista.

## API

### Preview de audiencia

Se añadirá un endpoint sin efectos secundarios:

`POST /sender/audience-preview`

Solicitud:

```json
{
  "audiences": [
    { "region": "EUR", "is_bounced": false },
    { "region": "EUR", "is_bounced": true }
  ],
  "segment": "standard"
}
```

Respuesta:

```json
{
  "branches": [
    { "region": "EUR", "is_bounced": false, "count": 1203 },
    { "region": "EUR", "is_bounced": true, "count": 49 }
  ],
  "total_unique": 1252
}
```

El preview se solicita al continuar desde el primer paso, no en cada clic. Si el usuario cambia la selección después de obtenerlo, el resultado se invalida hasta ejecutar un preview nuevo.

### Crear y actualizar campañas

- Las solicitudes nuevas usarán `audiences` y `segment`.
- `region` e `is_bounced` seguirán aceptándose temporalmente como formato legado.
- Si una solicitud nueva envía ambos formatos, `audiences` será autoritativo.
- Las respuestas incluirán `audiences` para reconstruir la selección durante la edición.

## Consulta de Airtable

Las condiciones compartidas se aplicarán una sola vez: etapa de campaña, exclusiones de envío, tags excluidos y segmento. Las ramas se combinarán dentro de una condición `OR`, donde cada rama es un `AND` de región y estado de rebote.

Forma conceptual:

```text
AND(
  common_campaign_rules,
  segment_rule,
  OR(
    AND(region = "USA", bounced = false),
    AND(region = "EUR", bounced = true)
  )
)
```

El servicio devolverá contactos y conteos por rama. El conjunto final se deduplicará por email normalizado mediante `trim().lower()`, aunque actualmente Airtable garantiza que los correos no se repiten entre ramas.

## Flujo de datos

1. El usuario selecciona ramas y un segmento en el paso Audience.
2. Al continuar, el frontend solicita el preview.
3. El backend valida, normaliza, consulta Airtable y devuelve conteos.
4. El wizard muestra el resultado y permite continuar.
5. Al guardar, la campaña persiste `audiences`, `segment` y el último `target_count` calculado.
6. Al lanzar o ejecutar una campaña programada, el backend vuelve a consultar Airtable con la configuración guardada.
7. El envío utiliza el conjunto deduplicado y actualiza el progreso sobre ese total.

## Persistencia y migración

La tabla `email_sender_campaigns` añadirá una columna:

```sql
ALTER TABLE email_sender_campaigns
ADD COLUMN IF NOT EXISTS audiences JSONB NOT NULL DEFAULT '[]'::jsonb;
```

Para campañas nuevas:

- `audiences` es el dato autoritativo.
- Si solo existe una rama, `region` e `is_bounced` pueden reflejarla para compatibilidad operacional.
- Si existen varias ramas, los campos legados no se usarán para reconstruir la campaña.

Para campañas existentes:

- Si `audiences` está vacío y existen `region/is_bounced`, el backend sintetiza una lista de una rama.
- La edición de una campaña antigua guarda el nuevo formato.
- Los workers programados aceptan ambos formatos durante la transición.

## Estados y errores

- Selección inválida: error inline en el paso Audience.
- Airtable no disponible: el usuario permanece en Audience y conserva su estado.
- Resultado vacío: se muestra advertencia; se puede guardar un borrador, pero no programar ni lanzar.
- Error de remitentes: se muestra en Setup y no se pierde la audiencia validada.
- Error del editor o campos requeridos: se muestra en Content & review y se enfoca el campo correspondiente.
- Preview obsoleto después de cambiar filtros: se invalida y debe recalcularse antes de programar.
- Doble envío del formulario: la acción final entra en estado loading y se deshabilita hasta recibir respuesta.

## Presentación en la tabla

La columna Audience mostrará un resumen compacto:

- Una rama: `EUR · Valid`.
- Dos ramas de una región: `EUR · All email states`.
- Cuatro ramas: `All Airtable audiences`.
- Combinación arbitraria: primera rama más `+N` y tooltip con el detalle completo.

El segmento se mostrará como metadata secundaria: `Not Donors` o `Donors`.

## Estrategia de pruebas

### Frontend

- Seleccionar y deseleccionar cada rama.
- Atajos `Select all`, `USA`, `EUR`, `Valid`, `Bounced` y `Clear`.
- El segmento continúa siendo una selección exclusiva.
- No se puede continuar sin ramas.
- Cambiar filtros invalida el preview.
- Volver entre pasos conserva todos los campos.
- El payload contiene la lista normalizada.
- Cargar una campaña antigua produce una rama seleccionada.
- El layout mantiene header y footer accesibles en escritorio y móvil.

### Backend

- Validación de región, segmento, cantidad y ramas duplicadas.
- Normalización determinista de la selección.
- Fórmula combinada con reglas comunes y ramas `OR`.
- Conteos por rama y total único.
- Deduplicación case-insensitive con espacios periféricos.
- Creación, actualización, edición y ejecución con múltiples ramas.
- Compatibilidad con campañas legadas.
- Bloqueo de programación y lanzamiento cuando el total es cero.
- Propagación diferenciada de error de Airtable frente a resultado vacío.

## Secuencia de entrega

1. Añadir tipos, normalización y pruebas del modelo de audiencias.
2. Añadir migración y persistencia JSONB con compatibilidad legada.
3. Generalizar la consulta de Airtable y añadir preview.
4. Actualizar creación, edición, scheduling y ejecución.
5. Extraer el formulario actual y construir el wizard de tres pasos.
6. Actualizar el resumen de audiencia en la tabla.
7. Ejecutar pruebas backend, frontend, lint, build y validación visual.

## Criterios de aceptación

- El usuario puede elegir cualquier subconjunto no vacío de las cuatro ramas.
- Los atajos producen exactamente las ramas indicadas.
- `Donors/Not Donors` se aplica como una única elección global.
- El preview muestra conteos por rama y total único.
- Los contactos se consultan nuevamente al lanzar.
- Un correo normalizado recibe como máximo un envío por campaña.
- Las campañas antiguas pueden editarse y ejecutarse.
- Una audiencia vacía no puede programarse ni lanzarse.
- El wizard evita el formulario largo y mantiene siempre visible su navegación.
- El flujo CSV existente continúa funcionando.
