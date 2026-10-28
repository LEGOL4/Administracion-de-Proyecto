<?php
declare(strict_types=1);

namespace Nexo\Core;

final class Validator
{
    public const ROLES = ['administrador', 'vendedor', 'cliente'];

    public static function uuid(mixed $v, string $campo = 'id'): string
    {
        if (!is_string($v) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $v)) {
            throw new ApiException(400, "El campo $campo no es válido.");
        }
        return strtolower($v);
    }

    public static function nombre(mixed $v): string
    {
        $v = is_string($v) ? trim($v) : '';
        if (!preg_match('/^[\p{L}\p{M}][\p{L}\p{M}\s.\'-]{1,79}$/u', $v)) {
            throw new ApiException(422, 'Ingresa un nombre válido (2 a 80 letras).');
        }
        return $v;
    }

    public static function email(mixed $v): string
    {
        $v = is_string($v) ? strtolower(trim($v)) : '';
        if (!filter_var($v, FILTER_VALIDATE_EMAIL) || strlen($v) > 120) {
            throw new ApiException(422, 'Ingresa un correo electrónico válido.');
        }
        return $v;
    }

    public static function password(mixed $v): string
    {
        if (!is_string($v) || strlen($v) < 6 || strlen($v) > 72) {
            throw new ApiException(422, 'La contraseña debe tener entre 6 y 72 caracteres.');
        }
        return $v;
    }

    public static function rol(mixed $v): string
    {
        if (!is_string($v) || !in_array($v, self::ROLES, true)) {
            throw new ApiException(422, 'El rol indicado no es válido.');
        }
        return $v;
    }

    public static function entero(mixed $v, string $campo, int $min, int $max): int
    {
        if (is_string($v) && preg_match('/^-?\d+$/', $v)) {
            $v = (int) $v;
        }
        if (!is_int($v) || $v < $min || $v > $max) {
            throw new ApiException(422, "$campo debe ser un entero entre $min y $max.");
        }
        return $v;
    }

    public static function decimal(mixed $v, string $campo, float $min, float $max): float
    {
        if (!is_int($v) && !is_float($v) && !(is_string($v) && is_numeric($v))) {
            throw new ApiException(422, "$campo debe ser un número.");
        }
        $v = round((float) $v, 2);
        if ($v < $min || $v > $max) {
            throw new ApiException(422, "$campo debe estar entre $min y $max.");
        }
        return $v;
    }

    public static function texto(mixed $v, string $campo, int $max, bool $obligatorio = false): string
    {
        $v = is_string($v) ? trim($v) : '';
        if ($obligatorio && $v === '') {
            throw new ApiException(422, "$campo es obligatorio.");
        }
        if (mb_strlen($v) > $max) {
            throw new ApiException(422, "$campo no puede superar $max caracteres.");
        }
        return $v;
    }

    public static function urlOpcional(mixed $v): ?string
    {
        $v = is_string($v) ? trim($v) : '';
        if ($v === '') {
            return null;
        }
        if (!filter_var($v, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $v) || strlen($v) > 500) {
            throw new ApiException(422, 'La URL de la imagen no es válida (debe empezar con http:// o https://).');
        }
        return $v;
    }
}
