# AI Agent Builder

Plataforma para crear, configurar y desplegar agentes de IA con soporte de documentos, conversaciones y widget embebible.

## Estructura del monorepo

```
/
├── backend/    ← API REST (Node.js + Express + TypeScript)
├── frontend/   ← Aplicación de gestión (Angular 17+)
└── widget/     ← Widget embebible de chat (JavaScript nativo + Vite)
```

### `/backend`

API REST que gestiona usuarios, agentes, documentos y conversaciones. Construida con Node.js, Express y TypeScript. Usa Sequelize + PostgreSQL como base de datos y se integra con la API de OpenAI (Responses API + file_search).

### `/frontend`

Aplicación web de backoffice para que los usuarios creen y administren sus agentes de IA, suban documentos y revisen conversaciones. Construida con Angular 17+ (standalone components) y Angular Material.

### `/widget`

Widget de chat embebible en cualquier sitio web mediante una etiqueta `<script>`. Construido con JavaScript nativo y empaquetado con Vite. Se comunica con el endpoint público `/chat/message` del backend sin necesidad de autenticación.

## Inicio rápido

Cada proyecto tiene su propio `package.json` y se gestiona de forma independiente. Consulta el `README.md` de cada carpeta para instrucciones de instalación y arranque.
