<?php
declare(strict_types=1);

namespace Nexo\Controllers;

use Nexo\Core\ApiException;
use Nexo\Core\Request;
use Nexo\Core\Validator;
use Nexo\Models\Order;

final class OrderController
{
    /**
     * Administrador: todos. Vendedor: los suyos. Cliente: los suyos.
     * (el filtro real lo aplica RLS; los parámetros solo acotan la consulta).
     */
    public static function index(Request $req, array $params, array $user): array
    {
        $filters = [];
        if ($user['rol'] === 'cliente') {
            $filters['cliente_id'] = $user['id'];
        } else {
            foreach (['cliente_id', 'vendedor_id'] as $f) {
                if (!empty($req->query[$f])) {
                    $filters[$f] = Validator::uuid($req->query[$f], $f);
                }
            }
        }
        return Order::list($user['token'], $filters);
    }

    /** Vendedor / administrador: registra una venta y descuenta stock de forma atómica. */
    public static function store(Request $req, array $params, array $user): array
    {
        $b = $req->json();
        $clienteId = Validator::uuid($b['cliente_id'] ?? null, 'cliente_id');
        $items = self::items($b['items'] ?? null);

        $id = Order::create($user['token'], $clienteId, $items);
        return ['__status' => 201, 'data' => Order::find($user['token'], $id)];
    }

    /**
     * Corrige una venta (cliente y/o productos). Ajusta el stock de forma atómica.
     * Un vendedor solo puede editar sus ventas; el administrador, todas (lo valida la base de datos).
     */
    public static function update(Request $req, array $params, array $user): array
    {
        $id = Validator::uuid($params['id']);
        $b = $req->json();
        $clienteId = Validator::uuid($b['cliente_id'] ?? null, 'cliente_id');
        $items = self::items($b['items'] ?? null);

        Order::update($user['token'], $id, $clienteId, $items);
        return Order::find($user['token'], $id);
    }

    /** Elimina una venta y devuelve su stock al inventario. */
    public static function destroy(Request $req, array $params, array $user): array
    {
        Order::delete($user['token'], Validator::uuid($params['id']));
        return ['deleted' => true];
    }

    /** @return array<int,array{product_id:string,cantidad:int}> */
    private static function items(mixed $raw): array
    {
        if (!is_array($raw) || !$raw || count($raw) > 100) {
            throw new ApiException(422, 'El pedido debe tener entre 1 y 100 productos.');
        }
        $items = [];
        foreach ($raw as $it) {
            if (!is_array($it)) {
                throw new ApiException(422, 'Formato de productos inválido.');
            }
            $items[] = [
                'product_id' => Validator::uuid($it['product_id'] ?? null, 'product_id'),
                'cantidad' => Validator::entero($it['cantidad'] ?? null, 'La cantidad', 1, 9999),
            ];
        }
        return $items;
    }
}
