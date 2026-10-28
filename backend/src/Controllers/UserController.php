<?php
declare(strict_types=1);

namespace Nexo\Controllers;

use Nexo\Core\ApiException;
use Nexo\Core\Request;
use Nexo\Core\Supabase;
use Nexo\Core\Validator;
use Nexo\Models\Profile;

final class UserController
{
    /** Administrador: todas las cuentas. Vendedor: solo clientes. */
    public static function index(Request $req, array $params, array $user): array
    {
        return Profile::all($user['token'], $user['rol'] === 'vendedor');
    }

    /** Solo administrador: crea cuentas de vendedor, administrador (o cliente). */
    public static function store(Request $req, array $params, array $user): array
    {
        $b = $req->json();
        $nombre = Validator::nombre($b['nombre'] ?? null);
        $email = Validator::email($b['email'] ?? null);
        $password = Validator::password($b['password'] ?? null);
        $rol = Validator::rol($b['rol'] ?? null);

        $created = Supabase::adminCreateUser($email, $password, $nombre, $rol);
        $profile = Profile::find($user['token'], $created['id']);

        return ['__status' => 201, 'data' => $profile];
    }

    public static function updateRol(Request $req, array $params, array $user): array
    {
        $id = Validator::uuid($params['id']);
        $rol = Validator::rol($req->json()['rol'] ?? null);
        if ($id === $user['id']) {
            throw new ApiException(400, 'No puedes cambiar tu propio rol.');
        }
        return Profile::updateRol($user['token'], $id, $rol);
    }

    public static function destroy(Request $req, array $params, array $user): array
    {
        $id = Validator::uuid($params['id']);
        if ($id === $user['id']) {
            throw new ApiException(400, 'No puedes eliminar tu propia cuenta.');
        }
        if (Profile::find($user['token'], $id) === null) {
            throw new ApiException(404, 'El usuario no existe.');
        }
        if (Profile::hasOrders($user['token'], $id)) {
            throw new ApiException(409, 'No se puede eliminar: la cuenta tiene pedidos asociados.');
        }
        Supabase::adminDeleteUser($id);
        return ['deleted' => true];
    }
}
