# PostgreSQL on AWS EBS

Production database for String Theory: a self-managed PostgreSQL container on an EC2 instance, with
its data directory on a dedicated EBS volume.

PostgreSQL runs on EC2 rather than RDS so the storage layer is one you can reason about — a volume
you attach, snapshot and detach, with the data directory in one known place. The trade is that
failover, patching and backups are yours to operate, which is what the rest of this document covers.

---

## Topology

| Piece | Choice | Why |
|---|---|---|
| Instance | EC2, single AZ | One writer. Scaling out is a bigger change than it looks — see *Growing* below. |
| Storage | `gp3`, 100 GB, 3000 IOPS | Sustained throughput is the constraint, not peak. Postgres is IO-bound on small writes. |
| Durability | gp3 is replicated within the AZ | Survives instance loss. Survives an AZ loss only via snapshots, hence the schedule below. |
| Postgres | `postgres:16-alpine`, pinned | Matches `docker-compose.prod.yml`. Do not track `:latest`. |
| Port | not published | The app connects over the private network. See *Security groups*. |

The app is the only client. `DATABASE_SSL=disable` is correct here: both processes are inside the
same VPC and the connection never leaves the instance.

---

## One-time provisioning

Run on the EC2 instance. Substitute your own AZ, subnet and instance type.

### 1. Create and attach the volume

```bash
VOLUME_ID=$(aws ec2 create-volume \
  --availability-zone eu-west-1a \
  --size 100 \
  --volume-type gp3 \
  --iops 3000 \
  --throughput 125 \
  --tag 'Name=string-theory-pgdata,Project=string-theory' \
  --query 'VolumeId' --output text)

aws ec2 attach-volume --volume-id "$VOLUME_ID" --instance-id i-0abc123 --device /dev/sdf
```

`--iops 3000` and `--throughput 125` are the gp3 values included in the baseline price; state them
explicitly anyway so a future reader knows they were chosen, not inherited.

### 2. Format and mount

The device name (`/dev/sdf` above) is not stable across reboots. Format by **volume id** instead, or
you will eventually format the wrong disk.

```bash
# Wait for the device to appear
while [ ! -e /dev/nvme1n1 ]; do sleep 2; done

sudo mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/nvme1n1

sudo mkdir -p /mnt/string-theory/pgdata
sudo mount /dev/nvme1n1 /mnt/string-theory/pgdata

# Persist across reboots
VOLUME_ID_BY_NAME=$(aws ec2 describe-volumes \
  --filters Name=tag:Name,Values=string-theory-pgdata \
  --query 'Volumes[0].VolumeId' --output text)
echo "LABEL=string-theory-pgdata UUID=$(sudo blkid -s UUID -o value /dev/nvme1n1) /mnt/string-theory/pgdata ext4,nofail,discard,nobarrier 0 2" \
  | sudo tee -a /etc/fstab
```

`nofail` matters: without it a detached volume leaves the instance unbootable, and the database you
are trying to recover is behind a prompt you cannot see on a headless box.

### 3. Hand the directory to Postgres

Postgres runs as uid 999 inside the container. The bind mount must be owned by that uid or `initdb`
fails on first boot with a permission error that looks nothing like a permission error.

```bash
sudo chown 999:999 /mnt/string-theory/pgdata
sudo chmod 700 /mnt/string-theory/pgdata
```

`700` is not optional: the volume holds every campaign, brand contact and audit row.

---

## Running it

```bash
# Environment for the compose stack. Use a systemd EnvironmentFile, not a checked-in .env.
sudo install -m 600 -o root -g root /dev/null /etc/string-theory/postgres.env
sudo tee /etc/string-theory/postgres.env >/dev/null <<'ENV'
POSTGRES_DB=string_theory
POSTGRES_USER=string_theory
POSTGRES_PASSWORD=<generate with: openssl rand -base64 32>
POSTGRES_DATA_DIR=/mnt/string-theory/pgdata
ENV

docker compose -f docker-compose.prod.yml up -d
```

Start the app only once PostgreSQL reports healthy:

```bash
docker compose -f docker-compose.prod.yml up -d --wait postgres
npm run db:migrate
```

`--wait` exists because the migration runner will happily connect to a cluster that is still in
`initdb`, and a container that accepts connections before it accepts *queries* is the normal case
during first boot.

---

## Backups

A snapshot schedule is the whole point of the volume, and it is the one thing that is easy to forget.
Three layers, because each catches what the others miss.

### Continuous write-ahead log archiving

Point-in-time recovery. A nightly snapshot alone means losing a day's campaigns.

```bash
sudo install -m 700 -d /mnt/string-theory/pg-wal
sudo tee /etc/string-theory/archive-command.sh >/dev/null <<'SH'
#!/usr/bin/env bash
# Offload one completed WAL segment to S3. Returns non-zero to make Postgres retry.
set -euo pipefail
/usr/bin/aws s3 cp "$1" "s3://string-theory-pg-wal/$(basename "$1")" --storage-class STANDARD_IA
SH
sudo chmod +x /etc/string-theory/archive-command.sh
```

Configure `archive_mode`, `archive_command` and `wal_level = replica` in the container's Postgres
config, then reload. Without a tested restore, this is a hypothesis, not a backup — rehearse it.

### Nightly snapshots

```bash
aws ec2 create-snapshot \
  --volume-id "$VOLUME_ID" \
  --description "string-theory pgdata $(date -Is)" \
  --tag 'Name=string-theory-pgdata,Project=string-theory'
```

Wire this to an EventBridge schedule. Copy snapshots cross-region on a 30-day expiry; a snapshot that
only exists in one AZ is not a backup against an AZ failure.

### Test the restore

Quarterly, on a scratch instance, from a snapshot. Record how long it took. A backup whose restore
time is unknown has no usable recovery time objective.

---

## Security groups

- **Ingress:** PostgreSQL 5432 from the security group of the app instances. Nothing from
  `0.0.0.0/0`, ever.
- **Egress:** 5432 to the database security group, 443 to anywhere.
- `docker-compose.prod.yml` publishes no ports, so the database is unreachable from outside the
  instance regardless. The security group is the second lock, not the first.

---

## Monitoring

Alert on:

| Signal | Threshold | Meaning |
|---|---|---|
| `pg_isready` failures | any | Instance or volume problem. |
| Connection count vs `max_connections` | > 80% | `DATABASE_POOL_MAX` × instances has outgrown the instance. |
| Disk usage on the volume | > 75% | gp3 will throttle IOPS and Postgres will stall. |
| `oldest_replication_slot` age | > 1 hour | Something is holding the WAL back. |
| Failed migrations | any | `schema_migrations` diverging from the repo. |

Disk is the one that pages you at 3am: gp3 does not slow down gracefully, it runs out of credit.

---

## Growing

In rough order of cost, when the single instance stops being enough:

1. **More IOPS and throughput on the existing volume.** Cheapest, no downtime, usually sufficient until
   roughly 10k campaigns.
2. **Vertical resize** of the instance. Pairs with 1.
3. **A read replica** for reporting. Analytics reads are what usually cause the first incident; move
   them here before touching the writer.
4. **Partitions** on `campaign_videos` and any future per-play event table, by month. Only worth it
   once those tables have millions of rows.
5. **RDS** with Multi-AZ. Gives failover and managed backups for more money and fewer on-call pages.

Whichever you pick, the migration runner takes an advisory lock, so concurrent instances starting
during a deploy will not both apply the same file.

---

## Local development

`docker-compose.yml` uses a Docker named volume rather than a bind mount, and publishes 5432 on
loopback only. It is not the production topology and does not need to be — the variable that has to
point at durable storage is `PGDATA`, and both files put the cluster in the same subdirectory.

```bash
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
```

> `npm run db:up` needs Docker Compose v2 (`docker compose`). The Python `docker-compose` 1.x cannot
> parse the file against Docker 25+ — it fails with `KeyError: 'ContainerConfig'`. Install the v2
> plugin if you only have the 1.x binary.