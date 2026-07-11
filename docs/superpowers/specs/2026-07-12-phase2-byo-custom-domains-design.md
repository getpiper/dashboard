# Phase 2 slice C — BYO custom domains (design)

Third slice of Phase 2 ([#8](https://github.com/getpiper/dashboard/issues/8)),
tracked as [#19](https://github.com/getpiper/dashboard/issues/19). Phase 2 is an
epic of independent subsystems — deploy history + logs (slice A, shipped),
project import (slice D, shipped), app lifecycle (slice B, shipped), and this
one, BYO custom domains — each shipping as its own spec → plan → PR.

This slice lets a user attach a **bring-your-own custom domain** to a box from
the dashboard (free tier). The box still terminates TLS; the dashboard drives
the config and surfaces status. It builds on the box-detail page, which already
renders a box's connection state and its apps.

## Goal

From the box-detail page, a user can configure a BYO custom domain end-to-end —
see the DNS records to create, watch cert issuance progress, and remove the
domain — without touching the CLI.

Acceptance criteria (from #19):
- A BYO domain can be configured end-to-end from the dashboard (box still
  terminates TLS).
- DNS records to create are shown clearly.
- Cert-issuance status is visible and reflects the box's state.

## The control path (verified against `getpiper/piper`)

Everything rides the relay's control proxy, which forwards any
`/agents/{base}/v1/*` to the box over the tunnel, authenticated with the account
bearer in the `piper_session` cookie. Same plumbing every prior slice used — the
proxy forwards any method, so GET/PUT/DELETE all pass through unchanged. **No new
piper endpoint is required.**

Dependency [getpiper/piper#102](https://github.com/getpiper/piper/issues/102)
(domain-config API) is shipped. The three box endpoints, reached through the
proxy (`internal/api/api.go:278-330`):

| Action | Request | Response |
| --- | --- | --- |
| Read | `GET {relay}/agents/{base}/v1/domain` | `200` `Status` JSON (always, even unconfigured) |
| Set | `PUT {relay}/agents/{base}/v1/domain` body `{domain, dns_provider, dns_token}` | `200` `Status` (issuance kicked async); `400` invalid domain / unsupported provider / token required; `409` env-managed or box-not-relay-connected |
| Remove | `DELETE {relay}/agents/{base}/v1/domain` | `204`; `409` env-managed |

### The `Status` wire shape (`internal/domain/domain.go:358-383`)

The box already emits snake_case JSON tags (unlike the `App` list, which uses
Go-default capitalized keys), so no `Raw*` capital-key remap is needed — map
snake_case → camelCase directly:

```
Status {
  domain:         string
  dns_provider:   string
  dns_token_set:  bool          // token presence; the token value never returns
  source:         "api" | "env"
  status:         "" | "issuing" | "active" | "failed"
  error:          string        // populated when status == "failed"
  cert_not_after: string | null // RFC3339; present when active
  dns_records:    DNSRecord[]   // { type, name, value }
  dns_ok:         bool          // wildcard actually resolves to the relay
}
DNSRecord { type: "CNAME", name, value }
```

`dns_records` is always the two CNAMEs (`*.<domain>` and `<domain>` → the relay
host). They are for **traffic** — Cloudflare cert issuance uses the DNS API
token (DNS-01), not these records. `dns_ok` reports traffic readiness
(independent of issuance).

### Scope facts worth stating

- **Box-scoped, not app-scoped.** #102 exposes exactly one custom base domain
  per box, issued as a wildcard cert (`*.<domain>` + `<domain>`). Each app on
  the box becomes a subdomain automatically. Issue #19's "for an app" phrasing
  is loose; the real model attaches a base domain to the *box*. The UI therefore
  lives on the **box-detail page**, not the app-detail page.
- **Cloudflare is the only supported provider** (`internal/domain/domain.go:141`).
  We render it as a fixed label, not a dropdown.
- **The piper CLI has no `domain` command yet** — the dashboard is the first
  surface for this control.

## Design

Follows the established write pattern (server wrapper → session-guarded server
fn → injected-prop component → route wiring) exactly, as slices A/B/D did.

### 1. Server layer — `src/server/relay.ts`

Types plus three fetch wrappers, same status handling as the rest of the module
(`401` → `RelayAuthError`, `502`/`503` → `BoxOfflineError`):

```ts
type DnsRecord = { type: string; name: string; value: string };
type DomainStatus = {
  domain: string;
  dnsProvider: string;
  dnsTokenSet: boolean;
  source: "api" | "env";
  status: "" | "issuing" | "active" | "failed";
  error: string;
  certNotAfter: string | null;
  dnsRecords: DnsRecord[];
  dnsOk: boolean;
};

getDomain(credential, base)                     → GET    /v1/domain → 200 JSON (map to DomainStatus)
setDomain(credential, base, { domain, provider, token })
                                                → PUT    /v1/domain → 200 JSON (map to DomainStatus)
removeDomain(credential, base)                  → DELETE /v1/domain → 204
```

`getDomain`/`setDomain` expect `200` and map the body; on a non-2xx that isn't
`401`/`502`/`503`, throw an error using the trimmed response body (so piper's
`400`/`409` messages surface), falling back to a status-code message —
mirroring `createApp`/`linkApp`. `removeDomain` expects `204`, same fallback.
`base` is `encodeURIComponent`-wrapped, matching the existing wrappers.

The `PUT` body sends the provider as `"cloudflare"` (the component's fixed
value) under the wire key `dns_provider`, and the token under `dns_token`.

### 2. Server functions — `src/server/fns.ts`

One read fn and two write fns, session-guarded exactly like the existing fns —
read the `piper_session` cookie, `redirect({ to: "/login" })` if absent, and
`dropSessionAndRedirect()` on `RelayAuthError`:

```ts
getDomainFn    .validator((base: string) => base)                              // createServerFn() (GET)
setDomainFn    .validator((d: { base: string; domain: string; token: string }) => d)  // { method: "POST" }
removeDomainFn .validator((base: string) => base)                               // { method: "POST" }
```

`setDomainFn` calls `setDomain(credential, data.base, { domain: data.domain,
provider: "cloudflare", token: data.token })`.

### 3. Component — `src/components/domain-panel.tsx`

New component, decoupled from server fns via injected async props (testable with
fakes, mirroring `AppDetail`):

```ts
DomainPanel({
  status: DomainStatus,
  onSave:   (domain: string, token: string) => Promise<void>,
  onRemove: () => Promise<void>,
})
```

Renders one of three states off `status`:

- **`source === "env"`** — read-only: the domain and "Managed by this box's
  environment." No config or remove controls (gating the UI on `source` avoids
  the env-managed `409` entirely).
- **Unconfigured** (`source === "api"` and no `domain`) — a config form: a
  **Domain** text input, a **DNS API token** password input, and a static
  **Cloudflare** provider label. **Save** → `onSave(domain, token)`; pending
  state disables the button ("Saving…").
- **Configured** (`source === "api"` with a `domain`) — status view:
  - the domain and a **cert-status pill** (`issuing` / `active` / `failed`);
    `failed` shows `error`; `active` shows `certNotAfter`.
  - a **DNS-resolving** indicator driven by `dnsOk` ("DNS resolving to your box"
    yes/no).
  - the **CNAME records** table (`dnsRecords`) — type / name / value columns,
    monospace and copy-friendly.
  - a **Remove custom domain** action: an inline confirm block (not a modal)
    with a warning line, a text input, and **Cancel** / **Remove** buttons. The
    Remove button is **disabled until the typed value exactly equals the
    domain** (mirrors the app-delete guard). On confirm: pending → `onRemove()`.
    Cancel collapses and clears without calling `onRemove`.

A single `error` state renders a red message (mirrors `ImportWizard`/
`AppDetail`). Every catch re-throws `isRedirect(err)` first so session-expiry
redirects propagate; other errors set the message.

**Auto-poll while issuing:** a `useEffect` starts a ~5s `setInterval` that calls
an injected `refresh` — the route's `router.invalidate()` — **only while**
`status.status === "issuing"`, and clears the interval when status leaves
`issuing` or on unmount. So the panel flips from `issuing` to `active`/`failed`
on its own without a manual click.

### 4. Route wiring — `src/routes/boxes/$base.tsx`

The loader fetches domain status alongside the box (`Promise.all` of `getBox`
and `getDomainFn`). `BoxPage` renders `<DomainPanel>` under the box header via
`BoxDetail` (pass the status + handlers through, or render the panel as a
sibling — whichever keeps `BoxDetail` focused), wiring:

- `onSave`   → `await setDomainFn({ data: { base, domain, token } })` then
  `router.invalidate()`.
- `onRemove` → `await removeDomainFn({ data: base })` then `router.invalidate()`.
- `refresh`  → `router.invalidate()` (drives the issuing poll).

## Testing (test-first)

- **`relay.ts`** — `getDomain`/`setDomain`/`removeDomain` hit the correct
  method + path; `getDomain`/`setDomain` map a `200` body to `DomainStatus`
  (snake_case → camelCase, including `dns_records` and `dns_ok`); `setDomain`
  sends `dns_provider: "cloudflare"` and `dns_token` in the body; each maps
  `401` → `RelayAuthError`, `502`/`503` → `BoxOfflineError`; a non-2xx with a
  body (e.g. `400 unsupported dns provider`) throws an error carrying the body
  text; `removeDomain` resolves on `204`.
- **`domain-panel.tsx`** (Testing Library, injected fake props):
  - **env** source renders read-only, with no Save or Remove control.
  - **unconfigured** renders the form; entering a domain + token and submitting
    calls `onSave` with those values and shows the pending state.
  - **configured** renders the cert-status pill for `issuing`/`active`/`failed`
    (failed showing `error`, active showing `certNotAfter`), the `dnsOk`
    indicator, and the two CNAME records.
  - **remove** is disabled until the exact domain is typed; the matching value
    enables it; confirming calls `onRemove`; Cancel collapses without calling
    `onRemove`.
  - a rejected `onSave`/`onRemove` renders the error message.

Tests live outside `src/routes/` (the file router scans it), consistent with the
repo's constraint.

## Out of scope (unchanged from #19)

- **Per-app subdomain routing config.** The box maps each app to a subdomain of
  the base domain automatically; there is nothing per-app to configure here.
- **Non-Cloudflare DNS providers.** piper supports only Cloudflare today
  (`internal/domain/domain.go:141`); adding others is a piper change first.
- **Any relay-side change.** The relay is a pure proxy passthrough for
  `/v1/domain`; #102 is shipped.
