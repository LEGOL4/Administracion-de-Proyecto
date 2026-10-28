<?php
declare(strict_types=1);

namespace Nexo\Middleware;

use Nexo\Core\ApiException;
use Nexo\Core\Supabase;

final class AuthMiddleware
{
    /**
     * Valida el JWT de Supabase y devuelve el perfil del usuario:
     * ['id','nombre','email','rol','token'].
     */
    public static function authenticate(string $token): array
    {
        if ($token === '') {
            throw new ApiException(401, 'Debes iniciar sesión.');
        }

        $authUser = Supabase::getUser($token);
        if ($authUser === null) {
            throw new ApiException(401, 'Sesión inválida o expirada.');
        }

        $rows = Supabase::rest('GET', 'profiles?id=eq.' . $authUser['id'] . '&select=id,nombre,email,rol', $token);
        if (empty($rows)) {
            throw new ApiException(403, 'Tu cuenta no tiene un perfil asignado.');
        }
        $profile = $rows[0];

        // El acceso con Google es exclusivo para clientes.
        $provider = $authUser['app_metadata']['provider'] ?? 'email';
        if ($provider === 'google' && $profile['rol'] !== 'cliente') {
            throw new ApiException(403, 'El acceso con Google es exclusivo para clientes.');
        }

        $profile['token'] = $token;
        return $profile;
    }
}
