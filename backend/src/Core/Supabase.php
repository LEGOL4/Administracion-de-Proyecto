<?php
declare(strict_types=1);

namespace Nexo\Core;

/**
 * Cliente mínimo de Supabase para PHP (sin dependencias).
 *
 *  - rest():        PostgREST con el token DEL USUARIO  -> las políticas RLS siguen activas.
 *  - restService(): PostgREST con la service_role      -> solo para lecturas ya autorizadas.
 *  - admin*():      API de administración de Auth      -> crear / eliminar cuentas.
 */
final class Supabase
{
    private static function http(string $method, string $url, array $headers, ?array $body = null): array
    {
        $ch = curl_init($url);
        $h = [];
        foreach ($headers as $k => $v) {
            $h[] = "$k: $v";
        }
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $h,
            CURLOPT_TIMEOUT => 20,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_UNICODE));
        }
        $raw = curl_exec($ch);
        if ($raw === false) {
            $err = curl_error($ch);
            curl_close($ch);
            throw new ApiException(502, 'No se pudo contactar con Supabase: ' . $err);
        }
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [$status, $raw === '' ? null : json_decode($raw, true)];
    }

    private static function base(): string
    {
        return rtrim(Env::get('SUPABASE_URL'), '/');
    }

    /** Traduce errores de Postgres / PostgREST a mensajes útiles. */
    private static function mapError(int $status, mixed $data): ApiException
    {
        $code = is_array($data) ? (string) ($data['code'] ?? '') : '';
        $msg = is_array($data) ? (string) ($data['message'] ?? $data['msg'] ?? $data['error_description'] ?? '') : '';

        return match (true) {
            $status === 401 || $code === 'PGRST301' => new ApiException(401, 'Sesión inválida o expirada.'),
            $code === '42501' => new ApiException(403, 'No tienes permisos para realizar esta acción.'),
            $code === '23503' => new ApiException(409, 'El registro está siendo utilizado por otros datos.'),
            $code === '23505' => new ApiException(409, 'Ya existe un registro con esos datos.'),
            $code === '23514' => new ApiException(422, 'Los datos enviados no cumplen las reglas del sistema.'),
            $code === 'P0001' => new ApiException(400, $msg ?: 'No se pudo completar la operación.'),
            $status >= 500 => new ApiException(502, 'Error en el servicio de base de datos.'),
            default => new ApiException($status, $msg ?: 'No se pudo completar la operación.'),
        };
    }

    /** PostgREST con el JWT del usuario (RLS activo). */
    public static function rest(string $method, string $path, string $userToken, ?array $body = null, array $extra = []): mixed
    {
        $headers = [
            'apikey' => Env::get('SUPABASE_ANON_KEY'),
            'Authorization' => 'Bearer ' . $userToken,
            'Content-Type' => 'application/json',
        ] + $extra;
        [$status, $data] = self::http($method, self::base() . '/rest/v1/' . $path, $headers, $body);
        if ($status >= 400) {
            throw self::mapError($status, $data);
        }
        return $data;
    }

    /** PostgREST con service_role (salta RLS). Úsalo solo tras haber autorizado la acción. */
    public static function restService(string $method, string $path, ?array $body = null, array $extra = []): mixed
    {
        $key = Env::get('SUPABASE_SERVICE_ROLE_KEY');
        $headers = [
            'apikey' => $key,
            'Authorization' => 'Bearer ' . $key,
            'Content-Type' => 'application/json',
        ] + $extra;
        [$status, $data] = self::http($method, self::base() . '/rest/v1/' . $path, $headers, $body);
        if ($status >= 400) {
            throw self::mapError($status, $data);
        }
        return $data;
    }

    /** Valida un access_token y devuelve el usuario de Auth. */
    public static function getUser(string $token): ?array
    {
        [$status, $data] = self::http('GET', self::base() . '/auth/v1/user', [
            'apikey' => Env::get('SUPABASE_ANON_KEY'),
            'Authorization' => 'Bearer ' . $token,
        ]);
        return ($status === 200 && is_array($data) && !empty($data['id'])) ? $data : null;
    }

    /** Registro público (Supabase aplica su política de confirmación por correo). */
    public static function signUp(string $email, string $password, string $nombre): void
    {
        [$status, $data] = self::http('POST', self::base() . '/auth/v1/signup', [
            'apikey' => Env::get('SUPABASE_ANON_KEY'),
            'Content-Type' => 'application/json',
        ], ['email' => $email, 'password' => $password, 'data' => ['nombre' => $nombre]]);

        if ($status >= 400) {
            $msg = strtolower((string) ($data['msg'] ?? $data['message'] ?? $data['error_description'] ?? ''));
            if (str_contains($msg, 'already registered')) {
                throw new ApiException(409, 'Ya existe una cuenta con ese correo.');
            }
            if (str_contains($msg, 'rate limit')) {
                throw new ApiException(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.');
            }
            throw new ApiException(400, 'No se pudo crear la cuenta. Revisa los datos e inténtalo nuevamente.');
        }
    }

    /** Crea una cuenta con rol asignado por el administrador. El rol va en app_metadata (inmodificable por el usuario). */
    public static function adminCreateUser(string $email, string $password, string $nombre, string $rol): array
    {
        $key = Env::get('SUPABASE_SERVICE_ROLE_KEY');
        [$status, $data] = self::http('POST', self::base() . '/auth/v1/admin/users', [
            'apikey' => $key,
            'Authorization' => 'Bearer ' . $key,
            'Content-Type' => 'application/json',
        ], [
            'email' => $email,
            'password' => $password,
            'email_confirm' => true,
            'user_metadata' => ['nombre' => $nombre],
            'app_metadata' => ['rol' => $rol],
        ]);

        if ($status >= 400) {
            $msg = strtolower((string) ($data['msg'] ?? $data['message'] ?? ''));
            if (str_contains($msg, 'already') || ($data['error_code'] ?? '') === 'email_exists') {
                throw new ApiException(409, 'Ya existe una cuenta con ese correo.');
            }
            throw new ApiException(400, 'No se pudo crear la cuenta.');
        }
        return $data;
    }

    public static function adminDeleteUser(string $id): void
    {
        $key = Env::get('SUPABASE_SERVICE_ROLE_KEY');
        [$status] = self::http('DELETE', self::base() . '/auth/v1/admin/users/' . $id, [
            'apikey' => $key,
            'Authorization' => 'Bearer ' . $key,
        ]);
        if ($status >= 400) {
            throw new ApiException(400, 'No se pudo eliminar la cuenta.');
        }
    }
}
