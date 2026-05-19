### 12.4 User-facing message catalog

| Code | Where it surfaces | Doug-facing message | Crew-facing message | Follow-up |
| --- | --- | --- | --- | --- |
| **Fixture group** | | | | |
| ~~`OAUTH_STATE_INVALID` (operator-log-only variant)~~ | Retired: deduplicated against the canonical user-visible `OAUTH_STATE_INVALID` row. | — | — | — |
| `SHEET_UNAVAILABLE` | fixture producer | "Doug copy." | "Crew copy." | Doug → fix sheet |
| `ADMIN_LOG_ONLY` | fixture producer | (admin log only — fixture hint) | — | — |

<!-- §12.4 helpfulContext appendix — machine-parseable -->

```yaml
SHEET_UNAVAILABLE: "Helpful context."
```

## 13. Next section
