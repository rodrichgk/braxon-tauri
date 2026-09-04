# BRAXON scan service

One small HTTP endpoint that lets a phone open a job on a specific bench PC.

```
phone camera ─▶ https://192.168.77.182:8481/s/<pcId>/<entity>/<key>
                     │  INSERT INTO "BraxonScanInbox"  (addressed to pcId)
                     ▼
              Postgres  ◀── BRAXON desktop app polls it (scan_inbox.rs) ──▶ opens the job
```

- **entity** is one of `job`, `abs`, `stock`.
- **key** is the record id (for `job` it's the 4D `LigCde` id; for `abs` the reference).
- **pcId** identifies which running BRAXON install should react — its UUID from
  `%APPDATA%\pic-abs-tester\client_id.txt`, also visible in the app.

The service and every BRAXON client share one Postgres. The service creates
`"BraxonClient"` and `"BraxonScanInbox"` on boot if they don't exist (same DDL as
`src-tauri/src/client_registry.rs`).

## Transfer the folder to the server

Pick one (run on your Windows machine, not inside the PuTTY session):

```bat
:: PuTTY's own scp (C:\Program Files\PuTTY\pscp.exe)
pscp -r "c:\...\braxon-tauri\scan-service" YOU@192.168.77.182:/tmp/scan-service
```
```bash
# or from Git Bash
scp -r "/c/.../braxon-tauri/scan-service" YOU@192.168.77.182:/tmp/
```
Or install **WinSCP** (reuses your saved PuTTY session) and drag the folder to `/tmp`.
Or, if you push the repo: `git clone https://github.com/rodrichgk/braxon-tauri` on the
server and use its `scan-service/` folder.

## Deploy (Ubuntu, same box as Postgres)

```bash
node -v   # must be >= 18 — if older, install nodejs 18+ first

sudo useradd --system --home /opt/braxon-scan --shell /usr/sbin/nologin braxon-scan
sudo mkdir -p /opt/braxon-scan /etc/braxon-scan

# code  (assumes you uploaded the folder to /tmp/scan-service — see "Transfer" below)
sudo rsync -a /tmp/scan-service/ /opt/braxon-scan/
sudo chown -R braxon-scan /opt/braxon-scan
cd /opt/braxon-scan && sudo -u braxon-scan npm install --omit=dev   # installs `pg`

# config
sudo cp scan-service/env.example /etc/braxon-scan/env
sudo nano /etc/braxon-scan/env                    # set PG* to the BRAXON DB
sudo chmod 600 /etc/braxon-scan/env && sudo chown braxon-scan /etc/braxon-scan/env

# self-signed cert (CN/SAN must be the IP phones use)
sudo openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout /etc/braxon-scan/key.pem -out /etc/braxon-scan/cert.pem \
  -subj "/CN=192.168.77.182" -addext "subjectAltName=IP:192.168.77.182"
sudo chown braxon-scan /etc/braxon-scan/key.pem /etc/braxon-scan/cert.pem

# service
sudo cp scan-service/braxon-scan.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now braxon-scan

# firewall
sudo ufw allow 8481/tcp
```

## Verify

```bash
curl -k https://192.168.77.182:8481/healthz            # -> ok
curl -k "https://192.168.77.182:8481/s/<pcId>/job/17490801?label=TEST"
```

The second call returns a confirmation page and the BRAXON app on `<pcId>` jumps to
REMAN → Suivi d'interventions with that job open. Get a real `pcId` from the app
(Sidebar → scan menu → "This PC") or:

```sql
SELECT pc_id, hostname, last_seen FROM "BraxonClient" ORDER BY last_seen DESC;
```

## Notes

- **IP changes.** QR codes embed `192.168.77.182`. Give the server a static IP / DHCP
  reservation. The bench PC's `pcId` is stable regardless of its IP.
- **Config in the app.** BRAXON builds QR URLs from `scanServiceUrl` in `localStorage`
  (Sidebar → scan menu), default `https://192.168.77.182:8481`. Change it there if you
  move the port/host.
- `SCAN_TLS=off` runs plain HTTP for use behind an existing TLS reverse proxy; then set
  the app's `scanServiceUrl` to the proxy's `https://…` address.
