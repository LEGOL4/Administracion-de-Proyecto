<?php
declare(strict_types=1);

namespace Nexo\Models;

use Nexo\Core\ApiException;
use Nexo\Core\Supabase;

final class Order
{
    /** @param array<string,string> $filters columna => uuid */
    public static function list(string $token, array $filters = []): array
    {
        $q = 'orders?select=*,order_items(*)&order=fecha.desc';
        foreach ($filters as $col => $uuid) {
            $q .= "&$col=eq.$uuid";
        }
        $rows = Supabase::rest('GET', $q, $token) ?? [];
        return self::format($rows);
    }

    public static function find(string $token, string $id): array
    {
        $list = self::list($token, ['id' => $id]);
        return $list[0] ?? throw new ApiException(404, 'El pedido no existe.');
    }

    /** Crea el pedido con la función atómica crear_pedido() de Postgres. Devuelve el id. */
    public static function create(string $token, string $clienteId, array $items): string
    {
        $id = Supabase::rest('POST', 'rpc/crear_pedido', $token, [
            'p_cliente_id' => $clienteId,
            'p_items' => $items,
        ]);
        return (string) $id;
    }

    /**
     * Normaliza los pedidos y agrega los nombres de cliente/vendedor.
     * Los nombres se leen con service_role porque un cliente no puede leer el perfil
     * de su vendedor por RLS; los pedidos ya vienen filtrados por el rol del usuario.
     */
    private static function format(array $rows): array
    {
        if (!$rows) {
            return [];
        }
        $ids = [];
        foreach ($rows as $o) {
            $ids[$o['cliente_id']] = true;
            if (!empty($o['vendedor_id'])) {
                $ids[$o['vendedor_id']] = true;
            }
        }
        $profiles = Supabase::restService('GET', 'profiles?select=id,nombre&id=in.(' . implode(',', array_keys($ids)) . ')') ?? [];
        $names = array_column($profiles, 'nombre', 'id');

        return array_map(static fn(array $o) => [
            'id' => $o['id'],
            'cliente_id' => $o['cliente_id'],
            'cliente_nombre' => $names[$o['cliente_id']] ?? null,
            'vendedor_id' => $o['vendedor_id'],
            'vendedor_nombre' => $names[$o['vendedor_id'] ?? ''] ?? null,
            'total' => (float) $o['total'],
            'estado' => $o['estado'],
            'fecha' => $o['fecha'],
            'items' => array_map(static fn(array $it) => [
                'product_id' => $it['product_id'],
                'nombre' => $it['nombre'],
                'cantidad' => (int) $it['cantidad'],
                'precio_unit' => (float) $it['precio_unit'],
            ], $o['order_items'] ?? []),
        ], $rows);
    }
}
