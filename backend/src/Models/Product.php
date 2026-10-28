<?php
declare(strict_types=1);

namespace Nexo\Models;

use Nexo\Core\ApiException;
use Nexo\Core\Supabase;

final class Product
{
    private const COLS = 'id,nombre,descripcion,categoria,precio,stock,imagen_url,created_at';

    public static function all(string $token): array
    {
        return Supabase::rest('GET', 'products?select=' . self::COLS . '&order=nombre.asc', $token) ?? [];
    }

    public static function create(string $token, array $data): array
    {
        $rows = Supabase::rest('POST', 'products', $token, $data, ['Prefer' => 'return=representation']);
        return $rows[0] ?? throw new ApiException(403, 'No tienes permisos para crear productos.');
    }

    public static function update(string $token, string $id, array $data): array
    {
        $rows = Supabase::rest('PATCH', "products?id=eq.$id", $token, $data, ['Prefer' => 'return=representation']);
        return $rows[0] ?? throw new ApiException(404, 'El producto no existe.');
    }

    public static function delete(string $token, string $id): void
    {
        $rows = Supabase::rest('DELETE', "products?id=eq.$id", $token, null, ['Prefer' => 'return=representation']);
        if (empty($rows)) {
            throw new ApiException(404, 'El producto no existe.');
        }
    }
}
