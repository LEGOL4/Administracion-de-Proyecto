<?php
declare(strict_types=1);

namespace Nexo\Controllers;

use Nexo\Core\Request;
use Nexo\Core\Supabase;
use Nexo\Core\Validator;

final class AuthController
{
    /**
     * Registro PÚBLICO: solo crea cuentas de CLIENTE.
     * El backend ignora cualquier "rol" enviado y, además, el trigger de la base de datos
     * asigna 'cliente' a todo registro público. Vendedores y administradores los crea el
     * administrador en POST /api/users.
     */
    public static function register(Request $req): array
    {
        $b = $req->json();
        $nombre = Validator::nombre($b['nombre'] ?? null);
        $email = Validator::email($b['email'] ?? null);
        $password = Validator::password($b['password'] ?? null);

        Supabase::signUp($email, $password, $nombre);

        return [
            '__status' => 201,
            'data' => ['message' => 'Cuenta de cliente creada. Si se solicita, confirma tu correo antes de ingresar.'],
        ];
    }

    public static function me(Request $req, array $params, array $user): array
    {
        unset($user['token']);
        return $user;
    }
}
