<?php
declare(strict_types=1);

namespace Nexo\Controllers;

use Nexo\Core\Request;
use Nexo\Core\Validator;
use Nexo\Models\Product;

final class ProductController
{
    public static function index(Request $req, array $params, array $user): array
    {
        return Product::all($user['token']);
    }

    public static function store(Request $req, array $params, array $user): array
    {
        return ['__status' => 201, 'data' => Product::create($user['token'], self::payload($req->json()))];
    }

    public static function update(Request $req, array $params, array $user): array
    {
        $id = Validator::uuid($params['id']);
        return Product::update($user['token'], $id, self::payload($req->json()));
    }

    public static function setStock(Request $req, array $params, array $user): array
    {
        $id = Validator::uuid($params['id']);
        $stock = Validator::entero($req->json()['stock'] ?? null, 'El stock', 0, 1000000);
        return Product::update($user['token'], $id, ['stock' => $stock]);
    }

    public static function destroy(Request $req, array $params, array $user): array
    {
        Product::delete($user['token'], Validator::uuid($params['id']));
        return ['deleted' => true];
    }

    private static function payload(array $b): array
    {
        return [
            'nombre' => Validator::texto($b['nombre'] ?? null, 'El nombre', 120, true),
            'descripcion' => Validator::texto($b['descripcion'] ?? '', 'La descripción', 500),
            'categoria' => Validator::texto($b['categoria'] ?? null, 'La categoría', 60, true),
            'precio' => Validator::decimal($b['precio'] ?? null, 'El precio', 0, 99999999),
            'stock' => Validator::entero($b['stock'] ?? null, 'El stock', 0, 1000000),
            'imagen_url' => Validator::urlOpcional($b['imagen_url'] ?? null),
        ];
    }
}
