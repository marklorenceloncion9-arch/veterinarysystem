<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $reports = DB::table('damage_reports')->select('id', 'evidence_image_url', 'evidence_image_urls')->get();

        foreach ($reports as $report) {
            $urls = json_decode((string) $report->evidence_image_urls, true);
            if (!is_array($urls)) {
                $urls = [];
            }

            if (is_string($report->evidence_image_url) && trim($report->evidence_image_url) !== '') {
                array_unshift($urls, trim($report->evidence_image_url));
            }

            $clean = [];
            foreach ($urls as $url) {
                $url = trim((string) $url);
                if ($url !== '' && !in_array($url, $clean, true)) {
                    $clean[] = $url;
                }
            }

            DB::table('damage_reports')->where('id', $report->id)->update([
                'evidence_image_urls' => $clean ? json_encode(array_values(array_slice($clean, 0, 3))) : null,
            ]);
        }

        Schema::table('damage_reports', function (Blueprint $table) {
            $table->dropColumn('evidence_image_url');
        });
    }

    public function down(): void
    {
        Schema::table('damage_reports', function (Blueprint $table) {
            $table->string('evidence_image_url', 1000)->nullable()->after('reason');
        });

        $reports = DB::table('damage_reports')->select('id', 'evidence_image_urls')->get();
        foreach ($reports as $report) {
            $urls = json_decode((string) $report->evidence_image_urls, true);
            $first = is_array($urls) ? ($urls[0] ?? null) : null;

            DB::table('damage_reports')->where('id', $report->id)->update([
                'evidence_image_url' => is_string($first) ? $first : null,
            ]);
        }
    }
};
