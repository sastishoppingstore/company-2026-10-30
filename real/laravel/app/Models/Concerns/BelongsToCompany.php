<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;

/**
 * Company-level data isolation: every query on a company-owned model is scoped to
 * the authenticated company, so a company can never read another company's rows.
 */
trait BelongsToCompany
{
    public function scopeForCompany(Builder $query, ?int $companyId): Builder
    {
        return $query->when($companyId, fn (Builder $q) => $q->where('company_id', $companyId));
    }

    public function isOwnedBy(?int $companyId): bool
    {
        return $this->company_id !== null && $this->company_id === $companyId;
    }
}
