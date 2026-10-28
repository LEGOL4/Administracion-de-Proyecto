<?php
declare(strict_types=1);

namespace Nexo\Core;

/** Error controlado que se traduce a una respuesta JSON con su código HTTP. */
final class ApiException extends \RuntimeException
{
    public function __construct(public int $status, string $message)
    {
        parent::__construct($message);
    }
}
