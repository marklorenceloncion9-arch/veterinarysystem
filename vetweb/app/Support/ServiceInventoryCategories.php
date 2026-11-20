<?php

namespace App\Support;

class ServiceInventoryCategories
{
    /**
     * Maps a service name to the inventory categories it depends on.
     * Treatment is intentionally omitted — medicines are chosen at treatment time.
     *
     * @var array<string, list<string>>
     */
    private const MAP = [
        'deworming' => ['Dewormer'],
        'vaccination' => ['Vaccine'],
        'vitamin supplement' => ['Vitamins'],
        'spay' => ['Surgery'],
        'castration' => ['Surgery'],
    ];

    /**
     * @return list<string>|null Null when the service does not require stock gating.
     */
    // Diri kuhaon ang category sa inventory para sa serbisyo.
    public static function forService(string $typeName): ?array
    {
        $key = strtolower(trim($typeName));

        return self::MAP[$key] ?? null;
    }

    // Diri susihon kung kinahanglan i-check ang stock sa serbisyo.
    public static function requiresInventoryCheck(string $typeName): bool
    {
        return self::forService($typeName) !== null;
    }

    /**
     * @param  list<string>  $serviceNames
     * @return list<string>|null Allowed category names, or null when all categories apply.
     */
    // Diri kuhaon ang mga category para sa mga serbisyo.
    public static function categoriesForServices(array $serviceNames): ?array
    {
        $normalized = collect($serviceNames)
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->filter()
            ->values()
            ->all();

        if ($normalized === []) {
            return null;
        }

        if (in_array('treatment', $normalized, true)) {
            return null;
        }

        $categories = [];

        foreach ($normalized as $name) {
            foreach (self::MAP[$name] ?? [] as $category) {
                $categories[$category] = true;
            }
        }

        return $categories === [] ? null : array_keys($categories);
    }

    /**
     * @param  list<string>  $serviceNames
     */
    // Diri susihon kung mohaum ang tambal sa serbisyo.
    public static function itemMatchesServices(?string $categoryName, array $serviceNames): bool
    {
        $category = trim((string) $categoryName);
        if ($category === '') {
            return false;
        }

        $allowed = self::categoriesForServices($serviceNames);
        if ($allowed === null) {
            $normalized = collect($serviceNames)
                ->map(fn ($name) => strtolower(trim((string) $name)))
                ->filter()
                ->all();

            return in_array('treatment', $normalized, true);
        }

        $allowedSet = array_map('strtolower', $allowed);

        return in_array(strtolower($category), $allowedSet, true);
    }

    // Diri susihon kung naay treatment nga serbisyo ang hayop.
    public static function petHasTreatmentService(array $serviceNames): bool
    {
        return collect($serviceNames)
            ->map(fn ($name) => strtolower(trim((string) $name)))
            ->contains('treatment');
    }
}
