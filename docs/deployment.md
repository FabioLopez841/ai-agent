# Guía de despliegue — AI Agent Builder

Este proyecto se compone de tres aplicaciones independientes que se despliegan por separado en Vercel:

| Proyecto | Directorio | Tipo |
|---|---|---|
| **Backend** | `backend/` | Node.js + Express + TypeScript |
| **Frontend** | `frontend/` | Angular 17 SPA |
| **Widget** | `widget/` | Vite IIFE (JavaScript nativo) |

---

## Arquitectura de URLs en producción

```
Usuario final
  └── Widget embebido  →  https://tu-widget.vercel.app/widget.js
  └── Backoffice        →  https://tu-frontend.vercel.app
                               └──→ API  →  https://tu-backend.vercel.app
```

> **Importante**: los tres proyectos se despliegan en proyectos separados de Vercel.
> El widget NO se sirve desde el backend — tiene su propio proyecto y URL.

---

## 1. Preparación previa: base de datos PostgreSQL

El backend requiere una instancia de PostgreSQL accesible desde Vercel. Las opciones recomendadas son:

- **Neon** (https://neon.tech) — plan gratuito, serverless, compatible con Vercel.
- **Supabase** (https://supabase.com) — plan gratuito con PostgreSQL administrado.

Una vez creada la base de datos, ejecuta el siguiente script en su **SQL Editor** (Neon → SQL Editor, o Supabase → SQL Editor):

```sql
-- ============================================================
-- AI Agent Builder — Schema de producción
-- ============================================================

-- 1. Enum para el rol de usuario
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tabla users
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  email        VARCHAR(255) NOT NULL UNIQUE,
  password     VARCHAR(255) NOT NULL,
  role         user_role    NOT NULL DEFAULT 'admin',
  "createdAt"  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 3. Tabla agents
CREATE TABLE IF NOT EXISTS agents (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL,
  description           TEXT,
  instructions          TEXT,
  "openaiVectorStoreId" VARCHAR(255),
  "userId"              INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. Tabla documents
CREATE TABLE IF NOT EXISTS documents (
  id             SERIAL PRIMARY KEY,
  "agentId"      INTEGER      NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  "fileName"     VARCHAR(255) NOT NULL,
  "fileType"     VARCHAR(255),
  "openaiFileId" VARCHAR(255) NOT NULL,
  "createdAt"    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 5. Tabla conversations
CREATE TABLE IF NOT EXISTS conversations (
  id          SERIAL PRIMARY KEY,
  "agentId"   INTEGER     NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  "userId"    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  messages    JSONB       NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> El script es idempotente (`CREATE TABLE IF NOT EXISTS`, `EXCEPTION WHEN duplicate_object`) — se puede ejecutar varias veces sin error. El mismo script está en `backend/src/config/schema.sql`.

---

## 1b. Paso previo en GitHub: dar acceso a Vercel al repositorio

Antes de importar el repositorio en Vercel, comprueba que la aplicación de Vercel tiene acceso al repo:

1. Ve a **GitHub → Settings → Applications → Authorized GitHub Apps**.
2. Localiza **Vercel** y haz clic en **Configure**.
3. En **Repository access**, selecciona el repositorio del proyecto (o *All repositories*).
4. Guarda los cambios.

> Si Vercel no tiene acceso al repositorio, el paso de importación en el dashboard de Vercel no encontrará el repo o no podrá clonarlo para el build.

---

## 1c. Desactivar Deployment Protection en los tres proyectos

Vercel activa **Vercel Authentication** por defecto en todos los proyectos del plan Hobby. Esto añade una pantalla de login de Vercel delante de **todos** los despliegues. Hay que desactivarlo en los tres proyectos:

1. Abre el proyecto en el dashboard de Vercel.
2. Ve a **Settings → Deployment Protection**.
3. Desactiva **Vercel Authentication**.
4. Repite para backend, frontend y widget.

> Sin esto el backend devuelve una página HTML de login en lugar de JSON, el frontend muestra la pantalla de Vercel en vez de Angular, y el widget no puede cargar `widget.js`.

---

## 2. Despliegue del Backend

### 2.1 Configuración en Vercel

1. Importa el repositorio en Vercel.
2. En **Root Directory** escribe: `backend`
3. En **Framework Preset** selecciona: `Other`
4. En **Settings → General → Build & Development Settings**:
   - **Build Command**: dejar **vacío** (`@vercel/node` compila TypeScript internamente)
   - **Output Directory**: dejar **vacío**
   - **Install Command**: `npm install`
5. En **Settings → Deployment Protection**: desactivar **Vercel Authentication** (ver sección 1c — aplicar a los tres proyectos).
6. En **Settings → Environment Variables** añade:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DB_HOST` | Host de PostgreSQL | `ep-xxx.neon.tech` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DB_NAME` | Nombre de la base de datos | `aiagentbuilder` |
| `DB_USER` | Usuario de la base de datos | `postgres` |
| `DB_PASSWORD` | Contraseña de la base de datos | `supersecreta` |
| `JWT_SECRET` | Secreto para firmar JWT (mín. 64 chars) | ver nota abajo |
| `OPENAI_API_KEY` | Clave de API de OpenAI | `sk-proj-...` |
| `FRONTEND_URL` | URL del frontend en producción | `https://tu-frontend.vercel.app` |

> Para generar `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`  
> Para múltiples orígenes en `FRONTEND_URL`: `https://tu-frontend.vercel.app,https://otro-dominio.com`  
> **No añadir** `DB_SSL` en Vercel — su ausencia activa SSL automáticamente (necesario para Neon/Supabase).

### 2.2 `backend/vercel.json`

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/index.ts",
      "use": "@vercel/node",
      "config": { "bundle": false }
    }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "src/index.ts" }
  ]
}
```

> **Puntos críticos del `vercel.json`**:
> - `src` apunta a `src/index.ts` (no `dist/index.js` — `dist/` está en `.gitignore` y no llega a Vercel).
> - `"bundle": false` es **obligatorio**: sin él ncc no puede resolver el `require('pg')` dinámico de Sequelize y el servidor falla con `"Please install pg package manually"`.

### 2.3 Problemas encontrados y soluciones

| Error | Causa | Solución aplicada |
|---|---|---|
| `Authentication Required` (página de login Vercel) | Deployment Protection activo por defecto | Desactivar en Settings → Deployment Protection |
| `NOT_FOUND` en todas las rutas | `vercel.json` apuntaba a `dist/index.js` que no existe en el repo | Cambiar a `src/index.ts` |
| `Please install pg package manually` | ncc (bundler de `@vercel/node`) no puede trazar el `require('pg')` dinámico de Sequelize | Añadir `"bundle": false` en `vercel.json` + pasar `dialectModule: pg` a Sequelize |
| `FUNCTION_INVOCATION_FAILED` por timeout | `sequelize.sync({ alter: true })` se ejecutaba en cada cold start serverless | En Vercel no llamar a `sync()` — solo en local con `if (!process.env.VERCEL)` |
| `connection is insecure (try using sslmode=require)` | Neon/Supabase requieren SSL obligatoriamente | Añadir `dialectOptions: { ssl: { require: true } }` controlado por `DB_SSL` env var |
| `TS7016: Could not find a declaration file for module 'pg'` (local) | `@types/pg` no está instalado — TypeScript no tiene tipos para `import pg from 'pg'` | `npm i --save-dev @types/pg` en `backend/` |
| `404 NOT_FOUND` en `https://tu-widget.vercel.app/` | Vite en modo `lib` solo genera `widget.js` en `dist/` — no incluye `index.html` | Añadir script de post-build `scripts/copy-html.js` que copia `index.html` a `dist/` |
| CORS bloqueado cuando el widget llama al backend | El widget puede estar embebido en cualquier dominio — el middleware CORS global de `index.ts` rechaza el preflight OPTIONS antes de que el router procese nada | Middleware path-aware en `index.ts`: `/chat/*` usa `cors({ origin: '*' })`, el resto usa `cors` restrictivo con `FRONTEND_URL` |

### 2.4 Cómo funciona en local

1. Copia `backend/.env.example` como `backend/.env`.
2. Rellena las variables con tus valores locales.
3. Añade `DB_SSL=false` (tu PostgreSQL local no necesita SSL).
4. En `FRONTEND_URL` incluye también el widget para que las peticiones del dev server pasen el CORS:
   ```
   FRONTEND_URL=http://localhost:4200,http://localhost:5173
   ```
5. Arranca con `npm run dev`.

---

## 3. Despliegue del Frontend (Angular)

### 3.1 Cómo funciona el build con variables de entorno

Antes de compilar, el script `scripts/set-env.js` lee las variables de entorno `API_URL` y `WIDGET_URL` y genera automáticamente `src/environments/environment.prod.ts`. Angular sustituye `environment.ts` por `environment.prod.ts` durante el build de producción gracias al `fileReplacements` en `angular.json`.

Flujo:
```
API_URL=https://tu-backend.vercel.app
WIDGET_URL=https://tu-widget.vercel.app
  └── npm run build
        └── node scripts/set-env.js   ← genera environment.prod.ts
        └── ng build                  ← compila usando environment.prod.ts
```

### 3.2 Configuración en Vercel

1. Importa el repositorio en Vercel.
2. En **Root Directory** escribe: `frontend`
3. En **Framework Preset** selecciona: `Angular`
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist/frontend/browser`
6. En **Settings → Environment Variables** añade:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `API_URL` | URL del backend en producción | `https://tu-backend.vercel.app` |
| `WIDGET_URL` | URL del widget en producción | `https://tu-widget.vercel.app` |

### 3.3 `frontend/vercel.json`

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

> Necesario para que Angular Router funcione — sin él las rutas como `/agents/1/conversations` devuelven 404.

### 3.4 Cómo funciona en local

- `environment.ts` usa `http://localhost:3000` y `http://localhost:5173` directamente.
- `environment.prod.ts` solo se usa en `npm run build`.
- Arranca con `npm start`.

---

## 4. Despliegue del Widget

### 4.1 Cómo funciona

Vite sustituye `import.meta.env.VITE_BACKEND_URL` en tiempo de build por el valor real. El resultado es un `widget.js` IIFE autocontenido con la URL del backend incrustada.

El widget se sirve como **sitio estático** desde su propio proyecto Vercel — no desde el backend.

### 4.2 Configuración en Vercel

1. Importa el repositorio en Vercel.
2. En **Root Directory** escribe: `widget`
3. En **Framework Preset** selecciona: `Vite`
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. En **Settings → Environment Variables** añade:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_BACKEND_URL` | URL del backend en producción | `https://tu-backend.vercel.app` |

### 4.4 `widget/vercel.json`

```json
{
  "headers": [
    {
      "source": "/widget.js",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" },
        { "key": "Cache-Control", "value": "public, max-age=86400" }
      ]
    }
  ]
}
```

> `Access-Control-Allow-Origin: *` es obligatorio para que webs externas puedan cargar el script.

### 4.5 Cómo embeber en una web externa

```html
<script
  src="https://tu-widget.vercel.app/widget.js"
  data-agent-id="1"
  data-color="#1976d2"
  data-position="bottom-right"
  data-title="¿En qué puedo ayudarte?">
</script>
```

### 4.6 Cómo funciona en local

1. Copia `widget/.env.example` como `widget/.env` (ya incluye `VITE_BACKEND_URL=http://localhost:3000`).
2. `npm run dev` para desarrollo, `npm run build` para compilar.

> **Problema local conocido**: `Uncaught SyntaxError: Cannot use 'import.meta' outside a module`  
> **Causa**: el script en `widget/index.html` no tiene `type="module"`, por lo que el navegador no reconoce `import.meta.env`  
> **Solución**: el script tag de `widget/index.html` debe llevar `type="module"`:
> ```html
> <script type="module" src="/src/widget.js" data-agent-id="1" ...></script>
> ```
> Esto solo afecta al `index.html` de desarrollo — el build de producción genera un IIFE sin `import.meta`.

---

## 5. Orden de despliegue recomendado

```
1. Base de datos (Neon / Supabase)   ← obtienes las credenciales de conexión
2. Ejecutar schema.sql               ← crea las tablas en producción
3. Backend                           ← obtienes la URL del backend
4. Widget                            ← usa la URL del backend (VITE_BACKEND_URL)
5. Frontend                          ← usa URL del backend (API_URL) y widget (WIDGET_URL)
6. Vuelve al Backend                 ← actualiza FRONTEND_URL con la URL real del frontend
7. Redespliega Backend               ← para que el CORS quede actualizado
```

---

## 6. Variables de entorno — resumen global

### `backend/.env` (local) / Vercel Environment Variables (producción)

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aiagentbuilder
DB_USER=postgres
DB_PASSWORD=
DB_SSL=false          ← SOLO en local; NO añadir en Vercel
JWT_SECRET=cambia_esto_por_un_secreto_seguro
OPENAI_API_KEY=sk-...
FRONTEND_URL=http://localhost:4200,http://localhost:5173
```

> Incluir `http://localhost:5173` en local permite que el widget (dev server de Vite) pueda hacer peticiones al backend sin ser bloqueado por CORS.

### `frontend/` — solo en Vercel (no hay `.env` en Angular)

```env
API_URL=https://tu-backend.vercel.app
WIDGET_URL=https://tu-widget.vercel.app
```

> En local no se necesita: `ng serve` usa `environment.ts` con los valores locales hardcodeados.

### `widget/.env` (local) / Vercel Environment Variables (producción)

```env
VITE_BACKEND_URL=http://localhost:3000
```

---

## 7. Verificación post-despliegue

1. **Backend health check**  
   `GET https://tu-backend.vercel.app/health`  
   → `{ "status": "ok", "timestamp": "..." }`

2. **Frontend login**  
   Abre `https://tu-frontend.vercel.app/login` y verifica que el formulario conecta con el backend.

3. **Widget**  
   Abre `https://tu-widget.vercel.app` y verifica que el chat responde.


---

## 2. Despliegue del Backend

### 2.1 Configuración en Vercel

1. Importa el repositorio en Vercel.
2. En **Root Directory** escribe: `backend`
3. En **Framework Preset** selecciona: `Other`
4. Establece los siguientes valores de build:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
5. En **Settings → Environment Variables** añade:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DB_HOST` | Host de PostgreSQL | `ep-xxx.neon.tech` |
| `DB_PORT` | Puerto de PostgreSQL | `5432` |
| `DB_NAME` | Nombre de la base de datos | `aiagentbuilder` |
| `DB_USER` | Usuario de la base de datos | `postgres` |
| `DB_PASSWORD` | Contraseña de la base de datos | `supersecreta` |
| `JWT_SECRET` | Secreto para firmar JWT (mín. 64 chars) | `genera con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `OPENAI_API_KEY` | Clave de API de OpenAI | `sk-proj-...` |
| `FRONTEND_URL` | URL del frontend en producción | `https://tu-frontend.vercel.app` |

> Para múltiples orígenes en `FRONTEND_URL`, separa con comas:  
> `https://tu-frontend.vercel.app,https://tu-dominio-custom.com`

### 2.2 Archivo `vercel.json` recomendado

Crea `backend/vercel.json` para que Vercel enrute todas las peticiones al servidor Express:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/index.js"
    }
  ]
}
```

### 2.3 Cómo funciona en local

1. Copia `.env.example` como `.env` en `backend/`.
2. Rellena las variables con tus valores locales.
3. Arranca con `npm run dev`.

---

## 3. Despliegue del Frontend (Angular)

### 3.1 Cómo funciona el build con variables de entorno

Antes de compilar, el script `scripts/set-env.js` lee la variable de entorno `API_URL` y genera automáticamente `src/environments/environment.prod.ts`. Angular sustituye `environment.ts` por `environment.prod.ts` durante el build de producción gracias al `fileReplacements` configurado en `angular.json`.

Flujo completo del build:
```
API_URL=https://tu-backend.vercel.app
  └── npm run build
        └── node scripts/set-env.js   ← escribe environment.prod.ts
        └── ng build                  ← compila usando environment.prod.ts
```

### 3.2 Configuración en Vercel

1. Importa el repositorio en Vercel.
2. En **Root Directory** escribe: `frontend`
3. En **Framework Preset** selecciona: `Angular`
4. Establece los siguientes valores de build:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/frontend/browser`
   - **Install Command**: `npm install`
5. En **Settings → Environment Variables** añade:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `API_URL` | URL del backend en producción | `https://tu-backend.vercel.app` |

### 3.3 Archivo `vercel.json` recomendado

Crea `frontend/vercel.json` para que Angular Router funcione correctamente (SPA con rutas cliente):

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 3.4 Cómo funciona en local

- `environment.ts` (desarrollo) apunta siempre a `http://localhost:3000`.
- `environment.prod.ts` solo se usa en `npm run build` (producción).
- Arranca con `npm start` (ng serve usa `environment.ts` directamente).

---

## 4. Despliegue del Widget

### 4.1 Cómo funciona la variable de entorno

Vite sustituye `import.meta.env.VITE_BACKEND_URL` en tiempo de build por el valor real de la variable. El resultado es un archivo `widget.js` IIFE con la URL hardcodeada correctamente para cada entorno.

### 4.2 Configuración en Vercel

1. Importa el repositorio en Vercel.
2. En **Root Directory** escribe: `widget`
3. En **Framework Preset** selecciona: `Vite`
4. Establece los siguientes valores de build:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
5. En **Settings → Environment Variables** añade:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `VITE_BACKEND_URL` | URL del backend en producción | `https://tu-backend.vercel.app` |

### 4.3 Cómo embeber el widget en una web externa

Una vez desplegado, el propietario de la web embebe el widget añadiendo:

```html
<script
  src="https://tu-widget.vercel.app/widget.js"
  data-agent-id="1"
  data-color="#1976d2"
  data-position="bottom-right"
  data-title="¿En qué puedo ayudarte?">
</script>
```

### 4.4 Cómo funciona en local

1. Copia `.env.example` como `.env` en `widget/`.
2. El valor por defecto es `VITE_BACKEND_URL=http://localhost:3000`.
3. Arranca con `npm run dev` para desarrollo o `npm run build` para compilar.

---

## 5. Orden de despliegue recomendado

Despliega siempre en este orden para tener las URLs finales disponibles al configurar las dependencias:

```
1. Base de datos (Neon / Supabase)   ← primero: necesitas las credenciales
2. Backend                           ← segundo: obtienes la URL del backend
3. Widget                            ← tercero: usa la URL del backend
4. Frontend                          ← cuarto: usa la URL del backend
5. Vuelve al Backend                 ← actualiza FRONTEND_URL con la URL del frontend
```

---

## 6. Variables de entorno — resumen global

### `backend/.env` (local) / Vercel Environment Variables (producción)

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aiagentbuilder
DB_USER=postgres
DB_PASSWORD=
JWT_SECRET=cambia_esto_por_un_secreto_seguro
OPENAI_API_KEY=sk-...
FRONTEND_URL=http://localhost:4200
```

### `frontend/` — solo en Vercel (no hay archivo .env en Angular)

```env
API_URL=https://tu-backend.vercel.app
```

> En local no se necesita: `ng serve` usa `environment.ts` directamente con `http://localhost:3000`.

### `widget/.env` (local) / Vercel Environment Variables (producción)

```env
VITE_BACKEND_URL=http://localhost:3000
```

---

## 7. Verificación post-despliegue

Comprueba que todo funciona correctamente en este orden:

1. **Backend health check**  
   `GET https://tu-backend.vercel.app/health`  
   → Debe devolver `{ "status": "ok", "timestamp": "..." }`

2. **Frontend login**  
   Abre `https://tu-frontend.vercel.app/login` y verifica que el formulario conecta con el backend.

3. **Widget embebido**  
   Abre `https://tu-widget.vercel.app` (el `index.html` de prueba) y verifica que el chat responde.
