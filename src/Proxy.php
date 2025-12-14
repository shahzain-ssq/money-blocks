<?php

function parseTrustedProxies(): array
{
    $trustedProxiesEnv = getenv('TRUSTED_PROXIES') ?: '';

    return array_filter(array_map('trim', explode(',', $trustedProxiesEnv)));
}

function ipMatchesCidr(string $ip, string $cidr): bool
{
    if (!str_contains($cidr, '/')) {
        return false;
    }

    [$subnet, $mask] = explode('/', $cidr, 2);
    $maskBits = (int) $mask;
    $ipBinary = inet_pton($ip);
    $subnetBinary = inet_pton($subnet);

    if ($ipBinary === false || $subnetBinary === false) {
        return false;
    }

    $ipUnpacked = unpack('C*', $ipBinary);
    $subnetUnpacked = unpack('C*', $subnetBinary);

    if ($ipUnpacked === false || $subnetUnpacked === false) {
        return false;
    }

    $bits = count($ipUnpacked) * 8;
    if ($maskBits < 0 || $maskBits > $bits) {
        return false;
    }

    $fullBytes = intdiv($maskBits, 8);
    $remainingBits = $maskBits % 8;

    for ($i = 1; $i <= $fullBytes; $i++) {
        if ($ipUnpacked[$i] !== $subnetUnpacked[$i]) {
            return false;
        }
    }

    if ($remainingBits === 0) {
        return true;
    }

    $maskByte = 0xFF << (8 - $remainingBits) & 0xFF;

    return ($ipUnpacked[$fullBytes + 1] & $maskByte) === ($subnetUnpacked[$fullBytes + 1] & $maskByte);
}

function isTrustedProxyAddress(string $remoteAddr, array $trustedProxies): bool
{
    if ($remoteAddr === '' || empty($trustedProxies)) {
        return false;
    }

    foreach ($trustedProxies as $proxy) {
        if (str_contains($proxy, '/')) {
            if (ipMatchesCidr($remoteAddr, $proxy)) {
                return true;
            }
            continue;
        }

        if ($remoteAddr === $proxy) {
            return true;
        }
    }

    return false;
}
