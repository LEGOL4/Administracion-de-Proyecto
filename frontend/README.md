# NEXO · Frontend

Interfaz web en HTML + CSS + JavaScript puro (sin build).

```
frontend/
├── index.html
├── css/style.css
└── js/
    ├── config.js   URL de Supabase, clave pública y URL del backend
    ├── api.js      Cliente de Supabase (solo login) + cliente de la API PHP
    └── app.js      Vistas por rol (administrador, vendedor, cliente)
```

## Ejecutar
1. Inicia el backend (ver `../backend/README.md`).
2. Sirve esta carpeta con cualquier servidor estático, por ejemplo:
   ```
   cd frontend
   php -S localhost:5500
   ```
   y abre `http://localhost:5500`.
3. Si el backend está en otra URL, cámbiala en `js/config.js` (`API_BASE_URL`) y agrega el origen
   del frontend a `ALLOWED_ORIGINS` en el `.env` del backend.

## Cuentas de prueba
| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | admin@nexo.com | Admin#2026 |
| Vendedor | vendedor@nexo.com | Vendedor#2026 |
| Cliente | se registra desde "Crear cuenta" | — |

Cambia estas contraseñas antes de entregar o publicar el sistema.

## Google (clientes)
Para "Continuar con Google" activa el proveedor en Supabase → *Authentication → Providers → Google* y agrega la URL
del frontend en *Authentication → URL Configuration → Redirect URLs*.
