<?php
declare(strict_types=1);

/**
 * NEXO · Backend (API REST) — punto de entrada.
 * Arquitectura MVC: Core (infraestructura) · Models (acceso a datos) · Controllers (lógica).
 * La base de datos es Supabase (PostgreSQL); la autenticación, Supabase Auth.
 */

spl_autoload_register(static function (string $class): void {
    $prefix = 'Nexo\\';
    if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
        return;
    }
    $file = __DIR__ . '/../src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

use Nexo\Controllers\{AuthController, ProductController, UserController, OrderController, ReportController};
use Nexo\Core\{ApiException, Env, Request, Response, Router};

Env::load(__DIR__ . '/../.env');

try {
    Response::cors();
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    $ADMIN = ['administrador'];
    $STAFF = ['administrador', 'vendedor'];
    $ALL = ['administrador', 'vendedor', 'cliente'];

    $r = new Router();

    // Público
    $r->add('GET', '/api/health', fn() => ['status' => 'ok', 'time' => date('c')]);
    $r->add('POST', '/api/auth/register', [AuthController::class, 'register']);

    // Sesión
    $r->add('GET', '/api/auth/me', [AuthController::class, 'me'], $ALL);

    // Productos
    $r->add('GET', '/api/products', [ProductController::class, 'index'], $ALL);
    $r->add('POST', '/api/products', [ProductController::class, 'store'], $ADMIN);
    $r->add('PUT', '/api/products/{id}', [ProductController::class, 'update'], $ADMIN);
    $r->add('PATCH', '/api/products/{id}/stock', [ProductController::class, 'setStock'], $ADMIN);
    $r->add('DELETE', '/api/products/{id}', [ProductController::class, 'destroy'], $ADMIN);

    // Usuarios
    $r->add('GET', '/api/users', [UserController::class, 'index'], $STAFF);
    $r->add('POST', '/api/users', [UserController::class, 'store'], $ADMIN);
    $r->add('PATCH', '/api/users/{id}/rol', [UserController::class, 'updateRol'], $ADMIN);
    $r->add('DELETE', '/api/users/{id}', [UserController::class, 'destroy'], $ADMIN);

    // Pedidos
    $r->add('GET', '/api/orders', [OrderController::class, 'index'], $ALL);
    $r->add('POST', '/api/orders', [OrderController::class, 'store'], $STAFF);

    // Reportes
    $r->add('GET', '/api/dashboard', [ReportController::class, 'dashboard'], $ADMIN);
    $r->add('GET', '/api/reports/summary', [ReportController::class, 'summary'], $ADMIN);

    $r->dispatch(Request::capture());
} catch (ApiException $e) {
    Response::error($e->getMessage(), $e->status);
} catch (Throwable $e) {
    error_log('[NEXO] ' . $e);
    Response::error('Error interno del servidor.', 500);
}
