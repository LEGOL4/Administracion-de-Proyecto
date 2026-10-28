<?php
declare(strict_types=1);

namespace Nexo\Core;

use Nexo\Middleware\AuthMiddleware;

final class Router
{
    /** @var array<int, array{string,string,callable,?array}> */
    private array $routes = [];

    /** $roles = null -> ruta pública; arreglo -> requiere sesión y uno de esos roles. */
    public function add(string $method, string $pattern, callable $handler, ?array $roles = null): void
    {
        $this->routes[] = [$method, $pattern, $handler, $roles];
    }

    public function dispatch(Request $req): void
    {
        $pathMatched = false;

        foreach ($this->routes as [$method, $pattern, $handler, $roles]) {
            $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
            if (!preg_match($regex, $req->path, $m)) {
                continue;
            }
            $pathMatched = true;
            if ($method !== $req->method) {
                continue;
            }
            $params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);

            $user = null;
            if ($roles !== null) {
                $user = AuthMiddleware::authenticate($req->token);
                if (!in_array($user['rol'], $roles, true)) {
                    throw new ApiException(403, 'Tu rol no tiene acceso a este recurso.');
                }
            }
            $result = $handler($req, $params, $user);
            if (is_array($result) && isset($result['__status'])) {
                Response::json($result['data'] ?? null, (int) $result['__status']);
            }
            Response::json($result);
        }

        throw $pathMatched
            ? new ApiException(405, 'Método no permitido.')
            : new ApiException(404, 'Ruta no encontrada.');
    }
}
