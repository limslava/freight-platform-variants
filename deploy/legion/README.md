# MoviBids and FreVigo on Legion

The two site containers join the existing `second-brain_default` Docker network.
Caddy remains the only service publishing ports 80 and 443.

Domains:

- `movibids.ru` — MoviBids, Russian default;
- `movibids.com` — MoviBids, English default;
- `frevigo.pro` — FreVigo, Russian default;
- `frevigo.com` — FreVigo, English default.

Deploy from the repository root:

```sh
docker compose -f deploy/legion/docker-compose.yml up -d --build
```

The Caddy blocks from `deploy/legion/Caddyfile.sites` must be appended to
`/srv/second-brain/Caddyfile`, validated inside `second-brain-caddy-1`, and
reloaded only after a successful validation.

Lead backups are stored in `deploy/legion/data/<brand>/leads.jsonl` on Legion.
Email, Telegram and Bitrix24 delivery remain disabled until their environment
variables are supplied to the corresponding service.

`FORMS_ENABLED=false` is set in Compose while legal and contact details are not
published. The UI hides the fields and the server returns HTTP 503 for direct
requests to `/api/lead`.
