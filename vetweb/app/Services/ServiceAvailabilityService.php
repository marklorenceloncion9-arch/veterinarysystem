<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\Medicine;
use App\Models\Service;
use App\Support\ServiceInventoryCategories;
use Illuminate\Support\Collection;

class ServiceAvailabilityService
{
    /** @var Collection<string, bool>|null */
    private ?Collection $categoriesWithStock = null;

    // Diri susihon kung available ang serbisyo.
    public function isAvailable(Service $service): bool
    {
        return $this->getAvailability($service)['is_available'];
    }

    /**
     * @return array{is_available: bool, unavailable_reason: string|null}
     */
    // Diri kuhaon ang availability ug rason sa serbisyo.
    public function getAvailability(Service $service): array
    {
        $requiredCategories = ServiceInventoryCategories::forService($service->type_name);

        if ($requiredCategories === null) {
            return [
                'is_available' => true,
                'unavailable_reason' => null,
            ];
        }

        $stockByCategory = $this->getCategoriesWithStock();
        $missingCategories = [];

        foreach ($requiredCategories as $categoryName) {
            $key = strtolower(trim($categoryName));
            if (!($stockByCategory[$key] ?? false)) {
                $missingCategories[] = $categoryName;
            }
        }

        if ($missingCategories === []) {
            return [
                'is_available' => true,
                'unavailable_reason' => null,
            ];
        }

        $label = count($missingCategories) === 1
            ? $missingCategories[0]
            : implode(', ', $missingCategories);

        return [
            'is_available' => false,
            'unavailable_reason' => "Required {$label} inventory has no usable (non-expired) stock.",
        ];
    }

    /**
     * @return array<string, mixed>
     */
    // Diri idugang ang availability info sa serbisyo.
    public function enrichService(Service $service): array
    {
        $availability = $this->getAvailability($service);

        return [
            'id' => $service->id,
            'type_name' => $service->type_name,
            'description' => $service->description,
            'is_available' => $availability['is_available'],
            'unavailable_reason' => $availability['unavailable_reason'],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    // Diri idugang ang availability sa tanang serbisyo.
    public function enrichAll(): array
    {
        return Service::orderBy('type_name')
            ->get()
            ->map(fn (Service $service) => $this->enrichService($service))
            ->values()
            ->all();
    }

    /**
     * @param list<int> $serviceIds
     */
    // Diri susihon kung available tanan gipili nga serbisyo.
    public function assertServicesAvailable(array $serviceIds): ?string
    {
        if ($serviceIds === []) {
            return null;
        }

        $services = Service::whereIn('id', $serviceIds)->get();

        foreach ($services as $service) {
            $availability = $this->getAvailability($service);
            if (!$availability['is_available']) {
                return "{$service->type_name} is temporarily unavailable. {$availability['unavailable_reason']}";
            }
        }

        return null;
    }

    /**
     * @return array<string, bool>
     */
    // Diri kuhaon ang mga category nga naay stock.
    private function getCategoriesWithStock(): array
    {
        if ($this->categoriesWithStock !== null) {
            return $this->categoriesWithStock->all();
        }

        $medicineIdsWithStock = Inventory::query()
            ->availableForUse()
            ->distinct()
            ->pluck('medicine_id');

        $medicines = Medicine::with('category')
            ->whereIn('id', $medicineIdsWithStock)
            ->get();

        $result = [];

        foreach ($medicines as $medicine) {
            $categoryName = strtolower(trim((string) ($medicine->category?->name ?? '')));
            if ($categoryName !== '') {
                $result[$categoryName] = true;
            }
        }

        $this->categoriesWithStock = collect($result);

        return $result;
    }
}
