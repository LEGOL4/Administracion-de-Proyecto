<?php
declare(strict_types=1);

namespace Nexo\Controllers;

use Nexo\Core\Request;
use Nexo\Models\Order;
use Nexo\Models\Product;
use Nexo\Models\Profile;

final class ReportController
{
    /** Indicadores del panel general (solo administrador). */
    public static function dashboard(Request $req, array $params, array $user): array
    {
        $t = $user['token'];
        $products = Product::all($t);
        $orders = Order::list($t);
        $users = Profile::all($t);

        return [
            'productos' => count($products),
            'stock_bajo' => count(array_filter($products, fn($p) => (int) $p['stock'] <= 5)),
            'ventas' => count($orders),
            'ingresos' => round(array_sum(array_column($orders, 'total')), 2),
            'usuarios' => count($users),
            'clientes' => count(array_filter($users, fn($u) => $u['rol'] === 'cliente')),
            'vendedores' => count(array_filter($users, fn($u) => $u['rol'] === 'vendedor')),
            'ultimas' => array_slice($orders, 0, 6),
        ];
    }

    /** Reportes comerciales (solo administrador). */
    public static function summary(Request $req, array $params, array $user): array
    {
        $orders = Order::list($user['token']);
        $ingresos = array_sum(array_column($orders, 'total'));

        $porProducto = [];
        $unidades = 0;
        foreach ($orders as $o) {
            foreach ($o['items'] as $it) {
                $porProducto[$it['nombre']] = ($porProducto[$it['nombre']] ?? 0) + $it['cantidad'];
                $unidades += $it['cantidad'];
            }
        }
        arsort($porProducto);
        $top = [];
        foreach (array_slice($porProducto, 0, 6, true) as $nombre => $cant) {
            $top[] = ['nombre' => $nombre, 'cantidad' => $cant];
        }

        return [
            'ingresos' => round($ingresos, 2),
            'pedidos' => count($orders),
            'ticket_promedio' => $orders ? round($ingresos / count($orders), 2) : 0,
            'unidades' => $unidades,
            'top' => $top,
            'ventas' => $orders,
        ];
    }
}
