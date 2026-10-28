<?php
declare(strict_types=1);

namespace Nexo\Core;

final class Env
{
    private static array $vars = [];

    public static function load(string $file): void
    {
        if (!is_file($file)) {
            error_log('[NEXO] No se encontro el archivo .env en: ' . realpath(dirname($file)) . ' (debe llamarse exactamente ".env")');
            return;
        }
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim(preg_replace('/^\xEF\xBB\xBF/', '', $line)); // quita el BOM de UTF-8
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$k, $v] = explode('=', $line, 2);
            self::$vars[trim($k)] = trim($v, " \t\"'");
        }
    }

    public static function get(string $key, ?string $default = null): string
    {
        $value = self::$vars[$key] ?? getenv($key) ?: $default;
        if ($value === null || $value === '') {
            throw new ApiException(500, "Falta configurar $key en el archivo .env del backend.");
        }
        return $value;
    }
}
