---
title: Supplier review
---

# Supplier review — Q3 2026

**Prepared for:** Operations team
**Status:** Draft

## Summary

We reviewed **14 suppliers** across three regions. Key findings:

1. Two contracts renew automatically in *November*.
2. Notice periods range from 30 to 90 days.
3. Pricing for raw materials rose by ~8% year on year.

> **Note:** figures exclude the Leeds site, which reports separately.

## Renewal dates

| Supplier | Renewal | Notice | Owner |
|----------|---------|-------:|-------|
| Acme Ltd | 2026-11-30 | 60 days | Priya |
| Borealis | 2027-02-15 | 90 days | Tom |
| Castell & Co | 2026-12-01 | 30 days | — |

## Actions

- [ ] Send notice to Acme by **Oct 1**
- [x] Collect Borealis pricing
- [ ] Decide on Castell

### Method

Data came from the contract register (`contracts.xlsx`) and supplier emails. See [the register](contracts.xlsx) for details.

```sql
SELECT supplier, renewal_date
FROM contracts
WHERE renewal_date < '2027-01-01';
```

---

*Last updated by the agent.*
