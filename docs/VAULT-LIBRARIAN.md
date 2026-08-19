# vault-librarian — documento técnico

Subagente de Claude Code, definido en [`.claude/agents/vault-librarian.md`](../.claude/agents/vault-librarian.md),
scoped a este repo. Es la única pieza del stack que tiene acceso directo de escritura a los dos
vaults Obsidian de Joaquín; el resto del sistema (Claude principal, otros agentes) los tocan
indirectamente a través de él.

## 1. Qué problema resuelve

Con dos servidores MCP conectados (`obsidian-vault-mcp`, desplegados como **Agent Vault** y
**Obsidian Vault**, ver [README.md](../README.md)), cualquier conversación de Claude Code tiene
acceso directo a las tools `webdav_*` de ambos. Sin un agente dedicado, eso genera dos problemas:

- **Costo de contexto**: cada operación de lectura/escritura de archivo (especialmente lotes de
  varios archivos o binarios en base64) infla el historial de la conversación principal con
  contenido que no es relevante para el resto de la tarea que se está haciendo.
- **Riesgo de escritura sin criterio**: las tools `webdav_*` no distinguen "espacio de trabajo
  desechable" de "vault personal curado" — un LLM operando sin instrucciones específicas puede
  sobreescribir una nota real sin haberla leído antes, o borrar contenido del vault personal
  porque técnicamente la tool lo permite.

`vault-librarian` existe para aislar ambos problemas: corre en su propio subagente (contexto
separado del principal) y tiene un system prompt que codifica las reglas de cuidado que hacen
falta para operar sobre el vault personal sin supervisión turno a turno.

## 2. Arquitectura: dónde encaja en el sistema

```
Usuario ──▶ Claude Code (conversación principal)
                │
                │ delega vía Task/Agent tool
                ▼
        vault-librarian (subagente, contexto aislado)
                │
     ┌──────────┴──────────┐
     │                      │
     ▼                      ▼
Agent Vault MCP        Obsidian Vault MCP
(rama master,           (rama annas-archive,
 /TestFolder en Koofr)   /Obsidian Vault en Koofr)
     │                      │
     └──────────┬───────────┘
                 ▼
            Koofr (WebDAV)
```

Cada servidor MCP es una instancia independiente de `obsidian-vault-mcp` (mismo código, distinto
`WEBDAV_ROOT_PATH`/credenciales/nombre — ver la sección *Running multiple instances* del
[README.md](../README.md)). El agente no sabe ni le importa que ambos corren del mismo código
fuente: los ve como dos conectores MCP distintos, cada uno con su propio set de tools.

Además de las tools `webdav_*`, el agente tiene `Read` y `Glob` — no para tocar los vaults, sino
para leer archivos **locales** de la máquina de Joaquín cuando la tarea es "subir esta carpeta de
mi disco al vault" (ver sección 5).

## 3. Modelo de permisos por vault

| | Agent Vault (`/TestFolder`) | Obsidian Vault (`/Obsidian Vault`) |
|---|---|---|
| Naturaleza | Espacio de trabajo agéntico, desechable | Segundo cerebro personal, curado a mano |
| Tolerancia a error | Alta — iterar y corregir es el modo normal | Cero — un error real corrompe información viva |
| `webdav_create_remote_file(s)` | Sí | Sí |
| `webdav_update_remote_file` | Sí | Sí (solo tras leer el contenido actual) |
| `webdav_move_remote_item` / `webdav_copy_remote_item` | Sí | Sí |
| `webdav_delete_remote_item` | Sí | **No** — no está en la lista de tools del agente |
| `webdav_create_remote_directory` | Sí | **No** — no está en la lista de tools del agente |

La asimetría de permisos está implementada al nivel del frontmatter del agente (`tools:` en
[`vault-librarian.md`](../.claude/agents/vault-librarian.md)), no como una instrucción que el
modelo podría llegar a ignorar bajo presión — las tools de borrado/creación de directorio para
Obsidian Vault directamente no están disponibles en la sesión del agente, así que no hay forma de
invocarlas por error de razonamiento.

## 4. Reglas de comportamiento (system prompt)

El prompt completo vive en el propio archivo del agente; acá el resumen de las reglas que importan
para entender su comportamiento observado:

1. **Leer antes de escribir.** Antes de `webdav_update_remote_file` sobre cualquier nota,
   primero hace `webdav_get_remote_file` en el mismo turno — nunca sobreescribe a ciegas.
2. **`CLAUDE.md` del vault personal manda.** Si no lo leyó en la sesión actual, lo lee antes de
   tocar cualquier nota en Obsidian Vault — ese archivo puede traer reglas más específicas o más
   recientes que las de este documento, y tienen prioridad.
3. **Ambigüedad → pregunta, no asume.** Un pedido como "guardá esto en mis notas" no resuelve por
   sí solo si va en `3 - Notas Varias/`, `4 - Proyectos/` o el diario del día — el agente para y
   pregunta en vez de elegir una carpeta al azar.
4. **Fallos se reportan, no se "arreglan".** Si una tool falla o un path no existe, el
   comportamiento esperado es parar y explicar el problema, no intentar una acción correctiva no
   pedida (mover, borrar, recrear) que podría empeorar las cosas.
5. **Reporte final obligatorio.** Cada ejecución termina con un resumen: qué vault tocó, qué
   paths leyó/creó/modificó, y cualquier duda o riesgo detectado en el camino (ej. "esta nota ya
   tenía contenido distinto, agregué al final en vez de reemplazar"). Esto es lo que le permite a
   la conversación principal (o a Joaquín) auditar qué pasó sin tener que revisar el vault a mano.
6. **No inventa contenido.** Si le piden resumir o citar una nota que no pudo leer, lo dice — no
   genera un resumen plausible a partir de nada.
7. **No reorganiza por iniciativa propia.** Aunque detecte que la estructura de carpetas del
   vault personal podría "mejorarse", esa decisión es de Joaquín, no del agente.

## 5. Flujo: subida masiva de archivos locales

Caso de uso recurrente: volcar una carpeta local (notas `.md`, imágenes `.png`) a un vault sin que
cada archivo individual pase por el contexto de la conversación principal.

```
1. Glob   → lista los archivos locales a subir (ej. carpeta-local/**/*.{md,png})
2. Read   → lee cada archivo (texto → utf8, binario → base64 si está disponible así)
3. arma el path remoto preservando la estructura relativa pedida
4. UNA llamada a webdav_create_remote_files([{path, content, encoding, overwrite}, ...])
5. revisa la respuesta (created/failed por archivo) y reporta fallos puntuales
```

El punto de diseño clave es el paso 4: `webdav_create_remote_files` (tool de bulk-upload agregada
específicamente para este flujo, ver [README.md → Available MCP Tools](../README.md)) resuelve en
una sola invocación lo que de otro modo serían N llamadas a `webdav_create_remote_file`, y crea
automáticamente las subcarpetas de destino que falten — WebDAV `PUT` no las crea solo.

Si un archivo binario no está disponible en base64 de forma simple, el agente lo sube individual
con `webdav_create_remote_file` en vez de forzar una conversión que podría corromperlo — prioriza
corrección sobre completar el batch en una sola llamada.

## 6. Resolución de nombres de tool entre conectores

Un detalle operativo no evidente: el prefijo real de las tools (`mcp__<algo>__webdav_*`) depende
de **cómo** se agregó cada conector, no solo de qué nombre se le puso:

- Agregado directo como MCP server en Claude Code → `mcp__agent-vault__webdav_*`
- Agregado como Connector de claude.ai → `mcp__claude_ai_<Nombre_Con_Guiones_Bajos>__webdav_*`
  (antepone `claude_ai_` y preserva mayúsculas/espacios convertidos a guion bajo)

El agente tiene esto documentado explícitamente en su prompt porque en la práctica generó
confusión real: "Obsidian Vault" agregado vía claude.ai terminó exponiendo tools bajo
`mcp__claude_ai_Obsidian_Vault__webdav_*`, no `mcp__obsidian-vault__webdav_*` como se esperaba
inicialmente. La lista de `tools:` en el frontmatter ya está fijada a los prefijos reales
verificados — si se reconecta algún servidor con un nombre distinto, esa lista necesita
actualizarse a mano.

## 7. Límites explícitos

Lo que el agente **no** hace, por diseño:

- No tiene acceso a borrar ni crear directorios en Obsidian Vault (sección 3).
- No decide la taxonomía/organización del vault personal.
- No genera contenido de notas que no pudo leer.
- No opera en más de un vault por operación sin que quede explícito en el pedido a qué vault
  corresponde cada parte.
- No persiste memoria entre invocaciones — cada llamada arranca en frío; el contexto viene del
  prompt de la tarea que se le delega, no de conversaciones anteriores.

## 8. Cómo invocarlo

Desde la conversación principal de Claude Code, delegar con el `Agent`/`Task` tool especificando
`subagent_type: vault-librarian`, con una descripción autocontenida de la tarea (el agente no ve
el historial de la conversación que lo invoca). Ejemplos de tareas apropiadas:

- "Guardá esta nota en el vault agéntico, carpeta `CDF-Proyect/`."
- "Buscá en mi segundo cerebro qué notas hay sobre [tema] en `4 - Proyectos/`."
- "Subí la carpeta `C:\...\export-notas\` completa al vault personal, dentro de `3 - Notas Varias/`."

No es apropiado para: decisiones sobre qué carpeta usar sin dar contexto suficiente (el agente va
a preguntar y frenar la ejecución), ni para operaciones de borrado/reorganización del vault
personal (no tiene permisos para eso, ver sección 3).
