<?php
declare(strict_types=1);

namespace Nexo\Core;

final class Request
{
    private ?array $json = null;

    public function __construct(
        public string $method,
        public string $path,
        public array $query,
        public string $token,
        private string $rawBody
    ) {}

    public static function capture(): self
    {
        $path = rtrim((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH), '/') ?: '/';
        // Si el backend vive en una subcarpeta (p. ej. XAMPP: /nexo/backend/public/api/...),
        // se descarta todo lo anterior a "/api".
        if (($pos = strpos($path, '/api')) !== false && $pos > 0) {
            $path = substr($path, $pos);
        }

        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if ($auth === '' && function_exists('getallheaders')) {
            foreach (getallheaders() as $name => $value) {
                if (strtolower($name) === 'authorization') {
                    $auth = $value;
                }
            }
        }
        $token = preg_match('/^Bearer\s+(\S+)$/i', $auth, $m) ? $m[1] : '';

        return new self(
            strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'),
            $path,
            $_GET,
            $token,
            file_get_contents('php://input') ?: ''
        );
    }

    /** Cuerpo JSON como arreglo asociativo. */
    public function json(): array
    {
        if ($this->json === null) {
            if (trim($this->rawBody) === '') {
                $this->json = [];
            } else {
                $decoded = json_decode($this->rawBody, true);
                if (!is_array($decoded)) {
                    throw new ApiException(400, 'El cuerpo de la solicitud no es un JSON válido.');
                }
                $this->json = $decoded;
            }
        }
        return $this->json;
    }
}
