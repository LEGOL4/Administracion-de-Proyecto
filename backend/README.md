# NEXO · Backend (PHP)

API REST en PHP 8.0+ con arquitectura MVC. Sin Composer ni frameworks: solo la extensión `curl`.
La base de datos es **Supabase (PostgreSQL)** y la autenticación es **Supabase Auth**.

## Estructura
```
backend/
├── public/index.php        Punto de entrada y tabla de rutas
├── public/.htaccess        Reescritura de URL (Apache)
├── src/Core/               Env, Request, Response, Router, Validator, Supabase (cliente)
├── src/Middleware/         AuthMiddleware (valida el JWT y el rol)
├── src/Models/             Product, Profile, Order (acceso a datos)
├── src/Controllers/        Auth, Product, User, Order, Report (lógica)
└── .env.example
```

## Puesta en marcha
1. Copia `.env.example` a `.env`.
2. En Supabase → *Project Settings → API Keys* copia la clave **service_role / secret** en `SUPABASE_SERVICE_ROLE_KEY`.
   Esta clave es secreta: solo vive en el backend.
3. Inicia el servidor de desarrollo:
   ```
   cd backend
   php -S localhost:8000 -t public public/index.php
   ```
4. Prueba: `http://localhost:8000/api/health`

## Seguridad
- Cada ruta (salvo `/api/health` y `/api/auth/register`) exige `Authorization: Bearer <token de Supabase>`.
- El backend valida el token con Supabase, lee el rol del perfil y comprueba que la ruta lo permita (401/403).
- Las consultas usan el **token del usuario**, así que las políticas RLS de la base de datos siguen activas
  como segunda barrera. La `service_role` solo se usa para crear/eliminar cuentas y leer nombres.
- Registro público: solo crea **clientes**. Vendedores y administradores los crea un administrador (`POST /api/users`);
  el rol viaja en `app_metadata`, que el usuario final no puede modificar.
- Las ventas se registran con la función SQL `crear_pedido()`, que verifica y descuenta stock de forma atómica.

## Endpoints
| Método | Ruta | Roles |
|---|---|---|
| POST | `/api/auth/register` | público (solo cliente) |
| GET | `/api/auth/me` | todos |
| GET | `/api/products` | todos |
| POST / PUT / DELETE | `/api/products`, `/api/products/{id}` | administrador |
| PATCH | `/api/products/{id}/stock` | administrador |
| GET | `/api/users` | administrador (todos) · vendedor (solo clientes) |
| POST | `/api/users` | administrador |
| PATCH | `/api/users/{id}/rol` | administrador |
| DELETE | `/api/users/{id}` | administrador |
| GET | `/api/orders` (`?cliente_id=`, `?vendedor_id=`) | todos (cada uno ve lo suyo; administrador ve todo) |
| POST | `/api/orders` | vendedor, administrador |
| GET | `/api/dashboard`, `/api/reports/summary` | administrador |

Respuestas: `{ "data": ... }` en éxito y `{ "error": "mensaje" }` en error.

## Despliegue en Render
1. Sube la carpeta del proyecto a GitHub (el `.env` NO se sube: está en `.gitignore`).
2. Render > New > Web Service > conecta el repositorio.
   - Language: **Docker** · Root Directory: `backend` · Region: Ohio (cerca de Supabase).
3. En *Environment* agrega las variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` y `ALLOWED_ORIGINS` (URL(s) del frontend, separadas por coma).
4. Prueba: `https://TU-SERVICIO.onrender.com/api/health`
5. En el frontend, `js/config.js` > `API_BASE_URL: 'https://TU-SERVICIO.onrender.com/api'`.
