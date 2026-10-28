<?php
declare(strict_types=1);

namespace Nexo\Models;

use Nexo\Core\ApiException;
use Nexo\Core\Supabase;

final class Profile
{
    private const COLS = 'id,nombre,email,rol,created_at';

    public static function all(string $token, bool $soloClientes = false): array
    {
        $q = 'profiles?select=' . self::COLS . '&order=nombre.asc';
        if ($soloClientes) {
            $q .= '&rol=eq.cliente';
        }
        return Supabase::rest('GET', $q, $token) ?? [];
    }

    public static function find(string $token, string $id): ?array
    {
        $rows = Supabase::rest('GET', "profiles?id=eq.$id&select=" . self::COLS, $token);
        return $rows[0] ?? null;
    }

    public static function updateRol(string $token, string $id, string $rol): array
    {
        $rows = Supabase::rest('PATCH', "profiles?id=eq.$id", $token, ['rol' => $rol], ['Prefer' => 'return=representation']);
        return $rows[0] ?? throw new ApiException(404, 'El usuario no existe.');
    }

    public static function hasOrders(string $token, string $id): bool
    {
        $rows = Supabase::rest('GET', "orders?or=(cliente_id.eq.$id,vendedor_id.eq.$id)&select=id&limit=1", $token);
        return !empty($rows);
    }
}
