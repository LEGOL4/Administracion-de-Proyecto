# NEXO · Frontend

HTML + CSS + JavaScript puro (sin build).

```
frontend/
├── index.html
├── css/style.css
└── js/
    ├── config.js   URL de Supabase, clave pública y URL del backend (no cambió)
    ├── api.js      Cliente de Supabase (solo autenticación) + cliente de la API PHP (no cambió)
    ├── a11y.js     Panel de accesibilidad (texto, daltonismo, contraste, cursor, fuente, animaciones)
    ├── receipt.js  Comprobantes descargables (PDF A4 y ticket de 80 mm), sin librerías externas
    └── app.js      Acceso, validaciones y vistas por rol
```

## Qué cambió
- Nuevo diseño completo (identidad de almacén: verde profundo, gris concreto, amarillo de señalización).
- Iniciar sesión y Crear cuenta normales, sin los textos de "solo clientes".
- Botón de Google en ambas pestañas (Continuar con Google / Registrarme con Google).
- Mensajes de validación bajo cada campo: correo sin @ o sin dominio, contraseña corta
  ("Te faltan 3 caracteres"), contraseñas que no coinciden, nombre muy corto.
- Tras crear la cuenta se inicia sesión automáticamente.

## Google
Supabase → Authentication → Providers → Google (activado) y, en URL Configuration, agrega
la URL del frontend (p. ej. https://nexo-5kyj.netlify.app) a Site URL y Redirect URLs.

## Seguridad
- Este repositorio no debe contener contraseñas ni claves secretas.
- `config.js` solo tiene valores públicos: la URL de Supabase y la clave *publishable* (anon),
  que está pensada para ir en el navegador y está limitada por las políticas RLS.
- La clave `service_role` vive únicamente en las variables de entorno de Render.
- `_headers` agrega cabeceras de seguridad y una política CSP en Netlify.
