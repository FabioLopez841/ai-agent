La aplicación debe cubrir  estos requisitos: Quiero que construyas un SaaS completo para creación y gestión de agentes de inteligencia artificial embebibles en webs externas.

El sistema debe estar dividido en cuatro partes principales:
1) Backoffice (Angular)
2) Widget embebible (JavaScript nativo + Vite)
3) Backend (Node.js + Express + Sequelize + postgresql)
4) Visor de chat dentro del backoffice (para probar agentes sin embeber)

El objetivo es que cualquier empresa pueda:
- Crear un agente IA
- Subir información (texto o PDF)
- Configurar comportamiento
- Probar el agente desde el backoffice (chat interno)
- Obtener un script para embeber un chat en su web
- El chat debe mantener historial aunque se recargue la página

---

# 🧱 STACK TECNOLÓGICO

Frontend Backoffice:
- Angular
- Standalone Components (OBLIGATORIO)
- Angular Material (OBLIGATORIO para todos los estilos y componentes UI)
- RxJS
- Arquitectura basada en servicios + posible patrón Facade

⚠️ Reglas Angular MUY IMPORTANTES:
- Todos los componentes deben ser standalone (standalone: true)
- NO usar NgModules
- SIEMPRE usar templateUrl (NO usar templates inline)
- SIEMPRE separar:
  - component.ts
  - component.html
  - component.scss
- Uso de imports en el propio componente standalone

---

Widget embebible:
- JavaScript nativo (sin frameworks)
- Bundler: Vite
- CSS puro (sin frameworks, sin librerías externas)
- Exportado como script embebible tipo:
  <script src="https://tu-cdn/widget.js" data-agent-id="XXX"></script>

Backend:
- Node.js
- Express
- Sequelize ORM
- postgresql

IA:
- OpenAI API (Assistants o Responses API)
- Uso de tools:
  - file_search (para PDFs y documentos)
- ❌ NO usar code_interpreter en ningún caso en la implementación

---

# 🎨 ESTILOS Y UI (MUY IMPORTANTE)

Backoffice Angular:
- Usar Angular Material para:
  - Botones
  - Formularios
  - Tablas
  - Diálogos
  - Inputs
  - Layouts básicos
- Diseño tipo dashboard profesional
- SCSS por componente

Widget:
- Usar exclusivamente CSS puro
- No usar:
  - Bootstrap
  - Tailwind
  - Angular
  - React
- Estilos encapsulados (preferiblemente con Shadow DOM)
- Debe ser ligero y fácilmente embebible en cualquier web sin conflictos

---

# 📄 GESTIÓN DE DOCUMENTOS (MUY IMPORTANTE)

NO se deben almacenar archivos físicamente en nuestro backend ni en el servidor.

En su lugar:
- Los archivos deben subirse directamente a OpenAI
- El backend solo almacenará:
  - fileId (devuelto por OpenAI)
  - agentId
  - metadata (nombre, tipo, etc.)

Entidad Document:
- id
- agentId
- fileName
- fileType
- openaiFileId
- createdAt

Flujo:
1. Usuario sube archivo desde Angular
2. Backend recibe el archivo temporalmente (stream o buffer)
3. Backend lo envía a OpenAI (files API)
4. Se guarda únicamente el openaiFileId en base de datos
5. Se elimina cualquier rastro local del archivo

---

# ⚠️ REGISTRO DE MODELOS EN `models/index.ts` (CRÍTICO)

**Todos los modelos Sequelize DEBEN importarse en `backend/src/models/index.ts`.**

`backend/src/index.ts` importa `./models/index` antes de ejecutar `sequelize.sync()`.
Si un modelo no está importado en ese fichero, Sequelize no conoce su existencia
y su tabla NUNCA se creará en la base de datos.

Regla: cada vez que se cree un modelo nuevo, añadirlo inmediatamente en `models/index.ts`:

```typescript
// models/index.ts
import User from './User';
import Agent from './Agent';
import Document from './Document';
import Conversation from './Conversation';
// ← NUEVO MODELO AQUÍ

// Asociaciones (también en este fichero)
```

**Síntoma si se olvida**: el servidor arranca sin errores pero las queries fallan con
"tabla no existe" o Sequelize devuelve `null` en todas las consultas.

---

# ⚠️ DIFERENCIA ENTRE file_search Y code_interpreter (IMPORTANTE PARA EL AGENTE)

Aunque OpenAI ofrece múltiples tools, en este sistema:

✅ Usamos SOLO: file_search  
❌ NO usamos: code_interpreter  

Explicación:

file_search:
- Permite indexar documentos (PDF, DOCX, TXT)
- Ideal para búsqueda semántica
- Se usa para que el agente responda preguntas basadas en contenido
- Persistente y optimizado para RAG (Retrieval Augmented Generation)

code_interpreter:
- Ejecuta código en tiempo real (Python)
- Útil para análisis de datos (CSV, cálculos, transformaciones)
- No necesario para este caso de uso
- Añade complejidad y coste innecesario

Decisión de arquitectura:
→ Este SaaS está orientado a asistentes conversacionales basados en conocimiento, no en ejecución de código.

---

# 🧩 FUNCIONALIDADES PRINCIPALES

## 1. AUTENTICACIÓN
- Login / Register
- JWT authentication
- Roles:
  - Admin (gestiona agentes)
  - Usuario (opcional futuro)

---

## 2. GESTIÓN DE AGENTES

Entidad Agent:
- id
- name
- description
- instructions (prompt base)
- apiKey (OpenAI o interna)
- createdBy

Funcionalidades:
- Crear agente
- Editar agente
- Eliminar agente
- Listar agentes

---

## 3. CARGA DE CONTENIDO

Funcionalidades:
- Subir archivos:
  - PDF, DOC, DOCX, TXT → SIEMPRE usar file_search
- Asociar archivos al agente mediante openaiFileId
- Mostrar listado de documentos

---

## 4. CONFIGURACIÓN DEL AGENTE

Permitir configurar:
- Prompt base del sistema
- Temperatura (opcional)
- Tipo de respuestas
- Herramientas habilitadas (solo file_search)

---

## 5. VISOR DE CHAT EN BACKOFFICE (MUY IMPORTANTE)

Crear una vista dentro de Angular que permita probar el agente sin necesidad de embeberlo.

Características:
- UI tipo chat (usando Angular Material)
- Selección de agente
- Envío de mensajes
- Visualización de respuestas
- Persistencia de conversación durante la sesión

Debe reutilizar exactamente el mismo endpoint de chat que el widget.

---

## 6. GENERACIÓN DE WIDGET EMBEBIBLE

El sistema debe generar un script dinámico:

Ejemplo:
<script src="https://cdn.tusaas.com/widget.js" data-agent-id="123"></script>

Opciones configurables:
- Color del chat
- Posición (bottom-right, bottom-left)
- Título del chat

---

## 7. WIDGET DE CHAT (JS NATIVO)

Características:
- UI tipo burbuja flotante
- Chat expandible
- Input de texto
- Scroll de mensajes
- Estilos con CSS puro

Muy importante:
✅ Persistencia de conversación en localStorage o sessionStorage
→ El historial debe mantenerse aunque el usuario recargue la página

---

## 8. BACKEND - ENDPOINTS

### Auth
- POST /auth/register
- POST /auth/login

### Agents
- GET /agents
- POST /agents
- PUT /agents/:id
- DELETE /agents/:id

### Documents
- POST /documents/upload
- GET /documents/:agentId

### Chat
- POST /chat/message

Body:
{
  agentId,
  message,
  conversationId (opcional)
}

Respuesta:
{
  reply,
  conversationId
}

---

## 9. GESTIÓN DE CONVERSACIONES

Entidad Conversation:
- id
- agentId
- messages (JSON)
- createdAt

Objetivo:
- Mantener contexto de conversación
- Reutilizable tanto para:
  - Widget embebido
  - Visor de chat del backoffice

---

## 10. INTEGRACIÓN CON OPENAI

Implementar:
- Subida de archivos con files API
- Asociación de archivos a agentes
- Uso de file_search para consultas
- Inyección de:
  - system prompt
  - historial de conversación
  - referencias a archivos (openaiFileId)

---

## 11. FRONTEND BACKOFFICE (ANGULAR)

Pantallas:

1. Login
2. Dashboard
3. Lista de agentes
4. Crear/Editar agente
5. Subida de documentos
6. Configuración del widget
7. Visor de chat (NUEVO)
8. Vista previa del chat (opcional)

Extras:
- Uso obligatorio de Angular Material
- Formularios reactivos
- Servicios HTTP
- Manejo de estado con RxJS

---

## 12. WIDGET - DETALLES TÉCNICOS

Debe:
- Insertarse dinámicamente en el DOM
- Crear un shadow DOM (recomendado)
- No interferir con estilos del cliente
- Ser ligero y rápido
- Usar exclusivamente CSS puro

---

## 13. ARQUITECTURA GENERAL

- Backend desacoplado del frontend
- Widget independiente del backoffice
- API REST centralizada
- Preparado para escalar a multi-tenant SaaS

---

# 🎯 OBJETIVO FINAL

El sistema debe permitir:
1. Crear un agente en el backoffice
2. Subir documentos (almacenados en OpenAI, no localmente)
3. Configurarlo
4. Probarlo en el visor de chat interno
5. Obtener script embebible
6. Insertarlo en una web externa
7. Tener un chat funcional con IA y persistencia

---

# ⚠️ IMPORTANTE

- Código limpio y modular
- Separación clara de responsabilidades
- Preparado para producción (no solo demo)
- Evitar dependencias innecesarias en el widget
- Manejar errores en frontend y backend

---

Construye todo el proyecto base con esta estructura y deja preparado para iterar. El guión con los prompts generalo en un fichero llamado plan-ai-agent-builder en esta ruta. Y por favor, quiero que sea super detallado.



quiero que hagas una modificación en el plan. resulta que tengo un backend con autenticación JWT ya desarrollado en otro proyecto y quiero que la parte de creación del backend con autenticación JWT, conexión a la base de datos con sequelize, y apis de login y register, lo creemos en este proyecto pero utilizando una skill o prompt reutilizable de github copilot, la que tu consideres mejor. De forma que en el curso esta parte del backend concretamente lo que hagamos sea ejecutar la skill, ver como se crea y comentar lo que se ha creado, así ahorramos tiempo y cosas que ya hemos explicado en otros cursos. Por favor monta el skill o prompt reutilizable de github copilot en este mismo directorio y modifica el guión para que se adapte a esta nueva forma de crear el backend. 

Ahora imagina que mañana tengo que dejar el proyecto a medias o me gustaría recrearlo en un nuevo entorno o IDE, quiero que si indico los mismos prompts en github copilot el resultado sea el mismo y sin errores, por ello, quiero que revises los instructions que tengo creados en el proyecto XXXXX con el mismo stack tecnológico en este mismo directorio y los apliques en este, para no tener los mismos errores que hemos tenido en el pasado, y luego además combinalo con los que tu crees que deberían ser buenas prácticas y modos de desarrollar profesionales con estas tecnologías creando el github-copilot instrcutions y luego en la carpeta instructions/ los instructions concretos que consideres que son necesarios para que la arquitectura sea profesional, sin errores y que al final lo dicho, podamos recomenzar en otro momento, en otro ide con github copilot y que el agente de código parta de unas instrucciones claras y no se desvíe de lo que nosotros hemos hecho en este proyecto.

Vale ahora quiero que hagas otra modificación al plan, quiero que crees un prompt reutilizable para arrancar el proyecto de frontend con las especificaciones que ya hemos dicho en el plan y adaptandose a los frontend instructions, concretamente quiero que el prompt arranque con la instalación de dependecias, angular material, implementación del auth service, interceptors, guards y login. Tienes un ejemplo del boilerplate de frontend que quiero en el proyecto XXXX
 De forma que en el curso esta parte del frontend concretamente lo que hagamos sea ejecutar la skill, ver como se crea y comentar lo que se ha creado, así ahorramos tiempo y cosas que ya hemos explicado en otros cursos. Por favor monta el skill o prompt reutilizable de github copilot en este mismo directorio y modifica el guión para que se adapte a esta nueva forma de crear el frontend.
